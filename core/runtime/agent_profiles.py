"""
Per-agent KPI weights (cost / latency / quality) and Groq model tier pools.

Senior Dev may only use mid + top tiers; other agents may use cheap + mid + top.
"""
from __future__ import annotations

from typing import Dict, List

AGENT_CANONICAL_NAMES = (
    "Pathfinder",
    "Triage Nurse",
    "Archaeologist",
    "Senior Dev",
    "Testing Agent",
)

# One Groq API key per agent (different accounts) to spread rate limits.
GROQ_API_KEY_ENV: Dict[str, str] = {
    "Pathfinder": "GROQ_API_KEY_PATHFINDER",
    "Triage Nurse": "GROQ_API_KEY_TRIAGE_NURSE",
    "Archaeologist": "GROQ_API_KEY_ARCHAEOLOGIST",
    "Senior Dev": "GROQ_API_KEY_SENIOR_DEV",
    "Testing Agent": "GROQ_API_KEY_TESTING_AGENT",
}

KPI_WEIGHTS: Dict[str, Dict[str, float]] = {
    "Pathfinder": {"cost": 0.60, "latency": 0.30, "quality": 0.10},
    "Triage Nurse": {"cost": 0.30, "latency": 0.50, "quality": 0.20},
    "Archaeologist": {"cost": 0.33, "latency": 0.34, "quality": 0.33},
    "Senior Dev": {"cost": 0.15, "latency": 0.25, "quality": 0.60},
    "Testing Agent": {"cost": 0.40, "latency": 0.35, "quality": 0.25},
}

# Logical tier labels → Groq model *keys* understood by integrations.groq_client.GroqClient.MODELS
_CHEAP_KEYS = ["qwen-qwq-32b-instruct", "llama-3.1-8b"]
_MID_KEYS = ["qwen-qwq-32b", "mixtral-8x7b"]
_TOP_KEYS = ["llama-3.3-70b"]


def model_pool_for_agent(agent_name: str) -> List[str]:
    """Resolved model keys allowed for routing for this agent."""
    name = agent_name.strip() if agent_name else ""
    if name == "Senior Dev":
        return list(dict.fromkeys(_MID_KEYS + _TOP_KEYS))
    return list(dict.fromkeys(_CHEAP_KEYS + _MID_KEYS + _TOP_KEYS))


def kpi_weights_for_agent(agent_name: str) -> Dict[str, float]:
    return dict(KPI_WEIGHTS.get(agent_name, KPI_WEIGHTS["Pathfinder"]))
