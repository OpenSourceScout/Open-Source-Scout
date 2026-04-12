"""
FastAPI backend for Open Source Scout.

Exposes REST endpoints so a React (or other) frontend can call
the Python backend without going through Streamlit.
"""
# ruff: noqa: E402

import errno
import logging
import os
import sys
from pathlib import Path

# Ensure project root is on path (for uvicorn app.api:app)
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv(override=True)

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from tenacity import RetryError

from app.auth_routes import router as auth_router
from app.auth_service import decode_access_token
from app.db import (
    create_pool,
    count_user_projects,
    create_project,
    delete_project,
    fetch_user_activity,
    FREE_PROJECT_LIMIT,
    get_project,
    get_user_projects,
    get_user_github_token,
    init_schema,
    record_git_push,
    record_issue_analysis,
    record_tech_stack_search,
    rename_project,
)

from integrations.github_client import GitHubClient
from integrations.groq_client import GroqClient, MODEL_LLAMA_4_SCOUT_17B, MODEL_README_SUMMARY
from core.orchestrator import ScoutOrchestrator
from core.agents.pathfinder import PathfinderAgent
from utils.cache import CacheManager
from utils.pdf_generator import PDFGenerator

logger = logging.getLogger(__name__)

app = FastAPI(
    title="Open Source Scout API",
    description="Backend API for the Open Source Scout editor and analysis tools",
    version="0.1.0",
)

@app.on_event("startup")
def _startup():
    # Auth is optional for the app overall, but if Neon env vars are present,
    # initialize the pool and ensure the schema exists.
    try:
        app.state.db_pool = create_pool()
        init_schema(app.state.db_pool)
        app.state.db_init_error = None
    except Exception as e:
        app.state.db_pool = None
        app.state.db_init_error = str(e)


@app.on_event("shutdown")
def _shutdown():
    pool = getattr(app.state, "db_pool", None)
    if pool is not None:
        pool.close()


app.include_router(auth_router)

