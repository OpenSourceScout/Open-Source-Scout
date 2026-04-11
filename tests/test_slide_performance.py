"""Performance / scalability smoke tests (slide: refinement & optimization)."""
import time
from pathlib import Path

from integrations.github_client import GitHubClient


def test_get_file_tree_scales_to_many_small_files(tmp_path: Path):
    sub = tmp_path / "pkg"
    sub.mkdir()
    for i in range(120):
        (sub / f"mod_{i}.py").write_text(f"# {i}\n", encoding="utf-8")
    client = GitHubClient(token=None)
    t0 = time.perf_counter()
    files = client.get_file_tree(tmp_path, max_depth=4)
    elapsed = time.perf_counter() - t0
    assert len(files) >= 120
    assert elapsed < 3.0, f"file tree walk too slow: {elapsed:.2f}s"
