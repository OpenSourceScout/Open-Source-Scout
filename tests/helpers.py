from datetime import datetime, timezone, timedelta

from core.schemas import GitHubIssue


def make_github_issue(
    number: int = 1,
    title: str = "Test issue",
    body: str | None = None,
    labels: list | None = None,
    comments: int = 0,
    days_old: int = 7,
) -> GitHubIssue:
    now = datetime.now(timezone.utc)
    created = now - timedelta(days=days_old)
    updated = now - timedelta(days=1)
    return GitHubIssue(
        number=number,
        title=title,
        body=body,
        url=f"https://api.github.com/repos/test/repo/issues/{number}",
        html_url=f"https://github.com/test/repo/issues/{number}",
        labels=labels or [],
        state="open",
        created_at=created.isoformat(),
        updated_at=updated.isoformat(),
        comments=comments,
    )
