"""Contextvars for Groq / cascadeflow instrumentation (per-request isolation)."""
from __future__ import annotations

from contextvars import ContextVar
from typing import Any

pipeline_run_id_var: ContextVar[str | None] = ContextVar("scout_pipeline_run_id", default=None)
pipeline_user_id_var: ContextVar[str | None] = ContextVar("scout_pipeline_user_id", default=None)
groq_agent_name_var: ContextVar[str | None] = ContextVar("scout_groq_agent_name", default=None)
groq_step_index_var: ContextVar[int] = ContextVar("scout_groq_step_index", default=0)


def set_pipeline_run_context(run_id: str | None, user_id: str | None) -> None:
    pipeline_run_id_var.set(run_id)
    pipeline_user_id_var.set(user_id)


def clear_pipeline_run_context() -> None:
    pipeline_run_id_var.set(None)
    pipeline_user_id_var.set(None)


def set_groq_agent(agent_name: str | None) -> None:
    groq_agent_name_var.set(agent_name)


def next_groq_step_index() -> int:
    cur = groq_step_index_var.get()
    nxt = cur + 1
    groq_step_index_var.set(nxt)
    return nxt


def reset_groq_step_index() -> None:
    groq_step_index_var.set(0)


def trace_metadata() -> dict[str, Any]:
    return {
        "run_id": pipeline_run_id_var.get(),
        "user_id": pipeline_user_id_var.get(),
        "agent_name": groq_agent_name_var.get(),
        "step_index": groq_step_index_var.get(),
    }
