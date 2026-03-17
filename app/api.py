"""
FastAPI backend for Open Source Scout.

Exposes REST endpoints so a React (or other) frontend can call
the Python backend without going through Streamlit.
"""
import os
import sys
from pathlib import Path

# Ensure project root is on path (for uvicorn app.api:app)
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from app.auth_routes import router as auth_router
from app.auth_service import decode_access_token
from app.db import create_pool, init_schema

from integrations.github_client import GitHubClient
from integrations.groq_client import GroqClient
from core.orchestrator import ScoutOrchestrator
from core.agents.pathfinder import PathfinderAgent
from utils.cache import CacheManager
from utils.pdf_generator import PDFGenerator

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
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


class AnalyzeRequest(BaseModel):
    """Request body for running analysis."""

    repo_url: str
    beginner_only: bool = True
    fast_model: str = "llama-3.3-70b"
    powerful_model: str = "openai/gpt-oss-120b"


class SearchReposRequest(BaseModel):
    """Request body for searching repositories by tech stack."""
    
    tech_stack: list[str]
    fast_model: str = "openai/gpt-oss-120b"


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


def _to_jsonable(obj):
    """Convert Pydantic models and nested structures to JSON-serializable dict."""
    if hasattr(obj, "model_dump"):
        return obj.model_dump()
    if isinstance(obj, dict):
        return {k: _to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_jsonable(item) for item in obj]
    return obj


# --- Endpoints ---


@app.post("/api/analyze")
def run_analyze(body: AnalyzeRequest):
    """
    Run the full 3-agent analysis pipeline.

    Blocks until complete (may take 1–2 minutes). Returns analysis results.
    """
    try:
        github_client = GitHubClient()
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
        return _to_jsonable(results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/re-analyze-issue")
def re_analyze_issue(body: ReAnalyzeRequest):
    """
    Re-run phases 2 (Archaeologist) + 3 (Senior Dev) for a specific issue.

    Called when the user selects a different issue from the ranked list.
    Re-uses already-fetched repo/issue data so only the LLM-heavy steps
    (code search + briefing generation) are repeated.
    """
    try:
        github_client = GitHubClient()
        groq_client = GroqClient()
        orchestrator = ScoutOrchestrator(
            github_client=github_client,
            groq_client=groq_client,
            fast_model=body.fast_model,
            powerful_model=body.powerful_model,
        )

        # Fetch repo metadata
        repo = github_client.get_repo(body.repo_url)

        # Fetch the specific issue directly by number — works for any issue
        # regardless of how recently it was updated (avoids the "top 50" limit).
        try:
            target_issue = github_client.get_issue(body.repo_url, body.issue_number)
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"Issue #{body.issue_number} not found in the repository."
            )

        # Also fetch a batch of issues for scoring/ranking context (phase 3)
        issues = github_client.get_issues(body.repo_url, beginner_only=False, max_issues=50)

        # Phase 2 — Archaeologist
        phase2 = orchestrator.run_phase2(body.repo_url, target_issue)
        if not phase2.get("success"):
            raise HTTPException(status_code=500, detail=phase2.get("error", "Phase 2 failed"))

        agent2_output = phase2["agent2_output"]

        # Fetch agent1_output from a fresh issue ranking (needed for phase 3 context)
        from core.schemas import Agent1Output, RepoInfo, RankedIssue, ScoreBreakdown
        from core.scoring import IssueScorer
        scorer = IssueScorer()
        ranked = scorer.rank_issues(issues, top_n=3)
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
        phase3 = orchestrator.run_phase3(repo, target_issue, agent1_output, agent2_output)
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

        final_agent2 = testing_result.get("agent2_output", agent2_output)
        final_agent3 = testing_result.get("agent3_output", agent3_output)

        return _to_jsonable({
            "success": True,
            "target_issue": target_issue,
            "agent2_output": final_agent2,
            "agent3_output": final_agent3,
            "testing_output": testing_result.get("testing_output"),
        })

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search-repos")
def search_repos_by_tech_stack(body: SearchReposRequest):
    """
    Search and rank GitHub repositories based on user's tech stack.
    
    Uses the Pathfinder agent to find beginner-friendly repos matching
    the user's skills. Returns top 5 ranked repositories.
    """
    try:
        if not body.tech_stack or len(body.tech_stack) == 0:
            raise HTTPException(status_code=400, detail="At least one technology/skill is required")
        
        github_client = GitHubClient()
        groq_client = GroqClient()
        
        pathfinder = PathfinderAgent(groq_client, model=body.fast_model)
        results = pathfinder.run(
            tech_stack=body.tech_stack,
            github_client=github_client,
            top_n=5
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
                "select id, email, display_name, created_at from users where id = %s",
                (user_id,),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="User not found")
            cols = [d.name for d in cur.description]
            return dict(zip(cols, row, strict=False))


@app.get("/api/repos/{owner}/{repo}/files/{file_path:path}")
def get_file_content(
    owner: str,
    repo: str,
    file_path: str,
    ref: str = "main",
):
    """
    Fetch raw file content from a repository.

    Uses the GitHub Contents API. Requires GITHUB_TOKEN for private repos.
    """
    try:
        client = GitHubClient()
        content = client.get_file_content(owner, repo, file_path, ref=ref)
        return {"content": content, "path": file_path, "ref": ref}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/repos/{owner}/{repo}/push")
def push_file(
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
        client = GitHubClient()
        result = client.push_file_content(
            owner=owner,
            repo=repo,
            branch_name=body.branch_name,
            file_path=body.file_path,
            content=body.content,
            commit_message=body.commit_message,
            base_branch=body.base_branch,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
