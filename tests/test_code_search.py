"""
Module tests: code localization search and symbol extraction.
"""
from pathlib import Path

from utils.code_search import CodeSearcher


class TestCodeSearcherPythonFallback:
    def test_finds_literal_in_repo(self, tmp_path: Path):
        (tmp_path / "mod.py").write_text(
            "def locate_me():\n    return 42\n",
            encoding="utf-8",
        )
        s = CodeSearcher(tmp_path)
        results = s.search("locate_me", max_results=10)
        assert len(results) >= 1
        assert results[0].file_path.replace("\\", "/") == "mod.py"
        assert "locate_me" in results[0].line_content

    def test_extract_symbols_python(self, tmp_path: Path):
        (tmp_path / "a.py").write_text(
            "class Foo:\n    pass\n\ndef bar():\n    pass\n",
            encoding="utf-8",
        )
        s = CodeSearcher(tmp_path)
        syms = s.extract_symbols("a.py")
        assert "Foo" in syms
        assert "bar" in syms

    def test_get_file_content_slice(self, tmp_path: Path):
        lines = "\n".join(f"line {i}" for i in range(1, 6))
        (tmp_path / "f.txt").write_text(lines + "\n", encoding="utf-8")
        s = CodeSearcher(tmp_path)
        chunk = s.get_file_content("f.txt", start_line=2, end_line=3)
        assert "line 2" in chunk
        assert "line 3" in chunk

    def test_missing_file_returns_empty(self, tmp_path: Path):
        s = CodeSearcher(tmp_path)
        assert s.search("xyz_nonexistent_token_999", max_results=5) == []
        assert s.get_file_content("missing.py") == ""

    def test_empty_path_and_directory_not_opened_as_file(self, tmp_path: Path):
        (tmp_path / "subdir").mkdir()
        s = CodeSearcher(tmp_path)
        assert s.get_file_content("") == ""
        assert s.get_file_content("   ") == ""
        assert s.get_file_content("subdir") == ""
        assert s.extract_symbols("subdir") == []
        assert s.search("", max_results=5) == []
