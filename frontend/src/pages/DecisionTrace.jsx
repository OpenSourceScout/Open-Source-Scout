import { useOutletContext } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts'

function traceRows(run) {
  const rows = run?.trace
  return Array.isArray(rows) ? rows : []
}

function aggregateByAgent(rows) {
  const map = new Map()
  for (const row of rows) {
    let meta = {}
    try {
      const q = typeof row.query === 'string' ? row.query : ''
      const parsed = q.startsWith('{') ? JSON.parse(q) : {}
      meta = parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      meta = {}
    }
    const agent = meta.agent_name || row.agent || row.role || 'unknown'
    const cost = Number(meta.estimated_cost_usd ?? row.estimated_cost_usd ?? row.cost ?? 0) || 0
    const prev = map.get(agent) || { agent, cost: 0, steps: 0 }
    prev.cost += cost
    prev.steps += 1
    map.set(agent, prev)
  }
  return [...map.values()].sort((a, b) => b.cost - a.cost)
}

export default function DecisionTrace() {
  const { cascadeflowRun } = useOutletContext() || {}
  const run = cascadeflowRun || {}
  const rows = traceRows(run)
  const chartData = aggregateByAgent(rows)

  return (
    <div className="min-h-full bg-app-bg text-app-text p-6">
      <header className="mb-8 border-b border-app-border pb-6">
        <h1 className="text-2xl font-bold tracking-tight">Decision Trace</h1>
        <p className="mt-2 text-sm text-app-muted max-w-3xl">
          Runtime routing and estimated spend from the last pipeline bound to this session (cascadeflow observe/enforce mode).
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-10">
        {[
          ['Mode', run.mode ?? '—'],
          ['Run ID', run.run_id ?? '—'],
          ['Estimated cost (USD)', run.cost != null ? Number(run.cost).toFixed(6) : '—'],
          ['Budget remaining', run.budget_remaining != null ? Number(run.budget_remaining).toFixed(6) : '—'],
          ['Budget max', run.budget_max != null ? String(run.budget_max) : '—'],
          ['Steps', run.step_count != null ? String(run.step_count) : String(rows.length)],
          ['Latency used (ms)', run.latency_used_ms != null ? String(run.latency_used_ms) : '—'],
          ['Tool calls', run.tool_calls != null ? String(run.tool_calls) : '—'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-app-border bg-app-surface p-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-app-muted">{k}</div>
            <div className="mt-1 font-mono text-sm text-app-text break-all">{v}</div>
          </div>
        ))}
      </div>

      {chartData.length > 0 && (
        <div className="mb-10 h-72 rounded-xl border border-app-border bg-app-surface p-4">
          <h2 className="text-sm font-semibold text-app-text mb-4">Estimated cost by agent</h2>
          <ResponsiveContainer width="100%" height="90%">
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
      )}

      <div className="rounded-xl border border-app-border bg-app-surface overflow-hidden">
        <div className="border-b border-app-border px-4 py-3 bg-app-elevated">
          <h2 className="text-sm font-semibold text-app-text">Steps</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-app-bg text-app-muted text-left text-xs uppercase tracking-wide">
              <tr>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Meta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-app-muted">
                    No trace rows yet. Run repository search or analysis with cascadeflow enabled (not &quot;off&quot; mode).
                  </td>
                </tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={i} className="hover:bg-app-bg/80">
                    <td className="px-3 py-2 font-medium text-app-text">{row.action ?? '—'}</td>
                    <td className="px-3 py-2 text-app-muted max-w-xs truncate">{row.reason ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-xs text-primary-300">{row.model ?? '—'}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-app-muted max-w-xl truncate">{row.query ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
