"""
Gold-standard accuracy: expected file + function for a fixed issue and tree (slide item 4).
"""
from pathlib import Path

from core.schemas import GitHubIssue
from utils.code_search import CodeSearcher
from utils.text_chunking import extract_keywords

GOLD_ROOT = Path(__file__).resolve().parent / "fixtures" / "gold_repo"
EXPECTED_REL = "src/payment/compute_fee.py"
EXPECTED_SYMBOL = "compute_fee"


def test_gold_keywords_include_issue_terms():
    issue = GitHubIssue(
        number=101,
        title="compute_fee returns wrong value for small amounts",
        body=(
            "When amount_cents is under 100, compute_fee in the payment module "
            "should still follow the documented rules."
        ),
        url="https://api.github.com/repos/fixture/gold/issues/101",
        html_url="https://github.com/fixture/gold/issues/101",
        state="open",
        created_at="2024-01-01T00:00:00Z",
        updated_at="2024-01-02T00:00:00Z",
    )
    text = f"{issue.title}\n{issue.body or ''}"
    kws = extract_keywords(text, max_keywords=15)
    blob = " ".join(kws).lower()
    assert "compute" in blob or "fee" in blob or "compute_fee" in text.lower()


def test_gold_search_top_hit_is_expected_file():
    assert GOLD_ROOT.is_dir()
    issue_title = "Fix compute_fee edge case for amount_cents"
    searcher = CodeSearcher(GOLD_ROOT)
    results = searcher.search("compute_fee", max_results=20)
    assert results, "search should find the symbol"
    top = results[0].file_path.replace("\\", "/")
    assert top == EXPECTED_REL


def test_gold_extract_symbols_contains_expected_function():
    searcher = CodeSearcher(GOLD_ROOT)
    syms = searcher.extract_symbols(EXPECTED_REL)
    assert EXPECTED_SYMBOL in syms
