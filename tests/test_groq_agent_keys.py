"""Per-agent Groq API key resolution."""
import os

import pytest

from integrations.groq_client import GroqClient, groq_api_key_for_agent


def test_groq_api_key_for_agent_uses_dedicated_env(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY_PATHFINDER", "key-pathfinder")
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    assert groq_api_key_for_agent("Pathfinder") == "key-pathfinder"


def test_groq_api_key_for_agent_falls_back_to_shared(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY_SENIOR_DEV", raising=False)
    monkeypatch.setenv("GROQ_API_KEY", "shared-key")
    assert groq_api_key_for_agent("Senior Dev") == "shared-key"


def test_for_agent_builds_client(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY_TESTING_AGENT", "testing-key")
    client = GroqClient.for_agent("Testing Agent")
    assert client.api_key == "testing-key"


def test_missing_key_raises(monkeypatch):
    for var in (
        "GROQ_API_KEY",
        "GROQ_API_KEY_ARCHAEOLOGIST",
    ):
        monkeypatch.delenv(var, raising=False)
    with pytest.raises(ValueError, match="GROQ_API_KEY_ARCHAEOLOGIST"):
        GroqClient.for_agent("Archaeologist")
