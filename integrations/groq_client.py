"""
Groq API Client — completions with retry/backoff and cascadeflow-aware routing.
"""
from __future__ import annotations

import json
import logging
import os
import time
from typing import Optional, Type, TypeVar

from pydantic import BaseModel
import requests
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from core.runtime.agent_profiles import (
    GROQ_API_KEY_ENV,
    kpi_weights_for_agent,
    model_pool_for_agent,
)
from core.runtime.cascadeflow_init import get_cascadeflow_mode
from core.runtime.groq_context import next_groq_step_index, trace_metadata

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

MODEL_LLAMA_4_SCOUT_17B = "meta-llama/llama-4-scout-17b-16e-instruct"
# Use a model Groq still serves (8b-instant was removed for many accounts).
MODEL_README_SUMMARY = MODEL_LLAMA_4_SCOUT_17B


try:
    import cascadeflow

    _CF = cascadeflow
except ImportError:  # pragma: no cover
    _CF = None


class GroqRateLimitError(Exception):
    """Raised when Groq API returns 429 Too Many Requests."""

    pass


class GroqAPIError(Exception):
    """General Groq API error."""

    pass


# Rough relative USD prices ($ / 1M input tokens) for routing pressure — not invoicing-grade.
_MODEL_INPUT_PRICE: dict[str, float] = {
    "meta-llama/llama-3.1-8b-instant": 0.05,
    MODEL_LLAMA_4_SCOUT_17B: 0.11,
    "meta-llama/llama-3.3-70b-versatile": 0.59,
    "mixtral-8x7b-32768": 0.24,
    "openai/gpt-oss-120b": 0.15,
    "openai/gpt-oss-20b": 0.075,
    "qwen/qwen3-32b": 0.29,
    "qwen/qwq-32b-preview": 0.29,
}


_QUALITY_PRIOR_LOGICAL: dict[str, float] = {
    "llama-3.3-70b": 0.95,
    "openai/gpt-oss-120b": 0.92,
    "qwen-qwq-32b": 0.88,
    "mixtral-8x7b": 0.84,
    "qwen-qwq-32b-instruct": 0.82,
    "llama-3.1-8b": 0.72,
    "gemma2-9b": 0.70,
}

_LATENCY_PRIOR_LOGICAL: dict[str, float] = {
    "llama-3.1-8b": 0.96,
    "gemma2-9b": 0.93,
    "qwen-qwq-32b-instruct": 0.88,
    "mixtral-8x7b": 0.82,
    "qwen-qwq-32b": 0.78,
    "openai/gpt-oss-120b": 0.74,
    "llama-3.3-70b": 0.68,
}


def groq_api_key_for_agent(agent_name: str) -> Optional[str]:
    """Resolve Groq API key for an agent; falls back to GROQ_API_KEY."""
    name = (agent_name or "").strip()
    env_var = GROQ_API_KEY_ENV.get(name)
    if env_var:
        key = os.getenv(env_var)
        if key:
            return key
    return os.getenv("GROQ_API_KEY")


