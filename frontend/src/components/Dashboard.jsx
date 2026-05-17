import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Search, Rocket, Settings, User, Github, ExternalLink, FolderKanban, ThumbsUp, ThumbsDown } from 'lucide-react'
import { searchReposByTechStack, runAnalyze, createProject, getMe, feedbackRepoSelection, feedbackThumbs } from '../api'
import ScoutLogo from './ScoutLogo'

const QUICK_ADD_TAGS = ['Python', 'JavaScript', 'React', 'Node.js', 'TypeScript', 'Go', 'Java', 'Rust']

const MAX_REPO_BULLETS = 4

function buildRepoBullets(repo) {
  if (Array.isArray(repo.why_match) && repo.why_match.length > 0) {
    const fromWhy = repo.why_match
      .map((t) => String(t).trim())
      .filter(Boolean)
      .slice(0, MAX_REPO_BULLETS)
    if (fromWhy.length) return fromWhy
  }
  const desc = (repo.description || '').trim()
  if (desc) {
    const chunks = desc
      .split(/\s*(?:[.•]|\n)\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => s.length < 140)
      .slice(0, MAX_REPO_BULLETS)
    if (chunks.length) return chunks
  }
  const b = repo.score_breakdown
  const inferred = []
  if (b) {
    if ((b.beginner_friendliness ?? 0) >= 15) inferred.push('Beginner-friendly repository')
    if ((b.activity ?? 0) >= 10) inferred.push('Healthy activity and commits')
    if ((b.issue_availability ?? 0) >= 7) inferred.push('Issues available for contributors')
    if ((b.community ?? 0) >= 7) inferred.push('Active community')
    if ((b.tech_match ?? 0) >= 25) inferred.push('Strong tech stack alignment')
  }
  return inferred.slice(0, MAX_REPO_BULLETS).length
    ? inferred.slice(0, MAX_REPO_BULLETS)
    : ['Matches your search criteria']
}

