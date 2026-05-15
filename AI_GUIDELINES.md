# AI Assistant Development Guidelines

This file provides critical instructions for AI assistants working on the Open Source Scout project.

## 🚀 How to Start the App Correctly

To avoid "Internal Server Error" (proxy mismatch) on Windows, always follow these rules:

### 1. Port Configuration
- **Backend API Port:** Must be **8003** (not 8001, not 8000).
- **Frontend Port:** 5173.
- **Vite Proxy:** Configured in `frontend/vite.config.js` to point to `localhost:8003`.

### 2. Startup Procedure

#### **Terminal 1: Backend**
Use the project's virtual environment python:
```powershell
.\venv\Scripts\python -m uvicorn app.api:app --port 8003
```
*Note: If port 8003 is already occupied, kill the process using:*
`Stop-Process -Id (Get-NetTCPConnection -LocalPort 8003).OwningProcess -Force`

#### **Terminal 2: Frontend**
```bash
cd frontend
npm run dev
```

## 🛠️ Tech Stack & Architecture
- **Framework:** LangGraph (State-managed multi-agent pipeline).
- **Backend:** FastAPI.
- **Frontend:** React + Vite + Tailwind CSS.
- **LLM:** Groq (Llama 3.3 70B for reasoning, 17B for fast tasks).
- **Orchestration:** `core/orchestrator.py` uses a `StateGraph` with a QA feedback loop.

## 🧪 Testing
Always run the test suite after architectural changes:
```powershell
.\venv\Scripts\python -m pytest tests/ -v --ignore=tests/test_live_api_smoke.py
```
