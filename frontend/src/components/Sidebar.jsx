import { useState } from 'react'
import './Sidebar.css'

const MODEL_OPTIONS = {
  Recommended: { fast: 'qwen-qwq-32b', powerful: 'llama-3.3-70b' },
  Fast: { fast: 'llama-3.1-8b', powerful: 'llama-3.3-70b' },
  Balanced: { fast: 'llama-3.3-70b', powerful: 'llama-3.3-70b' },
}

export default function Sidebar({ onAnalyze, loading }) {
  const [repoUrl, setRepoUrl] = useState('')
  const [beginnerOnly, setBeginnerOnly] = useState(true)
  const [modelChoice, setModelChoice] = useState('Recommended')

  const handleGenerate = () => {
    const { fast, powerful } = MODEL_OPTIONS[modelChoice]
    onAnalyze({
      repo_url: repoUrl,
      beginner_only: beginnerOnly,
      fast_model: fast,
      powerful_model: powerful,
    })
  }

  const handleDemo = (url) => {
    setRepoUrl(url)
    const { fast, powerful } = MODEL_OPTIONS[modelChoice]
    onAnalyze({
      repo_url: url,
      beginner_only: beginnerOnly,
      fast_model: fast,
      powerful_model: powerful,
    })
  }

  const canGenerate = repoUrl.trim() && !loading

  return (
    <aside className="sidebar">
      <h3>📝 Repository Input</h3>
      <input
        type="text"
        placeholder="https://github.com/owner/repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
        disabled={loading}
      />
      <hr />
      <h3>⚙️ Options</h3>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={beginnerOnly}
          onChange={(e) => setBeginnerOnly(e.target.checked)}
          disabled={loading}
        />
        🌱 Beginner-only mode
      </label>
      <label className="select-label">
        🤖 Model Selection
        <select
          value={modelChoice}
          onChange={(e) => setModelChoice(e.target.value)}
          disabled={loading}
        >
          {Object.keys(MODEL_OPTIONS).map((k) => (
            <option key={k} value={k}>{k}</option>
          ))}
        </select>
      </label>
      <hr />
      <h3>📊 API Status</h3>
      <p className="api-status">
        API keys are configured on the server. Ensure GROQ_API_KEY and GITHUB_TOKEN are set in .env.
      </p>
      <hr />
      <button
        className="btn-generate"
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {loading ? '⏳ Running...' : '🚀 Generate Analysis'}
      </button>
      <hr />
      <h3>🎯 Try Demo Repos</h3>
      <div className="demo-buttons">
        <button onClick={() => handleDemo('https://github.com/tiangolo/fastapi')} disabled={loading}>
          FastAPI
        </button>
        <button onClick={() => handleDemo('https://github.com/encode/httpx')} disabled={loading}>
          httpx
        </button>
      </div>
    </aside>
  )
}
