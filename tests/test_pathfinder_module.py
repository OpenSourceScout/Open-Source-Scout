"""Module tests: Pathfinder repository search and ranking (Agent 0)."""
import json
from unittest.mock import MagicMock

from core.agents.pathfinder import PathfinderAgent
from core.schemas import GitHubRepo


def _sample_repo(name: str = "acme/starter") -> GitHubRepo:
    return GitHubRepo(
        full_name=name,
        html_url=f"https://github.com/{name}",
        clone_url=f"https://github.com/{name}.git",
        language="Python",
        languages={"Python": 5000},
        stargazers_count=800,
        open_issues_count=40,
        topics=["good-first-issue", "python"],
    )


class TestPathfinderRepositorySearch:
    def test_empty_tech_stack_returns_no_repos(self):
        gh = MagicMock()
        g = MagicMock()
        agent = PathfinderAgent(g)
        out = agent.run([], gh, top_n=5)
        assert out.ranked_repos == []
        gh.search_repos.assert_not_called()

    def test_search_failure_gracefully_yields_empty_ranked(self):
        gh = MagicMock()
        gh.search_repos.side_effect = RuntimeError("API failure")
        g = MagicMock()
        agent = PathfinderAgent(g)
        out = agent.run(["python"], gh, top_n=5)
        assert out.ranked_repos == []
        assert out.search_queries_used

    def test_ranks_unique_repos_from_github_search(self):
        gh = MagicMock()
        gh.search_repos.return_value = [
            _sample_repo("a/one"),
            _sample_repo("b/two"),
        ]
        g = MagicMock()
        g.complete.return_value = json.dumps(
            {
                "reasons": [
                    "Matches your Python skills",
                    "Beginner-friendly signals in topics",
                    "Healthy issue backlog",
                ]
            }
        )
        agent = PathfinderAgent(g)
        out = agent.run(["python"], gh, top_n=2)
        assert len(out.ranked_repos) == 2
        assert out.ranked_repos[0].score_total >= out.ranked_repos[1].score_total
        names = {r.full_name for r in out.ranked_repos}
        assert names == {"a/one", "b/two"}
        assert "python" in [t.lower() for t in out.tech_stack]

    def test_deduplicates_duplicate_search_hits(self):
        gh = MagicMock()
        same = _sample_repo("dup/repo")
        gh.search_repos.return_value = [same, same]
        g = MagicMock()
        g.complete.return_value = '{"reasons": ["r1", "r2", "r3"]}'
        agent = PathfinderAgent(g)
        out = agent.run(["python"], gh, top_n=5)
        assert len(out.ranked_repos) == 1
