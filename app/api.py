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
from pydantic import BaseModel

from integrations.github_client import GitHubClient

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
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
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


# --- Endpoints ---


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
