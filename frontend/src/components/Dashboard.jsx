import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { searchReposByTechStack, runAnalyze } from '../api'

const QUICK_ADD_TAGS = ['Python', 'JavaScript', 'React', 'Node.js', 'TypeScript', 'Go', 'Java', 'Rust']

export default function Dashboard() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialMode = searchParams.get('mode') || 'tech'

  const [inputMode, setInputMode] = useState(initialMode) // 'tech' or 'repo'
  const [techTags, setTechTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [beginnerOnly, setBeginnerOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Results
  const [rankedRepos, setRankedRepos] = useState(null)
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)

  const addTag = (tag) => {
    if (tag && !techTags.includes(tag)) {
      setTechTags([...techTags, tag])
    }
    setTagInput('')
  }

  const removeTag = (tag) => {
    setTechTags(techTags.filter(t => t !== tag))
  }

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault()
      addTag(tagInput.trim())
    }
  }

  const handleTechSearch = async () => {
    if (techTags.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const result = await searchReposByTechStack({ tech_stack: techTags })
      setRankedRepos(result)
    } catch (err) {
      setError(typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRepoAnalyze = async () => {
    if (!repoUrl.trim()) return
    setLoading(true)
    setError(null)
    try {
      const result = await runAnalyze({ repo_url: repoUrl, beginner_only: beginnerOnly })
      setAnalysisResult(result)
      // Navigate to analysis view with results
      navigate('/analysis', { state: { result, repoUrl } })
    } catch (err) {
      setError(typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err))
    } finally {
      setLoading(false)
    }
  }

  const selectRepoForAnalysis = async (repo) => {
    setSelectedRepo(repo)
    setLoading(true)
    setError(null)
    try {
      const result = await runAnalyze({ repo_url: repo.url })
      navigate('/analysis', { state: { result, repoUrl: repo.url, rankedRepos } })
    } catch (err) {
      setError(typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err))
    } finally {
      setLoading(false)
    }
  }

  // Render waiting for input state
  const renderWaitingState = () => (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mb-6">
        <span className="text-4xl">🔭</span>
      </div>
      <h2 className="text-2xl font-semibold text-gray-900 mb-2">Waiting for input...</h2>
      <p className="text-gray-500 text-center max-w-md">
        {inputMode === 'tech'
          ? 'Add your tech stack tags in the sidebar to discover matching repositories.'
          : 'Enter a GitHub repository URL in the sidebar to begin analysis.'
        }
      </p>
    </div>
  )

  // Render repo results
  const renderRepoResults = () => (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Discovered Repositories</h2>
          <p className="text-gray-500 text-sm">
            {rankedRepos.ranked_repos.length} repositories match your tech stack
          </p>
        </div>
        <button
          onClick={() => setRankedRepos(null)}
          className="text-gray-500 hover:text-gray-700 text-sm"
        >
          ← Back to search
        </button>
      </div>

      <div className="space-y-4">
        {rankedRepos.ranked_repos.map((repo, index) => (
          <div
            key={repo.full_name}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center font-semibold text-gray-600">
                  #{index + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{repo.full_name.split('/')[1]}</h3>
                  <p className="text-gray-500 text-sm">{repo.full_name.split('/')[0]}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-accent-100 text-accent-700 px-3 py-1 rounded-full text-sm font-medium">
                  {repo.score_total}/100
                </span>
              </div>
            </div>

            <p className="text-gray-600 text-sm mb-4">{repo.why_match?.join(' • ') || repo.description}</p>

            {/* Score breakdown */}
            <div className="grid grid-cols-5 gap-2 mb-4">
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">Tech Match</div>
                <div className="font-semibold text-gray-900">{repo.score_breakdown.tech_match}</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">Beginner</div>
                <div className="font-semibold text-gray-900">{repo.score_breakdown.beginner_friendliness}</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">Activity</div>
                <div className="font-semibold text-gray-900">{repo.score_breakdown.activity_score}</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">Community</div>
                <div className="font-semibold text-gray-900">{repo.score_breakdown.community_score}</div>
              </div>
              <div className="text-center p-2 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-500">Issues</div>
                <div className="font-semibold text-gray-900">{repo.score_breakdown.issue_availability}</div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => selectRepoForAnalysis(repo)}
                disabled={loading}
                className="flex-1 bg-primary-500 text-white py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50"
              >
                {loading && selectedRepo?.full_name === repo.full_name ? 'Analyzing...' : 'Select & Analyze'}
              </button>
              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
              >
                View on GitHub
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
              <span className="text-white text-sm">🔭</span>
            </div>
            <span className="font-semibold text-gray-900">Open Source Scout</span>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setInputMode('tech')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${inputMode === 'tech'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Tech Stack
            </button>
            <button
              onClick={() => setInputMode('repo')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${inputMode === 'repo'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              Repository
            </button>
          </div>
        </div>

        {/* Input Section */}
        <div className="flex-1 p-4 overflow-y-auto">
          {inputMode === 'tech' ? (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Your Tech Stack
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                {techTags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-primary-100 text-primary-700 px-3 py-1 rounded-full text-sm"
                  >
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-primary-900"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Add technology..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />

              {/* Quick Add */}
              <div className="mt-4">
                <span className="text-xs text-gray-500 mb-2 block">Quick add:</span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ADD_TAGS.filter(t => !techTags.includes(t)).slice(0, 6).map(tag => (
                    <button
                      key={tag}
                      onClick={() => addTag(tag)}
                      className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs hover:bg-gray-200 transition-colors"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Repository URL
              </label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
              <div className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  id="beginnerOnly"
                  checked={beginnerOnly}
                  onChange={(e) => setBeginnerOnly(e.target.checked)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label htmlFor="beginnerOnly" className="ml-2 block text-sm text-gray-700">
                  Beginner-only mode
                </label>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Enter a GitHub repository URL to analyze its issues and codebase.
              </p>
            </>
          )}
        </div>

        {/* Action Button */}
        <div className="p-4 border-t border-gray-100">
          {error && (
            <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={inputMode === 'tech' ? handleTechSearch : handleRepoAnalyze}
            disabled={loading || (inputMode === 'tech' ? techTags.length === 0 : !repoUrl.trim())}
            className="w-full bg-primary-500 text-white py-3 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                {inputMode === 'tech' ? 'Searching...' : 'Analyzing...'}
              </>
            ) : (
              <>
                {inputMode === 'tech' ? '🔍 Find Repositories' : '🚀 Analyze Repository'}
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
            <p className="text-sm text-gray-500">
              {inputMode === 'tech' ? 'Discover repositories matching your skills' : 'Analyze a specific repository'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <span>⚙️</span>
            </button>
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          </div>
        </header>

        {/* Content */}
        {rankedRepos ? renderRepoResults() : renderWaitingState()}
      </main>
    </div>
  )
}