# Build CORS origins list from env (supports production Railway URL)
_default_origins = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:5175",
]
_extra = os.getenv("ALLOWED_ORIGINS", "")
_allowed_origins = _default_origins + [o.strip() for o in _extra.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response models ---


class PushFileRequest(BaseModel):
    """Request body for pushing file content."""

    file_path: str
    content: str
    branch_name: str
    commit_message: str
    base_branch: str = "main"
    target_mode: str | None = None  # 'original' | 'fork' | 'auto' (default)


class PushFilesRequest(BaseModel):
    """Request body for pushing multiple files in one commit."""

    files: list[dict]  # each: { file_path: str, content: str }
    branch_name: str
    commit_message: str
    base_branch: str = "main"
    target_mode: str | None = None  # 'original' | 'fork' | 'auto' (default)


class AnalyzeRequest(BaseModel):
    """Request body for running analysis."""

    repo_url: str
    beginner_only: bool = True
    fast_model: str = "llama-3.3-70b"
    powerful_model: str = "openai/gpt-oss-120b"


class SearchReposRequest(BaseModel):
    """Request body for searching repositories by tech stack."""
    
    tech_stack: list[str]
    fast_model: str = MODEL_LLAMA_4_SCOUT_17B


class ExportPdfRequest(BaseModel):
    """Request body for PDF export."""

    content: str


class ReAnalyzeRequest(BaseModel):
    """Request body for re-running phases 2+3 for a specific issue."""

    repo_url: str
    issue_number: int
    fast_model: str = "llama-3.3-70b"
    powerful_model: str = "llama-3.3-70b"
    pathfinder_output: dict | None = None


class CreateProjectRequest(BaseModel):
    """Request body for creating a new project."""

    name: str
    project_type: str  # 'tech_stack' or 'repo_url'
    tech_stack: list[str] | None = None
    repo_url: str | None = None
    repo_full_name: str | None = None
    selected_issue_number: int | None = None
    selected_issue_title: str | None = None
    analysis_result: dict | None = None


class RenameProjectRequest(BaseModel):
    """Request body for renaming a project."""

    name: str


class FileTreeRequest(BaseModel):
    """Request body for fetching files with analysis metadata."""

    ref: str = "HEAD"
    analysis_data: dict | None = None  # Optional: contains agent2_output, agent3_output
    max_files: int = 500


class ForkChoiceRequest(BaseModel):
    """Request body for fork choice confirmation."""

    choice: str  # 'fork' or 'original'
    issue_number: int | None = None
    analysis_id: str | None = None


def _to_jsonable(obj):
    """Convert Pydantic models and nested structures to JSON-serializable values."""
    return jsonable_encoder(obj)


def _optional_user_id(request: Request) -> int | None:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        claims = decode_access_token(token)
        return int(claims.get("sub"))
    except Exception:
        return None


def _require_user_id(request: Request) -> int:
    """Extract user ID from Bearer token or raise 401."""
    uid = _optional_user_id(request)
    if uid is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return uid


def _require_pool(request: Request):
    """Return the database pool or raise 500."""
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database not initialized")
    return pool


def _get_github_token_for_user(request: Request) -> str | None:
    """
    Get the GitHub token for the current user.
    Falls back to .env token if user is not authenticated or has no token.
    """
    uid = _optional_user_id(request)
    if uid:
        pool = getattr(request.app.state, "db_pool", None)
        if pool:
            try:
                token = get_user_github_token(pool, uid)
                if token:
                    return token
            except Exception:
                pass
    return os.getenv("GITHUB_TOKEN")


def _safe_record_activity(fn, *args, **kwargs) -> None:
    try:
        fn(*args, **kwargs)
    except Exception as e:
        logger.warning("Failed to record user activity: %s", e)


def _record_phase1_issue_analysis(pool, user_id: int, body: AnalyzeRequest, results: dict) -> None:
    if not results.get("success") or not results.get("agent1_output") or not results.get("repo"):
        return
    a1 = results["agent1_output"]
    repo = results["repo"]
    num = a1.selected_issue_number
    if num == 0 and a1.ranked_issues:
        num = a1.ranked_issues[0].number
    title = None
    for ri in a1.ranked_issues:
        if ri.number == num:
            title = ri.title
            break
    if title is None:
        title = ""
    full_name = repo.full_name
    record_issue_analysis(
        pool,
        user_id,
        repo_url=body.repo_url.strip(),
        repo_full_name=full_name,
        issue_number=num,
        issue_title=title,
    )


# --- Endpoints ---


def _enforce_free_tier_quota(request: Request):
    """Raise 403 if user has hit the free tier project limit."""
    uid = _optional_user_id(request)
    pool = getattr(request.app.state, "db_pool", None)
    if uid and pool:
        try:
            if count_user_projects(pool, uid) >= FREE_PROJECT_LIMIT:
                raise HTTPException(
                    status_code=403, 
                    detail=f"Free plan limit reached ({FREE_PROJECT_LIMIT} projects max). Please delete a project to run a new analysis or search."
                )
        except Exception as e:
            if isinstance(e, HTTPException):
                raise
            logger.error("Failed to check project quota: %s", e)


@app.post("/api/analyze")
def run_analyze(body: AnalyzeRequest, request: Request):
    """
    Run the full 3-agent analysis pipeline.

    Blocks until complete (may take 1–2 minutes). Returns analysis results.
    """
    _enforce_free_tier_quota(request)
    try:
        github_client = GitHubClient(token=_get_github_token_for_user(request))
        groq_client = GroqClient()
        cache_manager = CacheManager()
        orchestrator = ScoutOrchestrator(
            github_client=github_client,
            groq_client=groq_client,
            cache_manager=cache_manager,
            fast_model=body.fast_model,
            powerful_model=body.powerful_model,
        )
        results = orchestrator.run_phase1(
            repo_url=body.repo_url,
            beginner_only=body.beginner_only,
        )
        pool = getattr(request.app.state, "db_pool", None)
        uid = _optional_user_id(request)
        if pool and uid:
            _safe_record_activity(_record_phase1_issue_analysis, pool, uid, body, results)
        return _to_jsonable(results)
    except RetryError as e:
        status_msg = str(e)
        if "RateLimitError" in status_msg or "rate limit" in status_msg.lower():
            raise HTTPException(status_code=429, detail="API rate limit exceeded. Please try again later or configure a new API key.")
        raise HTTPException(status_code=500, detail=f"LLM request failed after retries: {status_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/test-post")
def test_post(request: Request):
    print("Test POST hit!", flush=True)
    return {"success": True}


@app.post("/api/re-analyze-issue")
def re_analyze_issue(body: ReAnalyzeRequest, request: Request):
    """
    Re-run phases 2 (Archaeologist) + 3 (Senior Dev) for a specific issue.

    Called when the user selects a different issue from the ranked list.
    Re-uses already-fetched repo/issue data so only the LLM-heavy steps
    (code search + briefing generation) are repeated.
    """
    try:
        github_client = GitHubClient(token=_get_github_token_for_user(request))
        groq_client = GroqClient()
        orchestrator = ScoutOrchestrator(
            github_client=github_client,
            groq_client=groq_client,
            fast_model=body.fast_model,
            powerful_model=body.powerful_model,
        )

        # Fetch repo metadata
        logger.info("re-analyze: fetching repo %s", body.repo_url)
        repo = github_client.get_repo(body.repo_url)

        # Fetch the specific issue directly by number — works for any issue
        # regardless of how recently it was updated (avoids the "top 50" limit).
        try:
            logger.info("re-analyze: fetching issue %s", body.issue_number)
            target_issue = github_client.get_issue(body.repo_url, body.issue_number)
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"Issue #{body.issue_number} not found in the repository."
            )

        # Also fetch a batch of issues for scoring/ranking context (phase 3)
        issues = github_client.get_issues(body.repo_url, beginner_only=False, max_issues=50)

        # Phase 2 — Archaeologist
        logger.info("re-analyze: running Phase 2")
        phase2 = orchestrator.run_phase2(body.repo_url, target_issue)
        logger.info("re-analyze: Phase 2 finished")
        if not phase2.get("success"):
            logger.error("re-analyze Phase 2 failed: %s", phase2.get("error"))
            raise HTTPException(status_code=500, detail=phase2.get("error", "Phase 2 failed"))

        agent2_output = phase2["agent2_output"]

        # Fetch agent1_output from a fresh issue ranking (needed for phase 3 context)
        from core.schemas import Agent1Output, RepoInfo, RankedIssue
        from core.scoring import IssueScorer
        logger.info("re-analyze: ranking context issues")
        scorer = IssueScorer()
        ranked = scorer.rank_issues(issues, top_n=3)
        logger.info("re-analyze: ranking context issues done")
        ranked_issues = [
            RankedIssue(
                number=iss.number,
                title=iss.title,
                url=iss.html_url,
                labels=iss.labels,
                score_total=sr.total,
                score_breakdown=sr.breakdown,
                why=sr.reasons[:4],
            )
            for iss, sr in ranked
        ]
        agent1_output = Agent1Output(
            repo=RepoInfo(
                url=repo.html_url,
                default_branch=repo.default_branch,
                description=repo.description,
                languages=list(repo.languages.keys())[:5] if repo.languages else None,
            ),
            ranked_issues=ranked_issues,
            selected_issue_number=target_issue.number,
        )

        # Phase 3 — Senior Dev
        logger.info("re-analyze: running Phase 3")
        phase3 = orchestrator.run_phase3(repo, target_issue, agent1_output, agent2_output)
        logger.info("re-analyze: Phase 3 finished")
        if not phase3.get("success"):
            raise HTTPException(status_code=500, detail=phase3.get("error", "Phase 3 failed"))

        agent3_output = phase3["agent3_output"]

        # Reconstruct PathfinderOutput if provided by frontend
        pathfinder = None
        if body.pathfinder_output:
            from core.schemas import PathfinderOutput
            try:
                pathfinder = PathfinderOutput.model_validate(body.pathfinder_output)
            except Exception:
                pass

        # Phase 4 — Testing Agent with QA feedback loop
        # If any agent fails QA, they are re-run with feedback (up to 2 retries).
        # The returned agent outputs may be improved versions after retries.
        logger.info("re-analyze: running QA cycle")
        testing_result = orchestrator.run_testing(
            repo=repo,
            issue=target_issue,
            agent1_output=agent1_output,
            agent2_output=agent2_output,
            agent3_output=agent3_output,
            repo_path=phase2.get("repo_path"),
            file_tree=phase2.get("file_tree"),
            pathfinder_output=pathfinder,
        )
        if not testing_result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=testing_result.get("error", "Testing / QA phase failed"),
            )

        final_agent2 = testing_result.get("agent2_output", agent2_output)
        final_agent3 = testing_result.get("agent3_output", agent3_output)

        logger.info("re-analyze: completed successfully")
        payload = {
            "success": True,
            "target_issue": target_issue,
            "agent2_output": final_agent2,
            "agent3_output": final_agent3,
            "testing_output": testing_result.get("testing_output"),
        }
        pool = getattr(request.app.state, "db_pool", None)
        uid = _optional_user_id(request)
        if pool and uid:
            _safe_record_activity(
                record_issue_analysis,
                pool,
                uid,
                repo_url=body.repo_url.strip(),
                repo_full_name=repo.full_name,
                issue_number=target_issue.number,
                issue_title=target_issue.title,
            )
        return _to_jsonable(payload)

    except RetryError as e:
        status_msg = str(e)
        if "RateLimitError" in status_msg or "rate limit" in status_msg.lower():
            raise HTTPException(
                status_code=429, 
                detail="Groq API rate limit exceeded. The analysis service is busy. Please wait a moment and try again, or update your API key for higher rate limits."
            )
        raise HTTPException(status_code=500, detail=f"LLM request failed after retries: {status_msg}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error in re-analyze")
        detail = str(e)
        if isinstance(e, OSError) and getattr(e, "errno", None) == errno.EINVAL:
            detail = (
                f"{detail} — On Windows, stop other uvicorn/Python on :8001, start API on port 8003 "
                "(.\\run-backend.ps1), then: $env:OSS_API_PROXY_TARGET='http://localhost:8003'; npm run dev "
                "in frontend. See Open-Source-Scout\\run-backend.ps1."
            )
        raise HTTPException(status_code=500, detail=detail)


