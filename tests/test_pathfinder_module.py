"""Module tests: Pathfinder repository search and ranking (Agent 0)."""
import json
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock

from core.agents.pathfinder import PathfinderAgent
from core.schemas import GitHubRepo, RepoSearchPreferences


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

    def test_search_prompt_parsed_into_preferences(self):
        gh = MagicMock()
        gh.search_repos.return_value = []
        g = MagicMock()
        g.complete.return_value = json.dumps(
            {
                "tech_stack": ["React", "Node.js"],
                "domain": "AI",
                "difficulty": "beginner",
                "preferred_tasks": ["frontend"],
            }
        )
        agent = PathfinderAgent(g)
        out = agent.run(
            tech_stack=[],
            github_client=gh,
            search_prompt="I want beginner React AI frontend repos",
        )
        assert out.preferences is not None
        assert "React" in out.preferences.tech_stack
        assert out.preferences.domain == "AI"
        assert "frontend" in out.preferences.preferred_tasks

    def test_weighted_total_uses_new_formula(self):
        agent = PathfinderAgent(MagicMock())
        recent = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        repo = _sample_repo()
        repo.pushed_at = recent
        prefs = RepoSearchPreferences(
            tech_stack=["python"],
            domain="",
            difficulty="beginner",
            preferred_tasks=[],
        )
        result = agent._calculate_repo_score(repo, prefs, MagicMock())
        expected = round(
            result["active_score"] * 0.25
            + result["beginner_friendly"] * 0.30
            + result["tech_match"] * 0.20
            + result["issue_quality"] * 0.15
            + result["community_score"] * 0.10
        )
        assert result["total"] == expected
        assert all(0 <= result[k] <= 100 for k in (
            "active_score", "beginner_friendly", "tech_match", "issue_quality", "community_score"
        ))