export default function Dashboard() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const initialMode = searchParams.get('mode') || 'tech'

  const [inputMode, setInputMode] = useState(initialMode)
  const [techTags, setTechTags] = useState([])
  const [tagInput, setTagInput] = useState('')
  const [repoUrl, setRepoUrl] = useState('')
  const [beginnerOnly, setBeginnerOnly] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [rankedRepos, setRankedRepos] = useState(null)
  const [selectedRepo, setSelectedRepo] = useState(null)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null))
  }, [])

  const displayName = user?.display_name || user?.email?.split('@')[0] || 'Developer'
  const userEmail = user?.email || ''
  const monogram = displayName.charAt(0).toUpperCase()

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

      // Auto-create project in background and capture its ID
      const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      const repoFullName = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : repoUrl
      const repoName = repoMatch ? repoMatch[2] : repoUrl
      let createdProjectId = null
      try {
        const proj = await createProject({
          name: repoName,
          project_type: 'repo_url',
          repo_url: repoUrl,
          repo_full_name: repoFullName,
          analysis_result: result,
        })
        createdProjectId = proj?.id || null
      } catch (_) { /* limit reached or other error — non-blocking */ }

      navigate('/analysis', { state: { result, repoUrl, activeProjectId: createdProjectId } })
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
    feedbackRepoSelection({ repo_url: repo.url, action: 'selected' })
    try {
      const result = await runAnalyze({ repo_url: repo.url })

      // Auto-create project in background and capture its ID
      const repoName = repo.full_name.split('/')[1] || repo.full_name
      let createdProjectId = null
      try {
        const proj = await createProject({
          name: repoName,
          project_type: 'tech_stack',
          tech_stack: techTags.length > 0 ? techTags : undefined,
          repo_url: repo.url,
          repo_full_name: repo.full_name,
          analysis_result: result,
        })
        createdProjectId = proj?.id || null
      } catch (_) { /* limit reached or other error — non-blocking */ }

      navigate('/analysis', { state: { result, repoUrl: repo.url, rankedRepos, activeProjectId: createdProjectId } })
    } catch (err) {
      setError(typeof err === 'object' ? (err.message || JSON.stringify(err)) : String(err))
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-input text-app-text placeholder:text-app-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/80 focus:border-primary-500/50'

  const renderWaitingState = () => (
    <div className="flex flex-col items-center justify-center h-full py-20">
      <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 ring-1 ring-app-border bg-app-surface p-2">
        <ScoutLogo className="h-14 w-14 rounded-lg" />
      </div>
      <h2 className="text-2xl font-semibold text-app-text mb-2">Waiting for input...</h2>
      <p className="text-app-muted text-center max-w-md">
        {inputMode === 'tech'
          ? 'Add your tech stack tags in the sidebar to discover matching repositories.'
          : 'Enter a GitHub repository URL in the sidebar to begin analysis.'}
      </p>
    </div>
  )

  const renderRepoResults = () => (
    <div className="p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-app-text">Discovered Repositories</h2>
          <p className="text-app-muted text-sm mt-1">
            {rankedRepos.ranked_repos.length} repositories match your tech stack
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRankedRepos(null)}
          className="text-app-muted hover:text-primary-400 text-sm transition-colors duration-200 self-start sm:self-auto"
        >
          ← Back to search
        </button>
      </div>

      <div className="space-y-6">
        {rankedRepos.ranked_repos.map((repo, index) => {
          const repoName = repo.full_name.split('/')[1] || repo.full_name
          const owner = repo.full_name.split('/')[0] || ''
          const isAnalyzingThis = loading && selectedRepo?.full_name === repo.full_name

          return (
            <article
              key={repo.full_name}
              className="bg-app-surface/50 border border-app-border rounded-2xl p-6 transition-colors hover:bg-app-surface"
            >
              {/* Header Section */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg bg-app-elevated border border-app-border text-app-muted shrink-0">
                    #{index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-xl text-app-text mb-1 flex items-center gap-2">
                      {repoName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-app-muted">
                      <span className="font-medium text-app-text/70">{owner}</span>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-amber-400/80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> 
                          {repo.stargazers_count?.toLocaleString() || repo.stars?.toLocaleString() || 0}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-app-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> 
                          {repo.open_issues_count?.toLocaleString() || repo.open_issues?.toLocaleString() || 0} issues
                        </span>
                        {(repo.language) && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-primary-500/80"></span> 
                            {repo.language}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 bg-app-bg px-4 py-2 border border-app-border rounded-xl">
                  <span className="text-xl font-bold text-primary-400">
                    {repo.score_total} <span className="text-sm font-medium text-app-muted">/100</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-app-muted">Match Score</span>
                </div>
              </div>

              {/* Description */}
              {repo.description && repo.description !== 'No description available' && (
                <p className="mb-6 text-base text-app-text/90 leading-relaxed">
                  {repo.description}
                </p>
              )}

              {/* Why it matches */}
              {repo.why_match && repo.why_match.length > 0 && (
                <div className="mb-6 bg-primary-500/5 rounded-xl p-4 border border-primary-500/10">
                  <p className="text-xs font-semibold text-primary-400 capitalize tracking-wide mb-3">Why it matches</p>
                  <ul className="text-sm text-app-text/80 space-y-2">
                    {repo.why_match.slice(0, 3).map((reason, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <svg className="w-4 h-4 text-primary-400/70 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="leading-snug">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metrics Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {[
                  ['tech_match', 'Tech Match'],
                  ['beginner_friendliness', 'Beginner'],
                  ['activity', 'Activity'],
                  ['community', 'Community'],
                  ['issue_availability', 'Issues'],
                ].map(([key, label]) => (
                  <div key={key} className="p-3 bg-app-bg rounded-xl border border-app-border">
                    <div className="text-[11px] font-semibold tracking-wide text-app-muted uppercase mb-1">{label}</div>
                    <div className="font-medium text-app-text">{repo.score_breakdown?.[key] ?? '-'}</div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-app-border/60">
                <button
                  type="button"
                  onClick={() => selectRepoForAnalysis(repo)}
                  disabled={loading}
                  className="inline-flex w-fit items-center gap-2 rounded-lg bg-app-text text-app-bg px-5 py-2.5 text-sm font-medium transition-all duration-200 hover:bg-app-text/90 hover:scale-[0.98] disabled:opacity-50"
                >
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  {isAnalyzingThis ? 'Analyzing...' : 'Analyze Repository'}
                </button>
                <button
                  type="button"
                  onClick={() => feedbackRepoSelection({ repo_url: repo.url, action: 'skipped' })}
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-app-border rounded-lg text-app-muted hover:bg-app-elevated transition-colors text-sm font-medium"
                >
                  Skip
                </button>
                <div className="flex items-center gap-1 border border-app-border rounded-lg p-1 bg-app-bg">
                  <button
                    type="button"
                    title="Helpful match"
                    onClick={() =>
                      feedbackThumbs({ target_type: 'repo', target_id: repo.full_name, vote: 'up' })
                    }
                    className="p-2 rounded-md text-app-muted hover:text-emerald-400 hover:bg-app-elevated"
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    title="Not a good match"
                    onClick={() =>
                      feedbackThumbs({ target_type: 'repo', target_id: repo.full_name, vote: 'down' })
                    }
                    className="p-2 rounded-md text-app-muted hover:text-red-400 hover:bg-app-elevated"
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </button>
                </div>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-app-border rounded-lg text-app-text hover:bg-app-elevated transition-colors text-sm font-medium"
                >
                  View Source
                </a>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="h-screen bg-app-bg flex text-app-text overflow-hidden">
      <aside className="w-80 bg-app-surface border-r border-app-border flex flex-col shrink-0">
        <div className="p-4 border-b border-app-border shrink-0">
          <div className="flex items-center gap-2">
            <ScoutLogo className="h-8 w-8" />
            <span className="font-semibold text-app-text">Open Source Scout</span>
          </div>
        </div>

        <div className="p-4 border-b border-app-border shrink-0">
          <div className="flex bg-app-bg rounded-lg p-1 border border-app-border">
            <button
              type="button"
              onClick={() => setInputMode('tech')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors duration-200 ${
                inputMode === 'tech'
                  ? 'bg-app-elevated text-app-text shadow-sm border border-app-border'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Tech Stack
            </button>
            <button
              type="button"
              onClick={() => setInputMode('repo')}
              className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors duration-200 ${
                inputMode === 'repo'
                  ? 'bg-app-elevated text-app-text shadow-sm border border-app-border'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              Repository
            </button>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          {inputMode === 'tech' ? (
            <>
              <label className="block text-sm font-medium text-app-text mb-2">Your Tech Stack</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {techTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 bg-primary-500/15 text-primary-300 border border-primary-500/25 px-3 py-1 rounded-full text-sm"
                  >
                    {tag}
                    <button type="button" onClick={() => removeTag(tag)} className="hover:text-primary-200">
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
                className={inputClass}
              />
              <div className="mt-4">
                <span className="text-xs text-app-muted mb-2 block">Quick add:</span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_ADD_TAGS.filter((t) => !techTags.includes(t))
                    .slice(0, 6)
                    .map((tag) => (
                       <button
                        key={tag}
                        type="button"
                        onClick={() => addTag(tag)}
                        className="px-2 py-1 bg-app-bg text-app-muted border border-app-border rounded text-xs hover:border-primary-500/40 hover:text-primary-400 transition-colors duration-200"
                      >
                        + {tag}
                      </button>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-app-text mb-2">Repository URL</label>
              <input
                type="text"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repo"
                className={inputClass}
              />
              <div className="mt-4 flex items-center">
                <input
                  type="checkbox"
                  id="beginnerOnly"
                  checked={beginnerOnly}
                  onChange={(e) => setBeginnerOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-app-border bg-app-input text-primary-500 focus:ring-primary-500/50"
                />
                <label htmlFor="beginnerOnly" className="ml-2 block text-sm text-app-muted">
                  Beginner-only mode
                </label>
              </div>
              <p className="text-xs text-app-muted mt-2">
                Enter a GitHub repository URL to analyze its issues and codebase.
              </p>
            </>
          )}
        </div>

        <div className="p-4 border-t border-app-border shrink-0">
          {error && (
            <div className="mb-3 p-2 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={inputMode === 'tech' ? handleTechSearch : handleRepoAnalyze}
            disabled={loading || (inputMode === 'tech' ? techTags.length === 0 : !repoUrl.trim())}
            className="w-full bg-accent-500 text-[#0b0f14] py-3 rounded-lg font-semibold hover:bg-accent-600 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {inputMode === 'tech' ? 'Searching...' : 'Analyzing...'}
              </>
            ) : (
              <>
                {inputMode === 'tech' ? (
                  <>
                    <Search className="w-4 h-4" /> Find Repositories
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" /> Analyze Repository
                  </>
                )}
              </>
            )}
          </button>
        </div>

        {/* Profile Sidebar Footer */}
        <div className="p-4 border-t border-app-border bg-app-surface/50 shrink-0">
          <div className="flex items-center justify-between">
            <Link
              to="/profile"
              className="flex items-center gap-3 flex-1 px-2 py-1.5 rounded-lg hover:bg-app-elevated transition-colors duration-200"
            >
              <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center shrink-0 text-sm font-bold text-primary-400 uppercase">
                {monogram}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-app-text truncate">{displayName}</p>
                {userEmail && <p className="text-xs text-app-muted truncate">{userEmail}</p>}
              </div>
            </Link>
            <Link
              to="/settings"
              className="p-2 text-app-muted hover:text-app-text rounded-lg hover:bg-app-elevated transition-colors duration-200 shrink-0"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-app-bg">
        <header className="bg-app-surface/80 backdrop-blur-sm border-b border-app-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-app-text">Dashboard</h1>
            <p className="text-sm text-app-muted">
              {inputMode === 'tech' ? 'Discover repositories matching your skills' : 'Analyze a specific repository'}
            </p>
          </div>
          <div className="flex items-center justify-end">
            <Link
              to="/projects"
              title="My Projects"
              aria-label="My Projects"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-app-muted hover:text-primary-400 rounded-lg hover:bg-app-elevated border border-transparent hover:border-primary-500/30 transition-all duration-200"
            >
              <FolderKanban className="w-4 h-4" />
              <span>Projects</span>
            </Link>
          </div>
        </header>

        {rankedRepos ? renderRepoResults() : renderWaitingState()}
      </main>
    </div>
  )
}
