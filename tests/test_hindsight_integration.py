"""Integration-style tests for feedback + memory APIs with mocked Hindsight."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.api import app
from core.memory.hindsight_client import (
    _extract_hindsight_items,
    _mental_model_content_empty,
    _mental_model_fields,
    _mental_model_needs_refresh,
    _memory_unit_fields,
    _observation_as_mental_model_row,
    _operation_id_from_response,
)
from core.schemas import Agent1Output, PathfinderOutput, RankedIssue, RepoInfo, ScoreBreakdown


@pytest.fixture
def client():
    return TestClient(app)


ANON_A = {"X-User-Id": "anon-test-user-a"}
ANON_B = {"X-User-Id": "anon-test-user-b"}


def test_memory_unit_fields_reads_api_dict_rows():
    mid, text, typ, _ts = _memory_unit_fields(
        {"id": "mu1", "content": "Explicit feedback: up on repo x/y", "type": "experience"}
    )
    assert mid == "mu1"
    assert text == "Explicit feedback: up on repo x/y"
    assert typ == "experience"


def test_extract_hindsight_items_reads_banks_key():
    payload = {"banks": [{"bank_id": "scout:user:1"}]}
    assert len(_extract_hindsight_items(payload, "items", "banks")) == 1


def test_observation_maps_to_mental_model_row():
    row = _observation_as_mental_model_row(
        {"id": "o1", "text": "User prefers React repos", "mentioned_at": "2026-01-01"}
    )
    assert row["source"] == "observation"
    assert "React" in row["title"]


def test_mental_model_fields_reads_api_dict_rows():
    mid, title, _desc, _ca = _mental_model_fields({"id": "mm1", "name": "Prefers small PRs"})
    assert mid == "mm1"
    assert title == "Prefers small PRs"


def test_mental_model_content_empty_detects_hindsight_placeholder():
    assert _mental_model_content_empty("I don't have information.")
    assert _mental_model_content_empty("")
    assert not _mental_model_content_empty("User prefers React and TypeScript repos.")


def test_mental_model_needs_refresh_for_placeholder():
    model = {"id": "scout-repo-preferences", "name": "Repos", "content": "I don't have information."}
    assert _mental_model_needs_refresh(model)


def test_operation_id_from_response_reads_dict():
    assert _operation_id_from_response({"operation_id": "op-abc"}) == "op-abc"


def test_ensure_scout_mental_models_creates_missing():
    from core.memory import hindsight_client as hc

    sdk = MagicMock()
    sdk.list_memories.return_value = {"items": []}
    create_resp = MagicMock()
    create_resp.operation_id = "op-create-1"
    sdk.create_mental_model.return_value = create_resp

    client = hc.ScoutHindsightClient()
    client.enabled = True
    client._client = MagicMock()
    client._list_scout_mental_models_raw = MagicMock(return_value=[])
    status = MagicMock()
    status.status = "completed"
    client._hc_run_async = MagicMock(return_value=status)

    client._ensure_scout_mental_models(sdk, "scout:user:test-mm")
    assert sdk.create_mental_model.call_count == len(hc.SCOUT_MENTAL_MODEL_SPECS)
    client._hc_run_async.assert_called()


def test_feedback_repo_selection_triggers_retain(client):
    hx = MagicMock()
    with patch("app.api.get_scout_hindsight", return_value=hx):
        r = client.post(
            "/api/feedback/repo-selection",
            headers=ANON_A,
            json={"repo_url": "https://github.com/octocat/Hello-World", "action": "skipped"},
        )
    assert r.status_code == 200
    hx.retain_sync.assert_called_once()


def test_feedback_issue_interaction_triggers_retain(client):
    hx = MagicMock()
    with patch("app.api.get_scout_hindsight", return_value=hx):
        r = client.post(
            "/api/feedback/issue-interaction",
            headers=ANON_A,
            json={
                "issue_url": "https://github.com/octocat/Hello-World/issues/1",
                "action": "opened",
            },
        )
    assert r.status_code == 200
    hx.retain_sync.assert_called_once()


def test_memory_reset_requires_confirm(client):
    hx = MagicMock()
    with patch("app.api.get_scout_hindsight", return_value=hx):
        r = client.post("/api/memory/reset", headers=ANON_A)
    assert r.status_code == 400
    hx.reset_bank_sync.assert_not_called()


def test_memory_reset_calls_delete(client):
    hx = MagicMock()
    with patch("app.api.get_scout_hindsight", return_value=hx):
        r = client.post("/api/memory/reset?confirm=true", headers=ANON_A)
    assert r.status_code == 204
    hx.reset_bank_sync.assert_called_once_with("anon-test-user-a")


def test_per_user_isolation_feedback_metadata(client):
    hx = MagicMock()
    with patch("app.api.get_scout_hindsight", return_value=hx):
        client.post(
            "/api/feedback/thumbs",
            headers=ANON_A,
            json={"target_type": "repo", "target_id": "r1", "vote": "up"},
        )
        client.post(
            "/api/feedback/thumbs",
            headers=ANON_B,
            json={"target_type": "repo", "target_id": "r1", "vote": "down"},
        )
    assert hx.retain_sync.call_count == 2
    uid_first = hx.retain_sync.call_args_list[0][0][0]
    uid_second = hx.retain_sync.call_args_list[1][0][0]
    assert uid_first != uid_second


def test_search_repos_calls_pathfinder_run(client):
    pf_out = PathfinderOutput(
        tech_stack=["python"],
        ranked_repos=[],
        search_queries_used=[],
        recalled_memory_ids=[],
        memory_summary="",
    )

    with patch("app.api.PathfinderAgent") as PA, patch(
        "app.api.GroqClient.for_agent", return_value=MagicMock()
    ):
        PA.return_value.run.return_value = pf_out
        r = client.post(
            "/api/search-repos",
            headers=ANON_A,
            json={"tech_stack": ["python"], "fast_model": "openai/gpt-oss-120b"},
        )
    assert r.status_code == 200
    PA.return_value.run.assert_called_once()


def test_hindsight_unreachable_analyze_still_returns_payload(client):
    from tests.helpers import make_github_issue

    repo = MagicMock()
    repo.full_name = "a/b"
    repo.html_url = "https://github.com/a/b"
    agent1 = Agent1Output(
        repo=RepoInfo(url="https://github.com/a/b", default_branch="main"),
        ranked_issues=[
            RankedIssue(
                number=1,
                title="Easy",
                url="https://github.com/a/b/issues/1",
                labels=[],
                score_total=80,
                score_breakdown=ScoreBreakdown(
                    labels=10,
                    clarity=10,
                    activity=10,
                    size_estimate=10,
                    risk_penalty=0,
                ),
                why=["ok"],
            )
        ],
        selected_issue_number=1,
    )

    hx = MagicMock()
    hx.recall_sync.side_effect = RuntimeError("network down")

    issues = [make_github_issue(number=1)]

    with patch("app.api.get_scout_hindsight", return_value=hx):
        with patch("app.api.GitHubClient") as Gh:
            Gh.return_value.get_repo.return_value = repo
            Gh.return_value.get_issues.return_value = issues
            with patch("app.api.GroqClient"):
                with patch("app.api.ScoutOrchestrator") as Orch:
                    Orch.return_value.run_phase1.return_value = {
                        "success": True,
                        "repo": repo,
                        "issues": issues,
                        "agent1_output": agent1,
                    }
                    r = client.post(
                        "/api/analyze",
                        headers=ANON_A,
                        json={"repo_url": "https://github.com/a/b"},
                    )
    assert r.status_code == 200


def test_memory_by_ids_bulk_fetch(client):
    hx = MagicMock()
    hx.fetch_memory_sync.return_value = [{"memory_id": "x", "text": "hello"}]
    with patch("app.api.get_scout_hindsight", return_value=hx):
        r = client.get("/api/memory/by-ids", headers=ANON_A, params={"ids": "x,y"})
    assert r.status_code == 200
    assert r.json()["memories"][0]["text"] == "hello"
