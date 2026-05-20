"""Helpers to exclude user-skipped repositories from Pathfinder results."""
from __future__ import annotations

import re
from typing import Any, Iterable


_GH_REPO_RE = re.compile(r"github\.com/([^/\s]+/[^/\s#?]+)", re.I)


def normalize_repo_id(url_or_name: str) -> str:
    if not url_or_name or not str(url_or_name).strip():
        return ""
    s = str(url_or_name).strip().lower().replace(".git", "").rstrip("/")
    m = _GH_REPO_RE.search(s)
    if m:
        return m.group(1).lower()
    if "/" in s and " " not in s:
        return s.lower()
    return s.lower()


def skipped_ids_from_memories(memories: Iterable[dict[str, Any]]) -> set[str]:
    """Collect owner/repo ids the user has skipped (from Hindsight experience memories)."""
    out: set[str] = set()
    for m in memories or []:
        meta = m.get("metadata") if isinstance(m.get("metadata"), dict) else {}
        action = (meta.get("action") or "").lower()
        text = (m.get("text") or "").lower()
        if action != "skipped" and "skipped repository" not in text:
            continue
        repo_url = meta.get("repo_url") or ""
        if not repo_url and "github.com" in text:
            found = _GH_REPO_RE.search(m.get("text") or "")
            if found:
                repo_url = f"https://github.com/{found.group(1)}"
        rid = normalize_repo_id(repo_url)
        if rid:
            out.add(rid)
    return out


def merge_exclude_sets(
    request_excludes: Iterable[str] | None,
    memory_excludes: set[str],
) -> set[str]:
    merged = set(memory_excludes)
    for item in request_excludes or []:
        rid = normalize_repo_id(item)
        if rid:
            merged.add(rid)
    return merged


def repo_matches_exclude(repo, exclude_ids: set[str]) -> bool:
    if not exclude_ids:
        return False
    full = normalize_repo_id(getattr(repo, "full_name", "") or "")
    url = normalize_repo_id(getattr(repo, "html_url", "") or getattr(repo, "url", "") or "")
    return full in exclude_ids or url in exclude_ids