@app.post("/api/search-repos")
def search_repos_by_tech_stack(body: SearchReposRequest, request: Request):
    """
    Search and rank GitHub repositories based on user's tech stack.
    
    Uses the Pathfinder agent to find beginner-friendly repos matching
    the user's skills. Returns top 5 ranked repositories.
    """
    _enforce_free_tier_quota(request)
    try:
        if not body.tech_stack or len(body.tech_stack) == 0:
            raise HTTPException(status_code=400, detail="At least one technology/skill is required")
        
        github_client = GitHubClient(token=_get_github_token_for_user(request))
        groq_client = GroqClient()
        
        pathfinder = PathfinderAgent(groq_client, model=body.fast_model)
        results = pathfinder.run(
            tech_stack=body.tech_stack,
            github_client=github_client,
            top_n=5
        )
        pool = getattr(request.app.state, "db_pool", None)
        uid = _optional_user_id(request)
        if pool and uid:
            names = [r.full_name for r in results.ranked_repos]
            _safe_record_activity(
                record_tech_stack_search,
                pool,
                uid,
                list(results.tech_stack),
                names,
            )
        return _to_jsonable(results)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/export/pdf")
def export_pdf(body: ExportPdfRequest):
    """Generate PDF from markdown content."""
    try:
        pdf_gen = PDFGenerator()
        pdf_bytes = pdf_gen.markdown_to_pdf(body.content)
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": "attachment; filename=contributor_briefing.pdf"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
def health():
    """Health check for load balancers / readiness probes."""
    db_pool = getattr(app.state, "db_pool", None)
    db_init_error = getattr(app.state, "db_init_error", None)
    return {
        "status": "ok",
        "db_initialized": db_pool is not None,
        "db_error": db_init_error,
    }


