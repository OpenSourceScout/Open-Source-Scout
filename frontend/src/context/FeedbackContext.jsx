import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { feedbackRepoSelection, feedbackThumbs } from '../api'
import FeedbackToast from '../components/FeedbackToast'

const STORAGE_KEY = 'scout_feedback_state_v1'

const FeedbackContext = createContext(null)

function loadState() {
  if (typeof window === 'undefined') return {}
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function persistState(next) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode */
  }
}

function thumbsKey(targetType, targetId) {
  return `thumbs:${targetType}:${targetId}`
}

function skipKey(repoUrl) {
  return `skip:repo:${repoUrl}`
}

export function FeedbackProvider({ children }) {
  const [state, setState] = useState(loadState)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const id = setTimeout(() => setToast(null), 2600)
    return () => clearTimeout(id)
  }, [toast])

  const patchState = useCallback((updater) => {
    setState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      persistState(next)
      return next
    })
  }, [])

  const getVote = useCallback(
    (targetType, targetId) => state[thumbsKey(targetType, targetId)] || null,
    [state],
  )

  const isSkipped = useCallback((repoUrl) => !!state[skipKey(repoUrl)], [state])

  const sendThumbs = useCallback(
    async ({ target_type, target_id, vote }) => {
      const key = thumbsKey(target_type, target_id)
      patchState((prev) => ({ ...prev, [key]: vote }))
      try {
        await feedbackThumbs({ target_type, target_id, vote })
        setToast(vote === 'up' ? 'Marked as helpful' : 'Marked as not helpful')
      } catch {
        patchState((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setToast('Could not save feedback. Try again.')
      }
    },
    [patchState],
  )

  const sendRepoSkip = useCallback(
    async (repoUrl) => {
      const key = skipKey(repoUrl)
      patchState((prev) => ({ ...prev, [key]: true }))
      try {
        await feedbackRepoSelection({ repo_url: repoUrl, action: 'skipped' })
        setToast('Repository skipped')
      } catch {
        patchState((prev) => {
          const next = { ...prev }
          delete next[key]
          return next
        })
        setToast('Could not save skip. Try again.')
      }
    },
    [patchState],
  )

  const value = useMemo(
    () => ({ getVote, isSkipped, sendThumbs, sendRepoSkip }),
    [getVote, isSkipped, sendThumbs, sendRepoSkip],
  )

  return (
    <FeedbackContext.Provider value={value}>
      <FeedbackToast message={toast} />
      {children}
    </FeedbackContext.Provider>
  )
}

export function useFeedbackActions() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) {
    throw new Error('useFeedbackActions must be used within FeedbackProvider')
  }
  return ctx
}
