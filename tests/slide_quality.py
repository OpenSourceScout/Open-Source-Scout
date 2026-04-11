"""Slide-aligned quality assertions for localization and Agent 3 outputs."""
import re

from core.schemas import Agent2Output, Agent3Output


def assert_hits_reference_repo_paths(output: Agent2Output, file_tree: list[str]) -> None:
    tree_set = {p.replace("\\", "/") for p in file_tree}
    for hit in output.hits:
        normalized = hit.path.replace("\\", "/")
        assert normalized in tree_set, f"Hit path {hit.path!r} not in file_tree"


def assert_agent3_deliverables(output: Agent3Output) -> None:
    assert len(output.briefing_markdown.strip()) >= 80, "Briefing too short"
    assert "#" in output.briefing_markdown or "##" in output.briefing_markdown, (
        "Briefing should use markdown headings"
    )
    pr = output.pr_draft
    assert pr.branch_name.strip(), "branch_name required"
    assert pr.commit_message.strip(), "commit_message required"
    assert pr.pr_title.strip(), "pr_title required"
    assert len(pr.pr_body.strip()) >= 20, "pr_body should describe the change"
    assert isinstance(output.test_commands, list)
    assert isinstance(output.risk_notes, list)


def assert_slide_deliverables_quality(output: Agent3Output, issue_number: int) -> None:
    """
    Stricter checks: fix plan, testing guidance, PR draft (slide item 5).
    """
    assert_agent3_deliverables(output)
    md = output.briefing_markdown.lower()
    plan_signals = (
        "implementation plan",
        "fix plan",
        "step-by-step",
        "🔧 implementation",
    )
    test_signals = (
        "testing strategy",
        "test plan",
        "pytest",
        "npm test",
        "✅ testing",
    )
    location_signals = (
        "code location",
        "files to",
        "📍 code",
    )
    assert any(s in md for s in plan_signals), "Briefing should include an implementation / fix plan section"
    assert any(s in md for s in test_signals), "Briefing should include testing guidance"
    assert any(s in md for s in location_signals), "Briefing should reference code locations"
    pr_blob = (output.pr_draft.pr_title + "\n" + output.pr_draft.pr_body).lower()
    assert re.search(rf"#\s*{issue_number}\b|fixes\s*#{issue_number}", pr_blob), (
        "PR title or body should reference the issue number"
    )
    actionable_cmds = [c for c in output.test_commands if c.strip() and not c.strip().startswith("#")]
    assert actionable_cmds, "Testing guidance should include at least one concrete command"