@app.get("/api/me")
def me(request: Request):
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = auth.split(" ", 1)[1].strip()
    try:
        claims = decode_access_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(status_code=500, detail="Database not initialized")

    user_id = int(claims.get("sub"))
    with pool.connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id, email, display_name, role, created_at from users where id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            cols = [d.name for d in cur.description]
            user = dict(zip(cols, row, strict=False))
            ca = user.get("created_at")
            if ca is not None and hasattr(ca, "isoformat"):
                user["created_at"] = ca.isoformat()
            activity = fetch_user_activity(pool, user_id)
            user.update(activity)
            return user


# --- Project endpoints ---


@app.get("/api/projects")
def list_projects(request: Request):
    """List all projects for the authenticated user."""
    uid = _require_user_id(request)
    pool = _require_pool(request)
    projects = get_user_projects(pool, uid)
    return {"projects": projects, "limit": FREE_PROJECT_LIMIT}


@app.post("/api/projects", status_code=201)
def create_project_endpoint(body: CreateProjectRequest, request: Request):
    """Create a new project. Enforces the free plan project limit."""
    uid = _require_user_id(request)
    pool = _require_pool(request)

    current_count = count_user_projects(pool, uid)
    if current_count >= FREE_PROJECT_LIMIT:
        raise HTTPException(
            status_code=403,
            detail=f"Free plan limit reached. You can have at most {FREE_PROJECT_LIMIT} projects. "
                   f"Delete an existing project to create a new one.",
        )

    if body.project_type not in ("tech_stack", "repo_url"):
        raise HTTPException(status_code=400, detail="project_type must be 'tech_stack' or 'repo_url'")

    project = create_project(
        pool,
        uid,
        name=body.name,
        project_type=body.project_type,
        tech_stack=body.tech_stack,
        repo_url=body.repo_url,
        repo_full_name=body.repo_full_name,
        selected_issue_number=body.selected_issue_number,
        selected_issue_title=body.selected_issue_title,
        analysis_result=body.analysis_result,
    )
    return project


