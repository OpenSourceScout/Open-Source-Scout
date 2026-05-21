import os

import pytest

# CI sets GROQ_API_KEY from secrets; missing/empty secrets must not break unit tests.
# .env is never loaded in GitHub Actions — only workflow env vars apply.
_TEST_GROQ_KEY = "test-key-for-pytest"


def _ensure_groq_test_keys() -> None:
    if not (os.environ.get("GROQ_API_KEY") or "").strip():
        os.environ["GROQ_API_KEY"] = _TEST_GROQ_KEY


_ensure_groq_test_keys()


@pytest.fixture
def sample_repo_api_payload():
    return {
        "full_name": "acme/demo",
        "description": "Demo",
        "default_branch": "main",
        "html_url": "https://github.com/acme/demo",
        "clone_url": "https://github.com/acme/demo.git",
        "language": "Python",
        "stargazers_count": 10,
        "open_issues_count": 3,
    }
