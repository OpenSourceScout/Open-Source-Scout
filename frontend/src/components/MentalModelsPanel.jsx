import { useEffect, useMemo, useState } from 'react'
import { mentalModelDescription, mentalModelEmptyHint } from '../utils/mentalModelText'
import MemoryConstellationGraph from './MemoryConstellationGraph'

export default function MentalModelsPanel({
  models = [],
  observationsCount = 0,
  graphData,
  graphLoading,
  graphError,
  bankId,
  title = "Mental models I've built",
  subtitle = 'Living documents maintained by Hindsight. Explore the constellation map below, then read each curated model.',
}) {
  const [selectedId, setSelectedId] = useState(null)

  const selected = useMemo(
    () => models.find((m) => m.id === selectedId) || models[0] || null,
    [models, selectedId],
  )

  useEffect(() => {
    if (models.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !models.some((m) => m.id === selectedId)) {
      setSelectedId(models[0].id)
    }
  }, [models, selectedId])

  const body = selected ? mentalModelDescription(selected) : null

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-app-text mb-1">{title}</h2>
        <p className="text-xs text-app-muted max-w-3xl">{subtitle}</p>
      </div>

      <MemoryConstellationGraph
        graphData={graphData}
        loading={graphLoading}
        error={graphError}
        bankId={bankId}
      />

      {models.length === 0 ? (
        <p className="text-sm text-app-muted">
          {observationsCount > 0
            ? 'Models are being created or refreshed — click Refresh in a few seconds.'
            : 'None yet. Use the app (feedback, skips, analysis), then refresh.'}
        </p>
      ) : (
        <div className="grid min-h-[320px] overflow-hidden rounded-xl border border-app-border bg-app-surface lg:grid-cols-[minmax(220px,280px)_1fr]">
          <aside className="border-b border-app-border lg:border-b-0 lg:border-r">
            <div className="border-b border-app-border px-3 py-2 text-[11px] uppercase tracking-wide text-app-muted">
              Curated models
            </div>
            <ul className="max-h-[360px] overflow-y-auto">
              {models.map((m) => {
                const active = selected?.id === m.id
                const preview = mentalModelDescription(m)
                return (
                  <li key={m.id || m.title}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      className={`w-full border-b border-app-border/60 px-3 py-3 text-left transition-colors ${
                        active
                          ? 'bg-primary-500/10 text-primary-300'
                          : 'text-app-muted hover:bg-app-elevated hover:text-app-text'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-app-text truncate">{m.title}</span>
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium leading-none text-emerald-200 ring-1 ring-emerald-400/20">
                          <span className="h-1 w-1 rounded-full bg-emerald-400" aria-hidden />
                          Curated
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-app-muted/90">
                        {preview || 'Generating…'}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ul>
          </aside>

          <article className="flex min-h-[280px] flex-col p-4">
            {selected ? (
              <>
                <header className="mb-3 border-b border-app-border pb-3">
                  <h3 className="text-base font-semibold text-app-text">{selected.title}</h3>
                  {selected.created_at && (
                    <p className="mt-1 text-xs text-app-muted">
                      Last updated{' '}
                      {typeof selected.created_at === 'string'
                        ? selected.created_at
                        : String(selected.created_at)}
                    </p>
                  )}
                </header>
                <div className="flex-1 overflow-y-auto">
                  {body ? (
                    <div className="prose prose-invert max-w-none text-sm leading-relaxed text-app-text/90 whitespace-pre-wrap">
                      {body}
                    </div>
                  ) : (
                    <p className="text-sm italic text-amber-300/90">
                      {mentalModelEmptyHint(observationsCount > 0)}
                    </p>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-app-muted">Select a mental model.</p>
            )}
          </article>
        </div>
      )}
    </section>
  )
}
