import { useEffect, useState } from 'react'
import { Brain, Search, AlertTriangle } from 'lucide-react'
import { adminListUsers, adminMemorySummary } from '../api'
import AdminSidebar from '../components/AdminSidebar'

function freshnessBadge(f) {
  const v = (f || 'stable').toLowerCase()
  const map = {
    stable: 'bg-slate-500/15 text-slate-300 border-slate-500/25',
    strengthening: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25',
    weakening: 'bg-amber-500/15 text-amber-300 border-amber-500/25',
    stale: 'bg-red-500/15 text-red-300 border-red-500/25',
  }
  return map[v] || map.stable
}

function userLabel(user) {
  return user.display_name || user.email || `User ${user.id}`
}

export default function AdminAgentMemory() {
  const [users, setUsers] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoadingUsers(true)
    adminListUsers(userQuery)
      .then((data) => {
        if (!active) return
        setUsers(data.users || [])
      })
      .catch((e) => {
        if (!active) return
        setError(e.message || 'Failed to load users')
      })
      .finally(() => {
        if (!active) return
        setLoadingUsers(false)
      })
    return () => {
      active = false
    }
  }, [userQuery])

  const loadSummary = async (user) => {
    if (!user) return
    setSelectedUser(user)
    setLoadingSummary(true)
    setError(null)
    try {
      const data = await adminMemorySummary(String(user.id))
      setSummary(data)
    } catch (e) {
      setError(e.message || 'Failed to load memory summary')
      setSummary(null)
    } finally {
      setLoadingSummary(false)
    }
  }

  const observations = summary?.observations || []
  const curatedMental = summary?.mental_models || []
  const facts = summary?.recent_facts || []
  const totals = summary?.totals || {}

  return (
    <div className="h-screen bg-app-bg text-app-text flex overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto">
        <header className="sticky top-0 z-10 border-b border-app-border bg-app-bg/95 px-6 py-4 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary-500/25 bg-primary-500/10">
              <Brain className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-app-text">Agent Memory (Admin)</h1>
              <p className="mt-1 text-sm text-app-muted max-w-3xl">
                Browse per-user memory banks without creating a project. Use search to find a user, then review their
                observations, mental models, and recent facts.
              </p>
            </div>
          </div>
        </header>

        <div className="p-6">

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="rounded-xl border border-app-border bg-app-surface p-4">
          <div className="text-xs uppercase tracking-wide text-app-muted mb-2">Users</div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-muted" />
            <input
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              placeholder="Search users"
              className="w-full rounded-lg border border-app-border bg-app-bg px-9 py-2 text-sm text-app-text placeholder:text-app-muted/60"
            />
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-2">
            {loadingUsers && <p className="text-xs text-app-muted">Loading users...</p>}
            {!loadingUsers && users.length === 0 && <p className="text-xs text-app-muted">No users found.</p>}
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => loadSummary(u)}
                className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                  selectedUser?.id === u.id
                    ? 'border-primary-500/40 bg-primary-500/10 text-primary-300'
                    : 'border-app-border text-app-muted hover:border-primary-500/40 hover:text-app-text'
                }`}
              >
                <div className="text-sm text-app-text truncate">{userLabel(u)}</div>
                <div className="text-[11px] text-app-muted truncate">{u.email}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="space-y-6">
          {!selectedUser && (
            <div className="rounded-xl border border-app-border bg-app-surface p-10 text-center">
              <p className="text-app-muted">Select a user to view their memory bank.</p>
            </div>
          )}

          {selectedUser && (
            <div className="rounded-xl border border-app-border bg-app-surface p-4">
              <div className="text-xs uppercase tracking-wide text-app-muted mb-2">Selected user</div>
              <div className="text-lg font-semibold text-app-text">{userLabel(selectedUser)}</div>
              <div className="text-sm text-app-muted">{selectedUser.email}</div>
              <div className="mt-2 text-xs text-app-muted">Total entries: {totals.total_entries ?? '—'}</div>
            </div>
          )}

          {loadingSummary && selectedUser && (
            <div className="rounded-xl border border-app-border bg-app-surface p-6 text-sm text-app-muted">
              Loading memory summary...
            </div>
          )}

          {!loadingSummary && selectedUser && summary && (
            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-semibold text-app-text mb-1">What we know about this user</h2>
                <p className="text-xs text-app-muted mb-4 max-w-2xl">Consolidated observation summaries.</p>
                <div className="space-y-3">
                  {observations.length === 0 ? (
                    <p className="text-sm text-app-muted">No consolidated observations yet.</p>
                  ) : (
                    observations.map((o) => (
                      <div
                        key={o.id || o.text}
                        className="rounded-xl border border-app-border bg-app-surface p-4 flex flex-wrap gap-3 justify-between"
                      >
                        <p className="text-sm text-app-text/90 flex-1 min-w-[200px]">{o.text}</p>
                        <span
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${freshnessBadge(
                            o.freshness,
                          )}`}
                        >
                          {o.freshness || 'stable'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-app-text mb-1">Mental models</h2>
                <p className="text-xs text-app-muted mb-4 max-w-2xl">Curated documents maintained by Hindsight.</p>
                <ul className="space-y-2">
                  {curatedMental.length === 0 ? (
                    <li className="text-sm text-app-muted">No mental models available yet.</li>
                  ) : (
                    curatedMental.map((m) => (
                      <li
                        key={`${m.source || 'mm'}-${m.id || m.title}`}
                        className="rounded-lg border border-app-border bg-app-surface px-4 py-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-medium text-app-text">{m.title}</span>
                          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                            Curated
                          </span>
                        </div>
                        {m.description && (
                          <p className="text-xs text-app-muted/90 leading-relaxed">{m.description}</p>
                        )}
                        {m.created_at && (
                          <p className="mt-1 text-xs text-app-muted">
                            {typeof m.created_at === 'string' ? m.created_at : String(m.created_at)}
                          </p>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-app-text mb-4">Recent facts</h2>
                <ul className="space-y-2">
                  {facts.length === 0 ? (
                    <li className="text-sm text-app-muted">No raw memories listed.</li>
                  ) : (
                    facts.map((f) => (
                      <li
                        key={f.id || `${f.text}-${f.mentioned_at}`}
                        className="rounded-lg border border-app-border bg-app-bg px-4 py-3 text-xs text-app-muted flex flex-wrap gap-2"
                      >
                        <span className="rounded bg-app-elevated px-1.5 py-0.5 font-mono text-[10px] text-primary-300 border border-app-border">
                          {f.kind || 'world'}
                        </span>
                        <span className="text-app-text/90 flex-1">{f.text}</span>
                        {f.mentioned_at && <span className="text-app-muted/80">{String(f.mentioned_at)}</span>}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </div>
          )}
        </section>
      </div>
        </div>
      </main>
    </div>
  )
}
