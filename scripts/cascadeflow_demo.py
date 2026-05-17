#!/usr/bin/env python3
"""
Compare cascadeflow session summaries across two POST /api/analyze calls.

Requires a running API (see Open-Source-Scout/run-backend.ps1), GROQ_API_KEY on the server,
and optional GitHub token. Sends X-User-Id for anonymous identity.

Usage:
  python scripts/cascadeflow_demo.py
Env:
  OSS_API_BASE=http://127.0.0.1:8003
  OSS_DEMO_REPO=https://github.com/tiangolo/fastapi
"""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import httpx

BASE = os.environ.get("OSS_API_BASE", "http://127.0.0.1:8003").rstrip("/")
REPO = os.environ.get("OSS_DEMO_REPO", "https://github.com/tiangolo/fastapi").strip()


def main() -> None:
    uid = os.environ.get("OSS_DEMO_USER_ID") or str(uuid.uuid4())
    headers = {"X-User-Id": uid, "Content-Type": "application/json"}
    payload = {"repo_url": REPO, "beginner_only": True}

    out_dir = Path(__file__).resolve().parent.parent / "demo_results"
    out_dir.mkdir(parents=True, exist_ok=True)
    report_path = out_dir / "cascadeflow_demo.md"

    rows = []
    with httpx.Client(timeout=600.0) as client:
        for i in range(1, 3):
            r = client.post(f"{BASE}/api/analyze", headers=headers, json=payload)
            r.raise_for_status()
            body = r.json()
            cf = body.get("cascadeflow_run") or {}
            rows.append(
                {
                    "run": i,
                    "cost": cf.get("cost"),
                    "mode": cf.get("mode"),
                    "steps": cf.get("step_count"),
                    "budget_remaining": cf.get("budget_remaining"),
                }
            )

    lines = [
        "# Cascadeflow demo (live API)",
        "",
        f"- API: `{BASE}`",
        f"- Repo: `{REPO}`",
        f"- Anonymous user: `{uid}`",
        "",
        "## Runs",
        "",
        "```json",
        json.dumps(rows, indent=2),
        "```",
        "",
        "## Delta",
        "",
    ]
    if len(rows) >= 2:
        c1 = rows[0].get("cost")
        c2 = rows[1].get("cost")
        lines.append(f"- Cost run 1: `{c1}`")
        lines.append(f"- Cost run 2: `{c2}`")
        try:
            if c1 not in (None, 0) and c2 is not None:
                pct = (float(c1) - float(c2)) / float(c1) * 100.0
                lines.append(f"- Approx. reduction run2 vs run1: `{pct:.1f}%`")
        except (TypeError, ValueError):
            pass

    report_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {report_path}")


if __name__ == "__main__":
    main()
