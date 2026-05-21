"""Hindsight singleton: per-user banks, retain / recall / reflect with safe degradation."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_HINDSIGHT_SYNC_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hindsight-sync")
_thread_local = threading.local()

from core.identity import bank_id_for_user

logger = logging.getLogger(__name__)


def _scalar_text(val: Any) -> str:
    if val is None:
        return ""
    if isinstance(val, str):
        return val.strip()
    return str(val).strip()


def _memory_unit_fields(m: Any) -> tuple[str, str, Any, Any]:
    """Normalize Hindsight memory rows (API returns dicts in ``items``, not only objects)."""
    if isinstance(m, dict):
        mid = _scalar_text(m.get("id") or m.get("memory_id"))
        raw_txt = (
            m.get("text")
            or m.get("content")
            or m.get("original_text")
            or m.get("body")
            or m.get("summary")
        )
        text = _scalar_text(raw_txt)
        typ = m.get("type") or m.get("fact_type") or m.get("kind")
        ts = (
            m.get("mentioned_at")
            or m.get("created_at")
            or m.get("updated_at")
            or m.get("timestamp")
            or m.get("occurred_start")
        )
        return mid, text, typ, ts
    mid = _scalar_text(getattr(m, "id", None) or getattr(m, "memory_id", None))
    raw_txt = (
        getattr(m, "text", None)
        or getattr(m, "content", None)
        or getattr(m, "original_text", None)
        or getattr(m, "body", None)
        or getattr(m, "summary", None)
    )
    text = _scalar_text(raw_txt)
    typ = getattr(m, "type", None) or getattr(m, "fact_type", None)
    ts = (
        getattr(m, "mentioned_at", None)
        or getattr(m, "created_at", None)
        or getattr(m, "updated_at", None)
        or getattr(m, "occurred_start", None)
    )
    return mid, text, typ, ts


def _extract_hindsight_items(payload: Any, *attr_names: str) -> list[Any]:
    """Normalize list responses (items, memories, banks, mental_models, …)."""
    if payload is None:
        return []
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for name in attr_names:
            chunk = payload.get(name)
            if chunk:
                return list(chunk)
        return []
    for name in attr_names:
        chunk = getattr(payload, name, None)
        if chunk:
            return list(chunk)
    if hasattr(payload, "model_dump"):
        try:
            data = payload.model_dump()
            for name in attr_names:
                chunk = data.get(name)
                if chunk:
                    return list(chunk)
        except Exception:
            pass
    return []


def _mental_model_content_empty(content: str) -> bool:
    text = _scalar_text(content)
    if not text:
        return True
    if len(text) < 4:
        return True
    for pat in _MENTAL_MODEL_EMPTY_PATTERNS:
        if pat.match(text):
            return True
    return False


def _operation_id_from_response(resp: Any) -> str:
    if resp is None:
        return ""
    if isinstance(resp, dict):
        return _scalar_text(resp.get("operation_id"))
    return _scalar_text(getattr(resp, "operation_id", None))


def _mental_model_fields(model: Any) -> tuple[str, str, str, Any]:
    if isinstance(model, dict):
        mid = _scalar_text(model.get("id"))
        title_raw = (
            model.get("title")
            or model.get("name")
            or model.get("label")
            or model.get("canonical_name")
            or "Mental model"
        )
        title = title_raw if isinstance(title_raw, str) else str(title_raw)
        desc = _scalar_text(
            model.get("content")
            or model.get("text")
            or model.get("description")
            or ""
        )
        ca = model.get("created_at") or model.get("updated_at") or model.get("last_refreshed_at")
        return mid, title.strip(), desc, ca
    mid = _scalar_text(getattr(model, "id", None))
    title_raw = (
        getattr(model, "title", None)
        or getattr(model, "name", None)
        or getattr(model, "label", None)
        or getattr(model, "canonical_name", None)
        or "Mental model"
    )
    title = title_raw if isinstance(title_raw, str) else str(title_raw)
    desc = _scalar_text(
        getattr(model, "content", None)
        or getattr(model, "text", None)
        or getattr(model, "description", None)
        or ""
    )
    ca = (
        getattr(model, "created_at", None)
        or getattr(model, "updated_at", None)
        or getattr(model, "last_refreshed_at", None)
    )
    return mid, title.strip(), desc, ca


def _mental_model_is_stale(model: Any) -> bool:
    if isinstance(model, dict):
        return bool(model.get("is_stale"))
    return bool(getattr(model, "is_stale", False))


def _mental_model_needs_refresh(model: Any) -> bool:
    _mid, _title, desc, _ca = _mental_model_fields(model)
    return _mental_model_is_stale(model) or _mental_model_content_empty(desc)


def _mental_model_row(model: Any, *, source: str = "curated") -> dict[str, Any]:
    mid, title, desc, ca = _mental_model_fields(model)
    return {
        "id": mid,
        "title": title or "Mental model",
        "description": desc,
        "created_at": ca,
        "source": source,
    }


def _observation_as_mental_model_row(obs: dict[str, Any]) -> dict[str, Any]:
    text = _scalar_text(obs.get("text") or "")
    title = text[:120] + ("…" if len(text) > 120 else "")
    return {
        "id": obs.get("id") or "",
        "title": title or "Consolidated observation",
        "description": text,
        "created_at": obs.get("mentioned_at"),
        "source": "observation",
        "freshness": obs.get("freshness") or "stable",
    }


try:
    from hindsight_client import Hindsight as HindsightSDK
except ImportError:  # pragma: no cover
    HindsightSDK = None  # type: ignore[misc, assignment]


SCOUT_MISSION = (
    "I help this user contribute to open-source software. I learn their tech stack, "
    "skill level, coding style, the issue types they actually complete, and the repositories "
    "they engage with. I bias recommendations toward what has worked for them and away from "
    "what they have repeatedly skipped."
)

DIRECTIVES: list[tuple[str, str]] = [
    (
        "skip_repos",
        "Never recommend a repository the user has explicitly skipped",
    ),
    (
        "no_upstream_writes",
        "Never auto-commit, auto-push, or modify upstream repositories",
    ),
    (
        "cite_memories",
        "Always cite which past memory or observation influenced a recommendation when one applies",
    ),
    (
        "respect_stack",
        "Respect the user's stated tech-stack constraints over historical inference",
    ),
]

# Curated mental models (Hindsight living documents) — distinct from auto-consolidated observations.
# Created per user bank; refresh_after_consolidation keeps them updated when new memories arrive.
MENTAL_MODEL_OP_POLL_INTERVAL_SEC = 0.75
MENTAL_MODEL_OP_TIMEOUT_SEC = 120.0
MEMORY_SUMMARY_SYNC_TIMEOUT_SEC = 300.0

# Placeholder text Hindsight returns before reflect finishes or when the bank has no data yet.
_MENTAL_MODEL_EMPTY_PATTERNS = (
    re.compile(r"^i\s+don'?t\s+have\s+information\.?$", re.I),
    re.compile(r"^no\s+information\.?$", re.I),
    re.compile(r"^not\s+enough\s+information\.?$", re.I),
)

SCOUT_MENTAL_MODEL_SPECS: list[dict[str, Any]] = [
    {
        "id": "scout-repo-preferences",
        "name": "Repository & tech preferences",
        "source_query": (
            "Based on this user's memories, summarize which repositories, tech stacks, "
            "and project types they prefer, skip, or want to avoid. Be specific and concise."
        ),
        "tags": ["scout", "repos"],
    },
    {
        "id": "scout-contribution-style",
        "name": "Contribution style",
        "source_query": (
            "How does this user approach open-source contribution: issue types, difficulty, "
            "briefings, and what has worked vs not worked for them?"
        ),
        "tags": ["scout", "issues"],
    },
    {
        "id": "scout-feedback-patterns",
        "name": "Feedback patterns",
        "source_query": (
            "What patterns appear in this user's thumbs up/down, skips, exports, and repo selections? "
            "What should agents recommend or avoid?"
        ),
        "tags": ["scout", "feedback"],
    },
]


_scout_singleton: Any | None = None


def _run_sync_sdk(fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """Run hindsight-client sync helpers off uvicorn's event loop (isolated aiohttp per thread)."""
    try:
        asyncio.get_running_loop()
        in_loop = True
    except RuntimeError:
        in_loop = False
    if not in_loop:
        return fn(*args, **kwargs)
    future = _HINDSIGHT_SYNC_POOL.submit(lambda: fn(*args, **kwargs))
    return future.result(timeout=120.0)


