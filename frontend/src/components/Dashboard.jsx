import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { Search, Rocket, Settings, User, Github, ExternalLink, FolderKanban } from 'lucide-react'
import { searchReposByTechStack, runAnalyze, createProject } from '../api'
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
    if ((b.beginner_friendliness ?? 0) >= 55) inferred.push('Beginner-friendly repository')
    if ((b.activity_score ?? 0) >= 55) inferred.push('Healthy activity and commits')
    if ((b.issue_availability ?? 0) >= 50) inferred.push('Issues available for contributors')
    if ((b.community_score ?? 0) >= 55) inferred.push('Active community')
    if ((b.tech_match ?? 0) >= 65) inferred.push('Strong tech stack alignment')
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

      // Auto-create project in background
      const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
      const repoFullName = repoMatch ? `${repoMatch[1]}/${repoMatch[2]}` : repoUrl
      const repoName = repoMatch ? repoMatch[2] : repoUrl
      try {
        await createProject({
          name: repoName,
          project_type: 'repo_url',
          repo_url: repoUrl,
          repo_full_name: repoFullName,
          analysis_result: result,
        })
      } catch (_) { /* limit reached or other error — non-blocking */ }

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

      // Auto-create project in background
      const repoName = repo.full_name.split('/')[1] || repo.full_name
      try {
        await createProject({
          name: repoName,
          project_type: 'tech_stack',
          tech_stack: techTags.length > 0 ? techTags : undefined,
          repo_url: repo.url,
          repo_full_name: repo.full_name,
          analysis_result: result,
        })
      } catch (_) { /* limit reached or other error — non-blocking */ }

      navigate('/analysis', { state: { result, repoUrl: repo.url, rankedRepos } })
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

      <div className="space-y-4">
        {rankedRepos.ranked_repos.map((repo, index) => {
          const repoName = repo.full_name.split('/')[1] || repo.full_name
          const owner = repo.full_name.split('/')[0] || ''
          const avatarLetter = (repoName[0] || '?').toUpperCase()
          const bullets = buildRepoBullets(repo)
          const isAnalyzingThis = loading && selectedRepo?.full_name === repo.full_name

          return (
            <article
              key={repo.full_name}
              onClick={() => !loading && selectRepoForAnalysis(repo)}
              style={{ animationDelay: `${index * 55}ms` }}
              className="dashboard-repo-card-enter group cursor-pointer rounded-[10px] border border-[#1F2937] bg-[#111827] p-5 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_4px_24px_-4px_rgba(0,0,0,0.35)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[#3B82F6] hover:shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_12px_40px_-8px_rgba(59,130,246,0.18)]"
            >
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex min-w-0 items-start gap-3">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#1F2937] bg-[#0B1220] text-sm font-semibold text-primary-400"
                    aria-hidden
                  >
                    {avatarLetter}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate font-semibold text-app-text">{repoName}</h3>
                      <span className="text-[11px] font-medium uppercase tracking-wide text-app-muted/80">
                        #{index + 1}
                      </span>
                    </div>
                    <p className="text-app-muted text-sm truncate">{owner}</p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-[rgba(34,197,94,0.15)] px-2.5 py-1 text-sm font-semibold text-[#22C55E]">
                  {repo.score_total}/100
                </span>
              </div>

              <ul className="mb-4 space-y-1.5 text-sm text-app-muted">
                {bullets.map((line, i) => (
                  <li key={`${repo.full_name}-b-${i}`} className="flex gap-2 leading-snug">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-app-muted/50" aria-hidden />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>

              <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ['tech_match', 'Tech Match'],
                  ['beginner_friendliness', 'Beginner'],
                  ['activity_score', 'Activity'],
                  ['community_score', 'Community'],
                  ['issue_availability', 'Issues'],
                ].map(([key, label]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-[#1F2937] bg-[#0B1220] px-2 py-2 text-center"
                  >
                    <div className="text-[11px] font-medium uppercase tracking-wide text-app-muted/80">{label}</div>
                    <div className="mt-0.5 text-base font-semibold tabular-nums text-app-text">
                      {repo.score_breakdown?.[key] ?? '—'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    selectRepoForAnalysis(repo)
                  }}
                  disabled={loading}
                  className="inline-flex w-fit items-center gap-2 rounded-lg bg-[#22C55E] px-5 py-2 text-sm font-semibold text-[#0B0F14] shadow-sm transition-all duration-200 ease-out hover:-translate-y-px hover:shadow-[0_0_20px_-4px_rgba(34,197,94,0.55)] disabled:pointer-events-none disabled:opacity-50"
                >
                  <Search className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  {isAnalyzingThis ? 'Analyzing…' : 'Analyze Repo'}
                </button>
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-[#1F2937] bg-transparent px-4 py-2 text-sm font-medium text-app-muted transition-all duration-200 ease-out hover:-translate-y-px hover:border-[#3B82F6]/60 hover:text-primary-400"
                >
                  <Github className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                  View on GitHub
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                </a>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-app-bg flex text-app-text">
      <aside className="w-80 bg-app-surface border-r border-app-border flex flex-col">
        <div className="p-4 border-b border-app-border">
          <div className="flex items-center gap-2">
            <ScoutLogo className="h-8 w-8" />
            <span className="font-semibold text-app-text">Open Source Scout</span>
          </div>
        </div>

        <div className="p-4 border-b border-app-border">
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

        <div className="p-4 border-t border-app-border">
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
      </aside>

      <main className="flex-1 overflow-y-auto bg-app-bg">
        <header className="bg-app-surface/80 backdrop-blur-sm border-b border-app-border px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-lg font-semibold text-app-text">Dashboard</h1>
            <p className="text-sm text-app-muted">
              {inputMode === 'tech' ? 'Discover repositories matching your skills' : 'Analyze a specific repository'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              to="/projects"
              title="My Projects"
              aria-label="My Projects"
              className="p-2 text-app-muted hover:text-primary-400 rounded-lg hover:bg-app-elevated transition-colors duration-200"
            >
              <FolderKanban className="w-5 h-5" />
            </Link>
            <button
              type="button"
              className="p-2 text-app-muted hover:text-app-text rounded-lg hover:bg-app-elevated transition-colors duration-200"
            >
              <Settings className="w-5 h-5" />
            </button>
            <Link
              to="/profile"
              title="Profile"
              aria-label="Profile"
              className="w-8 h-8 bg-app-elevated border border-app-border rounded-full flex items-center justify-center text-app-muted hover:border-primary-500/50 hover:text-primary-400 transition-all duration-200"
            >
              <User className="w-4 h-4" />
            </Link>
          </div>
        </header>

        {rankedRepos ? renderRepoResults() : renderWaitingState()}
      </main>
    </div>
  )
}
