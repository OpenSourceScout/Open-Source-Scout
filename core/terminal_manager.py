"""
Session-scoped terminal runtime for the editor experience.

This module keeps all state in memory and on local disk workspace folders.
No terminal data is persisted in the database.
"""

from __future__ import annotations

import json
import os
import queue
import shutil
import subprocess
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from integrations.github_client import GitHubClient


class TerminalManagerError(Exception):
    """Base error for terminal manager failures."""


class SessionNotFoundError(TerminalManagerError):
    """Raised when a session ID is unknown or expired."""


class TerminalNotFoundError(TerminalManagerError):
    """Raised when a terminal ID does not exist in a session."""


@dataclass
class TerminalProcessState:
    terminal_id: str
    label: str
    cwd: Path
    process: subprocess.Popen
    output_queue: queue.Queue[str] = field(default_factory=queue.Queue)
    history: deque[str] = field(default_factory=lambda: deque(maxlen=8000))
    closed: bool = False
    exit_code: int | None = None


@dataclass
class TerminalSessionState:
    session_id: str
    owner: str
    repo: str
    ref: str
    workspace_root: Path
    repo_root: Path
    created_at: float
    last_accessed: float
    suggestions: list[dict[str, str | None]] = field(default_factory=list)
    terminals: dict[str, TerminalProcessState] = field(default_factory=dict)


