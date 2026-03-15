# Open Source Scout 🔭

An AI-powered multi-agent system that helps beginners contribute to open-source projects by automating the journey from **issue discovery → code location → fix planning → PR drafting**.

## 🌟 Features

- **Tech Stack Discovery**: Find repositories matching your skills using the Pathfinder agent
- **Smart Issue Ranking**: Automatically finds and ranks beginner-friendly issues
- **Code Location**: Searches the codebase to find exactly where changes are needed
- **Contributor Briefing**: Generates comprehensive fix plans with step-by-step instructions
- **PR Draft Generation**: Creates ready-to-use branch names, commit messages, and PR descriptions
- **Export Options**: Download briefings as Markdown or PDF

## 🚀 Quick Start

### Prerequisites

- Python 3.11 or higher
- [uv](https://docs.astral.sh/uv/) (recommended) or pip
- Node.js 18+ (for React frontend)
- Git
- (Optional) [ripgrep](https://github.com/BurntSushi/ripgrep) for faster code search

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/SamarthPyati/Open-Source-Scout.git
   cd Open-Source-Scout
   ```

2. **Install Python dependencies using uv (recommended)**
   ```bash
   # Install uv if you haven't already
   # Windows PowerShell:
   powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
   
   # Linux/Mac:
   curl -LsSf https://astral.sh/uv/install.sh | sh
   
   # Sync dependencies (creates .venv automatically)
   uv sync
   ```

   **Alternative: Using pip**
   ```bash
   python -m venv venv
   
   # Windows
   venv\Scripts\activate
   
   # Linux/Mac
   source venv/bin/activate
   
   pip install -r requirements.txt
   ```

3. **Install frontend dependencies**
   ```bash
   cd frontend
   npm install
   cd ..
   ```

4. **Set up environment variables**
   ```bash
   # Copy the example file
   cp .env.example .env    # Linux/Mac
   copy .env.example .env  # Windows
   
   # Edit .env and add your API keys:
   # GROQ_API_KEY=your_groq_key          (Required - get from https://console.groq.com/keys)
   # GITHUB_TOKEN=your_github_token      (Optional but recommended for higher rate limits)
   ```

### Running the App

You need **two terminals** - one for the backend, one for the frontend.

**Terminal 1 - Start the FastAPI backend:**
```bash
# Using uv (recommended)
uv run uvicorn app.api:app --reload --port 8001

# Or using pip (with venv activated)
python -m uvicorn app.api:app --reload --port 8001
```

**Terminal 2 - Start the React frontend:**
```bash
cd frontend
npm run dev
```

**Open the app:** Navigate to **http://localhost:5173** in your browser.

### Quick Start Summary (TL;DR)

```bash
# Clone and setup
git clone https://github.com/SamarthPyati/Open-Source-Scout.git
cd Open-Source-Scout

# Backend setup
uv sync
cp .env.example .env
# Edit .env and add GROQ_API_KEY

# Frontend setup
cd frontend && npm install && cd ..

# Run (in separate terminals)
# Terminal 1: uv run uvicorn app.api:app --reload --port 8001
# Terminal 2: cd frontend && npm run dev

# Open http://localhost:5173
```

### Running the Streamlit App (Legacy)

```bash
# Using uv
uv run streamlit run app/main.py

# Or using pip (with venv activated)
streamlit run app/main.py
```

The app will open at `http://localhost:8501`

### API Endpoints

| Endpoint | Method | Description |
|---------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/search-repos` | POST | Search repos by tech stack (Pathfinder agent) |
| `/api/analyze` | POST | Run full 3-agent analysis pipeline |
| `/api/export/pdf` | POST | Export markdown to PDF |
| `/api/repos/{owner}/{repo}/files/{path}` | GET | Fetch file content (`?ref=main`) |
| `/api/repos/{owner}/{repo}/push` | POST | Push edited file (forks if needed) |

## 📖 How to Use

### Option 1: Tech Stack Discovery (Recommended for Beginners)
1. Click **"Find by Tech Stack"** on the landing page
2. Add your technologies (e.g., Python, React, TypeScript)
3. Click **"Find Repositories"** - the Pathfinder agent discovers matching repos
4. Select a repository from the ranked results
5. The system analyzes and displays:
   - **Issue Ranking**: Top beginner-friendly issues
   - **Code Locator**: Where to make changes
   - **Contributor Briefing**: Step-by-step fix plan + PR draft

### Option 2: Direct Repository Analysis
1. Click **"Analyze Repository"** on the landing page
2. Paste a GitHub repository URL (e.g., `https://github.com/tiangolo/fastapi`)
3. Click **"Analyze"** to run the 3-agent pipeline
4. Explore the results in the sidebar views

### Exporting Results
- **Markdown**: Download the briefing as a `.md` file
- **PDF**: Generate a formatted PDF document
- **PR Draft**: Use the suggested branch name, commit message, and PR title/body when creating your PR from the editor (after Save & Push)

## 🎯 Demo Examples

Try these repositories to see Open Source Scout in action:

### Example 1: FastAPI
```
https://github.com/tiangolo/fastapi
```
A popular Python web framework with well-maintained beginner issues.

### Example 2: httpx
```
https://github.com/encode/httpx
```
A modern HTTP client with good documentation and clear issues.

## 🏗️ Architecture

### Multi-Agent Pipeline

| Agent | Role | Model |
|-------|------|-------|
| **Pathfinder** | Discovers and ranks repositories based on user's tech stack | qwen-qwq-32b |
| **Triage Nurse** | Fetches and ranks issues by beginner-friendliness | qwen-qwq-32b |
| **Archaeologist** | Searches codebase, identifies files/functions | qwen-qwq-32b |
| **Senior Dev** | Creates fix plan, tests, and PR draft | llama-3.3-70b |

### Two Input Modes

1. **Repository URL**: Enter a GitHub repo directly → Triage Nurse → Archaeologist → Senior Dev
2. **Tech Stack**: Enter your skills → Pathfinder finds repos → Select repo → Full pipeline

### Pathfinder Scoring (Repository Discovery, 0-100)

| Component | Max Points | Description |
|-----------|------------|-------------|
| Tech Match | 40 | How well repo matches user's skills |
| Beginner Friendliness | 25 | Good first issues, contributing guides |
| Activity Level | 15 | Recent commits, active maintenance |
| Community Health | 10 | Contributors, responsiveness |
| Issue Availability | 10 | Number and quality of open issues |

### Issue Scoring Algorithm (0-100)

| Component | Max Points | Description |
|-----------|------------|-------------|
| Labels | 25 | `good first issue`, `help wanted`, etc. |
| Clarity | 20 | Description quality, formatting, examples |
| Activity | 15 | Recent updates, comment activity |
| Size Estimate | 20 | Estimated effort level |
| Risk Penalty | -20 | Complexity, breaking changes, security |

## 📁 Project Structure

```
Open-Source-Scout/
├── app/
│   ├── main.py              # Streamlit UI (legacy)
│   └── api.py               # FastAPI backend (REST)
├── frontend/                 # React + Vite + Tailwind CSS
│   ├── src/
│   │   ├── main.jsx         # App entry, routes
│   │   ├── api.js           # API client functions
│   │   ├── components/
│   │   │   ├── LandingPage.jsx    # Home page
│   │   │   ├── Dashboard.jsx      # Tech stack / repo input
│   │   │   ├── AnalysisLayout.jsx # Analysis view wrapper
│   │   │   └── AnalysisSidebar.jsx
│   │   └── pages/
│   │       ├── IssueRanking.jsx       # Ranked issues view
│   │       ├── CodeLocator.jsx        # Code location view
│   │       ├── ContributorBriefing.jsx # Briefing + PR draft
│   │       └── EditorWindow.jsx       # Monaco editor
│   └── package.json
├── core/
│   ├── agents/
│   │   ├── pathfinder.py    # Repository discovery (Agent 0)
│   │   ├── triage_nurse.py  # Issue ranking (Agent 1)
│   │   ├── archaeologist.py # Code location (Agent 2)
│   │   └── senior_dev.py    # Fix planning (Agent 3)
│   ├── scoring.py           # Scoring algorithm
│   ├── orchestrator.py      # Pipeline coordination
│   └── schemas.py           # Pydantic models
├── integrations/
│   ├── github_client.py     # GitHub API
│   └── groq_client.py       # Groq LLM API
├── utils/
│   ├── cache.py             # Caching
│   ├── code_search.py       # ripgrep/Python search
│   ├── pdf_generator.py     # PDF export
│   └── text_chunking.py     # Token management
├── tests/
│   ├── test_scoring.py      # Scoring tests
│   └── test_schemas.py      # Schema tests
├── pyproject.toml            # Python dependencies (uv)
├── uv.lock                   # Locked dependencies
├── requirements.txt          # Dependencies (pip fallback)
├── .env.example              # Environment template
└── README.md
```

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GROQ_API_KEY` | Yes | Groq API key for LLM access |
| `GITHUB_TOKEN` | No | GitHub token for higher rate limits (5000 vs 60 req/hr) |

### Model Selection

The app offers three model configurations:
- **Recommended** (default): Balanced speed and quality
- **Fast**: Prioritizes speed for quick analysis
- **Balanced**: Uses powerful model for all agents

## 🧪 Running Tests

```bash
# Run all tests
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_scoring.py -v
```

## ⚠️ Important Notes

- **No Auto-Commits**: This tool generates guidance only—it never modifies upstream repos
- **Public Repos Only**: Works with any public GitHub repository
- **Rate Limits**: Without a GitHub token, you're limited to 60 requests/hour
- **Large Repos**: Uses efficient code search to handle large codebases

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Feel free to:
- Open issues for bugs or feature requests
- Submit pull requests
- Share feedback on the scoring algorithm

---

Built with ❤️ using Streamlit, Groq, and the GitHub API.