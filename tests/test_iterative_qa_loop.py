"""
Iterative debugging: QA loop retries downstream agents when validation fails (slide item 8).
"""
from pathlib import Path
from unittest.mock import MagicMock

from core.orchestrator import ScoutOrchestrator
from core.schemas import (
    Agent1Output,
    Agent2Output,
    Agent3Output,
    AgentTestResult,
    CodeHit,
    GitHubIssue,
    GitHubRepo,
    PRDraft,
    RankedIssue,
    RepoInfo,
    ScoreBreakdown,
)
from core.schemas import TestingAgentOutput as QAOutput
from tests.helpers import make_github_issue


def _minimal_agent_outputs(issue: GitHubIssue):
    a1 = Agent1Output(
        repo=RepoInfo(url="https://github.com/o/r", default_branch="main"),
        ranked_issues=[
            RankedIssue(
                number=issue.number,
                title=issue.title,
                url=issue.html_url,
                labels=[],
                score_total=50,
                score_breakdown=ScoreBreakdown(
                    labels=10, clarity=10, activity=10, size_estimate=10, risk_penalty=0
                ),
                why=["test"],
            )
        ],
        selected_issue_number=issue.number,
    )
    a2 = Agent2Output(
        issue_number=issue.number,
        keywords=["x"],
        search_strategy=["s"],
        hits=[
            CodeHit(path="a.py", symbols=["f"], snippet="x", why_relevant="y"),
        ],
        confidence="Medium",
    )
    a3 = Agent3Output(
        briefing_markdown="# B\n\n## Code Location\n`a.py`\n\n## Implementation Plan\n1. Do.\n\n## Testing Strategy\n`pytest`\n",
        pr_draft=PRDraft(
            branch_name="fix/1",
            commit_message="fix: x",
            pr_title="T",
            pr_body=f"## Summary\nFixes #{issue.number}.\n",
        ),
        test_commands=["pytest"],
        risk_notes=["r"],
    )
    return a1, a2, a3


def test_qa_loop_retries_archaeologist_then_passes():
    issue = make_github_issue(number=7, title="Test issue")
    repo = GitHubRepo(
        full_name="o/r",
        html_url="https://github.com/o/r",
        clone_url="https://github.com/o/r.git",
    )
    a1, a2, a3 = _minimal_agent_outputs(issue)

    github = MagicMock()
    groq = MagicMock()
    orch = ScoutOrchestrator(github_client=github, groq_client=groq)

    qa_calls = {"n": 0}

    def qa_run(**kwargs):
        qa_calls["n"] += 1
        if qa_calls["n"] == 1:
            return QAOutput(
                overall_passed=False,
                overall_score=40,
                agent_results=[
                    AgentTestResult(
                        agent_name="Archaeologist",
                        passed=False,
                        score=30,
                        issues_found=["hits incomplete"],
                        suggestions=["add symbol names"],
                    )
                ],
                summary="needs retry",
                retry_recommended=True,
                retry_agents=["Archaeologist"],
            )
        return QAOutput(
            overall_passed=True,
            overall_score=85,
            agent_results=[
                AgentTestResult(agent_name="Archaeologist", passed=True, score=85),
            ],
            summary="ok",
            retry_recommended=False,
            retry_agents=[],
        )

    orch.testing_agent.run = MagicMock(side_effect=qa_run)
    orch.agent2.run = MagicMock(return_value=a2)
    orch.agent3.run = MagicMock(return_value=a3)
    orch.pathfinder.run = MagicMock(return_value=None)

    out = orch._run_qa_loop(
        repo=repo,
        issue=issue,
        issues=[issue],
        agent1_output=a1,
        agent2_output=a2,
        agent3_output=a3,
        repo_path=Path("."),
        file_tree=["a.py"],
        top_issues=3,
    )

    assert qa_calls["n"] == 2
    assert orch.agent2.run.call_count >= 1
    assert orch.agent3.run.call_count >= 1
    assert out["testing_output"].overall_passed is True
