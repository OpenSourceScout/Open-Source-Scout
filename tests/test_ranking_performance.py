"""Lightweight performance smoke: ranking many issues stays fast (no I/O)."""

import time

from core.scoring import IssueScorer
from tests.helpers import make_github_issue


def test_rank_hundred_issues_under_one_second():
    scorer = IssueScorer()
    issues = [make_github_issue(number=i, title=f"Issue {i}") for i in range(100)]
    t0 = time.perf_counter()
    ranked = scorer.rank_issues(issues, top_n=10)
    elapsed = time.perf_counter() - t0
    assert len(ranked) == 10
    assert elapsed < 1.0, f"ranking too slow: {elapsed:.3f}s"
