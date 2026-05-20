const STORAGE_KEY = 'scout_feedback_state_v1'

/** Normalize GitHub URL or owner/repo to lowercase owner/repo. */
export function normalizeRepoId(urlOrName) {
  if (!urlOrName || typeof urlOrName !== 'string') return ''
  const s = urlOrName.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '')
  const m = s.match(/github\.com\/([^/]+\/[^/]+)/)
  if (m) return m[1]
  if (s.includes('/') && !s.includes(' ')) return s
  return s
}

export function loadSkippedRepoIds() {
  if (typeof window === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const state = JSON.parse(raw)
    return Object.keys(state)
      .filter((k) => k.startsWith('skip:repo:') && state[k])
      .map((k) => normalizeRepoId(k.slice('skip:repo:'.length)))
      .filter(Boolean)
  } catch {
    return []
  }
}

export function filterRankedRepos(repos, skippedIds) {
  if (!Array.isArray(repos) || !skippedIds?.length) return repos || []
  const blocked = new Set(skippedIds.map(normalizeRepoId).filter(Boolean))
  return repos.filter((repo) => {
    const id = normalizeRepoId(repo.full_name || repo.url)
    return id && !blocked.has(id)
  })
}

export function filterPathfinderResult(result, skippedIds) {
  if (!result?.ranked_repos) return result
  const filtered = filterRankedRepos(result.ranked_repos, skippedIds)
  return {
    ...result,
    ranked_repos: filtered,
    skipped_filtered_count: (result.ranked_repos?.length || 0) - filtered.length,
  }
}
