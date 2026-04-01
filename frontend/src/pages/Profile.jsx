import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  User,
  Search,
  ClipboardList,
  GitBranch,
  ExternalLink,
  Loader2,
} from 'lucide-react'
import { getMe } from '../api'
import { clearAuthSession } from '../auth'

function formatWhen(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return String(iso)
  }
}

export default function Profile() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const me = await getMe()
        if (!cancelled) setData(me)
      } catch (e) {
        if (!cancelled) setError(e.message || 'Failed to load profile')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const handleLogout = () => {
    clearAuthSession()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-app-bg flex flex-col items-center justify-center p-6 text-app-text">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="text-primary-400 hover:text-primary-300 text-sm transition-colors"
        >
          Back to login
        </button>
      </div>
    )
  }

  const searches = data?.tech_stack_searches ?? []
  const issues = data?.issue_analyses ?? []
  const pushes = data?.git_pushes ?? []

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <header className="bg-app-surface border-b border-app-border px-6 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm bg-app-surface/95">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 text-app-muted hover:text-app-text rounded-lg hover:bg-app-elevated transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-app-text">Profile</h1>
            <p className="text-sm text-app-muted">Your activity in Open Source Scout</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
            Dashboard
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-app-muted hover:text-app-text transition-colors"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <section className="bg-app-surface border border-app-border rounded-xl p-6 flex items-start gap-4">
          <div className="w-14 h-14 bg-primary-500/15 border border-primary-500/25 rounded-full flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-app-text">{data.display_name || data.email}</h2>
            {data.display_name && <p className="text-sm text-app-muted mt-0.5">{data.email}</p>}
            <p className="text-xs text-app-muted/80 mt-2">Member since {formatWhen(data.created_at)}</p>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-5 h-5 text-app-muted" />
            <h3 className="text-lg font-semibold text-app-text">Tech stack searches</h3>
          </div>
          {searches.length === 0 ? (
            <p className="text-sm text-app-muted bg-app-surface border border-app-border rounded-xl p-4">
              No saved searches yet. Run a tech stack search from the dashboard while logged in.
            </p>
          ) : (
            <ul className="space-y-3">
              {searches.map((row) => (
                <li key={row.id} className="bg-app-surface border border-app-border rounded-xl p-4">
                  <p className="text-xs text-app-muted/80 mb-2">{formatWhen(row.created_at)}</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(row.tech_stack || []).map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 bg-primary-500/15 text-primary-300 border border-primary-500/25 rounded text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {(row.ranked_repo_full_names || []).length > 0 && (
                    <p className="text-sm text-app-muted">
                      <span className="text-app-muted/70">Repos matched: </span>
                      {(row.ranked_repo_full_names || []).join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-5 h-5 text-app-muted" />
            <h3 className="text-lg font-semibold text-app-text">Issues analyzed</h3>
          </div>
          {issues.length === 0 ? (
            <p className="text-sm text-app-muted bg-app-surface border border-app-border rounded-xl p-4">
              No issue analyses recorded yet. Analyze a repository or re-run analysis on an issue while logged in.
            </p>
          ) : (
            <ul className="space-y-3">
              {issues.map((row) => (
                <li
                  key={row.id}
                  className="bg-app-surface border border-app-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-app-text">
                      {row.repo_full_name}
                      <span className="text-app-muted font-normal"> · #{row.issue_number}</span>
                    </p>
                    <p className="text-sm text-app-muted mt-0.5">{row.issue_title}</p>
                    <a
                      href={row.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-400 hover:text-primary-300 mt-1 inline-flex items-center gap-1"
                    >
                      Repository <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <span className="text-xs text-app-muted/80 shrink-0">{formatWhen(row.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-5 h-5 text-app-muted" />
            <h3 className="text-lg font-semibold text-app-text">Pushes &amp; PR links</h3>
          </div>
          {pushes.length === 0 ? (
            <p className="text-sm text-app-muted bg-app-surface border border-app-border rounded-xl p-4">
              No pushes recorded yet. Push a change from the editor while logged in; we store the branch and GitHub compare link to open a PR.
            </p>
          ) : (
            <ul className="space-y-3">
              {pushes.map((row) => (
                <li key={row.id} className="bg-app-surface border border-app-border rounded-xl p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <p className="font-medium text-app-text">
                      {row.upstream_owner}/{row.upstream_repo}
                    </p>
                    <span className="text-xs text-app-muted/80">{formatWhen(row.created_at)}</span>
                  </div>
                  <p className="text-sm text-app-muted">
                    Branch <code className="text-xs bg-app-bg px-1 rounded border border-app-border">{row.branch_name}</code>
                    {' · '}
                    <code className="text-xs bg-app-bg px-1 rounded border border-app-border">{row.file_path}</code>
                  </p>
                  {row.commit_message && (
                    <p className="text-xs text-app-muted/80 mt-2 line-clamp-2">{row.commit_message}</p>
                  )}
                  {row.pr_url && (
                    <a
                      href={row.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 mt-3"
                    >
                      Open PR on GitHub <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
