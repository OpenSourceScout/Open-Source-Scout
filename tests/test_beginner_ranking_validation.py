"""
Issue ranking validation: beginner-friendly issues should outrank hostile/complex ones.
"""
import pytest

from core.scoring import IssueScorer
from tests.helpers import make_github_issue


class TestBeginnerFriendlyOrdering:
    @pytest.fixture
    def scorer(self):
        return IssueScorer()

    def test_good_first_issue_outranks_unlabeled_complex_body(self, scorer):
        beginner = make_github_issue(
            number=1,
            labels=["good first issue"],
            title="Fix typo in README",
            body="Replace 'teh' with 'the' in the installation section.",
        )
        vague = make_github_issue(
            number=2,
            labels=[],
            title="Stuff",
            body="idk",
        )
        ranked = scorer.rank_issues([vague, beginner], top_n=2)
        assert ranked[0][0].number == beginner.number
        assert ranked[0][1].total >= ranked[1][1].total

    def test_help_wanted_outranks_breaking_change_combo(self, scorer):
        easy = make_github_issue(
            number=10,
            labels=["help wanted"],
            title="Add docstring to helper",
            body="Single function in utils.py needs a short docstring.",
        )
        risky = make_github_issue(
            number=20,
            labels=["breaking change", "complex"],
            title="Rewrite auth and migrate database",
            body="Refactor security, migration, database schema, breaking API.",
        )
        ranked = scorer.rank_issues([risky, easy], top_n=2)
        assert ranked[0][0].number == easy.number

    def test_ranking_stable_descending_scores(self, scorer):
        issues = [
            make_github_issue(number=i, labels=["good first issue"] if i % 2 == 0 else [])
            for i in range(1, 15)
        ]
        ranked = scorer.rank_issues(issues, top_n=5)
        scores = [r[1].total for r in ranked]
        assert scores == sorted(scores, reverse=True)
