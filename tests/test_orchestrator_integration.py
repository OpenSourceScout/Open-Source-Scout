"""
Integration-style tests: orchestrator phases with mocked GitHub + Groq (no network).
"""
from pathlib import Path
from unittest.mock import MagicMock

from core.orchestrator import ScoutOrchestrator
from core.schemas import Agent2Output, CodeHit, GitHubRepo
from tests.helpers import make_github_issue


def _repo():
    return GitHubRepo(
        full_name="acme/demo",
        html_url="https://github.com/acme/demo",
        clone_url="https://github.com/acme/demo.git",
        default_branch="main",
        description="Test",
        languages={"Python": 100},
    )


def _groq_stub():
    g = MagicMock()
    g.complete.return_value = (
        '{"reasons": ["Clear scope for newcomers", "Well-labeled issue", "Small change"]}'
    )
    return g


class TestPhase1Integration:
    def test_phase1_success_with_ranked_issues(self):
        github = MagicMock()
        github.get_repo.return_value = _repo()
        github.get_issues.return_value = [
            make_github_issue(number=1, labels=["good first issue"], title="Easy fix"),
            make_github_issue(number=2, labels=[], title="Hard"),
        ]
        orch = ScoutOrchestrator(github_client=github, groq_client=_groq_stub())
        out = orch.run_phase1(
            repo_url="https://github.com/acme/demo",
            beginner_only=True,
            top_issues=2,
        )
        assert out["success"] is True
        assert out["agent1_output"].selected_issue_number != 0
        assert len(out["agent1_output"].ranked_issues) >= 1
        scores = [ri.score_total for ri in out["agent1_output"].ranked_issues]
        assert scores == sorted(scores, reverse=True)

    def test_phase1_no_issues(self):
        github = MagicMock()
        github.get_repo.return_value = _repo()
        github.get_issues.return_value = []
        orch = ScoutOrchestrator(github_client=github, groq_client=_groq_stub())
        out = orch.run_phase1("https://github.com/acme/demo")
        assert out["success"] is False
        assert "issues" in out.get("error", "").lower()


class TestPhase2Integration:
    def test_phase2_invokes_clone_tree_and_agent2(self, tmp_path: Path):
        github = MagicMock()
        github.clone_repo.return_value = tmp_path
        github.get_file_tree.return_value = ["README.md", "src/app.py"]
        (tmp_path / "src").mkdir(parents=True)
        (tmp_path / "src" / "app.py").write_text("pass\n", encoding="utf-8")

        issue = make_github_issue(number=5, title="Fix app")
        orch = ScoutOrchestrator(github_client=github, groq_client=_groq_stub())
        orch.agent2.run = MagicMock(
            return_value=Agent2Output(
                issue_number=5,
                keywords=["app"],
                search_strategy=["scan src"],
                hits=[
                    CodeHit(
                        path="src/app.py",
                        symbols=["main"],
                        snippet="def main(): pass",
                        why_relevant="Entry",
                    )
                ],
                confidence="High",
            )
        )

        out = orch.run_phase2("https://github.com/acme/demo", issue)

        assert out["success"] is True
        assert out["agent2_output"].issue_number == 5
        github.clone_repo.assert_called_once()
        github.get_file_tree.assert_called_once()
        orch.agent2.run.assert_called_once()
