"""API routes: file fetch, repo tree, search-repos success, LLM rate-limit path (slide 2 & 7)."""
from unittest.mock import MagicMock, patch

import pytest
import requests
from fastapi.testclient import TestClient
from tenacity import RetryError

from app.api import app
from core.schemas import (
    PathfinderOutput,
    RankedRepo,
    RepoScoreBreakdown,
)

ANON_HEADERS = {"X-User-Id": "pytest-slide-anon"}


@pytest.fixture
def client():
    return TestClient(app)


class TestGithubBackedEndpoints:
    def test_get_file_content_success(self, client):
        with patch("app.api.GitHubClient") as Gh:
            Gh.return_value.get_file_content.return_value = "hello world"
            r = client.get("/api/repos/o/r/files/src%2Fapp.py", params={"ref": "main"})
        assert r.status_code == 200
        assert r.json()["content"] == "hello world"
        Gh.return_value.get_file_content.assert_called_once()

    def test_get_repo_tree_success(self, client):
        with patch("app.api.GitHubClient") as Gh:
            Gh.return_value.get_repo_file_tree.return_value = [
                {"path": "README.md", "type": "file", "size": 10},
            ]
            r = client.get("/api/repos/o/r/tree")
        assert r.status_code == 200
        assert r.json()["total"] == 1

    def test_get_file_content_propagates_github_failure(self, client):
        with patch("app.api.GitHubClient") as Gh:
            Gh.return_value.get_file_content.side_effect = requests.HTTPError("404")
            r = client.get("/api/repos/o/r/files/missing.py")
        assert r.status_code == 500


class TestSearchReposIntegration:
    def test_search_repos_returns_ranked_payload(self, client):
        ranked = RankedRepo(
            full_name="demo/lib",
            url="https://github.com/demo/lib",
            description="A library",
            language="Python",
            stars=120,
            open_issues=12,
            score_total=75,
            score_breakdown=RepoScoreBreakdown(
                active_score=70,
                beginner_friendly=65,
                tech_match=80,
                issue_quality=60,
                community_score=55,
            ),
            why_match=["Strong Python match", "Active maintenance"],
        )
        out = PathfinderOutput(
            tech_stack=["python"],
            ranked_repos=[ranked],
            search_queries_used=["language:python stars:>50"],
        )
        with patch("app.api.PathfinderAgent") as PA, patch("app.api.GitHubClient"), patch(
            "app.api.GroqClient"
        ):
            PA.return_value.run.return_value = out
            r = client.post(
                "/api/search-repos",
                headers=ANON_HEADERS,
                json={"tech_stack": ["python"], "fast_model": "openai/gpt-oss-120b"},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["ranked_repos"][0]["full_name"] == "demo/lib"


class TestAnalyzeRateLimitHandling:
    def test_analyze_retry_error_returns_client_error_not_200(self, client):
        def fail(*_a, **_k):
            raise RetryError(MagicMock())

        with patch("app.api.ScoutOrchestrator") as Orch, patch("app.api.GitHubClient"), patch(
            "app.api.GroqClient"
        ):
            Orch.return_value.run_phase1.side_effect = fail
            r = client.post(
                "/api/analyze",
                headers=ANON_HEADERS,
                json={"repo_url": "https://github.com/a/b"},
            )
        assert r.status_code in (429, 500)


class TestReAnalyzeErrors:
    def test_re_analyze_missing_issue_returns_404(self, client):
        from core.schemas import GitHubRepo

        repo = GitHubRepo(
            full_name="a/b",
            html_url="https://github.com/a/b",
            clone_url="https://github.com/a/b.git",
        )
        with patch("app.api.GitHubClient") as Gh, patch("app.api.ScoutOrchestrator") as Orch:
            Gh.return_value.get_repo.return_value = repo
            Gh.return_value.get_issue.side_effect = RuntimeError("not found")
            Orch.return_value = MagicMock()
            r = client.post(
                "/api/re-analyze-issue",
                headers=ANON_HEADERS,
                json={
                    "repo_url": "https://github.com/a/b",
                    "issue_number": 99999,
                },
            )
        assert r.status_code == 404
        detail = r.json().get("detail", "").lower()
        assert "not found" in detail or "99999" in detail
