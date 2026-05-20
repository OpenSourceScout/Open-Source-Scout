import { useEffect, useMemo, useState } from 'react'
import { Search, Users, FolderKanban, Gauge, AlertTriangle, ChevronDown } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { adminDecisionTraces, adminListUsers } from '../api'
import AdminSidebar from '../components/AdminSidebar'

function traceRows(run) {
  const rows = run?.trace
  return Array.isArray(rows) ? rows : []
}

function parseMeta(row) {
  try {
    const q = row?.query
    if (typeof q === 'object' && q !== null) return q
    if (typeof q === 'string' && q.startsWith('{')) return JSON.parse(q)
  } catch {
    /* ignore */
  }
  return {}
}

function aggregateByAgent(rows) {
  const map = new Map()
  for (const row of rows) {
    const meta = parseMeta(row)
    const agent = meta.agent_name || row.agent || row.role || 'unknown'
    const cost = Number(meta.estimated_cost_usd ?? row.estimated_cost_usd ?? row.cost ?? 0) || 0
    const prev = map.get(agent) || { agent, cost: 0, steps: 0 }
    prev.cost += cost
    prev.steps += 1
    map.set(agent, prev)
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

function MetaPanel({ meta, raw, context }) {
  const header = context
    ? {
        context,
        meta,
        raw,
      }
    : meta
  const text =
    Object.keys(meta || {}).length > 0 || context
      ? JSON.stringify(header, null, 2)
      : typeof raw === 'string'
        ? raw
        : JSON.stringify(raw ?? {}, null, 2)
  return (
    <pre className="max-h-72 overflow-auto rounded-lg border border-app-border bg-app-bg p-3 font-mono text-[11px] text-app-muted whitespace-pre-wrap break-all">
      {text}
    </pre>
  )
}

function buildAggregateRun(rows, totals) {
  return {
    mode: 'aggregate',
    run_id: 'aggregate',
    step_count: totals.steps,
    cost: totals.cost,
    tool_calls: totals.toolCalls,
    trace: rows,
  }
}

function projectLabel(project) {
  const repo = project.repo_full_name || project.repo_url || 'unknown repo'
  return `${project.project_name || 'Project'} · ${repo}`
}

function userLabel(user) {
  const name = user.display_name || user.email || `User ${user.id}`
  return name
}

export default function AdminDecisionTrace() {
  const [users, setUsers] = useState([])
  const [projects, setProjects] = useState([])
  const [scope, setScope] = useState('all')
  const [userQuery, setUserQuery] = useState('')
  const [selectedUserId, setSelectedUserId] = useState(null)
  const [selectedProjectId, setSelectedProjectId] = useState(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingProjects, setLoadingProjects] = useState(true)
  const [error, setError] = useState(null)
  const [expandedRow, setExpandedRow] = useState(null)

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

  useEffect(() => {
    let active = true
    setLoadingProjects(true)
    setError(null)
    const userId = scope === 'all' ? null : selectedUserId
    adminDecisionTraces({ user_id: userId })
      .then((data) => {
        if (!active) return
        setProjects(data.projects || [])
      })
      .catch((e) => {
        if (!active) return
        setError(e.message || 'Failed to load decision traces')
      })
      .finally(() => {
        if (!active) return
        setLoadingProjects(false)
      })
    return () => {
      active = false
    }
  }, [scope, selectedUserId])

  useEffect(() => {
    if (scope === 'all') {
      setSelectedUserId(null)
      setSelectedProjectId(null)
    }
    if (scope === 'user') {
      setSelectedProjectId(null)
    }
  }, [scope])

  const selectedUser = users.find((u) => String(u.id) === String(selectedUserId)) || null

  const userProjects = useMemo(() => {
    if (!selectedUserId) return []
    return projects.filter((p) => String(p.user_id) === String(selectedUserId))
  }, [projects, selectedUserId])

  const traceProjects = useMemo(() => {
    return projects.filter((p) => p.cascadeflow_run && traceRows(p.cascadeflow_run).length > 0)
  }, [projects])

  const selectedProject = useMemo(() => {
    if (!selectedProjectId) return null
    return projects.find((p) => String(p.project_id) === String(selectedProjectId)) || null
  }, [projects, selectedProjectId])

  const aggregated = useMemo(() => {
    const scopeProjects =
      scope === 'all'
        ? traceProjects
        : scope === 'user'
          ? traceProjects.filter((p) => String(p.user_id) === String(selectedUserId))
          : selectedProject
            ? [selectedProject]
            : []

    const rows = []
    let totalCost = 0
    let totalSteps = 0
    let totalToolCalls = 0
    const usersSet = new Set()
    for (const project of scopeProjects) {
      if (project.user_id != null) usersSet.add(project.user_id)
      const run = project.cascadeflow_run
      const trace = traceRows(run)
      totalSteps += trace.length
      totalCost += Number(run?.cost ?? 0) || 0
      totalToolCalls += Number(run?.tool_calls ?? 0) || 0
      for (const row of trace) {
        rows.push({
          ...row,
          _context: {
            user_id: project.user_id,
            user_display_name: project.user_display_name,
            user_email: project.user_email,
            project_id: project.project_id,
            project_name: project.project_name,
            repo_full_name: project.repo_full_name,
          },
        })
      }
    }
    return {
      users: usersSet.size,
      projects: scopeProjects.length,
      rows,
      totals: { cost: totalCost, steps: totalSteps, toolCalls: totalToolCalls },
    }
  }, [scope, traceProjects, selectedUserId, selectedProject])

  const runSummary = buildAggregateRun(aggregated.rows, aggregated.totals)
  const chartData = aggregateByAgent(aggregated.rows)
  const showUserColumn = scope !== 'project'

  return (
    <div className="h-screen bg-app-bg text-app-text flex overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <header className="sticky top-0 z-10 border-b border-app-border bg-app-bg/95 px-6 py-4 backdrop-blur-sm">
          <h1 className="text-lg font-semibold text-app-text">Decision Trace (Admin)</h1>
          <p className="mt-1 text-sm text-app-muted max-w-3xl">
            Unified decision trace across all users, a single user, or a specific project. Search for a user, then drill
            into their projects to inspect runtime steps and costs.
          </p>
        </header>

        <div className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full p-6">

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr] min-h-0 h-full">
        <div className="flex flex-col gap-4 min-h-0">
          <div className="rounded-xl border border-app-border bg-app-surface p-4 flex flex-col min-h-0">
            <div className="text-xs uppercase tracking-wide text-app-muted mb-2">Scope</div>
            <div className="space-y-2">
              {[
                { id: 'all', label: 'All users' },
                { id: 'user', label: 'Per user' },
                { id: 'project', label: 'Per project' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScope(item.id)}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    scope === item.id
                      ? 'border-primary-500/40 bg-primary-500/10 text-primary-300'
                      : 'border-app-border text-app-muted hover:border-primary-500/40 hover:text-app-text'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-app-muted" />
              <div className="text-xs uppercase tracking-wide text-app-muted">Users</div>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-app-muted" />
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Search users"
                className="w-full rounded-lg border border-app-border bg-app-bg px-9 py-2 text-sm text-app-text placeholder:text-app-muted/60"
              />
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
              {loadingUsers && <p className="text-xs text-app-muted">Loading users...</p>}
              {!loadingUsers && users.length === 0 && (
                <p className="text-xs text-app-muted">No users found.</p>
              )}
              {users.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    setSelectedUserId(u.id)
                    setScope('user')
                  }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    String(selectedUserId) === String(u.id)
                      ? 'border-primary-500/40 bg-primary-500/10 text-primary-300'
                      : 'border-app-border text-app-muted hover:border-primary-500/40 hover:text-app-text'
                  }`}
                >
                  <div className="text-sm text-app-text truncate">{userLabel(u)}</div>
                  <div className="text-[11px] text-app-muted truncate">{u.email}</div>
                </button>
              ))}
            </div>
          </div>

          {scope !== 'all' && (
            <div className="rounded-xl border border-app-border bg-app-surface p-4">
              <div className="flex items-center gap-2 mb-2">
                <FolderKanban className="h-4 w-4 text-app-muted" />
                <div className="text-xs uppercase tracking-wide text-app-muted">Projects</div>
              </div>
              <div className="relative">
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value || null)
                    setScope('project')
                  }}
                  className="w-full appearance-none rounded-lg border border-app-border bg-app-bg px-3 py-2 pr-9 text-sm text-app-text"
                >
                  <option value="">Select a project</option>
                  {userProjects.map((p) => (
                    <option key={p.project_id} value={p.project_id}>
                      {projectLabel(p)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-2.5 h-4 w-4 text-app-muted" />
              </div>
              {selectedUser && (
                <p className="mt-2 text-xs text-app-muted">Showing projects for {userLabel(selectedUser)}.</p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5 min-h-0 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Users', value: aggregated.users, icon: Users },
              { label: 'Projects', value: aggregated.projects, icon: FolderKanban },
              { label: 'Total steps', value: aggregated.totals.steps, icon: Gauge },
            ].map((card) => (
              <div key={card.label} className="rounded-xl border border-app-border bg-app-surface p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-app-muted">
                  <card.icon className="h-4 w-4" />
                  {card.label}
                </div>
                <div className="mt-2 text-2xl font-semibold text-app-text">{card.value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-app-border bg-app-surface p-4">
            <div className="text-xs uppercase tracking-wide text-app-muted mb-2">Cost summary</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <div className="rounded-lg border border-app-border bg-app-bg px-3 py-2">
                Total cost: <span className="font-mono text-primary-300">${Number(runSummary.cost || 0).toFixed(6)}</span>
              </div>
              <div className="rounded-lg border border-app-border bg-app-bg px-3 py-2">
                Tool calls: <span className="font-mono text-primary-300">{runSummary.tool_calls || 0}</span>
              </div>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="rounded-xl border border-app-border bg-app-surface p-4">
              <h2 className="text-sm font-semibold text-app-text mb-4">Estimated cost by agent</h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <XAxis dataKey="agent" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8 }}
                      labelStyle={{ color: '#e2e8f0' }}
                    />
                    <Legend />
                    <Bar dataKey="cost" name="USD (est.)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
            <div className="border-b border-app-border px-4 py-3 bg-app-elevated flex items-center justify-between">
              <h2 className="text-sm font-semibold text-app-text">Decision steps</h2>
              {loadingProjects && <span className="text-xs text-app-muted">Loading…</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-app-bg text-app-muted text-left text-xs uppercase tracking-wide">
                  <tr>
                    {showUserColumn && <th className="px-3 py-2">User</th>}
                    {showUserColumn && <th className="px-3 py-2">Project</th>}
                    <th className="px-3 py-2">Action</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2">Agent</th>
                    <th className="px-3 py-2">Cost</th>
                    <th className="px-3 py-2 w-20">Meta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {aggregated.rows.length === 0 && !loadingProjects ? (
                    <tr>
                      <td colSpan={showUserColumn ? 7 : 5} className="px-3 py-8 text-center text-app-muted">
                        No decision traces found for this scope.
                      </td>
                    </tr>
                  ) : (
                    aggregated.rows.map((row, i) => {
                      const meta = parseMeta(row)
                      const agent = meta.agent_name || row.agent || row.role || '—'
                      const cost = Number(meta.estimated_cost_usd ?? row.estimated_cost_usd ?? row.cost ?? 0) || 0
                      const context = row._context || {}
                      const isOpen = expandedRow === i
                      return (
                        <>
                          <tr key={i} className="hover:bg-app-bg/80">
                            {showUserColumn && (
                              <td className="px-3 py-2 text-xs text-app-muted">
                                {context.user_display_name || context.user_email || context.user_id || '—'}
                              </td>
                            )}
                            {showUserColumn && (
                              <td className="px-3 py-2 text-xs text-app-muted">
                                {context.project_name || context.repo_full_name || context.project_id || '—'}
                              </td>
                            )}
                            <td className="px-3 py-2 font-medium text-app-text">{row.action ?? '—'}</td>
                            <td className="px-3 py-2 text-app-muted">{row.reason ?? '—'}</td>
                            <td className="px-3 py-2 text-app-text">{agent}</td>
                            <td className="px-3 py-2 font-mono text-xs text-primary-300">{cost.toFixed(6)}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setExpandedRow(isOpen ? null : i)}
                                className="text-xs font-medium text-primary-400 hover:text-primary-300"
                              >
                                {isOpen ? 'Hide' : 'View'}
                              </button>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-app-bg/60">
                              <td colSpan={showUserColumn ? 7 : 5} className="px-4 py-3">
                                <div className="rounded-xl border border-app-border bg-app-surface p-3">
                                  <div className="text-[11px] uppercase tracking-wide text-app-muted mb-2">
                                    Meta snapshot
                                  </div>
                                  <MetaPanel meta={meta} raw={row.query} context={context} />
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
          </div>
        </div>
      </main>
    </div>
  )
}
