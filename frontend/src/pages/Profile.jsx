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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          type="button"
          onClick={() => navigate('/login')}
          className="text-primary-600 hover:text-primary-700 text-sm"
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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 text-gray-500 hover:text-gray-800 rounded-lg hover:bg-gray-100"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Profile</h1>
            <p className="text-sm text-gray-500">Your activity in Open Source Scout</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/dashboard"
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Dashboard
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <section className="bg-white border border-gray-200 rounded-xl p-6 flex items-start gap-4">
          <div className="w-14 h-14 bg-primary-100 rounded-full flex items-center justify-center shrink-0">
            <User className="w-7 h-7 text-primary-600" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {data.display_name || data.email}
            </h2>
            {data.display_name && (
              <p className="text-sm text-gray-500 mt-0.5">{data.email}</p>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Member since {formatWhen(data.created_at)}
            </p>
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Search className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Tech stack searches</h3>
          </div>
          {searches.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">
              No saved searches yet. Run a tech stack search from the dashboard while logged in.
            </p>
          ) : (
            <ul className="space-y-3">
              {searches.map((row) => (
                <li
                  key={row.id}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <p className="text-xs text-gray-400 mb-2">{formatWhen(row.created_at)}</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {(row.tech_stack || []).map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 bg-primary-50 text-primary-800 rounded text-xs font-medium"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  {(row.ranked_repo_full_names || []).length > 0 && (
                    <p className="text-sm text-gray-600">
                      <span className="text-gray-500">Repos matched: </span>
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
            <ClipboardList className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Issues analyzed</h3>
          </div>
          {issues.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">
              No issue analyses recorded yet. Analyze a repository or re-run analysis on an issue while logged in.
            </p>
          ) : (
            <ul className="space-y-3">
              {issues.map((row) => (
                <li
                  key={row.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {row.repo_full_name}
                      <span className="text-gray-500 font-normal">
                        {' '}
                        · #{row.issue_number}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600 mt-0.5">{row.issue_title}</p>
                    <a
                      href={row.repo_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary-600 hover:underline mt-1 inline-flex items-center gap-1"
                    >
                      Repository <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">
                    {formatWhen(row.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-5 h-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">Pushes &amp; PR links</h3>
          </div>
          {pushes.length === 0 ? (
            <p className="text-sm text-gray-500 bg-white border border-gray-200 rounded-xl p-4">
              No pushes recorded yet. Push a change from the editor while logged in; we store the branch and GitHub compare link to open a PR.
            </p>
          ) : (
            <ul className="space-y-3">
              {pushes.map((row) => (
                <li
                  key={row.id}
                  className="bg-white border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                    <p className="font-medium text-gray-900">
                      {row.upstream_owner}/{row.upstream_repo}
                    </p>
                    <span className="text-xs text-gray-400">{formatWhen(row.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray-600">
                    Branch <code className="text-xs bg-gray-100 px-1 rounded">{row.branch_name}</code>
                    {' · '}
                    <code className="text-xs bg-gray-100 px-1 rounded">{row.file_path}</code>
                  </p>
                  {row.commit_message && (
                    <p className="text-xs text-gray-500 mt-2 line-clamp-2">{row.commit_message}</p>
                  )}
                  {row.pr_url && (
                    <a
                      href={row.pr_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary-600 hover:underline mt-3"
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
