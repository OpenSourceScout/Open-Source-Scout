"""
Cascadeflow harness bootstrap and helpers for scoped runs.
"""
from __future__ import annotations

import json
import logging
import os
from contextlib import contextmanager
from typing import Any, Generator, Iterator, Optional

logger = logging.getLogger(__name__)

try:
    import cascadeflow
except ImportError:  # pragma: no cover
    cascadeflow = None  # type: ignore[misc, assignment]


def configure_cascadeflow_from_env() -> str:
    """
    Initialize global cascadeflow harness (idempotent).

    Returns resolved mode string: off | observe | enforce.
    """
    if cascadeflow is None:
        logger.warning("cascadeflow is not installed; runtime intelligence disabled")
        return "off"
    raw = (os.getenv("CASCADEFLOW_MODE") or "observe").strip().lower()
    if raw not in ("off", "observe", "enforce"):
        raw = "observe"
    report = cascadeflow.init(mode=raw)
    logger.info(
        "cascadeflow init mode=%s instrumented=%s",
        getattr(report, "mode", raw),
        getattr(report, "instrumented", []),
    )
    return raw


def get_cascadeflow_mode() -> str:
    if cascadeflow is None:
        return "off"
    raw = (os.getenv("CASCADEFLOW_MODE") or "observe").strip().lower()
    return raw if raw in ("off", "observe", "enforce") else "observe"


def default_budget_usd() -> float:
    try:
        return float(os.getenv("CASCADEFLOW_BUDGET_USD") or "0.10")
    except ValueError:
        return 0.10


@contextmanager
def cascadeflow_budget_run(budget_usd: Optional[float]) -> Iterator[Any]:
    """
    Opens a cascadeflow run scope with a USD budget cap.

    When cascadeflow is unavailable or mode is off, this is a no-op context.
    """
    if cascadeflow is None or get_cascadeflow_mode() == "off":
        yield None
        return
    cap = budget_usd if budget_usd is not None else default_budget_usd()
    with cascadeflow.run(budget=cap) as session:
        yield session


def cascadeflow_session_payload(session: Any | None) -> dict[str, Any]:
    """Serialize harness session for API responses (Decision Trace UI)."""
    if session is None:
        return {
            "mode": get_cascadeflow_mode(),
            "run_id": None,
            "step_count": 0,
            "cost": 0.0,
            "budget_max": None,
            "budget_remaining": None,
            "latency_used_ms": 0.0,
            "energy_used": 0.0,
            "tool_calls": 0,
            "trace": [],
        }
    summary = {}
    try:
        summary = session.summary()
    except Exception:
        summary = {}
    trace: list[dict[str, Any]] = []
    try:
        trace = session.trace()
    except Exception:
        trace = []
    out = dict(summary)
    out["mode"] = get_cascadeflow_mode()
    # Trace entries may contain non-JSON floats/objects — normalize lightly
    safe_trace = []
    for row in trace:
        try:
            safe_trace.append(json.loads(json.dumps(row, default=str)))
        except Exception:
            safe_trace.append({"raw": str(row)})
    out["trace"] = safe_trace
    return out
