"""Tests for skipped-repository filtering."""
from types import SimpleNamespace

from core.memory.skipped_repos import (
    merge_exclude_sets,
    normalize_repo_id,
    repo_matches_exclude,
    skipped_ids_from_memories,
)


def test_normalize_repo_id_from_url():
    assert normalize_repo_id("https://github.com/meteor/meteor") == "meteor/meteor"


def test_skipped_ids_from_memories_metadata():
    memories = [
        {
            "text": "Pathfinder ranking: user skipped repository https://github.com/meteor/meteor",
            "metadata": {
                "kind": "repo_selection",
                "repo_url": "https://github.com/meteor/meteor",
                "action": "skipped",
            },
        }
    ]
    assert skipped_ids_from_memories(memories) == {"meteor/meteor"}


def test_merge_exclude_sets():
    merged = merge_exclude_sets(
        ["https://github.com/a/b"],
        {"c/d"},
    )
    assert merged == {"a/b", "c/d"}


def test_repo_matches_exclude():
    repo = SimpleNamespace(full_name="meteor/meteor", html_url="https://github.com/meteor/meteor")
    assert repo_matches_exclude(repo, {"meteor/meteor"})
