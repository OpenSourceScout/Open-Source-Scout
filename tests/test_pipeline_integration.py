"""
Integration: chained Phase 1 → 2 → 3 with real orchestrator wiring (GitHub + Groq mocked).

Covers slide integration between backend services and the multi-agent pipeline
without live GitHub or LLM calls.
"""
from pathlib import Path
from unittest.mock import MagicMock

from core.orchestrator import ScoutOrchestrator
from core.schemas import Agent2Output, Agent3Output, CodeHit, GitHubRepo, PRDraft
from tests.helpers import make_github_issue
from tests.slide_quality import assert_slide_deliverables_quality


def test_phase1_phase2_phase3_chain_produces_qa_ready_outputs(tmp_path: Path):
    repo = GitHubRepo(
        full_name="acme/app",
        html_url="https://github.com/acme/app",
        clone_url="https://github.com/acme/app.git",
        language="Python",
        languages={"Python": 100},
    )
    issues = [
        make_github_issue(number=3, labels=["good first issue"], title="Improve error message"),
    ]
    github = MagicMock()
    github.get_repo.return_value = repo
    github.get_issues.return_value = issues
    github.clone_repo.return_value = tmp_path
    github.get_file_tree.return_value = ["app/main.py"]

    groq = MagicMock()
    groq.complete.return_value = '{"reasons": ["Small scope", "Clear title", "Good labels"]}'

    orch = ScoutOrchestrator(github_client=github, groq_client=groq)
    p1 = orch.run_phase1("https://github.com/acme/app", top_issues=2)
    assert p1["success"] is True
    issue = p1["issues"][0]

    agent2_out = Agent2Output(
        issue_number=issue.number,
        keywords=["error"],
        search_strategy=["grep"],
        hits=[
            CodeHit(
                path="app/main.py",
                symbols=["main"],
                snippet="def main(): pass",
                why_relevant="Entry point",
            )
        ],
        confidence="High",
    )
    orch.agent2.run = MagicMock(return_value=agent2_out)

    p2 = orch.run_phase2("https://github.com/acme/app", issue)
    assert p2["success"] is True

    agent3_out = Agent3Output(
        briefing_markdown=(
            "# Contributor Briefing\n\n## Code Location\nEdit `app/main.py`.\n\n"
            "## Implementation Plan\n1. Adjust error string.\n2. Add test.\n\n"
            "## Testing Strategy\nRun `pytest` from repo root.\n"
        ),
        pr_draft=PRDraft(
            branch_name="fix/3-error-msg",
            commit_message="fix: improve CLI error message",
            pr_title="Improve error message",
            pr_body=f"## Summary\nFixes #{issue.number}.\n\n## Testing\npytest\n",
        ),
        test_commands=["pytest", "pytest -q"],
        risk_notes=["Low risk"],
    )
    orch.agent3.run = MagicMock(return_value=agent3_out)

    p3 = orch.run_phase3(repo, issue, p1["agent1_output"], p2["agent2_output"])
    assert p3["success"] is True
    assert_slide_deliverables_quality(p3["agent3_output"], issue_number=issue.number)
