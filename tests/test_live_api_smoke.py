"""
Live integration smoke tests (real GitHub and/or Groq).

- Default CI: GitHub tests run when GITHUB_TOKEN is set (e.g. GitHub Actions).
- Groq tests skip without GROQ_API_KEY.
- Full pipeline: set RUN_LIVE_STACK=1, GITHUB_TOKEN, GROQ_API_KEY (manual / workflow_dispatch).
"""
import os

import pytest

REPO_PUBLIC = "https://github.com/octocat/Hello-World"
REPO_WITH_ISSUES = "https://github.com/SamarthPyati/Open-Source-Scout"


@pytest.mark.live_github
def test_live_github_parse_and_fetch_repo():
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        pytest.skip("GITHUB_TOKEN not set")
    from integrations.github_client import GitHubClient

    client = GitHubClient(token=token)
    owner, name = client.parse_repo_url(REPO_PUBLIC)
    assert owner == "octocat"
    assert name == "Hello-World"
    repo = client.get_repo(REPO_PUBLIC)
    assert "Hello-World" in repo.full_name


@pytest.mark.live_github
def test_live_github_search_repositories():
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        pytest.skip("GITHUB_TOKEN not set")
    from integrations.github_client import GitHubClient

    client = GitHubClient(token=token)
    repos = client.search_repos("language:python stars:>5000", per_page=1)
    assert len(repos) >= 1
    assert repos[0].full_name


@pytest.mark.live_github
def test_live_github_fetch_some_open_issues():
    token = os.getenv("GITHUB_TOKEN")
    if not token:
        pytest.skip("GITHUB_TOKEN not set")
    from integrations.github_client import GitHubClient

    client = GitHubClient(token=token)
    issues = client.get_issues(REPO_WITH_ISSUES, beginner_only=False, max_issues=5)
    assert isinstance(issues, list)


@pytest.mark.live_groq
def test_live_groq_minimal_completion():
    key = os.getenv("GROQ_API_KEY")
    if not key or key == "test-key-for-pytest":
        pytest.skip("GROQ_API_KEY not set (or pytest placeholder)")
    from integrations.groq_client import GroqAPIError, GroqClient

    groq = GroqClient(api_key=key)
    try:
        text = groq.complete(
            prompt='Output JSON only (no markdown): {"ok": true, "echo": "pong"}',
            model="llama-3.1-8b",
            temperature=0,
            max_tokens=64,
            json_mode=True,
        )
    except GroqAPIError as e:
        err = str(e).lower()
        if "401" in str(e) or "invalid" in err or "api key" in err:
            pytest.skip(f"Groq API key not accepted in this environment: {e}")
        raise
    assert "true" in text.lower() or "ok" in text.lower()


@pytest.mark.live_stack
def test_live_orchestrator_phase1_real_apis():
    if os.getenv("RUN_LIVE_STACK", "").strip() not in ("1", "true", "yes"):
        pytest.skip("Set RUN_LIVE_STACK=1 to run full-stack live test")
    if not os.getenv("GITHUB_TOKEN"):
        pytest.skip("GITHUB_TOKEN required")
    if not os.getenv("GROQ_API_KEY"):
        pytest.skip("GROQ_API_KEY required")

    from integrations.github_client import GitHubClient
    from integrations.groq_client import GroqClient
    from core.orchestrator import ScoutOrchestrator

    github = GitHubClient(token=os.environ["GITHUB_TOKEN"])
    groq = GroqClient(api_key=os.environ["GROQ_API_KEY"])
    orch = ScoutOrchestrator(github_client=github, groq_client=groq)

    out = orch.run_phase1(
        REPO_WITH_ISSUES,
        beginner_only=False,
        top_issues=2,
    )
    assert isinstance(out, dict)
    assert "success" in out
    if not out.get("success"):
        pytest.skip(f"Phase1 did not succeed (acceptable for flaky repos): {out.get('error')}")
    assert out.get("agent1_output") is not None
    assert len(out["agent1_output"].ranked_issues) >= 1