class TerminalManager:
    """In-memory terminal session manager with local workspace storage."""

    def __init__(
        self,
        base_workspace: str | None = None,
        session_ttl_seconds: int | None = None,
    ) -> None:
        configured_base = (
            base_workspace
            or (os.getenv("OSS_TERMINAL_WORKSPACES") or "").strip()
            or ".cache/terminal_workspaces"
        )
        self.base_workspace = Path(configured_base)
        self.base_workspace.mkdir(parents=True, exist_ok=True)

        configured_ttl = session_ttl_seconds
        if configured_ttl is None:
            ttl_minutes = int(os.getenv("TERMINAL_SESSION_TTL_MINUTES", "180"))
            configured_ttl = max(15, ttl_minutes) * 60
        self.session_ttl_seconds = configured_ttl

        self._lock = threading.RLock()
        self._sessions: dict[str, TerminalSessionState] = {}

    def create_session(
        self,
        owner: str,
        repo: str,
        ref: str = "HEAD",
        github_token: str | None = None,
    ) -> dict[str, Any]:
        owner = owner.strip()
        repo = repo.strip()
        ref = (ref or "HEAD").strip() or "HEAD"

        if not owner or not repo:
            raise TerminalManagerError("owner and repo are required")

        self._cleanup_expired_sessions()

        session_id = uuid.uuid4().hex[:12]
        workspace_root = self.base_workspace / session_id
        repo_root = workspace_root / "repo"

        if workspace_root.exists():
            shutil.rmtree(workspace_root, ignore_errors=True)
        workspace_root.mkdir(parents=True, exist_ok=True)

        repo_url = f"https://github.com/{owner}/{repo}"
        github_client = GitHubClient(token=github_token)

        try:
            cached_clone = github_client.clone_repo(repo_url)
            shutil.copytree(cached_clone, repo_root, dirs_exist_ok=True)

            # Keep branch/ref alignment close to what the user opened in editor.
            if ref and ref != "HEAD":
                subprocess.run(
                    ["git", "checkout", ref],
                    cwd=repo_root,
                    check=False,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )

            now = time.time()
            session = TerminalSessionState(
                session_id=session_id,
                owner=owner,
                repo=repo,
                ref=ref,
                workspace_root=workspace_root,
                repo_root=repo_root,
                created_at=now,
                last_accessed=now,
                suggestions=self._build_suggestions(repo_root),
            )
            with self._lock:
                self._sessions[session_id] = session
            return self._session_payload(session)
        except Exception:
            shutil.rmtree(workspace_root, ignore_errors=True)
            raise

    def close_session(self, session_id: str) -> None:
        with self._lock:
            session = self._sessions.pop(session_id, None)
        if session is None:
            raise SessionNotFoundError(f"Unknown terminal session: {session_id}")
        self._close_session_resources(session)

    def close_all(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
            self._sessions.clear()
        for session in sessions:
            self._close_session_resources(session)

    def sync_files(self, session_id: str, files: list[dict[str, Any]]) -> dict[str, int]:
        session = self._get_session(session_id)
        repo_root = session.repo_root.resolve()

        synced = 0
        for file_item in files:
            rel_path = (
                (file_item.get("path") or file_item.get("file_path") or "")
                .replace("\\", "/")
                .strip()
            )
            content = file_item.get("content")
            if not rel_path or content is None:
                continue

            normalized = rel_path.lstrip("/")
            target = (repo_root / normalized).resolve()
            if os.path.commonpath([str(repo_root), str(target)]) != str(repo_root):
                continue

            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(str(content), encoding="utf-8")
            synced += 1

        return {"synced_files": synced, "total_files": len(files)}

    def list_terminals(self, session_id: str) -> list[dict[str, Any]]:
        session = self._get_session(session_id)
        with self._lock:
            return [self._terminal_payload(t) for t in session.terminals.values()]

    def get_terminal_status(self, session_id: str, terminal_id: str) -> dict[str, Any]:
        terminal = self._get_terminal(session_id, terminal_id)
        return self._terminal_payload(terminal)

    def create_terminal(
        self,
        session_id: str,
        label: str | None = None,
        cwd: str | None = None,
    ) -> dict[str, Any]:
        session = self._get_session(session_id)
        term_id = uuid.uuid4().hex[:8]
        shell_cmd = self._default_shell_command()
        start_cwd = self._resolve_cwd(session.repo_root, cwd)

        process = subprocess.Popen(
            shell_cmd,
            cwd=start_cwd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            shell=False,
            env=self._build_terminal_env(session.repo_root),
            bufsize=0,
        )

        terminal = TerminalProcessState(
            terminal_id=term_id,
            label=(label or f"Terminal {len(session.terminals) + 1}").strip() or f"Terminal {len(session.terminals) + 1}",
            cwd=start_cwd,
            process=process,
        )
        banner = f"# Terminal ready in {start_cwd}\n"
        terminal.history.append(banner)
        terminal.output_queue.put(banner)

        with self._lock:
            session.terminals[term_id] = terminal

        reader = threading.Thread(
            target=self._reader_loop,
            args=(session_id, term_id),
            daemon=True,
        )
        reader.start()

        return self._terminal_payload(terminal)

    def close_terminal(self, session_id: str, terminal_id: str) -> None:
        terminal = self._get_terminal(session_id, terminal_id)
        self._stop_process(terminal)
        with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:
                session.terminals.pop(terminal_id, None)

    def send_input(self, session_id: str, terminal_id: str, data: str) -> None:
        terminal = self._get_terminal(session_id, terminal_id)
        if terminal.process.poll() is not None:
            raise TerminalManagerError("Terminal process is not running")
        stdin = terminal.process.stdin
        if stdin is None:
            raise TerminalManagerError("Terminal stdin is unavailable")
        stdin.write(data.encode("utf-8", errors="replace"))
        stdin.flush()

    def run_command(
        self,
        session_id: str,
        terminal_id: str,
        command: str,
        cwd: str | None = None,
    ) -> dict[str, Any]:
        raw_command = (command or "").strip()
        if not raw_command:
            raise TerminalManagerError("command is required")

        session = self._get_session(session_id)
        script_lines: list[str] = []

        if cwd:
            target_cwd = self._resolve_cwd(session.repo_root, cwd)
            script_lines.append(self._cd_command(target_cwd))

        script_lines.append(raw_command)
        payload = "\n".join(script_lines).strip() + "\n"
        self.send_input(session_id, terminal_id, payload)
        return {"accepted": True, "command": raw_command}

    def read_output(
        self,
        session_id: str,
        terminal_id: str,
        max_chunks: int = 200,
    ) -> list[str]:
        terminal = self._get_terminal(session_id, terminal_id)
        chunks: list[str] = []
        for _ in range(max_chunks):
            try:
                chunks.append(terminal.output_queue.get_nowait())
            except queue.Empty:
                break
        return chunks

    def get_history(self, session_id: str, terminal_id: str) -> str:
        terminal = self._get_terminal(session_id, terminal_id)
        return "".join(list(terminal.history))

    def get_suggestions(self, session_id: str) -> list[dict[str, str | None]]:
        session = self._get_session(session_id)
        return list(session.suggestions)

    def is_allowed_suggested_command(self, command: str) -> bool:
        cmd = (command or "").strip().lower()
        if not cmd:
            return False
        allowed_prefixes = (
            "uv ",
            "python ",
            "pip ",
            "pytest",
            "npm ",
            "pnpm ",
            "yarn ",
            "git status",
        )
        return cmd.startswith(allowed_prefixes)

    def _get_session(self, session_id: str) -> TerminalSessionState:
        self._cleanup_expired_sessions()
        with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                raise SessionNotFoundError(f"Unknown terminal session: {session_id}")
            session.last_accessed = time.time()
            return session

    def _get_terminal(self, session_id: str, terminal_id: str) -> TerminalProcessState:
        session = self._get_session(session_id)
        with self._lock:
            terminal = session.terminals.get(terminal_id)
            if terminal is None:
                raise TerminalNotFoundError(f"Unknown terminal: {terminal_id}")
            return terminal

    def _reader_loop(self, session_id: str, terminal_id: str) -> None:
        try:
            terminal = self._get_terminal(session_id, terminal_id)
        except TerminalManagerError:
            return

        stream = terminal.process.stdout
        if stream is None:
            terminal.closed = True
            terminal.exit_code = terminal.process.poll()
            return

        try:
            while True:
                chunk = stream.readline()
                if not chunk:
                    break
                text = chunk.decode("utf-8", errors="replace")
                terminal.history.append(text)
                terminal.output_queue.put(text)
        finally:
            terminal.exit_code = terminal.process.poll()
            terminal.closed = True
            exit_line = f"\n# Terminal exited with code {terminal.exit_code}\n"
            terminal.history.append(exit_line)
            terminal.output_queue.put(exit_line)

    def _stop_process(self, terminal: TerminalProcessState) -> None:
        if terminal.process.poll() is not None:
            terminal.closed = True
            terminal.exit_code = terminal.process.returncode
            return

        try:
            terminal.process.terminate()
            terminal.process.wait(timeout=3)
        except Exception:
            try:
                terminal.process.kill()
            except Exception:
                pass

        terminal.closed = True
        terminal.exit_code = terminal.process.poll()

    def _close_session_resources(self, session: TerminalSessionState) -> None:
        for terminal in list(session.terminals.values()):
            self._stop_process(terminal)
        shutil.rmtree(session.workspace_root, ignore_errors=True)

    def _cleanup_expired_sessions(self) -> None:
        now = time.time()
        expired: list[str] = []
        with self._lock:
            for sid, session in self._sessions.items():
                if now - session.last_accessed > self.session_ttl_seconds:
                    expired.append(sid)
            stale_sessions = [self._sessions.pop(sid) for sid in expired]

        for session in stale_sessions:
            self._close_session_resources(session)

    def _session_payload(self, session: TerminalSessionState) -> dict[str, Any]:
        return {
            "session_id": session.session_id,
            "owner": session.owner,
            "repo": session.repo,
            "ref": session.ref,
            "workspace_root": str(session.workspace_root),
            "repo_root": str(session.repo_root),
            "created_at": session.created_at,
            "expires_in_seconds": self.session_ttl_seconds,
            "terminals": [self._terminal_payload(t) for t in session.terminals.values()],
            "suggestions_count": len(session.suggestions),
        }

    def _terminal_payload(self, terminal: TerminalProcessState) -> dict[str, Any]:
        return {
            "terminal_id": terminal.terminal_id,
            "label": terminal.label,
            "cwd": str(terminal.cwd),
            "closed": terminal.closed,
            "exit_code": terminal.exit_code,
        }

    def _build_terminal_env(self, repo_root: Path) -> dict[str, str]:
        env = os.environ.copy()
        cache_root = repo_root / ".terminal-cache"
        pip_cache = cache_root / "pip"
        uv_cache = cache_root / "uv"
        npm_cache = cache_root / "npm"

        pip_cache.mkdir(parents=True, exist_ok=True)
        uv_cache.mkdir(parents=True, exist_ok=True)
        npm_cache.mkdir(parents=True, exist_ok=True)

        env["PIP_CACHE_DIR"] = str(pip_cache)
        env["UV_CACHE_DIR"] = str(uv_cache)
        env["NPM_CONFIG_CACHE"] = str(npm_cache)

        if os.name != "nt":
            env["HISTFILE"] = str(repo_root / ".terminal_history")

        return env

    def _default_shell_command(self) -> list[str]:
        if os.name == "nt":
            return ["powershell.exe", "-NoLogo"]
        if shutil.which("bash"):
            return ["bash"]
        return ["sh"]

    def _resolve_cwd(self, repo_root: Path, cwd: str | None) -> Path:
        base = repo_root.resolve()
        if not cwd:
            return base
        candidate = (base / cwd).resolve()
        if os.path.commonpath([str(base), str(candidate)]) != str(base):
            return base
        if candidate.is_dir():
            return candidate
        return base

    def _cd_command(self, target: Path) -> str:
        if os.name == "nt":
            return f'cd /d "{target}"'
        return f'cd "{target}"'

    def _build_suggestions(self, repo_root: Path) -> list[dict[str, str | None]]:
        suggestions: list[dict[str, str | None]] = []
        seen: set[tuple[str, str]] = set()

        def add(comment: str, command: str, cwd: str | None = None) -> None:
            key = ((cwd or "").strip(), command.strip())
            if key in seen:
                return
            seen.add(key)
            suggestions.append(
                {
                    "comment": comment,
                    "command": command,
                    "cwd": cwd,
                }
            )

        has_pyproject = (repo_root / "pyproject.toml").exists()
        has_requirements = (repo_root / "requirements.txt").exists()
        has_api = (repo_root / "app" / "api.py").exists()
        has_main_py = (repo_root / "main.py").exists()
        has_tests = (repo_root / "tests").exists()

        root_scripts = self._package_scripts(repo_root / "package.json")
        frontend_scripts = self._package_scripts(repo_root / "frontend" / "package.json")

        if has_pyproject:
            add("# Install Python dependencies with uv", "uv sync")
        elif has_requirements:
            add("# Install Python dependencies from requirements", "pip install -r requirements.txt")

        if has_api:
            add("# Start the FastAPI backend", "uv run uvicorn app.api:app --reload --port 8003")

        if has_main_py:
            add("# Start the combined project launcher", "uv run python main.py")

        if has_tests:
            add("# Run backend tests", "uv run pytest")

        if "install" in root_scripts or (repo_root / "package.json").exists():
            add("# Install root Node dependencies", "npm install")
        if "dev" in root_scripts:
            add("# Run root frontend/server in dev mode", "npm run dev")
        if "test" in root_scripts:
            add("# Run root Node tests", "npm run test")

        frontend_dir = repo_root / "frontend"
        if frontend_dir.exists() and (frontend_dir / "package.json").exists():
            add("# Install frontend dependencies", "npm install", cwd="frontend")
            if "dev" in frontend_scripts:
                add("# Start Vite frontend", "npm run dev", cwd="frontend")
            if "build" in frontend_scripts:
                add("# Build frontend for production", "npm run build", cwd="frontend")
            if "test" in frontend_scripts:
                add("# Run frontend unit tests", "npm run test", cwd="frontend")

        add("# Check current git status", "git status")

        return suggestions

    def _package_scripts(self, package_json_path: Path) -> set[str]:
        if not package_json_path.exists():
            return set()
        try:
            data = json.loads(package_json_path.read_text(encoding="utf-8"))
            scripts = data.get("scripts") or {}
            if not isinstance(scripts, dict):
                return set()
            return {str(k) for k in scripts.keys()}
        except Exception:
            return set()
