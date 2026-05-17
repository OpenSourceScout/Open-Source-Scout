import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, RefreshCw, Trash2 } from 'lucide-react'
import { fetchMemorySummary, resetMemoryBank } from '../api'

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

export default function AgentMemory() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resetStep, setResetStep] = useState(0)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(() => {
    setError(null)
    setLoading(true)
    fetchMemorySummary()
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  const observations = data?.observations || []
  const mental = data?.mental_models || []
  const facts = data?.recent_facts || []
  const totals = data?.totals || {}
  const empty =
    !loading &&
    observations.length === 0 &&
    mental.length === 0 &&
    facts.length === 0 &&
    (totals.total_entries ?? 0) === 0

  const handleReset = async () => {
    if (resetStep === 0) {
      setResetStep(1)
      return
    }
    setResetting(true)
    try {
      await resetMemoryBank()
      setResetStep(0)
      load()
    } catch (e) {
      setError(e.message || 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="min-h-full bg-app-bg text-app-text p-6">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-app-border pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-primary-500/25 bg-primary-500/10">
              <Brain className="h-6 w-6 text-primary-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Agent Memory</h1>
              <p className="mt-1 text-sm text-app-muted max-w-2xl">
                Observations and facts retained for your account via Hindsight (per-user bank).
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-app-border px-4 py-2 text-sm text-app-muted hover:border-primary-500/40 hover:text-primary-400 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="rounded-lg border border-app-border px-4 py-2 text-sm text-app-muted hover:border-primary-500/40 hover:text-primary-400"
          >
            ← Dashboard
          </button>
        </div>
      </header>

      {data?.hindsight_enabled === false && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Hindsight is not active on the server. Set <span className="font-mono">HINDSIGHT_API_URL</span> and{' '}
          <span className="font-mono">HINDSIGHT_API_KEY</span> in <span className="font-mono">.env</span>, then restart
          the backend (<span className="font-mono">uvicorn</span>).
        </div>
      )}

      {loading && !data && <p className="text-app-muted text-sm">Loading memory…</p>}
      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {empty && !loading && (
        <div className="rounded-2xl border border-app-border bg-app-surface p-12 text-center">
          <p className="text-app-muted max-w-lg mx-auto leading-relaxed">
            Nothing stored yet for this account. Memories are saved when you use thumbs up/down on repos or briefings,
            skip a repo, export a briefing (PDF/Markdown), or interact with issues — and when{' '}
            <span className="text-app-text/90">HINDSIGHT_API_URL</span> /{' '}
            <span className="text-app-text/90">HINDSIGHT_API_KEY</span> are set on the server. Refresh after a few
            seconds once you&apos;ve done that.
          </p>
        </div>
      )}

      {!loading && !empty && (
        <div className="space-y-10">
          <section>
            <h2 className="text-lg font-semibold text-app-text mb-4">What I know about you</h2>
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
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${freshnessBadge(o.freshness)}`}
                    >
                      {o.freshness || 'stable'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-app-text mb-4">Mental models I&apos;ve built</h2>
            <ul className="space-y-2">
              {mental.length === 0 ? (
                <li className="text-sm text-app-muted">None yet.</li>
              ) : (
                mental.map((m) => (
                  <li key={m.id || m.title} className="rounded-lg border border-app-border bg-app-surface px-4 py-3 text-sm">
                    <span className="font-medium text-app-text">{m.title}</span>
                    {m.created_at && (
                      <span className="ml-2 text-xs text-app-muted">
                        · {typeof m.created_at === 'string' ? m.created_at : String(m.created_at)}
                      </span>
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

      <div className="mt-12 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-6">
        <h3 className="text-sm font-semibold text-red-200 mb-2 flex items-center gap-2">
          <Trash2 className="w-4 h-4" /> Reset memory
        </h3>
        <p className="text-xs text-app-muted mb-4 max-w-xl">
          Deletes your entire memory bank for this user id. This cannot be undone.
        </p>
        {resetStep === 1 && (
          <p className="text-xs text-amber-400 mb-3">Click again to confirm permanent deletion.</p>
        )}
        <button
          type="button"
          disabled={resetting}
          onClick={handleReset}
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
        >
          {resetStep === 0 ? 'Reset memory…' : resetting ? 'Resetting…' : 'Confirm reset'}
        </button>
      </div>
    </div>
  )
}
