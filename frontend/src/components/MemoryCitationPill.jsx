import { useState, useEffect, useRef } from 'react'
import { fetchMemoryByIds } from '../api'

export default function MemoryCitationPill({
  recalledMemoryIds = [],
  memorySummary = '',
  compact = false,
}) {
  const ids = (recalledMemoryIds || []).filter(Boolean)
  const label =
    memorySummary ||
    (ids.length ? `Influenced by ${ids.length} past memor${ids.length === 1 ? 'y' : 'ies'}` : '')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [err, setErr] = useState(null)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open || ids.length === 0) return
    let cancelled = false
    setLoading(true)
    setErr(null)
    fetchMemoryByIds(ids.slice(0, 24))
      .then((data) => {
        if (!cancelled) setItems(data.memories || [])
      })
      .catch((e) => {
        if (!cancelled) setErr(e.message || 'Could not load citations')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, ids])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!label && ids.length === 0) return null

  return (
    <span ref={rootRef} className={`relative inline-flex align-middle ${compact ? '' : 'my-1'}`}>
      <button
        type="button"
        onClick={() => ids.length && setOpen((v) => !v)}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
          ids.length
            ? 'border-primary-500/35 bg-primary-500/10 text-primary-300 hover:border-primary-400/60 cursor-pointer'
            : 'border-app-border bg-app-elevated text-app-muted cursor-default'
        }`}
        title={ids.length ? 'Show memory citations' : ''}
      >
        <span aria-hidden="true">≡</span>
        <span>{label}</span>
      </button>
      {open && ids.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 max-h-64 overflow-y-auto rounded-lg border border-app-border bg-app-surface p-3 text-left shadow-xl">
          {loading && <p className="text-xs text-app-muted">Loading…</p>}
          {err && <p className="text-xs text-red-400">{err}</p>}
          {!loading && !err && (
            <ul className="space-y-2 text-xs text-app-muted">
              {(items.length ? items : ids.map((id) => ({ memory_id: id, text: '' }))).map((row, i) => (
                <li key={row.memory_id || i} className="border-b border-app-border/60 pb-2 last:border-0 last:pb-0">
                  <div className="font-mono text-[10px] text-app-muted/70 truncate">{row.memory_id}</div>
                  <div className="text-app-text/90 whitespace-pre-wrap">{row.text || '—'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </span>
  )
}
