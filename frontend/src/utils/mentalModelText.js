/** Hindsight placeholder before reflect completes or when the bank has no memories yet. */
export function isMentalModelPlaceholder(text) {
  if (!text || typeof text !== 'string') return true
  const t = text.trim()
  if (!t) return true
  return /^i\s+don'?t\s+have\s+information\.?$/i.test(t)
    || /^no\s+information\.?$/i.test(t)
    || /^not\s+enough\s+information\.?$/i.test(t)
}

export function mentalModelDescription(m) {
  const desc = m?.description || ''
  if (!isMentalModelPlaceholder(desc)) return desc
  return null
}

export function mentalModelEmptyHint(hasObservations) {
  if (hasObservations) {
    return 'Content is being generated from stored memories. Click Refresh — the first load can take up to a minute.'
  }
  return 'No memories yet. Use feedback, skips, or run a search/analysis, then refresh.'
}
