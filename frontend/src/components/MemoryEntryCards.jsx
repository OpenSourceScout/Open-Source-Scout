import { FreshnessBadge, FactKindBadge } from './MemoryBadges'
import { formatMemoryDate } from '../utils/formatMemoryDate'

export function MemoryObservationCard({ observation }) {
  return (
    <article className="rounded-xl border border-app-border bg-app-surface/80 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <p className="text-sm leading-relaxed text-app-text/90">{observation.text}</p>
        <FreshnessBadge freshness={observation.freshness} className="self-start" />
      </div>
    </article>
  )
}

export function MemoryFactRow({ fact }) {
  const when = formatMemoryDate(fact.mentioned_at)

  return (
    <li className="rounded-xl border border-app-border bg-app-surface/60 px-4 py-3.5 sm:px-5">
      <div className="flex flex-col gap-2.5 sm:grid sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-x-4">
        <FactKindBadge kind={fact.kind} className="self-start" />
        <p className="text-sm leading-relaxed text-app-text/90 min-w-0">{fact.text}</p>
        {when && (
          <time
            dateTime={fact.mentioned_at}
            className="shrink-0 text-[11px] leading-none text-app-muted sm:pt-0.5 sm:text-right tabular-nums"
          >
            {when}
          </time>
        )}
      </div>
    </li>
  )
}
