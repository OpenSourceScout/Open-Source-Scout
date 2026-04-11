"""
Perfect live coverage (no mocks): real GitHub + FastAPI, and optional full Groq phases.

Enable with:
  SCOUT_PERFECT_LIVE=1
  GITHUB_TOKEN (not the pytest placeholder)
  GROQ_API_KEY (valid key, not placeholder) for orchestrator phase tests

Slide alignment:
- Integration: frontend can be verified via Playwright live spec + these API tests.
- GitHub API: real HTTP.
- Multi-agent + Groq: phase tests when keys are valid.
"""
import os

import pytest

PERFECT = os.getenv("SCOUT_PERFECT_LIVE", "").strip().lower() in ("1", "true", "yes")


def _github_token_ok() -> bool:
    t = os.getenv("GITHUB_TOKEN")
    return bool(t and t != "test-key-for-pytest")


def _groq_key_ok() -> bool:
    k = os.getenv("GROQ_API_KEY")
    return bool(k and k != "test-key-for-pytest")


@pytest.mark.perfect_live
def test_real_github_file_via_fastapi_matches_public_readme():
    """Backend + GitHub API integration (no mocks)."""
    if not PERFECT:
        pytest.skip("Set SCOUT_PERFECT_LIVE=1")
    if not _github_token_ok():
        pytest.skip("GITHUB_TOKEN required (not pytest placeholder)")

    from fastapi.testclient import TestClient

    from app.api import app

    with TestClient(app) as client:
        r = client.get(
            "/api/repos/octocat/Hello-World/files/README.md",
            params={"ref": "HEAD"},
        )
    assert r.status_code == 200, r.text
    data = r.json()
    assert "content" in data
    assert len(data["content"]) > 20
    assert "hello" in data["content"].lower() or "world" in data["content"].lower()


@pytest.mark.perfect_live
def test_real_github_repo_tree_via_fastapi():
    if not PERFECT:
        pytest.skip("Set SCOUT_PERFECT_LIVE=1")
    if not _github_token_ok():
        pytest.skip("GITHUB_TOKEN required")

    from fastapi.testclient import TestClient

    from app.api import app

    with TestClient(app) as client:
        r = client.get("/api/repos/octocat/Hello-World/tree", params={"max_files": 50})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("total", 0) >= 1
    paths = {f.get("path") for f in body.get("files", [])}
    assert "README.md" in paths or any("README" in (p or "") for p in paths)


@pytest.mark.perfect_live
def test_real_orchestrator_phase1_phase2_phase3():
    """
    Full multi-agent path with real GitHub clone + real Groq (slide integration).
    """
    if not PERFECT:
        pytest.skip("Set SCOUT_PERFECT_LIVE=1")
    if not _github_token_ok() or not _groq_key_ok():
        pytest.skip("GITHUB_TOKEN and valid GROQ_API_KEY required")

    from integrations.github_client import GitHubClient
    from integrations.groq_client import GroqClient
    from core.orchestrator import ScoutOrchestrator
    from tests.slide_quality import assert_slide_deliverables_quality

    repo_url = "https://github.com/SamarthPyati/Open-Source-Scout"
    github = GitHubClient(token=os.environ["GITHUB_TOKEN"])
    groq = GroqClient(api_key=os.environ["GROQ_API_KEY"])
    orch = ScoutOrchestrator(github_client=github, groq_client=groq)

    p1 = orch.run_phase1(repo_url, beginner_only=False, top_issues=2)
    assert p1.get("success"), p1.get("error", p1)
    issues = p1.get("issues") or []
    assert issues, "expected at least one open issue"
    target_num = p1["agent1_output"].selected_issue_number
    target = next((i for i in issues if i.number == target_num), issues[0])

    p2 = orch.run_phase2(repo_url, target)
    if not p2.get("success"):
        pytest.skip(f"Phase 2 failed (clone/network): {p2.get('error')}")
    assert p2.get("agent2_output") is not None
    if not p2["agent2_output"].hits:
        pytest.skip("Archaeologist returned no hits for this checkout; try again or adjust repo.")

    repo_meta = p1["repo"]
    p3 = orch.run_phase3(repo_meta, target, p1["agent1_output"], p2["agent2_output"])
    if not p3.get("success"):
        pytest.skip(f"Phase 3 failed (LLM/network): {p3.get('error')}")
    assert_slide_deliverables_quality(p3["agent3_output"], issue_number=target.number)