def _needs_isolated_sdk_client() -> bool:
    """Shared Hindsight aiohttp sessions must not cross asyncio loops / worker threads."""
    try:
        asyncio.get_running_loop()
        return True
    except RuntimeError:
        return threading.current_thread() is not threading.main_thread()


def _hindsight_env_configured() -> bool:
    base_url = (os.getenv("HINDSIGHT_API_URL") or "").strip()
    api_key = (os.getenv("HINDSIGHT_API_KEY") or "").strip()
    return bool(base_url and api_key and HindsightSDK)


def get_scout_hindsight() -> ScoutHindsightClient:
    global _scout_singleton
    if _scout_singleton is None:
        _scout_singleton = ScoutHindsightClient()
    elif not _scout_singleton.enabled and _hindsight_env_configured():
        _scout_singleton = ScoutHindsightClient()
    return _scout_singleton


class ScoutHindsightClient:
    """
    Thin wrapper around hindsight-client with lazy bank provisioning.

    When API credentials are missing or the remote service errors, methods degrade gracefully.
    """

    def __init__(self) -> None:
        self._base_url = (os.getenv("HINDSIGHT_API_URL") or "").strip().rstrip("/")
        self._api_key = (os.getenv("HINDSIGHT_API_KEY") or "").strip() or None
        self.enabled = bool(self._base_url and self._api_key and HindsightSDK)
        self._client = (
            HindsightSDK(base_url=self._base_url, api_key=self._api_key, timeout=60.0)
            if self.enabled
            else None
        )
        self._banks_configured: set[str] = set()

    def _sdk_for_sync(self) -> Any:
        """Hindsight SDK bound to the current thread/loop (avoids aiohttp timeout errors)."""
        if not self._client:
            return None
        if not _needs_isolated_sdk_client():
            return self._client
        isolated = getattr(_thread_local, "hindsight_sdk", None)
        if isolated is None:
            isolated = HindsightSDK(
                base_url=self._base_url,
                api_key=self._api_key,
                timeout=60.0,
            )
            _thread_local.hindsight_sdk = isolated
        return isolated

    def bank_for_user(self, user_id: str) -> str:
        return bank_id_for_user(user_id)

    def _ensure_bank(self, bank_id: str) -> None:
        sdk = self._sdk_for_sync()
        if not sdk:
            return
        if bank_id not in self._banks_configured:
            try:
                sdk.create_bank(
                    bank_id=bank_id,
                    name="Scout user bank",
                    mission=SCOUT_MISSION,
                    disposition_empathy=4,
                    disposition_literalism=3,
                    disposition_skepticism=3,
                    enable_observations=True,
                )
            except Exception:
                try:
                    sdk.get_bank_config(bank_id)
                except Exception as e:
                    logger.warning("Hindsight bank missing for %s: %s", bank_id, e)
                    return

            try:
                listed = sdk.list_directives(bank_id=bank_id)
                existing_names: set[str] = set()
                dirs = getattr(listed, "directives", None) or getattr(listed, "items", None) or []
                for d in dirs:
                    nm = getattr(d, "name", None)
                    if nm:
                        existing_names.add(str(nm))
                for name, content in DIRECTIVES:
                    if name in existing_names:
                        continue
                    self._client.create_directive(
                        bank_id=bank_id,
                        name=name,
                        content=content,
                        priority=10,
                    )
            except Exception as e:
                logger.warning("Hindsight directives setup failed for %s: %s", bank_id, e)

            self._banks_configured.add(bank_id)

        self._ensure_scout_mental_models(sdk, bank_id)

    def _hc_run_async(self, coro: Any) -> Any:
        from hindsight_client.hindsight_client import _run_async as _hc_run_async

        return _hc_run_async(coro)

    def _wait_for_hindsight_operations(
        self,
        sdk: Any,
        bank_id: str,
        operation_ids: list[str],
        timeout: float = MENTAL_MODEL_OP_TIMEOUT_SEC,
    ) -> None:
        pending = {_scalar_text(op) for op in operation_ids if _scalar_text(op)}
        if not pending:
            return
        deadline = time.monotonic() + timeout
        while pending and time.monotonic() < deadline:
            finished: set[str] = set()
            for op_id in pending:
                try:
                    status = self._hc_run_async(
                        sdk.operations.get_operation_status(bank_id, op_id)
                    )
                    st = getattr(status, "status", None)
                    if st is None and isinstance(status, dict):
                        st = status.get("status")
                    st = str(st or "").lower()
                    if st == "completed":
                        finished.add(op_id)
                    elif st in ("failed", "cancelled", "not_found"):
                        err = getattr(status, "error_message", None) or (
                            status.get("error_message") if isinstance(status, dict) else None
                        )
                        logger.warning(
                            "Hindsight operation %s for %s ended: %s (%s)",
                            op_id,
                            bank_id,
                            st,
                            err or "no detail",
                        )
                        finished.add(op_id)
                except Exception as e:
                    logger.warning("get_operation_status %s failed: %s", op_id, e)
            pending -= finished
            if pending:
                time.sleep(MENTAL_MODEL_OP_POLL_INTERVAL_SEC)
        if pending:
            logger.warning(
                "Timed out waiting for Hindsight operations on %s: %s",
                bank_id,
                ", ".join(sorted(pending)),
            )

    def _bank_has_memories(self, sdk: Any, bank_id: str) -> bool:
        try:
            resp = sdk.list_memories(bank_id=bank_id, limit=1)
            return bool(_extract_hindsight_items(resp, "memories", "items"))
        except Exception:
            return False

    def _list_scout_mental_models_raw(self, sdk: Any, bank_id: str) -> list[Any]:
        try:
            mm = self._hc_run_async(
                sdk.mental_models.list_mental_models(
                    bank_id=bank_id,
                    limit=100,
                    detail="content",
                )
            )
            return _extract_hindsight_items(mm, "items", "mental_models")
        except Exception as e:
            logger.warning("list_scout_mental_models_raw failed: %s", e)
            try:
                mm = sdk.list_mental_models(bank_id=bank_id)
                return _extract_hindsight_items(mm, "items", "mental_models")
            except Exception as e2:
                logger.warning("list_scout_mental_models_raw fallback failed: %s", e2)
                return []

    def _refresh_scout_mental_models(
        self,
        sdk: Any,
        bank_id: str,
        model_ids: list[str],
    ) -> None:
        """Run Hindsight reflect for each model and wait until async operations finish."""
        if not model_ids:
            return
        op_ids: list[str] = []
        for mm_id in model_ids:
            try:
                resp = sdk.refresh_mental_model(bank_id=bank_id, mental_model_id=mm_id)
                op_id = _operation_id_from_response(resp)
                if op_id:
                    op_ids.append(op_id)
                    logger.info("Refreshing mental model %s for %s (op=%s)", mm_id, bank_id, op_id)
            except Exception as e:
                logger.warning("refresh_mental_model %s for %s failed: %s", mm_id, bank_id, e)
        self._wait_for_hindsight_operations(sdk, bank_id, op_ids)

    def _ensure_scout_mental_models(self, sdk: Any, bank_id: str) -> None:
        """Provision Scout curated mental models (idempotent). Observations alone are not mental models."""
        if not sdk or not SCOUT_MENTAL_MODEL_SPECS:
            return
        try:
            listed_models = self._list_scout_mental_models_raw(sdk, bank_id)
            existing_ids: set[str] = set()
            for model in listed_models:
                mid = _scalar_text(
                    model.get("id") if isinstance(model, dict) else getattr(model, "id", None)
                )
                if mid:
                    existing_ids.add(mid)

            create_ops: list[str] = []
            for spec in SCOUT_MENTAL_MODEL_SPECS:
                mm_id = spec["id"]
                if mm_id in existing_ids:
                    continue
                try:
                    resp = sdk.create_mental_model(
                        bank_id=bank_id,
                        id=mm_id,
                        name=spec["name"],
                        source_query=spec["source_query"],
                        tags=spec.get("tags"),
                        max_tokens=2048,
                        trigger={"refresh_after_consolidation": True},
                    )
                    op_id = _operation_id_from_response(resp)
                    if op_id:
                        create_ops.append(op_id)
                    logger.info("Created Hindsight mental model %s for %s", mm_id, bank_id)
                except Exception as e:
                    logger.warning(
                        "create_mental_model %s for %s failed: %s", mm_id, bank_id, e
                    )

            if create_ops:
                self._wait_for_hindsight_operations(sdk, bank_id, create_ops)
        except Exception as e:
            logger.warning("ensure_scout_mental_models failed for %s: %s", bank_id, e)

    def _sync_scout_mental_model_content(self, sdk: Any, bank_id: str, user_id: str) -> None:
        """Refresh empty/stale Scout mental models when the bank has memories (memory page load)."""
        if not sdk or not self._bank_has_memories(sdk, bank_id):
            return
        scout_ids = {spec["id"] for spec in SCOUT_MENTAL_MODEL_SPECS}
        to_refresh: list[str] = []
        for model in self._list_scout_mental_models_raw(sdk, bank_id):
            mid = _scalar_text(
                model.get("id") if isinstance(model, dict) else getattr(model, "id", None)
            )
            if mid in scout_ids and _mental_model_needs_refresh(model):
                to_refresh.append(mid)
        if to_refresh:
            self._refresh_scout_mental_models(sdk, bank_id, to_refresh)

    async def get_or_create_bank(self, user_id: str) -> str:
        bid = self.bank_for_user(user_id)
        if not self.enabled:
            return bid
        try:
            await asyncio.to_thread(_run_sync_sdk, self._ensure_bank, bid)
        except Exception as e:
            logger.warning("Hindsight get_or_create_bank failed: %s", e)
        return bid

    def get_or_create_bank_sync(self, user_id: str) -> str:
        bid = self.bank_for_user(user_id)
        if not self.enabled:
            return bid
        try:
            _run_sync_sdk(self._ensure_bank, bid)
        except Exception as e:
            logger.warning("Hindsight get_or_create_bank_sync failed: %s", e)
        return bid

    async def retain(
        self,
        user_id: str,
        fact_text: str,
        kind: str,
        metadata: dict[str, Any],
    ) -> None:
        if not self.enabled or not self._client:
            return
        bank_id = self.bank_for_user(user_id)
        try:
            await self.get_or_create_bank(user_id)
            meta_flat = {str(k): str(v) for k, v in metadata.items()}
            await self._client.aretain(
                bank_id=bank_id,
                content=fact_text,
                context=kind,
                metadata=meta_flat,
                retain_async=False,
            )
        except Exception as e:
            logger.warning("Hindsight retain failed: %s", e)

    def retain_sync(
        self,
        user_id: str,
        fact_text: str,
        kind: str,
        metadata: dict[str, Any],
    ) -> None:
        if not self.enabled or not self._client:
            return
        try:
            _run_sync_sdk(self._retain_sync_impl, user_id, fact_text, kind, metadata)
        except Exception as e:
            logger.warning("Hindsight retain_sync failed: %s", e)

    def _retain_sync_impl(
        self,
        user_id: str,
        fact_text: str,
        kind: str,
        metadata: dict[str, Any],
    ) -> None:
        bank_id = self.bank_for_user(user_id)
        self._ensure_bank(bank_id)
        meta_flat = {str(k): str(v) for k, v in metadata.items()}
        self._sdk_for_sync().retain(
            bank_id=bank_id,
            content=fact_text,
            context=kind,
            metadata=meta_flat,
            retain_async=False,
        )

    async def recall(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        strategy: str = "auto",
    ) -> list[dict[str, Any]]:
        _ = strategy
        if not self.enabled or not self._client:
            return []
        bank_id = self.bank_for_user(user_id)
        try:
            await self.get_or_create_bank(user_id)
            resp = await self._client.arecall(
                bank_id=bank_id,
                query=query,
                max_tokens=min(8192, max(512, top_k * 512)),
                budget="mid",
                trace=False,
            )
            rows = getattr(resp, "results", None) or []
            out: list[dict[str, Any]] = []
            for r in rows[:top_k]:
                mid, text, typ, ts = _memory_unit_fields(r)
                out.append(
                    {
                        "memory_id": mid,
                        "text": text,
                        "score": None,
                        "kind": typ,
                        "timestamp": ts,
                    }
                )
            return out
        except Exception as e:
            logger.warning("Hindsight recall failed: %s", e)
            return []

    def recall_sync(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        strategy: str = "auto",
    ) -> list[dict[str, Any]]:
        if not self.enabled or not self._client:
            return []
        try:
            return _run_sync_sdk(self._recall_sync_impl, user_id, query, top_k, strategy)
        except Exception as e:
            logger.warning("Hindsight recall_sync failed: %s", e)
            return []

    def _recall_sync_impl(
        self,
        user_id: str,
        query: str,
        top_k: int,
        strategy: str,
    ) -> list[dict[str, Any]]:
        _ = strategy
        bank_id = self.bank_for_user(user_id)
        self._ensure_bank(bank_id)
        resp = self._sdk_for_sync().recall(
            bank_id=bank_id,
            query=query,
            max_tokens=min(8192, max(512, top_k * 512)),
            budget="mid",
            trace=False,
        )
        rows = getattr(resp, "results", None) or []
        out: list[dict[str, Any]] = []
        for r in rows[:top_k]:
            mid, text, typ, ts = _memory_unit_fields(r)
            out.append(
                {
                    "memory_id": mid,
                    "text": text,
                    "score": None,
                    "kind": typ,
                    "timestamp": ts,
                }
            )
        return out

    async def reflect(
        self,
        user_id: str,
        question: str,
        context: dict[str, Any],
    ) -> dict[str, Any]:
        if not self.enabled or not self._client:
            return {"answer": "", "cited_memory_ids": []}
        bank_id = self.bank_for_user(user_id)
        try:
            await self.get_or_create_bank(user_id)
            ctx_text = json.dumps(context, default=str)[:12000]
            resp = await self._client.areflect(
                bank_id=bank_id,
                query=question,
                context=ctx_text,
                budget="mid",
                include_facts=True,
            )
            cited = list(getattr(resp, "based_on", None) or [])
            text = getattr(resp, "text", "") or ""
            return {"answer": text, "cited_memory_ids": [str(x) for x in cited]}
        except Exception as e:
            logger.warning("Hindsight reflect failed: %s", e)
            return {"answer": "", "cited_memory_ids": []}

    def reflect_sync(self, user_id: str, question: str, context: dict[str, Any]) -> dict[str, Any]:
        if not self.enabled or not self._client:
            return {"answer": "", "cited_memory_ids": []}
        try:
            return _run_sync_sdk(self._reflect_sync_impl, user_id, question, context)
        except Exception as e:
            logger.warning("Hindsight reflect_sync failed: %s", e)
            return {"answer": "", "cited_memory_ids": []}

    def _reflect_sync_impl(
        self, user_id: str, question: str, context: dict[str, Any]
    ) -> dict[str, Any]:
        bank_id = self.bank_for_user(user_id)
        self._ensure_bank(bank_id)
        ctx_text = json.dumps(context, default=str)[:12000]
        resp = self._sdk_for_sync().reflect(
            bank_id=bank_id,
            query=question,
            context=ctx_text,
            budget="mid",
            include_facts=True,
        )
        cited = list(getattr(resp, "based_on", None) or [])
        text = getattr(resp, "text", "") or ""
        return {"answer": text, "cited_memory_ids": [str(x) for x in cited]}

    async def reset_bank(self, user_id: str) -> None:
        if not self.enabled or not self._client:
            return
        bank_id = self.bank_for_user(user_id)
        try:
            self._client.delete_bank(bank_id)
        except Exception as e:
            logger.warning("Hindsight delete_bank failed: %s", e)
        self._banks_configured.discard(bank_id)

    def reset_bank_sync(self, user_id: str) -> None:
        if not self.enabled:
            return
        try:
            _run_sync_sdk(self._reset_bank_sync_impl, user_id)
        except Exception as e:
            logger.warning("Hindsight reset_bank_sync failed: %s", e)

    def _reset_bank_sync_impl(self, user_id: str) -> None:
        sdk = self._sdk_for_sync()
        if not sdk:
            return
        bank_id = self.bank_for_user(user_id)
        try:
            sdk.delete_bank(bank_id)
        except Exception as e:
            logger.warning("Hindsight delete_bank failed: %s", e)
        self._banks_configured.discard(bank_id)

    async def fetch_memory_texts(self, user_id: str, ids: list[str]) -> list[dict[str, str]]:
        if not self.enabled or not self._client or not ids:
            return []
        bank_id = self.bank_for_user(user_id)
        out: list[dict[str, str]] = []
        for mid in ids:
            try:
                raw = await self._client.memory.get_memory(bank_id=bank_id, memory_id=mid)
                text = ""
                if isinstance(raw, dict):
                    text = str(raw.get("text") or raw.get("content") or "")
                else:
                    text = str(getattr(raw, "text", "") or getattr(raw, "content", "") or raw)
                out.append({"memory_id": mid, "text": text})
            except Exception:
                out.append({"memory_id": mid, "text": ""})
        return out

    def _memory_summary_payload_sync(self, user_id: str) -> dict[str, Any]:
        """Sync memory summary (runs on hindsight worker thread when called from uvicorn)."""
        if not self.enabled or not self._client:
            return {
                "observations": [],
                "mental_models": [],
                "recent_facts": [],
                "totals": {"facts": 0, "observations": 0, "mental_models": 0},
            }
        sdk = self._sdk_for_sync()
        bank_id = self.bank_for_user(user_id)
        try:
            self._ensure_bank(bank_id)
        except Exception:
            pass
        try:
            self._ensure_scout_mental_models(sdk, bank_id)
        except Exception:
            pass

        observations: list[dict[str, Any]] = []
        facts: list[dict[str, Any]] = []
        mental_models: list[dict[str, Any]] = []
        hindsight_stats: dict[str, Any] = {}

        try:
            stats = self._hc_run_async(sdk.banks.get_agent_stats(bank_id))
            hindsight_stats = {
                "total_observations": int(getattr(stats, "total_observations", 0) or 0),
                "pending_consolidation": int(getattr(stats, "pending_consolidation", 0) or 0),
                "last_consolidated_at": getattr(stats, "last_consolidated_at", None),
            }
        except Exception as e:
            logger.warning("get_agent_stats failed: %s", e)

        try:
            obs_resp = sdk.list_memories(bank_id=bank_id, type="observation", limit=50)
            for m in _extract_hindsight_items(obs_resp, "memories", "items")[:20]:
                mid, text, _, ts = _memory_unit_fields(m)
                if not text:
                    continue
                observations.append(
                    {
                        "id": mid,
                        "text": text,
                        "mentioned_at": ts,
                        "freshness": "stable",
                    }
                )
        except Exception as e:
            logger.warning("list observations failed: %s", e)

        try:
            self._sync_scout_mental_model_content(sdk, bank_id, user_id)
        except Exception as e:
            logger.warning("sync_scout_mental_model_content failed: %s", e)

        try:
            for model in self._list_scout_mental_models_raw(sdk, bank_id)[:20]:
                row = _mental_model_row(model, source="curated")
                if _mental_model_content_empty(row.get("description") or "") and observations:
                    spec = next(
                        (s for s in SCOUT_MENTAL_MODEL_SPECS if s["id"] == row.get("id")),
                        None,
                    )
                    if spec:
                        reflected = self.reflect_sync(user_id, spec["source_query"], {})
                        answer = _scalar_text(reflected.get("answer") or "")
                        if answer and not _mental_model_content_empty(answer):
                            row["description"] = answer
                            row["source"] = "curated+reflect"
                mental_models.append(row)
        except Exception as e:
            logger.warning("list mental models failed: %s", e)

        try:
            f_resp = sdk.list_memories(bank_id=bank_id, limit=40)
            for m in _extract_hindsight_items(f_resp, "memories", "items"):
                mid, text, typ, ts = _memory_unit_fields(m)
                if (typ or "").lower() == "observation":
                    continue
                facts.append(
                    {
                        "id": mid,
                        "text": text,
                        "kind": typ or "world",
                        "mentioned_at": ts,
                    }
                )
        except Exception as e:
            logger.warning("list recent facts failed: %s", e)

        return {
            "observations": observations,
            "mental_models": mental_models,
            "recent_facts": facts[-20:],
            "hindsight_stats": hindsight_stats,
            "totals": {
                "facts": len(facts),
                "observations": len(observations),
                "mental_models": len(mental_models),
            },
        }

    async def memory_summary_payload(self, user_id: str) -> dict[str, Any]:
        """Async wrapper for callers inside an existing event loop."""
        if not self.enabled or not self._client:
            return self._memory_summary_payload_sync(user_id)
        try:
            await self.get_or_create_bank(user_id)
        except Exception:
            pass
        return await asyncio.to_thread(_run_sync_sdk, self._memory_summary_payload_sync, user_id)

    def fetch_memory_sync(self, user_id: str, ids: list[str]) -> list[dict[str, str]]:
        if not self.enabled or not self._client or not ids:
            return []
        try:
            return _run_sync_sdk(self._fetch_memory_sync_impl, user_id, ids)
        except Exception as e:
            logger.warning("Hindsight fetch_memory_sync failed: %s", e)
            return [{"memory_id": mid, "text": ""} for mid in ids]

    def _fetch_memory_sync_impl(self, user_id: str, ids: list[str]) -> list[dict[str, str]]:
        sdk = self._sdk_for_sync()
        if not sdk:
            return []
        bank_id = self.bank_for_user(user_id)
        try:
            self._ensure_bank(bank_id)
        except Exception:
            pass
        out: list[dict[str, str]] = []
        timeout = getattr(sdk, "_timeout", 60.0)
        for mid in ids:
            try:
                raw = asyncio.run(
                    sdk.memory.get_memory(
                        bank_id=bank_id,
                        memory_id=mid,
                        _request_timeout=timeout,
                    )
                )
                text = ""
                if isinstance(raw, dict):
                    text = str(raw.get("text") or raw.get("content") or "")
                else:
                    text = str(getattr(raw, "text", "") or getattr(raw, "content", "") or raw)
                out.append({"memory_id": mid, "text": text})
            except Exception:
                out.append({"memory_id": mid, "text": ""})
        return out

    def memory_summary_sync(self, user_id: str) -> dict[str, Any]:
        if not self.enabled or not self._client:
            return self._memory_summary_payload_sync(user_id)
        try:
            try:
                asyncio.get_running_loop()
                in_loop = True
            except RuntimeError:
                in_loop = False
            if not in_loop:
                return self._memory_summary_payload_sync(user_id)
            future = _HINDSIGHT_SYNC_POOL.submit(
                self._memory_summary_payload_sync, user_id
            )
            return future.result(timeout=MEMORY_SUMMARY_SYNC_TIMEOUT_SEC)
        except Exception as e:
            logger.warning("Hindsight memory_summary_sync failed: %s", e)
            return self._memory_summary_payload_sync(user_id)
