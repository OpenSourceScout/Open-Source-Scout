"""Tests for cascadeflow routing helpers and run isolation."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from core.runtime.groq_context import pipeline_run_id_var, set_pipeline_run_context
from integrations.groq_client import GroqClient


@pytest.fixture
def groq_client(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test-key-for-unit-tests")
    return GroqClient(api_key="test-key-for-unit-tests")


def test_observe_mode_no_model_change(monkeypatch, groq_client):
    monkeypatch.setenv("CASCADEFLOW_MODE", "observe")
    _logical, gid, reason, switched = groq_client._route_completion("Pathfinder", "llama-3.3-70b")
    assert reason == "observe_passthrough"
    assert switched is False
    assert gid


def test_off_mode_no_switch(monkeypatch, groq_client):
    monkeypatch.setenv("CASCADEFLOW_MODE", "off")
    _logical, gid, reason, switched = groq_client._route_completion("Senior Dev", "llama-3.3-70b")
    assert reason == "off_mode"
    assert switched is False


def test_enforce_mode_returns_pool_member(monkeypatch, groq_client):
    monkeypatch.setenv("CASCADEFLOW_MODE", "enforce")
    logical, gid, reason, switched = groq_client._route_completion("Pathfinder", "llama-3.3-70b")
    assert reason == "enforce_kpi"
    assert logical in groq_client.MODELS or gid


def test_budget_breach_selects_cheapest(monkeypatch, groq_client):
    monkeypatch.setenv("CASCADEFLOW_MODE", "enforce")
    fake_ctx = MagicMock()
    fake_ctx.budget_max = 0.001
    fake_ctx.budget_remaining = 0.0
    fake_ctx.cost = 1.0

    with patch("integrations.groq_client._CF") as cf:
        cf.get_current_run.return_value = fake_ctx
        _logical, _gid, reason, switched = groq_client._route_completion("Pathfinder", "llama-3.3-70b")
    assert reason == "budget_cap_cheapest"
    assert switched is True


def test_run_context_isolation_async_tasks():
    import asyncio

    async def worker(val: str):
        set_pipeline_run_context(val, "u")
        await asyncio.sleep(0)
        return pipeline_run_id_var.get()

    async def runner():
        return await asyncio.gather(*[worker(f"id-{i}") for i in range(8)])

    ids = asyncio.run(runner())
    assert len(set(ids)) == len(ids)


def test_off_mode_skips_trace(monkeypatch):
    monkeypatch.setenv("CASCADEFLOW_MODE", "off")
    gc = GroqClient(api_key="test-key-for-unit-tests")
    with patch("integrations.groq_client._CF", None):
        gc._trace_complete(
            groq_model_id="x",
            elapsed_ms=1,
            routing_reason="off",
            logical_model="y",
            usage_pt=1,
            usage_ct=1,
            applied_switch=False,
        )
