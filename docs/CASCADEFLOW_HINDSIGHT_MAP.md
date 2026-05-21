# Cascadeflow + Hindsight integration map

Branch: `feature/cascadeflow-hindsight-integration`  
Repo: [Open-Source-Scout](https://github.com/SamarthPyati/Open-Source-Scout)

This document answers: **where** Cascadeflow and Hindsight are wired in the codebase, **which agents** use them, and **which API/UI surfaces** expose them.

---

## Summary

| System | What it does | Agents with direct hooks |
|--------|----------------|---------------------------|
| **Cascadeflow** | Per-request budget, KPI model routing, cost/trace audit | All agents that call Groq (see below) — via shared `groq_client.py`, not per-agent files |
| **Hindsight** | Per-user memory: retain / recall / reflect | **Pathfinder**, **Triage Nurse**, **Archaeologist**, **Senior Dev** only |

**Testing Agent** uses Groq (Cascadeflow applies) but has **no** Hindsight recall/reflect/retain in agent code.

---

## Cascadeflow

### How it attaches

1. FastAPI startup calls `configure_cascadeflow_from_env()` (`app/api.py`).
2. These routes open a budget scope with `cascadeflow_budget_run()` and attach `cascadeflow_run` to the JSON response:
   - `POST /api/search-repos` — Pathfinder only
   - `POST /api/analyze` — full pipeline
   - `POST /api/re-analyze-issue` — phases 2–4 (Triage → Archaeologist → Senior Dev → Testing)
3. Every Groq completion goes through `integrations/groq_client.py`, which records steps into the active Cascadeflow run (when mode ≠ `off` and package is installed in the backend venv).

### Agents affected (via Groq + KPI profiles)

Defined in `core/runtime/agent_profiles.py`:

| Agent | KPI weights (cost / latency / quality) | Model pool |
|-------|------------------------------------------|------------|
| Pathfinder | 0.60 / 0.30 / 0.10 | cheap + mid + top |
| Triage Nurse | 0.30 / 0.50 / 0.20 | cheap + mid + top |
| Archaeologist | 0.33 / 0.34 / 0.33 | cheap + mid + top |
| Senior Dev | 0.15 / 0.25 / 0.60 | **mid + top only** |
| Testing Agent | 0.40 / 0.35 / 0.25 | cheap + mid + top |

Per-agent Groq API keys (rate-limit spread), env vars in `GROQ_API_KEY_ENV`:

- `GROQ_API_KEY_PATHFINDER`
- `GROQ_API_KEY_TRIAGE_NURSE`
- `GROQ_API_KEY_ARCHAEOLOGIST`
- `GROQ_API_KEY_SENIOR_DEV`
- `GROQ_API_KEY_TESTING_AGENT`

`core/agents/base.py` sets the current agent name on each LLM call (`set_groq_agent`) so traces are labeled correctly.

### Backend files

| File | Role |
|------|------|
| `core/runtime/cascadeflow_init.py` | Init, mode, budget run, session payload for API |
| `core/runtime/groq_context.py` | Per-request `run_id`, `user_id`, agent name, step index |
| `core/runtime/agent_profiles.py` | KPI weights, model pools, per-agent Groq key env names |
| `integrations/groq_client.py` | Routing + Cascadeflow record/increment on each completion |
| `app/api.py` | Wraps the three pipeline routes above |

### Frontend files

| File | Role |
|------|------|
| `frontend/src/components/AnalysisLayout.jsx` | Header badge (mode, cost); passes `cascadeflowRun` to outlet |
| `frontend/src/pages/DecisionTrace.jsx` | Trace table, cost tiles, charts |
| `frontend/src/pages/IssueRanking.jsx` | Persists `cascadeflow_run` from analyze/re-analyze |

### Scripts / tests

- `scripts/cascadeflow_demo.py`
- `scripts/full_demo.py` (also reads `cascadeflow_run` costs)
- `tests/test_cascadeflow_integration.py`

### Env

- `CASCADEFLOW_MODE` — `observe` | `enforce` | `off` (default `observe`)
- `CASCADEFLOW_BUDGET_USD` — default `0.10` per API request

---

## Hindsight

### How it attaches

- One memory bank per user: `{HINDSIGHT_BANK_PREFIX}:user:{user_id}` (default prefix `scout`).
- User id from JWT (`AUTH_JWT_SECRET` + Bearer) or `X-User-Id` (anonymous UUID from frontend `localStorage` key `os_anon_user_id`).
- Client: `core/memory/hindsight_client.py` (`get_scout_hindsight()` singleton).

### Per-agent hooks (before LLM)

| Agent | File | API | Query / behavior |
|-------|------|-----|------------------|
| **Pathfinder** | `core/agents/pathfinder.py` | `recall_sync` / `retain_sync` | Recall: parsed preferences + prompt (`core/memory/repo_search_memory.py`). Retain after each completed search (`kind: repo_search`). |
| **Triage Nurse** | `core/agents/triage_nurse.py` | `recall_sync` | Issue completion patterns for repo language (`top_k=8`) → `## User completion patterns` |
| **Archaeologist** | `core/agents/archaeologist.py` | `recall_sync` | Repo facts `owner/repo` (`top_k=5`) → `## Known facts about this repo` |
| **Senior Dev** | `core/agents/senior_dev.py` | `reflect_sync` | Fix-plan tone / PR style / commit conventions → `## User Style Preamble` |
| **Testing Agent** | `core/agents/testing_agent.py` | — | **Not integrated** |

Outputs include `recalled_memory_ids` and `memory_summary` on schemas:

- `PathfinderOutput` — `core/schemas.py`
- `Agent1Output` (Triage)
- `Agent2Output` (Archaeologist)
- `Agent3Output` (Senior Dev)

### Memory write paths (retain — not inside agent `run()`)

| Endpoint | Trigger | Worker |
|----------|---------|--------|
| `POST /api/feedback/repo-selection` | Repo selected/skipped | `_feedback_repo_selection_worker` → `retain_sync` |
| `POST /api/feedback/issue-interaction` | Issue opened/skipped/completed | `_feedback_issue_interaction_worker` |
| `POST /api/feedback/export` | Briefing PDF/MD/push | `_feedback_export_worker` |
| `POST /api/feedback/thumbs` | Up/down on repo/issue/briefing | `_feedback_thumbs_worker` |
| `POST /api/search-repos` | Completed Pathfinder search | `PathfinderAgent._retain_search_preferences` → `retain_sync` (`kind: repo_search`) |

Feedback endpoints and search retain are defined in `app/api.py` / `pathfinder.py`; require `get_current_user` for API routes.

Postgres `user_tech_stack_searches` also stores `search_prompt` and `preferences` jsonb for Profile history.

### Memory read paths

| Endpoint | Purpose |
|----------|---------|
| `GET /api/memory/summary` | Agent Memory page |
| `GET /api/memory/by-ids?ids=...` | Citation popovers |
| `POST /api/memory/reset?confirm=true` | Delete user bank |

### Frontend (feedback + display)

| File | Hindsight-related behavior |
|------|----------------------------|
| `frontend/src/api.js` | `X-User-Id`, `feedback*`, `fetchMemorySummary`, `fetchMemoryByIds` |
| `frontend/src/hooks/useUser.js` | Anonymous user id |
| `frontend/src/pages/AgentMemory.jsx` | Memory dashboard |
| `frontend/src/components/MemoryCitationPill.jsx` | “Influenced by N memories” on results |
| `frontend/src/components/AnalysisLayout.jsx` | Header memory count; polls summary |
| `frontend/src/components/Dashboard.jsx` | Repo select/skip + thumbs |
| `frontend/src/main.jsx` | Pathfinder repo list skip + thumbs |
| `frontend/src/pages/IssueRanking.jsx` | Issue opened + thumbs; citations on agent1 |
| `frontend/src/pages/CodeLocator.jsx` | Citations on agent2 |
| `frontend/src/pages/ContributorBriefing.jsx` | Export + thumbs; citations on agent3 |
| `frontend/src/pages/EditorWindow.jsx` | PDF export → `feedbackExport` |

### Backend support files

| File | Role |
|------|------|
| `core/memory/hindsight_client.py` | retain / recall / reflect / summary / reset |
| `core/identity.py` | User context + bank id |
| `tests/test_hindsight_integration.py` | API + isolation tests |

### Env

- `HINDSIGHT_API_URL`
- `HINDSIGHT_API_KEY`
- `HINDSIGHT_BANK_PREFIX` (default `scout`)

---

## Pipeline ↔ route ↔ agents (quick reference)

```
POST /api/search-repos
  └─ Pathfinder          [Hindsight recall] [Cascadeflow via Groq]

POST /api/analyze
  └─ Triage Nurse        [Hindsight recall] [Cascadeflow]
  └─ Archaeologist       [Hindsight recall] [Cascadeflow]
  └─ Senior Dev          [Hindsight reflect] [Cascadeflow]
  └─ Testing Agent       [Cascadeflow only]

POST /api/re-analyze-issue
  └─ (same as analyze phases 2–4, Pathfinder optional from body)
```

User actions (thumbs, skip, export) → `POST /api/feedback/*` → Hindsight **retain** only.

---

## Related README

See root `README.md` sections **Runtime Intelligence (cascadeflow)** and **Agent Memory (Hindsight)** for diagrams and env tables.
