const FRESHNESS_STYLES = {
  stable: {
    pill: 'bg-slate-500/10 text-slate-200 ring-1 ring-slate-400/20',
    dot: 'bg-slate-400',
  },
  strengthening: {
    pill: 'bg-emerald-500/10 text-emerald-200 ring-1 ring-emerald-400/25',
    dot: 'bg-emerald-400',
  },
  weakening: {
    pill: 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/25',
    dot: 'bg-amber-400',
  },
  stale: {
    pill: 'bg-red-500/10 text-red-200 ring-1 ring-red-400/25',
    dot: 'bg-red-400',
  },
}

const KIND_STYLES = {
  world: {
    pill: 'bg-sky-500/10 text-sky-200 ring-1 ring-sky-400/20',
    dot: 'bg-sky-400',
  },
  experience: {
    pill: 'bg-violet-500/10 text-violet-200 ring-1 ring-violet-400/20',
    dot: 'bg-violet-400',
  },
  opinion: {
    pill: 'bg-amber-500/10 text-amber-200 ring-1 ring-amber-400/20',
    dot: 'bg-amber-400',
  },
  observation: {
    pill: 'bg-teal-500/10 text-teal-200 ring-1 ring-teal-400/20',
    dot: 'bg-teal-400',
  },
}

const DEFAULT_KIND = {
  pill: 'bg-app-elevated text-app-muted ring-1 ring-app-border',
  dot: 'bg-app-muted',
}

function labelText(value, fallback) {
  const raw = (value || fallback || '').toString().trim()
  if (!raw) return fallback
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
}

function StatusPill({ styles, label, className = '' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium leading-none ${styles.pill} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${styles.dot}`} aria-hidden />
      {label}
    </span>
  )
}

export function FreshnessBadge({ freshness, className = '' }) {
  const key = (freshness || 'stable').toLowerCase()
  const styles = FRESHNESS_STYLES[key] || FRESHNESS_STYLES.stable
  return <StatusPill styles={styles} label={labelText(freshness, 'Stable')} className={className} />
}

export function FactKindBadge({ kind, className = '' }) {
  const key = (kind || 'world').toLowerCase()
  const styles = KIND_STYLES[key] || DEFAULT_KIND
  return <StatusPill styles={styles} label={labelText(kind, 'World')} className={className} />
}
