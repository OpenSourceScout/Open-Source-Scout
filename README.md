# Open Source Scout

**Open source help for beginners** — find **good first issues**, discover **contributor-friendly** repositories, and get **AI-guided** code location, briefings, and pull request drafts.

[![Live demo](https://img.shields.io/badge/demo-live-22C55E?style=flat-square)](https://open-source-scout.up.railway.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-agents-8B5CF6?style=flat-square)](https://langchain-ai.github.io/langgraph/)

**Live app:** [https://open-source-scout.up.railway.app](https://open-source-scout.up.railway.app)

An AI-powered **multi-agent** platform for **first-time open source contributors** — from **repository discovery** and **beginner-friendly issue ranking** through **code location**, **fix planning**, **QA validation**, **in-editor review**, and **PR drafting**.

Built with **FastAPI**, **React (Vite)**, **LangGraph**, **Groq**, optional **Hindsight** memory, and **Cascadeflow** runtime intelligence.

### Who is this for?

- Developers searching for **open source help** to make their **first contribution**
- Students and beginners looking for **good first issues** matched to their **tech stack**
- Teams demoing **AI agents** for **open source contribution** workflows (Hacktoberfest, campus projects, OSS onboarding)

### Keywords

`open source help` · `beginner open source` · `good first issue` · `first contribution` · `contributor-friendly` · `open source contribution tool` · `AI coding assistant` · `issue ranking` · `pull request draft`

---

## Features

### Discovery and analysis
- **Pathfinder** — find repositories matching your tech stack and preferences
- **Triage Nurse** — rank beginner-friendly issues with explainable scores
- **Archaeologist** — locate relevant files, symbols, and snippets in the repo
- **Senior Dev** — generate contributor briefings and PR drafts
- **Testing Agent** — QA validation with an iterative feedback loop (LangGraph)
- **Learning Reviewer** — educational code review in the Monaco editor (no auto-patches)

### Product experience
- **GitHub OAuth** sign-in with per-user projects persisted in Postgres
- **Monaco editor** with file tree, diff view, save/push, and integrated terminal
- **Export** briefings as Markdown or PDF
- **Agent Memory** — per-user Hindsight bank with observations, mental models, and a 3D constellation graph
- **Admin tools** — Decision Trace and cross-user Agent Memory (admin role only)
- **Feedback loop** — thumbs, skips, exports, and issue interactions feed Hindsight retains

### Runtime intelligence
- **Cascadeflow** — budget caps, KPI-aware model routing, and audit traces on analysis endpoints

---

## Quick start (local development)

### Prerequisites

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (recommended) or pip + venv
- Node.js 20+ (frontend)
- Git
- (Optional) [ripgrep](https://github.com/BurntSushi/ripgrep) for faster code search

### 1. Clone and install

```bash
git clone https://github.com/SamarthPyati/Open-Source-Scout.git
cd Open-Source-Scout

# Backend
uv sync

# Frontend
cd frontend && npm install && cd ..
```

### 2. Environment

```bash
cp .env.example .env   # Linux/Mac
copy .env.example .env # Windows
```

Minimum for local dev:

| Variable | Purpose |
|----------|---------|
| `GROQ_API_KEY` | Fallback Groq key (or set per-agent keys — see `.env.example`) |
| `NEON_DATABASE_URL` | Postgres for auth, projects, and user data |
| `AUTH_JWT_SECRET` | JWT signing secret |

Optional but recommended:

| Variable | Purpose |
|----------|---------|
| `GITHUB_TOKEN` | Higher GitHub API rate limits |
| `CLIENT_ID` / `CLIENT_SECRET` / `GITHUB_REDIRECT_URI` | GitHub OAuth (`Continue with GitHub`) |
| `HINDSIGHT_API_URL` / `HINDSIGHT_API_KEY` | Agent memory and personalization |

See [`.env.example`](.env.example) for the full list, including per-agent Groq keys and production CORS settings.

### 3. Run (two terminals)

**Terminal 1 — backend (port 8003):**

```powershell
# Windows (recommended — no --reload, stable on OneDrive)
.\run-backend.ps1
```

```bash
# Linux/Mac or manual
uv run uvicorn app.api:app --port 8003
```

**Terminal 2 — frontend:**

```bash
cd frontend
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` to the backend on port 8003.

---

## How to use

### Find repos by tech stack
1. Sign in and open the **Dashboard**
2. Enter technologies or a natural-language prompt
3. Review Pathfinder-ranked repositories and select one
4. Walk through **Issues → Code Locator → Briefing → Editor**

### Analyze a repository directly
1. Paste a public GitHub URL on the Dashboard
2. Run analysis to rank issues, then click **Analyze This Issue** for full pipeline output

### Editor and PR workflow
1. Open the **Editor** from Code Locator or Briefing
2. Edit highlighted files in Monaco (diff view available)
3. Use **Learning Reviewer** feedback before push
4. Save & push to your fork, then open a PR using the generated draft

### Agent Memory
- Users: **Profile → Agent Memory** (observations, mental models, recent facts)
- Admins: **Admin → Agent Memory** (browse any user's bank)
- Use **Refresh mental models** when curated Hindsight documents need regeneration

---

## Architecture

### Multi-agent pipeline (LangGraph)

| Agent | Role |
|-------|------|
| **Pathfinder** | Repository discovery and ranking by tech fit |
| **Triage Nurse** | Issue fetching and beginner-friendly ranking |
| **Archaeologist** | Code search and relevance mapping |
| **Senior Dev** | Briefing, implementation plan, PR draft |
| **Testing Agent** | Structural + semantic QA with retry loop |
| **Learning Reviewer** | Educational review of user edits vs issue + briefing |

Orchestration lives in [`core/orchestrator.py`](core/orchestrator.py) using a **LangGraph** state machine with conditional QA retry edges.

Per-agent Groq keys and KPI weights are defined in [`core/runtime/agent_profiles.py`](core/runtime/agent_profiles.py).

### Key backend modules

```
Open-Source-Scout/
├── app/
│   ├── api.py              # FastAPI REST + WebSocket terminal + SPA serve
│   ├── auth_routes.py      # GitHub OAuth + JWT
│   └── db.py               # Neon Postgres schema and queries
├── core/
│   ├── agents/             # Pathfinder, Triage, Archaeologist, Senior Dev, Testing, Learning Reviewer
│   ├── memory/             # Hindsight client wrapper
│   ├── orchestrator.py     # LangGraph pipeline + QA loop
│   ├── scoring.py          # Issue scoring (0–100)
│   └── schemas.py          # Pydantic models
├── frontend/src/           # React + Vite + Tailwind
├── integrations/           # GitHub + Groq clients
├── tests/                  # Pytest suite (131+ tests)
├── Dockerfile              # Multi-stage: build frontend + serve via FastAPI
└── .github/workflows/ci.yml
```

### Frontend routes

| Route | Access | Description |
|-------|--------|-------------|
| `/dashboard` | Auth | Start analysis or tech-stack search |
| `/analysis/issues` | Auth | Ranked issues |
| `/analysis/code` | Auth | Code locator results |
| `/analysis/briefing` | Auth | Contributor briefing + PR draft |
| `/analysis/qa-report` | Admin | QA testing output |
| `/editor` | Auth | Monaco editor + terminal |
| `/projects` | Auth | Saved projects |
| `/admin/decision-trace` | Admin | Cascadeflow traces |
| `/admin/agent-memory` | Admin | Per-user memory banks |

Admin access requires `users.role = 'admin'` in Postgres.

---

## API overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health + DB status |
| `/api/me` | GET | Current user (JWT) |
| `/api/search-repos` | POST | Pathfinder repo search |
| `/api/analyze` | POST | Phase 1 — issue ranking |
| `/api/re-analyze-issue` | POST | Phases 2–4 + QA loop for one issue |
| `/api/repos/{owner}/{repo}/review-and-push` | POST | Learning Reviewer + push |
| `/api/repos/{owner}/{repo}/push` | POST | Push single file |
| `/api/repos/{owner}/{repo}/push-batch` | POST | Push multiple files |
| `/api/repos/{owner}/{repo}/tree` | GET | File tree for editor |
| `/api/memory/summary` | GET | User memory bank summary |
| `/api/memory/graph` | GET | Hindsight graph for constellation view |
| `/api/feedback/*` | POST | Retains for Hindsight (thumbs, skips, etc.) |
| `/api/projects` | GET/POST | User projects CRUD |
| `/api/admin/*` | GET | Admin decision traces and memory |

Full route list: [`app/api.py`](app/api.py).

---

## Production deployment

The repo includes a **multi-stage Dockerfile** that builds the React app and serves it from FastAPI (single process on `$PORT`).

### Railway / Docker checklist

Set these environment variables in your host:

```env
APP_ENV=production
FRONTEND_URL=https://your-public-app-url
ALLOWED_ORIGINS=https://your-public-app-url
NEON_DATABASE_URL=postgresql://...
AUTH_JWT_SECRET=<long-random-string>
GITHUB_TOKEN=...
GROQ_API_KEY=...                    # or per-agent keys
GROQ_API_KEY_REVIEWER=...
CLIENT_ID=...
CLIENT_SECRET=...
GITHUB_REDIRECT_URI=https://your-public-app-url/api/auth/github/callback
HINDSIGHT_API_URL=https://api.hindsight.vectorize.io
HINDSIGHT_API_KEY=...
```

Also update your **GitHub OAuth App** callback URL to match `GITHUB_REDIRECT_URI`.

When `APP_ENV=production` (or Railway's `RAILWAY_ENVIRONMENT=production`), CORS restricts origins to `ALLOWED_ORIGINS` + `FRONTEND_URL` — localhost defaults are not used.

Build and run locally with Docker:

```bash
docker build -t open-source-scout .
docker run -p 8080:8080 --env-file .env open-source-scout
```

---

## Agent Memory (Hindsight)

[Hindsight](https://hindsight.vectorize.io/) stores per-user banks (`HINDSIGHT_BANK_PREFIX`, default `scout`).

- **Retain** — feedback endpoints write structured facts
- **Recall / Reflect** — agents pull context before ranking, search, and briefing
- **Consolidation** — observations and curated mental models surface on `/api/memory/summary`
- **Graph** — `/api/memory/graph` powers the 3D constellation UI

Memory summary loads are **fast by default**; use `?refresh_mental_models=true` (or the UI **Refresh mental models** button) to trigger full Hindsight regeneration (may take 1–3 minutes).

| Variable | Purpose |
|----------|---------|
| `HINDSIGHT_API_URL` | Cloud or self-hosted endpoint |
| `HINDSIGHT_API_KEY` | API key |
| `HINDSIGHT_BANK_PREFIX` | Bank namespace prefix |

---

## Cascadeflow

[cascadeflow](https://docs.cascadeflow.ai/) instruments Groq calls with budget caps and returns `cascadeflow_run` traces on analysis endpoints.

| Variable | Default | Purpose |
|----------|---------|---------|
| `CASCADEFLOW_MODE` | `observe` | `observe`, `enforce`, or `off` |
| `CASCADEFLOW_BUDGET_USD` | `0.10` | Soft budget per API request |

Demo: `python scripts/cascadeflow_demo.py`

---

## Testing

### Backend

```bash
uv run pytest              # full suite
uv run pytest tests/test_scoring.py -v
```

### Frontend

```bash
cd frontend
npm run test               # Vitest unit tests
npm run build              # production build
npm run test:e2e           # Playwright (mocked backend)
```

CI runs on every push to `main`: backend pytest, frontend build, Vitest, and Playwright e2e (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

---

## Configuration reference

See [`.env.example`](.env.example) for all variables. Summary:

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes* | Fallback Groq key (*or all per-agent keys) |
| `GROQ_API_KEY_PATHFINDER` … `GROQ_API_KEY_REVIEWER` | No | Per-agent keys (spread rate limits) |
| `NEON_DATABASE_URL` | Yes | Postgres for auth and projects |
| `AUTH_JWT_SECRET` | Yes | JWT signing secret |
| `GITHUB_TOKEN` | No | GitHub API rate limits (5000 vs 60 req/hr) |
| `CLIENT_ID` / `CLIENT_SECRET` | No | GitHub OAuth |
| `GITHUB_REDIRECT_URI` / `FRONTEND_URL` | No | OAuth redirects |
| `ALLOWED_ORIGINS` | Prod | Comma-separated CORS origins |
| `APP_ENV` | No | Set `production` when deployed |
| `HINDSIGHT_*` | No | Agent memory |
| `CASCADEFLOW_*` | No | Runtime intelligence |
| `OSS_REPO_CACHE` | No | Clone cache dir (use outside OneDrive on Windows) |

---

## Important notes

- **Guidance, not autopilot** — generates plans and drafts; you review and push changes yourself
- **Public repos only** — works with public GitHub repositories
- **Rate limits** — add `GITHUB_TOKEN` for production use
- **Windows + OneDrive** — set `OSS_REPO_CACHE` to a path outside OneDrive if git clone fails; use `.\run-backend.ps1` (port 8003)

---

## FAQ

### What is Open Source Scout?

Open Source Scout is a free web app that helps **beginners contribute to open source**. It uses AI agents to find repositories, rank **good first issues**, locate relevant code, generate a **contributor briefing**, and help you draft a **pull request**.

### How is this different from GitHub’s good-first-issues search?

GitHub lists issues; Scout **ranks** them for beginners (labels, clarity, activity, size), then runs a full pipeline: **code locator**, **implementation plan**, **QA validation**, and an **in-browser editor** with educational review — not just a list of links.

### Do I need experience to use it?

No. The product is designed for **first-time contributors**. Sign in with GitHub, pick a repo or search by tech stack, choose an issue, and follow the guided flow.

### Is it free?

Yes. The live demo runs on Railway; you bring your own API keys when self-hosting (see [Quick start](#quick-start-local-development)).

### How do I get started?

1. Open the [live app](https://open-source-scout.up.railway.app)
2. Sign in with GitHub
3. Search by tech stack or paste a public repo URL
4. Select a ranked issue and follow **Code Locator → Briefing → Editor**

---

## SEO & discoverability

This repo includes technical SEO for the web app and GitHub:

| Asset | Purpose |
|-------|---------|
| `frontend/index.html` | Title, description, Open Graph, Twitter Card, JSON-LD |
| `frontend/public/robots.txt` | Crawler rules + sitemap URL |
| `frontend/public/sitemap.xml` | Public routes for search engines |
| `frontend/public/manifest.json` | PWA metadata |
| `frontend/src/utils/usePageTitle.js` | Per-route document titles |

**GitHub repo metadata** (description, homepage, topics) can be applied with:

```powershell
.\scripts\set_github_seo.ps1
```

Requires [GitHub CLI](https://cli.github.com/) (`gh auth login`). Ranking on Google for competitive terms takes time; these changes make the site **indexable** and **shareable** with correct previews.

---

## License

MIT — see [LICENSE](LICENSE).

## Contributing

Issues and pull requests are welcome. Please run `uv run pytest` and `cd frontend && npm run test && npm run build` before submitting.
