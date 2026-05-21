#!/usr/bin/env python3
"""
Full demo harness: Pathfinder cold vs warm plus analyze + feedback loops.

Produces demo_results/full_demo.md comparing Pathfinder outputs and cascadeflow costs.

Requires live API + keys on the backend. Anonymous identity via OSS_DEMO_USER_ID or auto UUID.

Env:
  OSS_API_BASE=http://127.0.0.1:8003
  OSS_DEMO_USER_ID=stable-id-for-repeat-runs
"""
from __future__ import annotations

import json
import os
import uuid
from collections import Counter
from pathlib import Path

import httpx

BASE = os.environ.get("OSS_API_BASE", "http://127.0.0.1:8003").rstrip("/")
ANCHOR_REPO = os.environ.get("OSS_DEMO_MAIN_REPO", "https://github.com/tiangolo/fastapi")

EXTRA_ANALYSIS_REPOS = [
    os.environ.get("OSS_DEMO_REPO_B", "https://github.com/psf/requests"),
    os.environ.get("OSS_DEMO_REPO_C", "https://github.com/pallets/flask"),
    os.environ.get("OSS_DEMO_REPO_D", "https://github.com/python/cpython"),
]


def pf_snapshot(body: dict) -> dict:
    names = [r.get("full_name") for r in body.get("ranked_repos") or []]
    return {"repos": names, "memory_summary": body.get("memory_summary", ""), "ids": body.get("recalled_memory_ids") or []}


def extract_cost(payload: dict) -> float | None:
    cr = payload.get("cascadeflow_run") or {}
    v = cr.get("cost")
    try:
        return float(v) if v is not None else None
    except (TypeError, ValueError):
        return None


def main() -> None:
    uid = os.environ.get("OSS_DEMO_USER_ID") or str(uuid.uuid4())
    headers = {"X-User-Id": uid, "Content-Type": "application/json"}
    out_dir = Path(__file__).resolve().parent.parent / "demo_results"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "full_demo.md"

    citation_counter: Counter[str] = Counter()
    memory_snapshots = []

    tech = {"tech_stack": ["Python", "React"], "fast_model": "meta-llama/llama-4-scout-17b-16e-instruct"}

    lines = [
        "# Full demo report",
        "",
        f"- API base: `{BASE}`",
        f"- Stable anonymous id: `{uid}`",
        "",
    ]

    with httpx.Client(timeout=900.0) as client:
        # Run 1 — cold Pathfinder
        r1 = client.post(f"{BASE}/api/search-repos", headers=headers, json=tech)
        r1.raise_for_status()
        b1 = r1.json()
        snap_a = pf_snapshot(b1)
        cost_search_1 = extract_cost(b1)
        for mid in snap_a.get("ids") or []:
            citation_counter[mid] += 1

        lines += ["## Run 1 — Pathfinder (cold)", "", "```json", json.dumps(snap_a, indent=2), "```", ""]
        lines.append(f"- cascadeflow estimated cost (search-repos): `{cost_search_1}`")
        lines.append("")

        # Runs 2–4 — varied analyzes + feedback (best-effort; skips failures)
        rotation = EXTRA_ANALYSIS_REPOS[:3]
        for idx, repo_url in enumerate(rotation, start=2):
            lines.append(f"## Run {idx} — analyze + scripted feedback ({repo_url})")
            try:
                ar = client.post(
                    f"{BASE}/api/analyze",
                    headers=headers,
                    json={"repo_url": repo_url, "beginner_only": True},
                )
                ar.raise_for_status()
                analysis = ar.json()
                lines.append(f"- analyze cascadeflow cost: `{extract_cost(analysis)}`")
                a1 = analysis.get("agent1_output") or {}
                issues = a1.get("ranked_issues") or []
                # Repo thumb + skip alternate repos for variety
                client.post(
                    f"{BASE}/api/feedback/repo-selection",
                    headers=headers,
                    json={"repo_url": repo_url, "action": "selected"},
                )
                if issues:
                    iss = issues[0]
                    client.post(
                        f"{BASE}/api/feedback/issue-interaction",
                        headers=headers,
                        json={
                            "issue_url": iss.get("url") or f"{repo_url}/issues/{iss.get('number')}",
                            "action": "skipped",
                        },
                    )
                    if issues[-1].get("url"):
                        client.post(
                            f"{BASE}/api/feedback/thumbs",
                            headers=headers,
                            json={
                                "target_type": "issue",
                                "target_id": issues[-1].get("url"),
                                "vote": "down",
                            },
                        )
                mids = (a1.get("recalled_memory_ids") or []) if isinstance(a1, dict) else []
                for mid in mids:
                    citation_counter[mid] += 1
                lines.append("")
            except Exception as exc:
                lines.append(f"- skipped ({exc})")
                lines.append("")
                continue

        # Run 5 — warm Pathfinder (same stack as run 1)
        r5 = client.post(f"{BASE}/api/search-repos", headers=headers, json=tech)
        r5.raise_for_status()
        b5 = r5.json()
        snap_b = pf_snapshot(b5)
        cost_search_5 = extract_cost(b5)
        for mid in snap_b.get("ids") or []:
            citation_counter[mid] += 1

        lines += ["## Run 5 — Pathfinder (warm)", "", "```json", json.dumps(snap_b, indent=2), "```", ""]
        lines.append(f"- cascadeflow estimated cost (search-repos): `{cost_search_5}`")
        lines.append("")

        try:
            ms = client.get(f"{BASE}/api/memory/summary", headers={"X-User-Id": uid})
            if ms.status_code == 200:
                memory_snapshots.append(ms.json())
        except Exception:
            pass

    lines += ["## Comparison", "", "### Pathfinder repo ordering delta", ""]
    only_a = [x for x in snap_a["repos"] if x not in snap_b["repos"]]
    only_b = [x for x in snap_b["repos"] if x not in snap_a["repos"]]
    lines.append(f"- Repos only in run 1: `{only_a}`")
    lines.append(f"- Repos only in run 5: `{only_b}`")
    lines.append("")
    lines.append("### Cost")
    lines.append(f"- Search cost run 1: `{cost_search_1}`")
    lines.append(f"- Search cost run 5: `{cost_search_5}`")
    try:
        if cost_search_1 and cost_search_5 is not None and float(cost_search_1) > 0:
            pct = (float(cost_search_1) - float(cost_search_5)) / float(cost_search_1) * 100.0
            lines.append(f"- Approx. Pathfinder cost delta (positive means cheaper on run 5): `{pct:.1f}%`")
    except (TypeError, ValueError):
        pass
    lines.append("")

    lines.append("### Memory totals (latest snapshot)")
    if memory_snapshots:
        lines.append("```json")
        lines.append(json.dumps(memory_snapshots[-1].get("totals"), indent=2))
        lines.append("```")
    lines.append("")

    top3 = citation_counter.most_common(3)
    lines.append("### Three most frequent recalled memory IDs observed across calls")
    lines.append(f"`{top3}`")

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
