from pathlib import Path
from unittest.mock import patch

from core.terminal_manager import TerminalManager


def _write_text(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def test_terminal_suggestions_follow_repo_stack_and_briefing(tmp_path):
    clone_root = tmp_path / "clone"
    clone_root.mkdir()

    _write_text(clone_root / "pyproject.toml", "[project]\nname = 'demo'\n")
    (clone_root / "app").mkdir()
    _write_text(clone_root / "app" / "api.py", "from fastapi import FastAPI\napp = FastAPI()\n")
    (clone_root / "tests").mkdir()
    _write_text(clone_root / "main.py", "print('hello')\n")

    frontend_dir = clone_root / "frontend"
    frontend_dir.mkdir()
    _write_text(
        frontend_dir / "package.json",
        '{"name":"frontend","packageManager":"pnpm@9.0.0","scripts":{"dev":"vite","build":"vite build","test":"vitest","lint":"eslint ."}}',
    )

    manager = TerminalManager(base_workspace=str(tmp_path / "workspaces"))
    analysis_data = {
        "agent3_output": {
            "briefing_markdown": "Run the tests first, then check the frontend and build output.",
        }
    }

    with patch("core.terminal_manager.GitHubClient") as github_cls:
        github = github_cls.return_value
        github.clone_repo.return_value = clone_root
        session = manager.create_session(
            owner="octocat",
            repo="demo",
            ref="main",
            analysis_data=analysis_data,
        )

    suggestions = manager.get_suggestions(session["session_id"])
    commands = [step["command"] for step in suggestions]

    assert commands[0] == "uv sync"
    assert "uv run pytest" in commands
    assert any(command.startswith("uv run uvicorn app.api:app") for command in commands)
    assert "pnpm install" in commands
    assert "pnpm run dev" in commands
    assert "pnpm run build" in commands
    assert "pnpm run test" in commands