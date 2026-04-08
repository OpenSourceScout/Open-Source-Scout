"""
GitHub API Client - Fetches issues, repo metadata, and clones repositories.
"""
import os
import re
import time
import base64
import hashlib
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import requests
from git import Repo as GitRepo
from git.exc import GitCommandError

from core.schemas import GitHubIssue, GitHubRepo


class GitHubClient:
    """Client for interacting with GitHub API and cloning repos."""
    
    BASE_URL = "https://api.github.com"
    
    def __init__(self, token: Optional[str] = None, cache_dir: str = ".cache/repos"):
        """
        Initialize GitHub client.
        
        Args:
            token: GitHub personal access token (optional but recommended)
            cache_dir: Directory to cache cloned repositories
        """
        self.token = token or os.getenv("GITHUB_TOKEN")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        self.session = requests.Session()
        if self.token:
            self.session.headers["Authorization"] = f"token {self.token}"
        self.session.headers["Accept"] = "application/vnd.github.v3+json"
        self.session.headers["User-Agent"] = "Open-Source-Scout/1.0"
    
    @property
    def has_token(self) -> bool:
        """Check if a GitHub token is configured."""
        return bool(self.token)
    
    @property
    def rate_limit_info(self) -> dict:
        """Get current rate limit status."""
        resp = self.session.get(f"{self.BASE_URL}/rate_limit")
        if resp.status_code == 200:
            data = resp.json()
            return {
                "remaining": data["resources"]["core"]["remaining"],
                "limit": data["resources"]["core"]["limit"],
                "reset_at": data["resources"]["core"]["reset"]
            }
        return {"remaining": 0, "limit": 60, "reset_at": 0}
    
    def parse_repo_url(self, url: str) -> Tuple[str, str]:
        """
        Parse owner and repo name from GitHub URL.
        
        Args:
            url: GitHub repository URL
            
        Returns:
            Tuple of (owner, repo_name)
        """
        # Clean the URL - remove trailing slashes and whitespace
        url = url.strip().rstrip('/')
        
        # Handle various URL formats
        patterns = [
            r"github\.com[/:]([^/]+)/([^/?\s]+)",  # https://github.com/owner/repo or git@github.com:owner/repo
            r"^([^/\s]+)/([^/\s]+)$"  # owner/repo format
        ]
        
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                owner, repo = match.groups()
                # Remove .git suffix if present
                if repo.endswith('.git'):
                    repo = repo[:-4]
                return owner, repo
        
        raise ValueError(f"Invalid GitHub URL: {url}")
    
    def get_repo(self, url: str) -> GitHubRepo:
        """
        Fetch repository metadata.
        
        Args:
            url: GitHub repository URL
            
        Returns:
            GitHubRepo object with repository metadata
        """
        owner, repo = self.parse_repo_url(url)
        
        # Get basic repo info
        resp = self.session.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
        resp.raise_for_status()
        data = resp.json()
        
        # Get languages
        lang_resp = self.session.get(f"{self.BASE_URL}/repos/{owner}/{repo}/languages")
        languages = lang_resp.json() if lang_resp.status_code == 200 else {}
        
        return GitHubRepo(
            full_name=data["full_name"],
            description=data.get("description"),
            default_branch=data.get("default_branch", "main"),
            html_url=data["html_url"],
            clone_url=data["clone_url"],
            language=data.get("language"),
            languages=languages,
            stargazers_count=data.get("stargazers_count", 0),
            open_issues_count=data.get("open_issues_count", 0)
        )
    
    def get_issues(
        self, 
        url: str, 
        beginner_only: bool = True,
        max_issues: int = 30
    ) -> List[GitHubIssue]:
        """
        Fetch open issues from repository.
        
        Args:
            url: GitHub repository URL
            beginner_only: If True, filter for beginner-friendly labels
            max_issues: Maximum number of issues to fetch
            
        Returns:
            List of GitHubIssue objects
        """
        owner, repo = self.parse_repo_url(url)
        
        # Labels to look for (GitHub API supports comma-separated for OR)
        beginner_labels = [
            "good first issue",
            "good-first-issue", 
            "help wanted",
            "help-wanted",
            "beginner",
            "easy",
            "starter",
            "first-timers-only"
        ]
        
        all_issues = []
        
        if beginner_only:
            # Fetch issues for each beginner label
            for label in beginner_labels:
                if len(all_issues) >= max_issues:
                    break
                    
                params = {
                    "state": "open",
                    "labels": label,
                    "per_page": min(10, max_issues - len(all_issues)),
                    "sort": "updated",
                    "direction": "desc"
                }
                
                resp = self.session.get(
                    f"{self.BASE_URL}/repos/{owner}/{repo}/issues",
                    params=params
                )
                
                if resp.status_code == 200:
                    for item in resp.json():
                        # Skip pull requests (they appear in issues endpoint)
                        if "pull_request" in item:
                            continue
                        
                        issue = self._parse_issue(item)
                        # Avoid duplicates
                        if not any(i.number == issue.number for i in all_issues):
                            all_issues.append(issue)
        else:
            # Fetch all open issues
            params = {
                "state": "open",
                "per_page": max_issues,
                "sort": "updated",
                "direction": "desc"
            }
            
            resp = self.session.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/issues",
                params=params
            )
            resp.raise_for_status()
            
            for item in resp.json():
                if "pull_request" not in item:
                    all_issues.append(self._parse_issue(item))
        
        return all_issues[:max_issues]
    
    def search_repos(
        self,
        query: str,
        per_page: int = 10,
        sort: str = "stars",
        order: str = "desc"
    ) -> List[GitHubRepo]:
        """
        Search GitHub repositories.
        
        Args:
            query: Search query (can include qualifiers like language:python)
            per_page: Number of results per page
            sort: Sort by 'stars', 'forks', 'help-wanted-issues', 'updated'
            order: 'asc' or 'desc'
            
        Returns:
            List of GitHubRepo objects
        """
        params = {
            "q": query,
            "per_page": per_page,
            "sort": sort,
            "order": order
        }
        
        resp = self.session.get(
            f"{self.BASE_URL}/search/repositories",
            params=params
        )
        
        if resp.status_code == 403:
            # Rate limit exceeded
            raise Exception("GitHub API rate limit exceeded. Please try again later or add a GITHUB_TOKEN.")
        
        resp.raise_for_status()
        data = resp.json()
        
        repos = []
        for item in data.get("items", []):
            repos.append(GitHubRepo(
                full_name=item["full_name"],
                description=item.get("description"),
                default_branch=item.get("default_branch", "main"),
                html_url=item["html_url"],
                clone_url=item["clone_url"],
                language=item.get("language"),
                languages={},  # Not available in search results
                stargazers_count=item.get("stargazers_count", 0),
                open_issues_count=item.get("open_issues_count", 0),
                topics=item.get("topics", [])
            ))
        
        return repos
    
    def _parse_issue(self, data: dict) -> GitHubIssue:
        """Parse GitHub API issue response into GitHubIssue model."""
        return GitHubIssue(
            number=data["number"],
            title=data["title"],
            body=data.get("body"),
            url=data["url"],
            html_url=data["html_url"],
            labels=[label["name"] for label in data.get("labels", [])],
            state=data["state"],
            created_at=data["created_at"],
            updated_at=data["updated_at"],
            comments=data.get("comments", 0),
            user=data.get("user", {}).get("login")
        )
    
    def get_issue(self, url: str, issue_number: int) -> "GitHubIssue":
        """
        Fetch a single issue by number.

        Uses ``GET /repos/{owner}/{repo}/issues/{issue_number}`` — a direct,
        O(1) lookup that works for any issue number regardless of how recently
        it was updated.

        Args:
            url: GitHub repository URL.
            issue_number: The issue number to fetch.

        Returns:
            GitHubIssue object.

        Raises:
            requests.HTTPError: If the issue doesn't exist (404) or another
                API error occurs.
        """
        owner, repo = self.parse_repo_url(url)
        resp = self.session.get(
            f"{self.BASE_URL}/repos/{owner}/{repo}/issues/{issue_number}"
        )
        resp.raise_for_status()
        return self._parse_issue(resp.json())

    def clone_repo(self, url: str, force_fresh: bool = False) -> Path:
        """
        Clone repository to local cache.
        
        Args:
            url: GitHub repository URL
            force_fresh: If True, delete existing clone and re-clone
            
        Returns:
            Path to cloned repository
        """
        owner, repo = self.parse_repo_url(url)
        
        # Create unique hash for the repo
        repo_hash = hashlib.md5(f"{owner}/{repo}".encode()).hexdigest()[:12]
        repo_dir = self.cache_dir / f"{owner}_{repo}_{repo_hash}"
        
        if repo_dir.exists():
            if force_fresh:
                import shutil
                shutil.rmtree(repo_dir)
            else:
                # Pull latest changes
                try:
                    git_repo = GitRepo(repo_dir)
                    git_repo.remotes.origin.pull()
                    return repo_dir
                except GitCommandError:
                    # If pull fails, do a fresh clone
                    import shutil
                    shutil.rmtree(repo_dir)
        
        # Clone the repository
        clone_url = f"https://github.com/{owner}/{repo}.git"
        try:
            GitRepo.clone_from(
                clone_url,
                repo_dir,
                depth=1,  # Shallow clone for speed
                single_branch=True
            )
        except GitCommandError as e:
            raise RuntimeError(f"Failed to clone repository: {e}")
        
        return repo_dir

    def get_default_branch(self, owner: str, repo: str) -> str:
        """Return the default branch name for a repository (e.g. 'main' or 'master')."""
        resp = self.session.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
        if resp.status_code == 200:
            return resp.json().get("default_branch", "main")
        return "main"

    def get_file_content(
        self,
        owner: str,
        repo: str,
        path: str,
        ref: str = "HEAD"
    ) -> str:
        """
        Fetch raw file content from a repository via the GitHub Contents API.

        Uses ``ref=HEAD`` by default so it always resolves to the repo's true
        default branch regardless of whether it is called ``main``, ``master``
        or anything else.  If that still returns 404 (e.g. the file genuinely
        doesn't exist under that name) the error is propagated to the caller.

        Args:
            owner: Repository owner
            repo: Repository name
            path: File path relative to repo root
            ref: Branch, tag, or commit SHA (default: HEAD — resolves to the
                 repo's default branch automatically)

        Returns:
            Decoded file content as string

        Raises:
            requests.HTTPError: On API errors (e.g. 404 when file not found)
            ValueError: If the path is not a file (e.g. directory)
        """
        url = f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}"
        resp = self.session.get(url, params={"ref": ref})

        # If the caller passed an explicit ref that isn't HEAD and the request
        # failed, make one more attempt using the repo's actual default branch.
        # This handles the common case where a caller hardcodes "main" but the
        # repo uses "master" (or vice-versa).
        if resp.status_code == 404 and ref != "HEAD":
            default_branch = self.get_default_branch(owner, repo)
            if default_branch != ref:
                resp = self.session.get(url, params={"ref": default_branch})

        resp.raise_for_status()
        data = resp.json()
        if data.get("type") != "file":
            raise ValueError(f"Expected file, got {data.get('type')}")
        content = data.get("content", "")
        encoding = data.get("encoding")
        if encoding == "base64":
            return base64.b64decode(content).decode("utf-8", errors="replace")
        return content

    # ==================== Git Data API (no-clone push) ====================

    def _get_ref_sha(self, owner: str, repo: str, branch: str) -> str:
        """
        Get the latest commit SHA for a branch.

        Uses the commits endpoint which is more reliable across different repo types.
        GET /repos/{owner}/{repo}/commits?sha={branch_name}&per_page=1

        Returns:
            Commit SHA string.
        """
        # List commits endpoint is more reliable than refs endpoint
        resp = self.session.get(
            f"{self.BASE_URL}/repos/{owner}/{repo}/commits",
            params={"sha": branch, "per_page": 1}
        )
        
        # If that fails, try the refs endpoint as fallback
        if resp.status_code != 200:
            resp = self.session.get(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/refs/heads/{branch}"
            )
        
        resp.raise_for_status()
        
        # Handle both response formats
        data = resp.json()
        
        # Commits endpoint returns a list, refs endpoint returns an object
        if isinstance(data, list):
            if data:
                return data[0]["sha"]  # Get SHA from first (latest) commit
            else:
                raise ValueError(f"No commits found for branch {branch}")
        elif "object" in data:
            return data["object"]["sha"]  # Refs endpoint format
        else:
            return data["sha"]  # Direct commit format

    def create_blob(self, owner: str, repo: str, content: str) -> str:
        """
        Create a blob with base64-encoded file content.

        POST /repos/{owner}/{repo}/git/blobs

        Returns:
            SHA of the created blob.
        """
        encoded = base64.b64encode(content.encode("utf-8")).decode("ascii")
        resp = self.session.post(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/blobs",
            json={"content": encoded, "encoding": "base64"},
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def _get_commit_tree_sha(self, owner: str, repo: str, commit_sha: str) -> str:
        """
        Get the tree SHA that belongs to a commit.

        GET /repos/{owner}/{repo}/git/commits/{commit_sha}

        Returns:
            Tree SHA string.
        """
        resp = self.session.get(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/commits/{commit_sha}"
        )
        resp.raise_for_status()
        return resp.json()["tree"]["sha"]

    def create_tree(
        self,
        owner: str,
        repo: str,
        base_tree_sha: str,
        file_path: str,
        blob_sha: str,
    ) -> str:
        """
        Create a new tree that replaces one file with a new blob.

        POST /repos/{owner}/{repo}/git/trees

        Returns:
            SHA of the new tree.
        """
        resp = self.session.post(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees",
            json={
                "base_tree": base_tree_sha,
                "tree": [
                    {
                        "path": file_path,
                        "mode": "100644",
                        "type": "blob",
                        "sha": blob_sha,
                    }
                ],
            },
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def create_tree_multi(
        self,
        owner: str,
        repo: str,
        base_tree_sha: str,
        entries: list[dict],
    ) -> str:
        """
        Create a new tree that replaces multiple files with new blobs.

        Args:
            owner: Target repo owner (where we have write access)
            repo: Target repo name
            base_tree_sha: Base tree SHA to apply changes onto
            entries: List of {path, mode, type, sha} objects for the tree API

        Returns:
            SHA of the new tree.
        """
        resp = self.session.post(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees",
            json={
                "base_tree": base_tree_sha,
                "tree": entries,
            },
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def create_commit(
        self,
        owner: str,
        repo: str,
        tree_sha: str,
        parent_sha: str,
        message: str,
    ) -> str:
        """
        Create a commit pointing at the given tree.

        POST /repos/{owner}/{repo}/git/commits

        Returns:
            SHA of the new commit.
        """
        resp = self.session.post(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/commits",
            json={
                "tree": tree_sha,
                "parents": [parent_sha],
                "message": message,
            },
        )
        resp.raise_for_status()
        return resp.json()["sha"]

    def create_or_update_ref(
        self, owner: str, repo: str, branch_name: str, commit_sha: str
    ) -> str:
        """
        Create a new branch ref, or force-update it if it already exists.

        Returns:
            The ref string (e.g. refs/heads/branch-name).
        """
        ref = f"refs/heads/{branch_name}"

        # Try to create the ref first
        resp = self.session.post(
            f"{self.BASE_URL}/repos/{owner}/{repo}/git/refs",
            json={"ref": ref, "sha": commit_sha},
        )
        if resp.status_code == 422:
            # Branch already exists — update it
            resp = self.session.patch(
                f"{self.BASE_URL}/repos/{owner}/{repo}/git/refs/heads/{branch_name}",
                json={"sha": commit_sha, "force": True},
            )
        resp.raise_for_status()
        return ref

    def fork_repo(
        self,
        owner: str,
        repo: str,
        poll_timeout: int = 30,
    ) -> Dict[str, str]:
        """
        Fork a repository into the authenticated user's account.

        If the fork already exists the GitHub API simply returns it.
        After the initial POST the fork may not be ready yet (202 Accepted),
        so we poll until the fork is queryable or the timeout is reached.

        Args:
            owner: Upstream repo owner.
            repo: Upstream repo name.
            poll_timeout: Max seconds to wait for the fork to be ready.

        Returns:
            dict with keys: fork_owner, fork_repo
        """
        resp = self.session.post(
            f"{self.BASE_URL}/repos/{owner}/{repo}/forks",
            json={},
        )
        # 202 = fork is being created; 200 = fork already exists
        if resp.status_code not in (200, 202):
            resp.raise_for_status()
        data = resp.json()
        fork_owner = data["owner"]["login"]
        fork_repo = data["name"]

        # Poll until the fork is accessible (GET returns 200)
        deadline = time.time() + poll_timeout
        while time.time() < deadline:
            check = self.session.get(
                f"{self.BASE_URL}/repos/{fork_owner}/{fork_repo}"
            )
            if check.status_code == 200:
                return {"fork_owner": fork_owner, "fork_repo": fork_repo}
            time.sleep(2)

        raise TimeoutError(
            f"Fork {fork_owner}/{fork_repo} not ready after {poll_timeout}s"
        )

    def push_file_content(
        self,
        owner: str,
        repo: str,
        branch_name: str,
        file_path: str,
        content: str,
        commit_message: str,
        base_branch: str = "main",
    ) -> dict:
        """
        Push a single-file edit as a new commit on *branch_name* without
        cloning the repository.  Uses the GitHub Git Data API.

        If the authenticated user does not have write access to the
        target repository, the repo is **forked first** and all writes
        go to the fork.

        Args:
            owner: Repository owner (upstream).
            repo: Repository name (upstream).
            branch_name: Target branch to create / update.
            file_path: Path of the file inside the repo.
            content: Full new file content (UTF-8 string).
            commit_message: Commit message.
            base_branch: Branch to branch off from (default: main).

        Returns:
            dict with keys: commit_sha, branch, branch_url,
                            fork_owner, fork_repo, upstream_owner,
                            upstream_repo, pr_url (compare URL for opening a PR)
        """
        upstream_owner = owner
        upstream_repo = repo

        # Check if we have push access by probing the repo permissions
        perm_resp = self.session.get(
            f"{self.BASE_URL}/repos/{owner}/{repo}"
        )
        perm_resp.raise_for_status()
        permissions = perm_resp.json().get("permissions", {})
        can_push = permissions.get("push", False)

        target_owner = owner
        target_repo = repo

        if not can_push:
            # Fork the repository first
            fork_info = self.fork_repo(owner, repo)
            target_owner = fork_info["fork_owner"]
            target_repo = fork_info["fork_repo"]

        # 1. Latest commit on the base branch (read from upstream so the
        #    fork's branch is based on the freshest upstream state)
        base_commit_sha = self._get_ref_sha(upstream_owner, upstream_repo, base_branch)

        # 2. Create blob with the new content (on the target we can write to)
        blob_sha = self.create_blob(target_owner, target_repo, content)

        # 3. Get tree of the base commit (readable from upstream)
        base_tree_sha = self._get_commit_tree_sha(
            upstream_owner, upstream_repo, base_commit_sha
        )

        # 4. New tree replacing the single file
        new_tree_sha = self.create_tree(
            target_owner, target_repo, base_tree_sha, file_path, blob_sha
        )

        # 5. New commit
        new_commit_sha = self.create_commit(
            target_owner, target_repo, new_tree_sha, base_commit_sha, commit_message
        )

        # 6. Create or update the branch ref
        self.create_or_update_ref(
            target_owner, target_repo, branch_name, new_commit_sha
        )

        branch_url = (
            f"https://github.com/{target_owner}/{target_repo}/tree/{branch_name}"
        )
        # Compare URL that can be used to open a PR back to upstream
        pr_url = (
            f"https://github.com/{upstream_owner}/{upstream_repo}"
            f"/compare/{base_branch}...{target_owner}:{branch_name}"
        )

        return {
            "commit_sha": new_commit_sha,
            "branch": branch_name,
            "branch_url": branch_url,
            "fork_owner": target_owner,
            "fork_repo": target_repo,
            "upstream_owner": upstream_owner,
            "upstream_repo": upstream_repo,
            "pr_url": pr_url,
        }

    def push_files_content(
        self,
        owner: str,
        repo: str,
        branch_name: str,
        files: list[dict],
        commit_message: str,
        base_branch: str = "main",
        target_mode: str = "auto",
    ) -> dict:
        """
        Push multiple file edits as a single commit on *branch_name*.

        target_mode:
            - "original": require push access and write to upstream repo
            - "fork": always write to a fork (create if needed)
            - "auto": write to upstream if push access else fork
        """
        if not files:
            raise ValueError("No files provided to push")

        upstream_owner = owner
        upstream_repo = repo

        perm_resp = self.session.get(f"{self.BASE_URL}/repos/{owner}/{repo}")
        perm_resp.raise_for_status()
        permissions = perm_resp.json().get("permissions", {})
        can_push = permissions.get("push", False)

        if target_mode not in ("original", "fork", "auto"):
            raise ValueError("target_mode must be 'original', 'fork', or 'auto'")

        target_owner = owner
        target_repo = repo

        if target_mode == "original":
            if not can_push:
                raise PermissionError("NO_PUSH_ACCESS")
        elif target_mode == "fork":
            fork_info = self.fork_repo(owner, repo)
            target_owner = fork_info["fork_owner"]
            target_repo = fork_info["fork_repo"]
        else:  # auto
            if not can_push:
                fork_info = self.fork_repo(owner, repo)
                target_owner = fork_info["fork_owner"]
                target_repo = fork_info["fork_repo"]

        base_commit_sha = self._get_ref_sha(upstream_owner, upstream_repo, base_branch)
        base_tree_sha = self._get_commit_tree_sha(upstream_owner, upstream_repo, base_commit_sha)

        tree_entries: list[dict] = []
        for f in files:
            file_path = f.get("file_path") or f.get("path")
            content = f.get("content")
            if not file_path or content is None:
                raise ValueError("Each file must have file_path and content")
            blob_sha = self.create_blob(target_owner, target_repo, content)
            tree_entries.append(
                {
                    "path": file_path,
                    "mode": "100644",
                    "type": "blob",
                    "sha": blob_sha,
                }
            )

        new_tree_sha = self.create_tree_multi(target_owner, target_repo, base_tree_sha, tree_entries)
        new_commit_sha = self.create_commit(target_owner, target_repo, new_tree_sha, base_commit_sha, commit_message)
        self.create_or_update_ref(target_owner, target_repo, branch_name, new_commit_sha)

        branch_url = f"https://github.com/{target_owner}/{target_repo}/tree/{branch_name}"
        pr_url = (
            f"https://github.com/{upstream_owner}/{upstream_repo}"
            f"/compare/{base_branch}...{target_owner}:{branch_name}"
        )
        return {
            "commit_sha": new_commit_sha,
            "branch": branch_name,
            "branch_url": branch_url,
            "fork_owner": target_owner,
            "fork_repo": target_repo,
            "upstream_owner": upstream_owner,
            "upstream_repo": upstream_repo,
            "pr_url": pr_url,
            "files_count": len(files),
        }

    def get_file_tree(self, repo_path: Path, max_depth: int = 5) -> List[str]:
        """
        Get list of files in repository (excluding common non-code directories).
        
        Args:
            repo_path: Path to cloned repository
            max_depth: Maximum directory depth to search
            
        Returns:
            List of file paths relative to repo root
        """
        ignore_dirs = {
            ".git", "node_modules", "__pycache__", ".cache",
            "dist", "build", ".next", "vendor", ".venv", "venv",
            "env", ".env", "coverage", ".nyc_output"
        }
        
        ignore_extensions = {
            ".min.js", ".min.css", ".map", ".lock",
            ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
            ".woff", ".woff2", ".ttf", ".eot"
        }
        
        files = []
        
        def walk_dir(path: Path, depth: int = 0):
            if depth > max_depth:
                return
                
            try:
                for item in path.iterdir():
                    if item.name in ignore_dirs:
                        continue
                    
                    if item.is_file():
                        # Skip ignored extensions
                        if any(item.name.endswith(ext) for ext in ignore_extensions):
                            continue
                        
                        rel_path = item.relative_to(repo_path)
                        files.append(str(rel_path).replace("\\", "/"))
                    
                    elif item.is_dir():
                        walk_dir(item, depth + 1)
            except PermissionError:
                pass

        walk_dir(repo_path)
        return files

    def get_repo_file_tree(
        self,
        owner: str,
        repo: str,
        ref: str = "HEAD",
        max_files: int = 500
    ) -> List[Dict]:
        """
        Fetch the entire file tree structure from a repository via GitHub API.
        
        Uses the GitHub Tree API with recursive=1 to fetch all files and directories
        in a single request. Results are paginated via base_tree parameter.
        
        Args:
            owner: Repository owner
            repo: Repository name
            ref: Branch, tag, or commit SHA (default: HEAD — repo's default branch)
            max_files: Maximum files to return (GitHub default is 100k tree objects)
        
        Returns:
            List of dicts with structure:
            {
                'path': 'src/main.py',
                'type': 'blob' (file) or 'tree' (directory),
                'size': 1024 (for files only)
            }
        
        Raises:
            requests.HTTPError: On API errors (e.g. 404 when ref not found)
        """
        try:
            # Get the commit SHA for the ref
            ref_sha = self._get_ref_sha(owner, repo, ref)
        except requests.HTTPError:
            # If ref fails (404), try default branch
            default_branch = self.get_default_branch(owner, repo)
            if default_branch != ref:
                ref_sha = self._get_ref_sha(owner, repo, default_branch)
            else:
                raise

        # Get tree with recursive=1 to fetch all files at once
        url = f"{self.BASE_URL}/repos/{owner}/{repo}/git/trees/{ref_sha}"
        params = {
            "recursive": "1",
            "per_page": "100"  # GitHub returns up to 100 tree objects per page
        }

        all_items = []
        
        try:
            resp = self.session.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
            
            # Check if we hit the 100k tree object limit
            if data.get("truncated", False):
                # Tree was truncated; try fetching via content API instead
                return self._get_repo_files_via_content_api(owner, repo, ref, max_files)
            
            items = data.get("tree", [])
            
            # Filter to files/dirs only, exclude submodules
            for item in items:
                if item["type"] in ["blob", "tree"]:
                    all_items.append({
                        "path": item["path"],
                        "type": "file" if item["type"] == "blob" else "dir",
                        "size": item.get("size", 0)
                    })
            
            return all_items[:max_files]
        
        except Exception as e:
            # Fallback to content API if tree API fails
            try:
                return self._get_repo_files_via_content_api(owner, repo, ref, max_files)
            except Exception:
                raise e

    def _get_repo_files_via_content_api(
        self,
        owner: str,
        repo: str,
        ref: str,
        max_files: int = 500
    ) -> List[Dict]:
        """
        Fallback method: Fetch file tree via Contents API (recursive).
        
        This is slower but works for truncated repositories.
        """
        files = []
        visited_dirs = set()

        def fetch_dir(path: str = ""):
            if len(files) >= max_files:
                return
            
            if path in visited_dirs:
                return
            
            visited_dirs.add(path)
            
            url = f"{self.BASE_URL}/repos/{owner}/{repo}/contents/{path}"
            try:
                resp = self.session.get(
                    url,
                    params={"ref": ref}
                )
                
                if resp.status_code == 404:
                    return
                
                resp.raise_for_status()
                items = resp.json()
                
                # Handle single file response
                if isinstance(items, dict):
                    items = [items]
                
                for item in items:
                    if len(files) >= max_files:
                        return
                    
                    if item["type"] == "file":
                        files.append({
                            "path": item["path"],
                            "type": "file",
                            "size": item.get("size", 0)
                        })
                    elif item["type"] == "dir":
                        files.append({
                            "path": item["path"],
                            "type": "dir",
                            "size": 0
                        })
                        # Recursively fetch subdirectory
                        fetch_dir(item["path"])
            
            except Exception:
                pass

        fetch_dir()
        return files
