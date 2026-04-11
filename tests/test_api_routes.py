"""
API integration tests: FastAPI routes, validation, and error paths (mocked upstream where needed).
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import app
from core.schemas import Agent1Output, GitHubRepo, RankedIssue, RepoInfo, ScoreBreakdown


@pytest.fixture
def client():
    return TestClient(app)


class TestHealth:
    def test_health_ok(self, client):
        r = client.get("/api/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert "db_initialized" in body


class TestSearchReposValidation:
    def test_empty_tech_stack_400(self, client):
        r = client.post("/api/search-repos", json={"tech_stack": []})
        assert r.status_code == 400
        assert "technology" in r.json()["detail"].lower()


class TestAnalyzePhase1Mocked:
    def test_no_issues_returns_json_without_crash(self, client):
        repo = GitHubRepo(
            full_name="a/b",
            html_url="https://github.com/a/b",
            clone_url="https://github.com/a/b.git",
        )
        with patch("app.api.GitHubClient") as Gh, patch("app.api.GroqClient") as Gq:
            Gh.return_value.get_repo.return_value = repo
            Gh.return_value.get_issues.return_value = []
            Gq.return_value = MagicMock()
            r = client.post(
                "/api/analyze",
                json={
                    "repo_url": "https://github.com/a/b",
                    "beginner_only": True,
                },
            )
        assert r.status_code == 200
        data = r.json()
        assert data["success"] is False
        assert "issues" in data.get("error", "").lower()

    def test_with_issues_returns_ranked_output(self, client):
        from tests.helpers import make_github_issue

        repo = GitHubRepo(
            full_name="a/b",
            html_url="https://github.com/a/b",
            clone_url="https://github.com/a/b.git",
            languages={"Python": 1},
        )
        issues = [
            make_github_issue(number=1, labels=["good first issue"], title="Easy"),
        ]
        ranked = Agent1Output(
            repo=RepoInfo(
                url=repo.html_url,
                default_branch="main",
                description=None,
                languages=["Python"],
            ),
            ranked_issues=[
                RankedIssue(
                    number=1,
                    title="Easy",
                    url="https://github.com/a/b/issues/1",
                    labels=["good first issue"],
                    score_total=90,
                    score_breakdown=ScoreBreakdown(
                        labels=25,
                        clarity=10,
                        activity=10,
                        size_estimate=15,
                        risk_penalty=0,
                    ),
                    why=["ok"],
                )
            ],
            selected_issue_number=1,
        )
        with patch("app.api.GitHubClient") as Gh, patch("app.api.GroqClient") as Gq, patch(
            "app.api.ScoutOrchestrator"
        ) as Orch:
            Gh.return_value.get_repo.return_value = repo
            Gh.return_value.get_issues.return_value = issues
            Orch.return_value.run_phase1.return_value = {
                "success": True,
                "repo": repo,
                "issues": issues,
                "agent1_output": ranked,
            }
            Gq.return_value = MagicMock()
            r = client.post(
                "/api/analyze",
                json={"repo_url": "https://github.com/a/b"},
            )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert body["agent1_output"]["selected_issue_number"] == 1


class TestExportPdf:
    def test_returns_pdf_bytes(self, client):
        r = client.post(
            "/api/export/pdf",
            json={"content": "# Title\n\nSome **markdown** content for the briefing.\n"},
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 100
