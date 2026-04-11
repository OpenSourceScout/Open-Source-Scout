"""Detection accuracy: link issue text to files and extracted symbols (slide item 4)."""
from pathlib import Path

from utils.code_search import CodeSearcher
from utils.text_chunking import extract_keywords

from tests.helpers import make_github_issue


class TestKeywordToCodeAlignment:
    def test_issue_keyword_maps_to_function_symbol_in_repo(self, tmp_path: Path):
        svc = tmp_path / "services"
        svc.mkdir()
        (svc / "user_service.py").write_text(
            "def reset_password(email: str) -> bool:\n"
            "    return True\n",
            encoding="utf-8",
        )
        issue = make_github_issue(
            title="Bug in reset_password",
            body="reset_password ignores domain validation for certain users.",
        )
        text = f"{issue.title}\n{issue.body or ''}"
        keywords = extract_keywords(text, max_keywords=10)
        assert any("reset" in k.lower() or "password" in k.lower() for k in keywords), keywords

        searcher = CodeSearcher(tmp_path)
        results = searcher.search("reset_password", max_results=10)
        assert results, "search should find the function name in source"
        rel = results[0].file_path.replace("\\", "/")
        assert rel == "services/user_service.py"
        symbols = searcher.extract_symbols(rel)
        assert "reset_password" in symbols
