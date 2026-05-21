"""
Open Source Scout — unified dev launcher.

Usage:
    python main.py                 # start backend + frontend
    python main.py --backend-only  # start only the FastAPI server
    python main.py --frontend-only # start only the React dev server
"""
import argparse
import os
import subprocess
import sys
import threading
import signal
from pathlib import Path

from dotenv import load_dotenv

# --------------------------------------------------------------------------- #
#  ANSI colour helpers                                                          #
# --------------------------------------------------------------------------- #
RESET  = "\033[0m"
BOLD   = "\033[1m"
CYAN   = "\033[36m"
YELLOW = "\033[33m"
RED    = "\033[31m"
GREEN  = "\033[32m"

def _prefix(tag: str, colour: str) -> str:
    return f"{colour}{BOLD}[{tag}]{RESET} "

BACKEND_PFX  = _prefix("backend ", CYAN)
FRONTEND_PFX = _prefix("frontend", YELLOW)


# --------------------------------------------------------------------------- #
#  Stream reader — runs in its own thread                                       #
# --------------------------------------------------------------------------- #
def _stream(pipe, prefix: str, stop_event: threading.Event):
    """Read *pipe* line-by-line, print with *prefix*, set stop_event on EOF."""
    try:
        for line in iter(pipe.readline, b""):
            if stop_event.is_set():
                break
            sys.stdout.write(prefix + line.decode(errors="replace"))
            sys.stdout.flush()
    finally:
        stop_event.set()


# --------------------------------------------------------------------------- #
#  Process launchers                                                            #
# --------------------------------------------------------------------------- #
ROOT = Path(__file__).parent
BACKEND_PORT = 8003


def _resolve_python() -> str:
    """Prefer project virtualenv so optional deps (e.g. cascadeflow) are available."""
    if os.name == "nt":
        candidates = (
            ROOT / ".venv" / "Scripts" / "python.exe",
            ROOT / "venv" / "Scripts" / "python.exe",
        )
    else:
        candidates = (
            ROOT / ".venv" / "bin" / "python",
            ROOT / "venv" / "bin" / "python",
        )
    for path in candidates:
        if path.is_file():
            return str(path)
    return sys.executable


def _backend_env() -> dict[str, str]:
    load_dotenv(ROOT / ".env", override=True)
    return os.environ.copy()


def _start_backend() -> subprocess.Popen:
    python = _resolve_python()
    cmd = [
        python, "-m", "uvicorn",
        "--reload",
        # Restrict reload watching to backend source folders; otherwise large
        # temp/cached checkouts under `.cache/` can trigger endless reloads.
        "--reload-dir", "app",
        "--reload-dir", "core",
        "--reload-dir", "integrations",
        "--reload-dir", "utils",
        "--reload-dir", "tests",
        "--port", str(BACKEND_PORT),
        "app.api:app",
    ]
    print(f"{CYAN}{BOLD}Starting backend{RESET}  -> http://localhost:{BACKEND_PORT}")
    print(f"{CYAN}  Python:{RESET} {python}")
    return subprocess.Popen(
        cmd,
        cwd=ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=_backend_env(),
    )


def _start_frontend() -> subprocess.Popen:
    frontend_dir = ROOT / "frontend"
    if not frontend_dir.exists():
        print(f"{RED}[error] frontend/ directory not found.{RESET}", file=sys.stderr)
        sys.exit(1)

    # Detect package manager
    npm = "npm"
    if (frontend_dir / "yarn.lock").exists():
        npm = "yarn"
    elif (frontend_dir / "pnpm-lock.yaml").exists():
        npm = "pnpm"

    cmd = [npm, "run", "dev"]
    print(f"{YELLOW}{BOLD}Starting frontend{RESET} -> http://localhost:5173")
    return subprocess.Popen(
        cmd,
        cwd=frontend_dir,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=os.environ.copy(),
        shell=(sys.platform == "win32"),
    )


# --------------------------------------------------------------------------- #
#  Main                                                                         #
# --------------------------------------------------------------------------- #
def main():
    parser = argparse.ArgumentParser(description="Open Source Scout dev launcher")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--backend-only",  action="store_true", help="Start only the FastAPI backend")
    group.add_argument("--frontend-only", action="store_true", help="Start only the React frontend")
    args = parser.parse_args()

    processes: list[subprocess.Popen] = []
    stop_event = threading.Event()

    def _shutdown(signum=None, frame=None):
        if stop_event.is_set():
            return
        stop_event.set()
        print(f"\n{RED}{BOLD}Shutting down…{RESET}")
        for proc in processes:
            try:
                proc.terminate()
            except OSError:
                pass
        for proc in processes:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    # Launch requested processes
    if not args.frontend_only:
        backend = _start_backend()
        processes.append(backend)
        threading.Thread(
            target=_stream,
            args=(backend.stdout, BACKEND_PFX, stop_event),
            daemon=True,
        ).start()

    if not args.backend_only:
        frontend = _start_frontend()
        processes.append(frontend)
        threading.Thread(
            target=_stream,
            args=(frontend.stdout, FRONTEND_PFX, stop_event),
            daemon=True,
        ).start()

    if not processes:
        print(f"{RED}No processes started.{RESET}")
        return

    print(f"\n{GREEN}{BOLD}Both servers running.{RESET}  Press Ctrl+C to stop.\n")

    # Wait — exit as soon as any process dies unexpectedly
    try:
        while not stop_event.is_set():
            for proc in processes:
                ret = proc.poll()
                if ret is not None:
                    name = "backend" if proc == processes[0] else "frontend"
                    print(
                        f"\n{RED}{BOLD}[{name}] exited with code {ret}.{RESET}",
                        file=sys.stderr,
                    )
                    _shutdown()
                    break
            stop_event.wait(timeout=0.5)
    finally:
        _shutdown()


if __name__ == "__main__":
    main()
