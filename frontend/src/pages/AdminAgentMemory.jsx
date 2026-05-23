import { useEffect, useState } from 'react'
import { Brain, Search, AlertTriangle, RefreshCw } from 'lucide-react'
import { adminListUsers, adminMemorySummary, adminMemoryGraph } from '../api'
import AdminSidebar from '../components/AdminSidebar'
import MentalModelsPanel from '../components/MentalModelsPanel'
import { MemoryObservationCard, MemoryFactRow } from '../components/MemoryEntryCards'

function userLabel(user) {
  return user.display_name || user.email || `User ${user.id}`
}

export default function AdminAgentMemory() {
  const [users, setUsers] = useState([])
  const [userQuery, setUserQuery] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [summary, setSummary] = useState(null)
  const [graphData, setGraphData] = useState(null)
  const [graphError, setGraphError] = useState(null)
  const [graphLoading, setGraphLoading] = useState(false)
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

  const loadSummary = async (user, { refreshMentalModels = false } = {}) => {
    if (!user) return
    setSelectedUser(user)
    setLoadingSummary(true)
    setGraphLoading(true)
    setError(null)
    setGraphError(null)
    try {
      const data = await adminMemorySummary(String(user.id), {
        refresh_mental_models: refreshMentalModels,
      })
      setSummary(data)
    } catch (e) {
      setError(e.message || 'Failed to load memory summary')
      setSummary(null)
      setGraphData(null)
      setGraphLoading(false)
      setLoadingSummary(false)
      return
    } finally {
      setLoadingSummary(false)
    }

    try {
      const graph = await adminMemoryGraph(String(user.id))
      setGraphData(graph)
    } catch (e) {
      setGraphError(e.message || 'Failed to load memory graph')
      setGraphData(null)
    } finally {
      setGraphLoading(false)
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
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs uppercase tracking-wide text-app-muted mb-2">Selected user</div>
                  <div className="text-lg font-semibold text-app-text">{userLabel(selectedUser)}</div>
                  <div className="text-sm text-app-muted">{selectedUser.email}</div>
                  <div className="mt-2 text-xs text-app-muted">Total entries: {totals.total_entries ?? '—'}</div>
                </div>
                <button
                  type="button"
                  onClick={() => loadSummary(selectedUser, { refreshMentalModels: true })}
                  disabled={loadingSummary}
                  className="inline-flex items-center gap-2 rounded-lg border border-app-border px-3 py-2 text-xs text-app-muted hover:border-primary-500/40 hover:text-primary-400 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loadingSummary ? 'animate-spin' : ''}`} />
                  Refresh mental models
                </button>
              </div>
            </div>
          )}

          {loadingSummary && selectedUser && (
            <div className="rounded-xl border border-app-border bg-app-surface p-6 text-sm text-app-muted">
              Loading memory summary… Use &quot;Refresh mental models&quot; if curated models need regeneration (may take up to 3 minutes).
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
                      <MemoryObservationCard key={o.id || o.text} observation={o} />
                    ))
                  )}
                </div>
              </section>

              <MentalModelsPanel
                title="Mental models"
                subtitle="Curated documents maintained by Hindsight. Constellation map matches the Hindsight control-plane memory graph."
                models={curatedMental}
                observationsCount={observations.length}
                graphData={graphData}
                graphLoading={graphLoading}
                graphError={graphError}
                bankId={summary?.bank_id || (selectedUser ? `scout:user:${selectedUser.id}` : null)}
              />

              <section>
                <h2 className="text-lg font-semibold text-app-text mb-4">Recent facts</h2>
                <ul className="space-y-2.5">
                  {facts.length === 0 ? (
                    <li className="text-sm text-app-muted">No raw memories listed.</li>
                  ) : (
                    facts.map((f) => <MemoryFactRow key={f.id || `${f.text}-${f.mentioned_at}`} fact={f} />)
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
