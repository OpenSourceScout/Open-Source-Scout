"""
Module tests: GitHub client URL parsing, repo search, and API failure paths.
"""
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
import requests

from integrations.github_client import GitHubClient


class TestParseRepoUrl:
    def test_https_url(self):
        c = GitHubClient(token="t")
        assert c.parse_repo_url("https://github.com/owner/name") == ("owner", "name")

    def test_trailing_slash_stripped(self):
        c = GitHubClient(token="t")
        assert c.parse_repo_url("https://github.com/owner/name/") == ("owner", "name")

    def test_git_suffix_removed(self):
        c = GitHubClient(token="t")
        assert c.parse_repo_url("https://github.com/owner/name.git") == ("owner", "name")

    def test_ssh_style(self):
        c = GitHubClient(token="t")
        assert c.parse_repo_url("git@github.com:owner/name.git") == ("owner", "name")

    def test_owner_repo_shorthand(self):
        c = GitHubClient(token="t")
        assert c.parse_repo_url("owner/name") == ("owner", "name")

    def test_invalid_url_raises(self):
        c = GitHubClient(token="t")
        with pytest.raises(ValueError, match="Invalid GitHub URL"):
            c.parse_repo_url("https://example.com/not-github")

    def test_empty_raises(self):
        c = GitHubClient(token="t")
        with pytest.raises(ValueError, match="Invalid GitHub URL"):
            c.parse_repo_url("   ")


class TestGetRepoMocked:
    def test_get_repo_success(self, sample_repo_api_payload):
        client = GitHubClient(token="tok")

        def fake_get(url, **kwargs):
            r = MagicMock()
            r.status_code = 200
            if "/languages" in str(url):
                r.json.return_value = {"Python": 1000}
            else:
                r.json.return_value = sample_repo_api_payload
            return r

        with patch.object(client.session, "get", side_effect=fake_get):
            repo = client.get_repo("https://github.com/acme/demo")

        assert repo.full_name == "acme/demo"
        assert repo.default_branch == "main"
        assert "Python" in repo.languages

    def test_get_repo_http_error(self):
        client = GitHubClient(token="tok")
        err = requests.HTTPError()
        resp = MagicMock()
        resp.raise_for_status.side_effect = err
        with patch.object(client.session, "get", return_value=resp):
            with pytest.raises(requests.HTTPError):
                client.get_repo("https://github.com/o/r")


class TestSearchReposMocked:
    def test_rate_limit_raises(self):
        client = GitHubClient(token="tok")
        r = MagicMock()
        r.status_code = 403
        with patch.object(client.session, "get", return_value=r):
            with pytest.raises(Exception, match="rate limit"):
                client.search_repos("language:python")

    def test_search_returns_repos(self):
        client = GitHubClient(token="tok")
        r = MagicMock()
        r.status_code = 200
        r.json.return_value = {
            "items": [
                {
                    "full_name": "a/b",
                    "description": "x",
                    "default_branch": "main",
                    "html_url": "https://github.com/a/b",
                    "clone_url": "https://github.com/a/b.git",
                    "language": "Python",
                    "stargazers_count": 5,
                    "open_issues_count": 2,
                    "topics": ["help-wanted"],
                }
            ]
        }
        with patch.object(client.session, "get", return_value=r):
            repos = client.search_repos("test", per_page=5)
        assert len(repos) == 1
        assert repos[0].full_name == "a/b"


class TestGetFileTreeLocal:
    def test_lists_text_files_skips_ignored(self, tmp_path: Path):
        client = GitHubClient(token=None)
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")
        (tmp_path / "node_modules").mkdir()
        (tmp_path / "node_modules" / "x.js").write_text("", encoding="utf-8")
        files = client.get_file_tree(tmp_path, max_depth=5)
        assert any("src/app.py" in f.replace("\\", "/") for f in files)
        assert not any("node_modules" in f for f in files)
