"""Module tests: Archaeologist code localization (Agent 2)."""
import json
from pathlib import Path
from unittest.mock import MagicMock

from core.agents.archaeologist import ArchaeologistAgent
from tests.helpers import make_github_issue


class TestArchaeologistCodeLocalization:
    def test_finds_expected_file_and_symbols_for_issue_keywords(self, tmp_path: Path):
        auth = tmp_path / "auth"
        auth.mkdir()
        (auth / "handlers.py").write_text(
            "def handle_login(user_id):\n    return user_id\n",
            encoding="utf-8",
        )
        file_tree = ["auth/handlers.py", "README.md"]
        issue = make_github_issue(
            number=9,
            title="Fix login redirect",
            body="The handle_login function does not validate session correctly.",
        )
        groq = MagicMock()
        groq.complete.side_effect = [
            json.dumps({"queries": ["handle_login", "login"]}),
            json.dumps(
                {
                    "enhanced_hits": [
                        {
                            "path": "auth/handlers.py",
                            "why_relevant": "Defines handle_login referenced in the issue.",
                        }
                    ],
                    "call_trace_hint": ["handle_login"],
                    "confidence": "High",
                    "next_files": [],
                }
            ),
        ]
        agent = ArchaeologistAgent(groq)
        out = agent.run(issue, tmp_path, file_tree)
        assert out.issue_number == 9
        assert out.hits, "expected at least one code hit"
        paths = {h.path.replace("\\", "/") for h in out.hits}
        assert "auth/handlers.py" in paths
        hit = next(h for h in out.hits if h.path.replace("\\", "/") == "auth/handlers.py")
        assert "handle_login" in hit.symbols
        assert out.confidence == "High"
