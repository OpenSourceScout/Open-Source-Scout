import os

import pytest

os.environ.setdefault("GROQ_API_KEY", "test-key-for-pytest")


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
