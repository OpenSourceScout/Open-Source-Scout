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

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from integrations.github_client import GitHubClient
from integrations.groq_client import GroqClient
from core.orchestrator import ScoutOrchestrator
from utils.cache import CacheManager
from utils.pdf_generator import PDFGenerator

app = FastAPI(
    title="Open Source Scout API",
    description="Backend API for the Open Source Scout editor and analysis tools",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
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
    fast_model: str = "qwen-qwq-32b"
    powerful_model: str = "llama-3.3-70b"


class ExportPdfRequest(BaseModel):
    """Request body for PDF export."""

    content: str


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
        results = orchestrator.run(
            repo_url=body.repo_url,
            beginner_only=body.beginner_only,
        )
        return _to_jsonable(results)
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
    return {"status": "ok"}


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