@app.get("/api/projects/{project_id}")
def get_project_endpoint(project_id: int, request: Request):
    """Get a single project with its full analysis result."""
    uid = _require_user_id(request)
    pool = _require_pool(request)
    project = get_project(pool, uid, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@app.patch("/api/projects/{project_id}")
def rename_project_endpoint(project_id: int, body: RenameProjectRequest, request: Request):
    """Rename a project. Only the name can be changed."""
    uid = _require_user_id(request)
    pool = _require_pool(request)
    result = rename_project(pool, uid, project_id, body.name)
    if result is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return result


@app.delete("/api/projects/{project_id}")
def delete_project_endpoint(project_id: int, request: Request):
    """Delete a project."""
    uid = _require_user_id(request)
    pool = _require_pool(request)
    deleted = delete_project(pool, uid, project_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Project not found")
    return {"ok": True}


@app.get("/api/repos/{owner}/{repo}/tree")
def get_repo_file_tree(
    request: Request,
    owner: str,
    repo: str,
    ref: str = "HEAD",
    max_files: int = 500,
):
    """
    Fetch the complete file tree structure for a repository.
    
    Returns all files and directories with metadata for building a file browser UI.
    Files that need attention (from analysis) can be marked separately.
    """
    owner = owner.strip()
    repo = repo.strip()
    try:
        client = GitHubClient(token=_get_github_token_for_user(request))
        files = client.get_repo_file_tree(owner, repo, ref=ref, max_files=max_files)
        return {
            "owner": owner,
            "repo": repo,
            "ref": ref,
            "files": files,
            "total": len(files),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/repos/{owner}/{repo}/tree/with-analysis")
def get_tree_with_analysis(
    request: Request,
    owner: str,
    repo: str,
    body: FileTreeRequest,
):
    """
    Fetch file tree merged with analysis data.
    
    Marks files that need to be changed (from Archaeologist hits and Senior Dev output).
    Highlightedfiles are weighted: 80% Archaeologist hits, 20% Senior Dev mentions.
    
    Returns:
    {
        "owner": str,
        "repo": str,
        "files": [
            {
                "path": "src/main.py",
                "type": "file" | "dir",
                "size": 1024,
                "highlighted": bool,
                "reason": str  # Why this file is highlighted
            }
        ],
        "highlighted_count": int,
        "total": int,
    }
    """
    owner = owner.strip()
    repo = repo.strip()
    try:
        client = GitHubClient(token=_get_github_token_for_user(request))
        files = client.get_repo_file_tree(owner, repo, ref=body.ref, max_files=body.max_files)
        
        # Parse analysis data to find highlighted files
        highlighted_paths = {}  # path -> reason
        
        if body.analysis_data:
            # Extract from Archaeologist hits (80% weight)
            agent2_output = body.analysis_data.get("agent2_output", {})
            if agent2_output:
                hits = agent2_output.get("hits", [])
                for hit in hits:
                    path = hit.get("path", "")  # Changed from file_path to path
                    if path:
                        reason = f"Code location: {hit.get('why_relevant', 'Referenced in analysis')}"
                        highlighted_paths[path] = reason
            
            # Extract from Senior Dev briefing (20% weight - supplementary)
            agent3_output = body.analysis_data.get("agent3_output", {})
            if agent3_output:
                briefing = agent3_output.get("briefing_markdown", "")
                # Look for common file patterns mentioned in briefing
                # (this is a simple heuristic; could be improved)
                import re
                # Match paths like src/main.py, app/api.py, etc.
                file_patterns = re.findall(r'[`\']([a-zA-Z0-9_\-./]*\.[a-zA-Z0-9_]+)[`\']', briefing)
                for pattern in file_patterns:
                    if pattern and "/" in pattern:
                        if pattern not in highlighted_paths:
                            highlighted_paths[pattern] = "Mentioned in briefing"
        
        # Merge with file tree
        result_files = []
        for file in files:
            file_path = file["path"]
            is_highlighted = file_path in highlighted_paths
            
            result_files.append({
                "path": file_path,
                "type": file["type"],
                "size": file.get("size", 0),
                "highlighted": is_highlighted,
                "reason": highlighted_paths.get(file_path, "")
            })
        
        return {
            "owner": owner,
            "repo": repo,
            "ref": body.ref,
            "files": result_files,
            "highlighted_count": sum(1 for f in result_files if f["highlighted"]),
            "total": len(result_files),
        }
    except Exception as e:
        logger.error(f"Error fetching tree with analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/repos/{owner}/{repo}/files/{file_path:path}")
def get_file_content(
    request: Request,
    owner: str,
    repo: str,
    file_path: str,
    ref: str = "HEAD",
):
    """
    Fetch raw file content from a repository.

    Uses the GitHub Contents API. Requires GITHUB_TOKEN for private repos.
    """
    try:
        client = GitHubClient(token=_get_github_token_for_user(request))
        content = client.get_file_content(owner, repo, file_path, ref=ref)
        return {"content": content, "path": file_path, "ref": ref}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/repos/{owner}/{repo}/readme-summary")
def get_readme_summary(request: Request, owner: str, repo: str):
    """
    Fetch repository README and generate an LLM summary.
    """
    owner = owner.strip()
    repo = repo.strip()
    print(f"DEBUG: get_readme_summary called with owner='{owner}', repo='{repo}'", flush=True)
    try:
        client = GitHubClient(token=_get_github_token_for_user(request))
        readme_names = ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README']
        content = None
        for name in readme_names:
            try:
                print(f"DEBUG: Trying to fetch {name}", flush=True)
                content = client.get_file_content(owner, repo, name)
                if content:
                    print(f"DEBUG: Fetched successfully! Length: {len(content)}", flush=True)
                    break
            except Exception as e:
                print(f"DEBUG: Failed to fetch {name}: {e}", flush=True)
                continue
                
        if not content:
            print("DEBUG: All README fetches failed. Returning default message.", flush=True)
            return {"summary": "No README found for this repository."}
            
        print("DEBUG: Sending content to Groq...", flush=True)
        groq_client = GroqClient()
        prompt = (
            "Please summarize the following repository README into a concise and well-formatted "
            "technical overview. "
            "CRITICAL FORMATTING RULES: "
            "1. Match this exact section style using emojis and no markdown headers: 📄 Overview, ✨ Key Features, 🎯 Intended Audience, 🚀 Quick Start. "
            "2. Do NOT use markdown bullet points (like - or *). Write features as individual standalone sentences. "
            "3. You MUST use DOUBLE NEWLINES (\\n\\n) between EVERY single line, sentence, and section title. No two lines of text should touch each other. "
            f"README:\n{content[:20000]}"
        )
        
        summary = groq_client.complete(
            prompt=prompt,
            model=MODEL_README_SUMMARY,
            max_tokens=1500
        )
        print("DEBUG: Summary generated successfully.", flush=True)
        return {"summary": summary}
    except RetryError as e:
        status_msg = str(e)
        if "RateLimitError" in status_msg or "rate limit" in status_msg.lower():
            raise HTTPException(status_code=429, detail="API rate limit exceeded. Please try again later.")
        raise HTTPException(status_code=500, detail=f"LLM request failed: {status_msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/repos/{owner}/{repo}/fork-choice")
def fork_choice(
    request: Request,
    owner: str,
    repo: str,
    body: ForkChoiceRequest,
):
    """
    Process user's choice for editing a repository.
    
    The user can choose to:
    1. Fork the repository and edit on their fork
    2. Edit directly on original (if they have access, otherwise error)
    
    Returns fork information if forking, or confirmation if using original.
    """
    owner = owner.strip()
    repo = repo.strip()
    
    try:
        client = GitHubClient(token=_get_github_token_for_user(request))
        
        if body.choice == "fork":
            # Initiate fork
            fork_info = client.fork_repo(owner, repo)
            fork_owner = fork_info["fork_owner"]
            fork_repo = fork_info["fork_repo"]
            fork_url = f"https://github.com/{fork_owner}/{fork_repo}"
            return {
                "success": True,
                "choice": "fork",
                "fork_owner": fork_owner,
                "fork_repo": fork_repo,
                "fork_url": fork_url,
                "message": f"Repository forked to {fork_owner}/{fork_repo}",
            }
        
        elif body.choice == "original":
            # Check if user has push access to original
            resp = client.session.get(f"{client.BASE_URL}/repos/{owner}/{repo}")
            resp.raise_for_status()
            permissions = resp.json().get("permissions", {})
            can_push = permissions.get("push", False)
            
            if not can_push:
                raise HTTPException(
                    status_code=403,
                    detail="You don't have push access to this repository. Please choose 'fork' instead."
                )
            
            return {
                "success": True,
                "choice": "original",
                "owner": owner,
                "repo": repo,
                "message": "Editing on original repository",
            }
        
        else:
            raise HTTPException(
                status_code=400,
                detail="Choice must be 'fork' or 'original'"
            )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing fork choice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/repos/{owner}/{repo}/push")
def push_file(
    request: Request,
    owner: str,
    repo: str,
    body: PushFileRequest,
):
    """
    Push edited file content to a new branch.

    Forks the repo if the user doesn't have push access, then creates
    a branch with the single-file commit. Returns branch URL and PR link.
    """
    try:
        logger.info(f"Push request: {owner}/{repo} - file: {body.file_path}")
        client = GitHubClient(token=_get_github_token_for_user(request))
        
        logger.info(f"Checking GitHub token: {'present' if client.has_token else 'MISSING'}")
        
        target_mode = (body.target_mode or "auto").strip().lower()
        # Use the multi-file implementation for the single-file case too, so
        # branch updates are consistent with the batch endpoint and honor
        # target_mode ("original"|"fork"|"auto").
        try:
            result = client.push_files_content(
                owner=owner,
                repo=repo,
                branch_name=body.branch_name,
                files=[{"file_path": body.file_path, "content": body.content}],
                commit_message=body.commit_message,
                base_branch=body.base_branch,
                target_mode=target_mode,
            )
        except PermissionError as e:
            if str(e) == "NO_PUSH_ACCESS" or "NO_PUSH_ACCESS" in str(e):
                raise HTTPException(
                    status_code=403,
                    detail="You don't have push access to this repository. Please fork before pushing.",
                )
            raise
        logger.info(f"Push successful: {result.get('branch_url')}")
        
        pool = getattr(request.app.state, "db_pool", None)
        uid = _optional_user_id(request)
        if pool and uid:
            _safe_record_activity(
                record_git_push,
                pool,
                uid,
                upstream_owner=result.get("upstream_owner") or owner,
                upstream_repo=result.get("upstream_repo") or repo,
                branch_name=result.get("branch") or body.branch_name,
                file_path=body.file_path,
                commit_sha=result.get("commit_sha"),
                pr_url=result.get("pr_url"),
                commit_message=body.commit_message,
            )
        return result
    except Exception as e:
        logger.error(f"Error pushing file to {owner}/{repo}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/repos/{owner}/{repo}/push-batch")
def push_files_batch(
    request: Request,
    owner: str,
    repo: str,
    body: PushFilesRequest,
):
    """
    Push multiple edited files to a single branch as ONE commit.

    This fixes the previous behavior where looping single-file pushes would
    force-update the branch and effectively keep only the last file.
    """
    try:
        client = GitHubClient(token=_get_github_token_for_user(request))
        target_mode = (body.target_mode or "auto").strip().lower()
        try:
            result = client.push_files_content(
                owner=owner,
                repo=repo,
                branch_name=body.branch_name,
                files=body.files,
                commit_message=body.commit_message,
                base_branch=body.base_branch,
                target_mode=target_mode,
            )
        except PermissionError as e:
            if str(e) == "NO_PUSH_ACCESS" or "NO_PUSH_ACCESS" in str(e):
                raise HTTPException(
                    status_code=403,
                    detail="You don't have push access to this repository. Please fork before pushing.",
                )
            raise

        pool = getattr(request.app.state, "db_pool", None)
        uid = _optional_user_id(request)
        if pool and uid:
            # Record a single activity row with a representative file path.
            rep_path = (body.files[0].get("file_path") if body.files else None) or ""
            _safe_record_activity(
                record_git_push,
                pool,
                uid,
                upstream_owner=result.get("upstream_owner") or owner,
                upstream_repo=result.get("upstream_repo") or repo,
                branch_name=result.get("branch") or body.branch_name,
                file_path=rep_path,
                commit_sha=result.get("commit_sha"),
                pr_url=result.get("pr_url"),
                commit_message=body.commit_message,
            )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error pushing batch to {owner}/{repo}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Serve the built React frontend (production only)
# ---------------------------------------------------------------------------
# Mount the Vite build output so FastAPI serves the full app from one process.
# This is only active when frontend/dist exists (i.e. after `npm run build`).
# In local dev the Vite dev server handles the frontend on port 5173.

_dist_dir = project_root / "frontend" / "dist"
if _dist_dir.is_dir():
    # Serve static assets (JS/CSS/images) under their hashed paths
    app.mount("/assets", StaticFiles(directory=_dist_dir / "assets"), name="assets")

    # Catch-all: serve index.html for any non-API route so React Router works
    @app.get("/{full_path:path}", response_class=HTMLResponse, include_in_schema=False)
    async def serve_spa(full_path: str):
        index = _dist_dir / "index.html"
        return HTMLResponse(content=index.read_text(), status_code=200)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
