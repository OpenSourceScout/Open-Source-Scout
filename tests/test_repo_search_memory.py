"""Tests for Pathfinder repo-search Hindsight helpers."""
from core.memory.repo_search_memory import (
    build_repo_search_recall_query,
    build_repo_search_retain_fact,
    repo_search_retain_metadata,
    truncate_search_prompt,
)
from core.schemas import RepoSearchPreferences


def test_truncate_search_prompt():
    long = "a" * 300
    assert len(truncate_search_prompt(long)) == 200
    assert truncate_search_prompt("  hi  ") == "hi"


def test_build_recall_query_includes_prompt_and_preferences():
    prefs = RepoSearchPreferences(
        tech_stack=["React"],
        domain="AI",
        difficulty="beginner",
        preferred_tasks=["frontend"],
    )
    q = build_repo_search_recall_query(
        "beginner friendly react projects in machine learning",
        prefs,
    )
    assert "React" in q
    assert "AI" in q
    assert "frontend" in q
    assert "similar to" in q


def test_build_retain_fact_and_metadata():
    prefs = RepoSearchPreferences(
        tech_stack=["Python"],
        domain="web",
        difficulty="intermediate",
        preferred_tasks=["backend"],
    )
    fact = build_repo_search_retain_fact("I want Django APIs", prefs, ranked_count=3)
    assert "Python" in fact
    assert "web" in fact
    assert "3 ranked" in fact
    assert "Django" in fact

    meta = repo_search_retain_metadata("I want Django APIs", prefs, ranked_count=3)
    assert meta["kind"] == "repo_search"
    assert meta["domain"] == "web"
    assert "Python" in meta["tech_stack"]
