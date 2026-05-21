import { ThumbsUp, ThumbsDown, Check } from 'lucide-react'
import { useFeedbackActions } from '../context/FeedbackContext'

export function RepoFeedbackBar({ repo, compact = false }) {
  const { getVote, isSkipped, sendThumbs, sendRepoSkip } = useFeedbackActions()
  const vote = getVote('repo', repo.full_name)
  const skipped = isSkipped(repo.url)

  const btnPad = compact ? 'p-1.5' : 'p-2'
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <>
      <button
        type="button"
        disabled={skipped}
        onClick={() => sendRepoSkip(repo.url)}
        className={`inline-flex items-center gap-2 px-5 py-2.5 border rounded-lg text-sm font-medium transition-all duration-200 ${
          skipped
            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400 cursor-default'
            : 'border-app-border text-app-muted hover:bg-app-elevated'
        }`}
      >
        {skipped ? (
          <>
            <Check className="w-4 h-4 shrink-0" />
            Skipped
          </>
        ) : (
          'Skip'
        )}
      </button>
      <div
        className={`flex items-center gap-1 border rounded-lg p-1 bg-app-bg ${
          vote ? 'border-primary-500/30' : 'border-app-border'
        }`}
      >
        <button
          type="button"
          title="Helpful match"
          aria-pressed={vote === 'up'}
          onClick={() =>
            sendThumbs({ target_type: 'repo', target_id: repo.full_name, vote: 'up' })
          }
          className={`${btnPad} rounded-md transition-all duration-200 ${
            vote === 'up'
              ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40 scale-105'
              : 'text-app-muted hover:text-emerald-400 hover:bg-app-elevated'
          }`}
        >
          <ThumbsUp className={`${iconSize} ${vote === 'up' ? 'fill-current' : ''}`} />
        </button>
        <button
          type="button"
          title="Not a good match"
          aria-pressed={vote === 'down'}
          onClick={() =>
            sendThumbs({ target_type: 'repo', target_id: repo.full_name, vote: 'down' })
          }
          className={`${btnPad} rounded-md transition-all duration-200 ${
            vote === 'down'
              ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40 scale-105'
              : 'text-app-muted hover:text-red-400 hover:bg-app-elevated'
          }`}
        >
          <ThumbsDown className={`${iconSize} ${vote === 'down' ? 'fill-current' : ''}`} />
        </button>
      </div>
    </>
  )
}

export function IssueFeedbackThumbs({ issue, compact = true }) {
  const { getVote, sendThumbs } = useFeedbackActions()
  const targetId = issue.html_url || issue.url || String(issue.number)
  const vote = getVote('issue', targetId)
  const btnPad = compact ? 'p-1.5' : 'p-2'
  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <div
      className={`flex items-center gap-1 rounded-lg border p-1 bg-app-bg ${
        vote ? 'border-primary-500/30' : 'border-app-border'
      }`}
    >
      <button
        type="button"
        title="Good suggestion"
        aria-pressed={vote === 'up'}
        onClick={() =>
          sendThumbs({ target_type: 'issue', target_id: targetId, vote: 'up' })
        }
        className={`${btnPad} rounded-md transition-all duration-200 ${
          vote === 'up'
            ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
            : 'text-app-muted hover:text-emerald-400'
        }`}
      >
        <ThumbsUp className={`${iconSize} ${vote === 'up' ? 'fill-current' : ''}`} />
      </button>
      <button
        type="button"
        title="Poor suggestion"
        aria-pressed={vote === 'down'}
        onClick={() =>
          sendThumbs({ target_type: 'issue', target_id: targetId, vote: 'down' })
        }
        className={`${btnPad} rounded-md transition-all duration-200 ${
          vote === 'down'
            ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
            : 'text-app-muted hover:text-red-400'
        }`}
      >
        <ThumbsDown className={`${iconSize} ${vote === 'down' ? 'fill-current' : ''}`} />
      </button>
    </div>
  )
}

export function BriefingFeedbackThumbs({ briefingId }) {
  const { getVote, sendThumbs } = useFeedbackActions()
  const vote = getVote('briefing', briefingId)

  return (
    <div
      className={`flex items-center gap-1 rounded-lg border p-1 bg-app-bg ${
        vote ? 'border-primary-500/30' : 'border-app-border'
      }`}
    >
      <button
        type="button"
        title="Briefing helpful"
        aria-pressed={vote === 'up'}
        onClick={() =>
          sendThumbs({ target_type: 'briefing', target_id: briefingId, vote: 'up' })
        }
        className={`p-2 rounded-md transition-all duration-200 ${
          vote === 'up'
            ? 'bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40'
            : 'text-app-muted hover:text-emerald-400'
        }`}
      >
        <ThumbsUp className={`w-4 h-4 ${vote === 'up' ? 'fill-current' : ''}`} />
      </button>
      <button
        type="button"
        title="Briefing not helpful"
        aria-pressed={vote === 'down'}
        onClick={() =>
          sendThumbs({ target_type: 'briefing', target_id: briefingId, vote: 'down' })
        }
        className={`p-2 rounded-md transition-all duration-200 ${
          vote === 'down'
            ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40'
            : 'text-app-muted hover:text-red-400'
        }`}
      >
        <ThumbsDown className={`w-4 h-4 ${vote === 'down' ? 'fill-current' : ''}`} />
      </button>
    </div>
  )
}
