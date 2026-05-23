import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, RefreshCw, Trash2 } from 'lucide-react'
import { fetchMemorySummary, resetMemoryBank, fetchMemoryGraph } from '../api'
import MentalModelsPanel from '../components/MentalModelsPanel'
import { MemoryObservationCard, MemoryFactRow } from '../components/MemoryEntryCards'

export default function AgentMemory() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [graphData, setGraphData] = useState(null)
  const [graphError, setGraphError] = useState(null)
  const [graphLoading, setGraphLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [resetStep, setResetStep] = useState(0)
  const [resetting, setResetting] = useState(false)

  const load = useCallback(({ refreshMentalModels = false } = {}) => {
    setError(null)
    setLoading(true)
    setGraphLoading(true)
    setGraphError(null)
    fetchMemorySummary({ refresh_mental_models: refreshMentalModels })
      .then(setData)
      .catch((e) => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
    fetchMemoryGraph()
      .then(setGraphData)
      .catch((e) => setGraphError(e.message || 'Failed to load memory graph'))
      .finally(() => setGraphLoading(false))
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
  const curatedMental = data?.mental_models || []
  const facts = data?.recent_facts || []
  const totals = data?.totals || {}
  const stats = data?.hindsight_stats || {}
  const empty =
    !loading &&
    observations.length === 0 &&
    curatedMental.length === 0 &&
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
              {data?.bank_id && (
                <p className="mt-2 text-xs font-mono text-app-muted/90">
                  Hindsight bank: <span className="text-primary-300">{data.bank_id}</span>
                  {stats.total_observations != null && (
                    <span className="ml-2 text-app-muted">
                      · {stats.total_observations} consolidated observation
                      {stats.total_observations === 1 ? '' : 's'} on server
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load({ refreshMentalModels: true })}
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

      {loading && !data && (
        <p className="text-app-muted text-sm">
          Loading memory… Curated mental models may take up to a minute to generate on first refresh.
        </p>
      )}
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
            <h2 className="text-lg font-semibold text-app-text mb-1">What I know about you</h2>
            <p className="text-xs text-app-muted mb-4 max-w-2xl">
              Consolidated observation summaries from your activity (automatic, not curated documents).
            </p>
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
            models={curatedMental}
            observationsCount={observations.length}
            graphData={graphData}
            graphLoading={graphLoading}
            graphError={graphError}
            bankId={data?.bank_id}
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
