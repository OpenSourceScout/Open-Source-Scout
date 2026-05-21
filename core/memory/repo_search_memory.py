"""Helpers for Pathfinder repo-search Hindsight retain and recall."""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Optional

if TYPE_CHECKING:
    from core.schemas import RepoSearchPreferences

PROMPT_RETAIN_MAX_LEN = 200


def truncate_search_prompt(prompt: str, max_len: int = PROMPT_RETAIN_MAX_LEN) -> str:
    text = (prompt or "").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


def build_repo_search_recall_query(
    search_prompt: str,
    preferences: Optional["RepoSearchPreferences"],
) -> str:
    """Query string for Hindsight recall before ranking."""
    parts: list[str] = ["past repo search preferences", "skipped or disliked repositories"]
    if preferences:
        stack = ", ".join(preferences.tech_stack) if preferences.tech_stack else ""
        if stack:
            parts.append(f"tech stack: {stack}")
        if preferences.domain:
            parts.append(f"domain: {preferences.domain}")
        if preferences.difficulty:
            parts.append(f"difficulty: {preferences.difficulty}")
        if preferences.preferred_tasks:
            parts.append(f"tasks: {', '.join(preferences.preferred_tasks)}")
    prompt_bit = truncate_search_prompt(search_prompt, 120)
    if prompt_bit:
        parts.append(f"similar to: {prompt_bit}")
    return "; ".join(parts)


def build_repo_search_retain_fact(
    search_prompt: str,
    preferences: "RepoSearchPreferences",
    *,
    ranked_count: int,
) -> str:
    """Human-readable fact for Hindsight retain after a completed search."""
    stack = ", ".join(preferences.tech_stack) if preferences.tech_stack else "none"
    tasks = ", ".join(preferences.preferred_tasks) if preferences.preferred_tasks else "none"
    domain = preferences.domain or "any"
    snippet = truncate_search_prompt(search_prompt)
    line = (
        f"Repo search preferences: tech=[{stack}], domain={domain}, "
        f"difficulty={preferences.difficulty}, tasks=[{tasks}], "
        f"returned {ranked_count} ranked repos."
    )
    if snippet:
        line += f' User said: "{snippet}"'
    return line


def repo_search_retain_metadata(
    search_prompt: str,
    preferences: "RepoSearchPreferences",
    *,
    ranked_count: int,
) -> dict[str, str]:
    """Flat string metadata for Hindsight (SDK requires str values)."""
    return {
        "kind": "repo_search",
        "tech_stack": ",".join(preferences.tech_stack),
        "domain": preferences.domain or "",
        "difficulty": preferences.difficulty or "beginner",
        "preferred_tasks": ",".join(preferences.preferred_tasks),
        "search_prompt": truncate_search_prompt(search_prompt),
        "preferences_json": json.dumps(preferences.model_dump(), ensure_ascii=False)[:500],
        "ranked_count": str(ranked_count),
    }
