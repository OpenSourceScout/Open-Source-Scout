"""
Output quality checks for code localization (Agent 2) and briefing / PR draft (Agent 3).
"""
from pathlib import Path

import pytest

from core.schemas import Agent2Output, Agent3Output, CodeHit, PRDraft
from tests.slide_quality import (
    assert_agent3_deliverables,
    assert_hits_reference_repo_paths,
)


class TestAgent2PathAccuracy:
    def test_hits_must_exist_in_tree(self, tmp_path: Path):
        core = tmp_path / "core"
        core.mkdir(parents=True)
        (core / "logic.py").write_text("def fix(): pass\n", encoding="utf-8")
        tree = ["core/logic.py"]
        good = Agent2Output(
            issue_number=1,
            keywords=["fix"],
            search_strategy=["grep"],
            hits=[
                CodeHit(
                    path="core/logic.py",
                    symbols=["fix"],
                    snippet="def fix(): pass",
                    why_relevant="Matches issue",
                )
            ],
            confidence="High",
        )
        assert_hits_reference_repo_paths(good, tree)

        bad = Agent2Output(
            issue_number=1,
            keywords=["x"],
            search_strategy=["y"],
            hits=[
                CodeHit(
                    path="ghost/missing.py",
                    symbols=[],
                    snippet="",
                    why_relevant="n/a",
                )
            ],
            confidence="Low",
        )
        with pytest.raises(AssertionError):
            assert_hits_reference_repo_paths(bad, tree)


class TestAgent3OutputQuality:
    def test_valid_sample_passes_heuristics(self):
        out = Agent3Output(
            briefing_markdown=(
                "# Contributor briefing\n\n## Code Location\nSee `core/logic.py`.\n\n"
                "## Implementation Plan\n1. Change X.\n2. Verify Y.\n\n"
                "## Testing Strategy\nRun `pytest tests/`.\n"
            ),
            pr_draft=PRDraft(
                branch_name="fix/1-typo",
                commit_message="fix: correct typo in README",
                pr_title="Fix README typo",
                pr_body="## Summary\nFixes #1.\n\n## Test plan\n- `pytest`",
            ),
            test_commands=["pytest tests/"],
            risk_notes=["Low risk"],
        )
        assert_agent3_deliverables(out)

    def test_trivial_briefing_fails(self):
        out = Agent3Output(
            briefing_markdown="short",
            pr_draft=PRDraft(
                branch_name="b",
                commit_message="c",
                pr_title="t",
                pr_body="x",
            ),
        )
        with pytest.raises(AssertionError):
            assert_agent3_deliverables(out)