class GroqClient:
    """Client for Groq API with retry logic and structured outputs."""

    BASE_URL = "https://api.groq.com/openai/v1/chat/completions"

    MODELS = {
        "openai/gpt-oss-120b": "openai/gpt-oss-120b",
        MODEL_LLAMA_4_SCOUT_17B: MODEL_LLAMA_4_SCOUT_17B,
        "llama-3.3-70b": "llama-3.3-70b-versatile",
        "llama-3.1-8b": "llama-3.1-8b-instant",
        "gemma2-9b": "gemma2-9b-it",
        "mixtral-8x7b": "mixtral-8x7b-32768",
        "llama-3.3-70b-specdec": "llama-3.3-70b-specdec",
        "deepseek-r1-distill-llama-70b": "deepseek-r1-distill-llama-70b",
        "qwen-qwq-32b-instruct": "qwen/qwen3-32b",
        "qwen-qwq-32b": "qwen/qwen3-32b",
    }

    DEFAULT_FAST_MODEL = "openai/gpt-oss-120b"
    DEFAULT_POWERFUL_MODEL = "llama-3.3-70b"

    def __init__(self, api_key: Optional[str] = None, *, agent_name: Optional[str] = None):
        if api_key is not None:
            self.api_key = api_key
        else:
            self.api_key = groq_api_key_for_agent(agent_name or "")
        if not self.api_key:
            env_hint = GROQ_API_KEY_ENV.get((agent_name or "").strip(), "GROQ_API_KEY")
            raise ValueError(
                f"Groq API key required: set {env_hint} or GROQ_API_KEY"
            )

        self.session = requests.Session()
        self.session.headers["Authorization"] = f"Bearer {self.api_key}"
        self.session.headers["Content-Type"] = "application/json"

    @classmethod
    def for_agent(cls, agent_name: str) -> "GroqClient":
        """Build a client using the dedicated API key for this agent."""
        return cls(agent_name=agent_name)

    def _logical_key_for(self, model: Optional[str]) -> str:
        if not model:
            return self.DEFAULT_FAST_MODEL
        if model in self.MODELS:
            return model
        rev = {v: k for k, v in self.MODELS.items()}
        return rev.get(model, model)

    def _normalize_weights(self, w: dict[str, float]) -> dict[str, float]:
        s = sum(max(v, 0.0) for v in w.values())
        if s <= 0:
            return {}
        return {k: max(v, 0.0) / s for k, v in w.items()}

    def _cost_norm_logical(self, logical: str) -> float:
        gid = self.MODELS.get(logical, logical)
        raw = _MODEL_INPUT_PRICE.get(gid, 0.25)
        hi = max(_MODEL_INPUT_PRICE.values()) or 1.0
        lo = min(_MODEL_INPUT_PRICE.values()) or 0.01
        if hi <= lo:
            return 0.5
        return max(0.0, min(1.0, 1.0 - ((raw - lo) / (hi - lo))))

    def _kpi_score_logical(self, logical: str, agent_name: str) -> float:
        w = self._normalize_weights(kpi_weights_for_agent(agent_name))
        if not w:
            return 0.0
        q = _QUALITY_PRIOR_LOGICAL.get(logical, 0.75)
        lat = _LATENCY_PRIOR_LOGICAL.get(logical, 0.75)
        c_util = self._cost_norm_logical(logical)
        return (
            w.get("quality", 0.0) * q
            + w.get("latency", 0.0) * lat
            + w.get("cost", 0.0) * c_util
        )

    def _snap_to_pool(self, logical: str, pool: list[str]) -> str:
        if logical in pool:
            return logical
        if "llama-3.3-70b" in pool:
            return "llama-3.3-70b"
        return pool[0]

    def _cheapest_logical(self, pool: list[str]) -> str:
        return min(pool, key=lambda k: _MODEL_INPUT_PRICE.get(self.MODELS.get(k, k), 999.0))

    def _route_completion(
        self, agent_name: str, requested: Optional[str]
    ) -> tuple[str, str, str, bool]:
        pool = model_pool_for_agent(agent_name or "Archaeologist")
        logical_requested = self._logical_key_for(requested)
        requested_gid = self.MODELS.get(logical_requested, logical_requested)
        mode = get_cascadeflow_mode()

        ctx = _CF.get_current_run() if _CF else None
        if ctx is not None and ctx.budget_max is not None and ctx.budget_remaining is not None:
            if ctx.budget_remaining <= 0 or ctx.cost >= ctx.budget_max:
                cheap_log = self._cheapest_logical(pool)
                gid = self.MODELS.get(cheap_log, cheap_log)
                return cheap_log, gid, "budget_cap_cheapest", gid != requested_gid

        if mode == "off":
            return logical_requested, requested_gid, "off_mode", False

        if mode == "observe":
            return logical_requested, requested_gid, "observe_passthrough", False

        logical_base = self._snap_to_pool(logical_requested, pool)
        baseline_gid = self.MODELS.get(logical_base, logical_base)
        best_logical = max(pool, key=lambda k: self._kpi_score_logical(k, agent_name))
        gid = self.MODELS.get(best_logical, best_logical)
        return best_logical, gid, "enforce_kpi", gid != baseline_gid

    def _estimate_cost_usd(self, groq_model_id: str, prompt_tokens: int, completion_tokens: float) -> float:
        pin = _MODEL_INPUT_PRICE.get(groq_model_id, 0.25)
        pout = pin * 1.25
        return (prompt_tokens / 1_000_000.0) * pin + (completion_tokens / 1_000_000.0) * pout

    def _trace_complete(
        self,
        *,
        groq_model_id: str,
        elapsed_ms: float,
        routing_reason: str,
        logical_model: str,
        usage_pt: int,
        usage_ct: int,
        applied_switch: bool,
    ) -> None:
        if _CF is None or get_cascadeflow_mode() == "off":
            return
        ctx = _CF.get_current_run()
        if ctx is None:
            return
        cost = self._estimate_cost_usd(groq_model_id, usage_pt, usage_ct)
        try:
            ctx._increment(cost=cost, steps=1, latency_ms=elapsed_ms)
        except Exception:
            logger.exception("cascadeflow increment failed")

        meta = trace_metadata()
        meta.update(
            {
                "routing_reason": routing_reason,
                "logical_model": logical_model,
                "groq_model": groq_model_id,
                "applied_switch": applied_switch,
                "prompt_tokens": usage_pt,
                "completion_tokens": usage_ct,
                "estimated_cost_usd": round(cost, 8),
            }
        )
        action = "switch_model" if applied_switch else "allow"
        try:
            ctx.record(
                action=action,
                reason=str(routing_reason),
                model=groq_model_id,
                query=json.dumps(meta, default=str),
                applied=True,
                decision_mode=get_cascadeflow_mode(),
            )
        except Exception:
            logger.exception("cascadeflow record failed")

    @retry(
        retry=retry_if_exception_type(GroqRateLimitError),
        stop=stop_after_attempt(4),
        wait=wait_exponential(multiplier=2, min=3, max=15),
    )
    def _make_request(self, payload: dict) -> dict:
        try:
            resp = self.session.post(self.BASE_URL, json=payload, timeout=120)

            if resp.status_code == 429:
                logger.warning("Rate limited by Groq API, retrying...")
                raise GroqRateLimitError("Rate limited")

            if resp.status_code != 200:
                error_msg = resp.text
                logger.error(f"Groq API error: {error_msg}")
                raise GroqAPIError(f"API error {resp.status_code}: {error_msg}")

            return resp.json()

        except requests.RequestException as e:
            logger.error(f"Request failed: {e}")
            raise GroqAPIError(f"Request failed: {e}") from e

    def complete(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        json_mode: bool = False,
        agent_name: Optional[str] = None,
    ) -> str:
        import core.runtime.groq_context as gctx

        name_for_router = agent_name or gctx.groq_agent_name_var.get() or "Unknown"
        logical_used, groq_model_id, routing_reason, applied_switch = self._route_completion(
            name_for_router, model
        )

        model_id = groq_model_id
        next_groq_step_index()

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }

        if json_mode:
            payload["response_format"] = {"type": "json_object"}

        start = time.monotonic()
        response = self._make_request(payload)
        elapsed_ms = (time.monotonic() - start) * 1000.0

        usage = response.get("usage") or {}
        pt = int(usage.get("prompt_tokens") or 0)
        ct = int(usage.get("completion_tokens") or 0)

        self._trace_complete(
            groq_model_id=model_id,
            elapsed_ms=elapsed_ms,
            routing_reason=routing_reason,
            logical_model=logical_used,
            usage_pt=pt,
            usage_ct=ct,
            applied_switch=applied_switch,
        )

        content = response["choices"][0]["message"]["content"]
        return content

    def complete_structured(
        self,
        prompt: str,
        response_model: Type[T],
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.3,
        agent_name: Optional[str] = None,
    ) -> T:
        schema_json = json.dumps(response_model.model_json_schema(), indent=2)

        json_system = f"""You are a helpful assistant that ONLY outputs valid JSON.
Your response must be a valid JSON object matching this schema:

{schema_json}

Do not include any text before or after the JSON. Only output the JSON object."""

        if system_prompt:
            json_system = f"{system_prompt}\n\n{json_system}"

        response = self.complete(
            prompt=prompt,
            model=model,
            system_prompt=json_system,
            temperature=temperature,
            max_tokens=8192,
            json_mode=True,
            agent_name=agent_name,
        )

        try:
            clean_response = response.strip()
            if clean_response.startswith("```"):
                lines = clean_response.split("\n")
                clean_response = "\n".join(lines[1:-1])

            data = json.loads(clean_response)
            return response_model.model_validate(data)

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response was: {response[:500]}...")
            raise GroqAPIError(f"Invalid JSON response: {e}") from e

        except Exception as e:
            logger.error(f"Failed to validate response: {e}")
            raise GroqAPIError(f"Validation failed: {e}") from e

    def get_available_models(self) -> list:
        return list(self.MODELS.keys())
