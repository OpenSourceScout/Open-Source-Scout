import { useState } from 'react'
import { Shuffle, Package, Wrench, FileText, Settings, Leaf, Bot, BarChart2, Loader2, Rocket, Search, Target } from 'lucide-react'
import './Sidebar.css'

const MODEL_OPTIONS = {
  Recommended: { fast: 'openai/gpt-oss-120b', powerful: 'llama-3.3-70b' },
  Fast: { fast: 'llama-3.1-8b', powerful: 'llama-3.3-70b' },
  Balanced: { fast: 'llama-3.3-70b', powerful: 'llama-3.3-70b' },
}

const INPUT_MODES = {
  REPO: 'repo',
  TECH_STACK: 'tech_stack'
}

export default function Sidebar({ onAnalyze, onSearchRepos, loading }) {
  const [inputMode, setInputMode] = useState(INPUT_MODES.REPO)
  const [repoUrl, setRepoUrl] = useState('')
  const [techStackInput, setTechStackInput] = useState('')
  const [techStackTags, setTechStackTags] = useState([])
  const [beginnerOnly, setBeginnerOnly] = useState(true)
  const [modelChoice, setModelChoice] = useState('Recommended')

  const handleAddTechStack = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      const value = techStackInput.trim().replace(',', '')
      if (value && !techStackTags.includes(value.toLowerCase())) {
        setTechStackTags([...techStackTags, value.toLowerCase()])
        setTechStackInput('')
      }
    }
  }

  const handleRemoveTag = (tagToRemove) => {
    setTechStackTags(techStackTags.filter(tag => tag !== tagToRemove))
  }

  const handleGenerate = () => {
    const { fast, powerful } = MODEL_OPTIONS[modelChoice]

    if (inputMode === INPUT_MODES.REPO) {
      onAnalyze({
        repo_url: repoUrl,
        beginner_only: beginnerOnly,
        fast_model: fast,
        powerful_model: powerful,
      })
    } else {
      onSearchRepos({
        tech_stack: techStackTags,
      })
    }
  }

  const handleDemo = (url) => {
    setInputMode(INPUT_MODES.REPO)
    setRepoUrl(url)
    const { fast, powerful } = MODEL_OPTIONS[modelChoice]
    onAnalyze({
      repo_url: url,
      beginner_only: beginnerOnly,
      fast_model: fast,
      powerful_model: powerful,
    })
  }

  const canGenerate = inputMode === INPUT_MODES.REPO
    ? repoUrl.trim() && !loading
    : techStackTags.length > 0 && !loading

  return (
    <aside className="sidebar">
      <h3><Shuffle className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Input Mode</h3>
      <div className="input-mode-toggle">
        <button
          className={`mode-btn ${inputMode === INPUT_MODES.REPO ? 'active' : ''}`}
          onClick={() => setInputMode(INPUT_MODES.REPO)}
          disabled={loading}
        >
          <Package className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Repository URL
        </button>
        <button
          className={`mode-btn ${inputMode === INPUT_MODES.TECH_STACK ? 'active' : ''}`}
          onClick={() => setInputMode(INPUT_MODES.TECH_STACK)}
          disabled={loading}
        >
          <Wrench className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Tech Stack
        </button>
      </div>

      <hr />

      {inputMode === INPUT_MODES.REPO ? (
        <>
          <h3><FileText className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Repository Input</h3>
          <input
            type="text"
            placeholder="https://github.com/owner/repo"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            disabled={loading}
          />
        </>
      ) : (
        <>
          <h3><Wrench className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Your Tech Stack</h3>
          <p className="input-hint">Enter technologies/skills you know (press Enter to add)</p>
          <input
            type="text"
            placeholder="e.g., Python, React, Node.js"
            value={techStackInput}
            onChange={(e) => setTechStackInput(e.target.value)}
            onKeyDown={handleAddTechStack}
            disabled={loading}
          />
          {techStackTags.length > 0 && (
            <div className="tech-tags">
              {techStackTags.map(tag => (
                <span key={tag} className="tech-tag">
                  {tag}
                  <button
                    className="tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                    disabled={loading}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="quick-add">
            <span className="quick-add-label">Quick add:</span>
            {['Python', 'JavaScript', 'React', 'TypeScript', 'Go', 'Rust'].map(tech => (
              <button
                key={tech}
                className="quick-add-btn"
                onClick={() => {
                  if (!techStackTags.includes(tech.toLowerCase())) {
                    setTechStackTags([...techStackTags, tech.toLowerCase()])
                  }
                }}
                disabled={loading || techStackTags.includes(tech.toLowerCase())}
              >
                {tech}
              </button>
            ))}
          </div>
        </>
      )}

      <hr />

      <h3><Settings className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Options</h3>
      {inputMode === INPUT_MODES.REPO && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={beginnerOnly}
            onChange={(e) => setBeginnerOnly(e.target.checked)}
            disabled={loading}
          />
          <Leaf className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Beginner-only mode
        </label>
      )}
      <label className="select-label">
        <Bot className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Model Selection
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

      <h3><BarChart2 className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> API Status</h3>
      <p className="api-status">
        API keys are configured on the server. Ensure GROQ_API_KEY and GITHUB_TOKEN are set in .env.
      </p>

      <hr />

      <button
        className="btn-generate"
        onClick={handleGenerate}
        disabled={!canGenerate}
      >
        {loading
          ? <><Loader2 className="inline w-4 h-4 mr-1 animate-spin" /> Running...</>
          : inputMode === INPUT_MODES.REPO
            ? <><Rocket className="inline w-4 h-4 mr-1" /> Generate Analysis</>
            : <><Search className="inline w-4 h-4 mr-1" /> Find Repositories</>
        }
      </button>

      <hr />

      <h3><Target className="inline w-4 h-4 mr-1 -mt-0.5 align-middle" /> Try Demo Repos</h3>
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
