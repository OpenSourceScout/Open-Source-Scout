"""Module tests: Senior Dev briefing and PR draft generation (Agent 3)."""
import json
from unittest.mock import MagicMock

from core.agents.senior_dev import SeniorDevAgent
from core.schemas import (
    Agent1Output,
    Agent2Output,
    CodeHit,
    GitHubIssue,
    GitHubRepo,
    RankedIssue,
    RepoInfo,
    ScoreBreakdown,
)
from tests.slide_quality import assert_slide_deliverables_quality


def _briefing_sample() -> str:
    return """# Contributor Briefing: Fix login redirect

## Overview
Repository acme/app — issue asks to correct login handling.

## Repository Setup
Clone with `git clone` and install per README.

## Issue Analysis
Session validation missing in login path.

## Code Location
- `auth/handlers.py` — `handle_login`

## Implementation Plan
1. Add session check inside `handle_login`.
2. Add regression test.

## Testing Strategy
Run unit tests covering auth module.

## PR Preparation
Use branch `fix/9-login` and conventional commits.

## Notes & Risks
Low risk; touch authentication only.
"""


class TestSeniorDevBriefingGeneration:
    def test_run_produces_structured_briefing_pr_tests_and_risks(self):
        groq = MagicMock()
        groq.complete.side_effect = [
            _briefing_sample(),
            json.dumps(
                {
                    "commit_message": "fix(auth): validate session in handle_login",
                    "pr_title": "Fix session validation in login handler",
                    "pr_body": (
                        "## Summary\nFixes #9 — validates session in handle_login.\n\n"
                        "## Testing\n- pytest tests/auth/\n"
                    ),
                }
            ),
        ]
        repo = GitHubRepo(
            full_name="acme/app",
            html_url="https://github.com/acme/app",
            clone_url="https://github.com/acme/app.git",
            language="Python",
            languages={"Python": 100},
        )
        issue = GitHubIssue(
            number=9,
            title="Fix login redirect",
            body="handle_login should check session.",
            url="https://api.github.com/repos/acme/app/issues/9",
            html_url="https://github.com/acme/app/issues/9",
            labels=["bug"],
            state="open",
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-02T00:00:00Z",
        )
        agent1 = Agent1Output(
            repo=RepoInfo(url=repo.html_url, default_branch="main"),
            ranked_issues=[
                RankedIssue(
                    number=9,
                    title=issue.title,
                    url=issue.html_url,
                    labels=issue.labels,
                    score_total=70,
                    score_breakdown=ScoreBreakdown(
                        labels=15, clarity=12, activity=10, size_estimate=15, risk_penalty=0
                    ),
                    why=["Good first contribution"],
                )
            ],
            selected_issue_number=9,
        )
        agent2 = Agent2Output(
            issue_number=9,
            keywords=["login"],
            search_strategy=["handle_login"],
            hits=[
                CodeHit(
                    path="auth/handlers.py",
                    symbols=["handle_login"],
                    snippet="def handle_login",
                    why_relevant="Login handler",
                )
            ],
            confidence="High",
        )
        agent = SeniorDevAgent(groq)
        out = agent.run(repo, issue, agent1, agent2)
        assert_slide_deliverables_quality(out, issue_number=9)
        assert groq.complete.call_count >= 2
