"""
API integration tests: FastAPI routes, validation, and error paths (mocked upstream where needed).
"""
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import app
from core.schemas import Agent1Output, GitHubRepo, RankedIssue, RepoInfo, ScoreBreakdown

ANON_HEADERS = {"X-User-Id": "pytest-anonymous-user"}


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
        r = client.post("/api/search-repos", json={"tech_stack": []}, headers=ANON_HEADERS)
        assert r.status_code == 400
        assert "technology" in r.json()["detail"].lower()


class TestAnalyzePhase1Mocked:
    def test_no_issues_returns_json_without_crash(self, client):
        repo = GitHubRepo(
            full_name="a/b",
            html_url="https://github.com/a/b",
            clone_url="https://github.com/a/b.git",
        )
        with patch("app.api.GitHubClient") as Gh, patch("app.api.ScoutOrchestrator") as Orch:
            Gh.return_value.get_repo.return_value = repo
            Gh.return_value.get_issues.return_value = []
            Orch.return_value.run_phase1.return_value = {
                "success": False,
                "error": "No issues found matching criteria",
                "repo": repo,
            }
            r = client.post(
                "/api/analyze",
                headers=ANON_HEADERS,
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
                headers=ANON_HEADERS,
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


class TestTerminalRoutes:
    def test_create_terminal_session(self, client):
        manager = MagicMock()
        manager.create_session.return_value = {
            "session_id": "sess123",
            "owner": "octocat",
            "repo": "hello-world",
            "ref": "main",
            "terminals": [],
            "suggestions_count": 3,
        }
        client.app.state.terminal_manager = manager

        r = client.post(
            "/api/terminal/sessions",
            json={"owner": "octocat", "repo": "hello-world", "ref": "main"},
        )

        assert r.status_code == 200
        body = r.json()
        assert body["session_id"] == "sess123"
        assert body["owner"] == "octocat"
        manager.create_session.assert_called_once()

    def test_sync_files_route(self, client):
        manager = MagicMock()
        manager.sync_files.return_value = {"synced_files": 2, "total_files": 2}
        client.app.state.terminal_manager = manager

        r = client.post(
            "/api/terminal/sess123/sync-files",
            json={
                "files": [
                    {"path": "a.py", "content": "print('a')"},
                    {"path": "b.py", "content": "print('b')"},
                ]
            },
        )

        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["synced_files"] == 2
        manager.sync_files.assert_called_once()

    def test_run_suggested_rejects_disallowed_command(self, client):
        manager = MagicMock()
        manager.is_allowed_suggested_command.return_value = False
        client.app.state.terminal_manager = manager

        r = client.post(
            "/api/terminal/sess123/run-suggested",
            json={
                "terminal_id": "term1",
                "command": "rm -rf /",
                "cwd": None,
            },
        )

        assert r.status_code == 400
        assert "not allowed" in r.json()["detail"].lower()
        manager.run_command.assert_not_called()

    def test_run_suggested_executes_allowed_command(self, client):
        manager = MagicMock()
        manager.is_allowed_suggested_command.return_value = True
        manager.run_command.return_value = {"accepted": True, "command": "uv sync"}
        client.app.state.terminal_manager = manager

        r = client.post(
            "/api/terminal/sess123/run-suggested",
            json={
                "terminal_id": "term1",
                "command": "uv sync",
                "cwd": None,
            },
        )

        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["accepted"] is True
        manager.run_command.assert_called_once_with(
            session_id="sess123",
            terminal_id="term1",
            command="uv sync",
            cwd=None,
        )

    def test_run_manual_command(self, client):
        manager = MagicMock()
        manager.run_command.return_value = {"accepted": True, "command": "python main.py"}
        client.app.state.terminal_manager = manager

        r = client.post(
            "/api/terminal/sess123/run",
            json={
                "terminal_id": "term1",
                "command": "python main.py",
                "cwd": None,
            },
        )

        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["accepted"] is True
        manager.run_command.assert_called_once_with(
            session_id="sess123",
            terminal_id="term1",
            command="python main.py",
            cwd=None,
        )

    def test_output_polling_route(self, client):
        manager = MagicMock()
        manager.read_output.return_value = ["line1\n", "line2\n"]
        manager.get_terminal_status.return_value = {
            "terminal_id": "term1",
            "label": "Terminal 1",
            "cwd": "D:/repo",
            "closed": False,
            "exit_code": None,
        }
        client.app.state.terminal_manager = manager

        r = client.get("/api/terminal/sess123/term1/output?max_chunks=50")

        assert r.status_code == 200
        body = r.json()
        assert body["chunks"] == ["line1\n", "line2\n"]
        assert body["closed"] is False
        assert body["exit_code"] is None
        manager.read_output.assert_called_once_with("sess123", "term1", max_chunks=50)
        manager.get_terminal_status.assert_called_once_with("sess123", "term1")
