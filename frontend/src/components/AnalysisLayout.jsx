import { Outlet, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { PanelLeft } from 'lucide-react'
import AnalysisSidebar from './AnalysisSidebar'
import { isAdmin } from '../auth'
import { subscribeCodeReviewSync } from '../utils/codeReviewSync'

const SIDEBAR_OPEN_KEY = 'scout_analysis_sidebar_open'

export default function AnalysisLayout() {
  const location = useLocation()
  const [repoInfo, setRepoInfo] = useState(() => {
    const saved = sessionStorage.getItem('scout_repoInfo')
    return saved ? JSON.parse(saved) : null
  })
  const [repoUrl, setRepoUrl] = useState(() => {
    const saved = sessionStorage.getItem('scout_repoUrl')
    if (saved) return saved
    // Fallback: reconstruct from repoInfo (owner/name) that was already stored
    const repoInfoSaved = sessionStorage.getItem('scout_repoInfo')
    if (repoInfoSaved) {
      try {
        const info = JSON.parse(repoInfoSaved)
        if (info.owner && info.name) return `https://github.com/${info.owner}/${info.name}`
      } catch (e) { 
        // ignore parsing errors
      }
    }
    return null
  })
  const [analysisResult, setAnalysisResultRaw] = useState(() => {
    const saved = sessionStorage.getItem('scout_analysisResult')
    return saved ? JSON.parse(saved) : null
  })
  const [rankedRepos, setRankedRepos] = useState(() => {
    const saved = sessionStorage.getItem('scout_rankedRepos')
    return saved ? JSON.parse(saved) : null
  })
  const [analysisNavOpen, setAnalysisNavOpen] = useState(() => {
    try {
      const v = sessionStorage.getItem(SIDEBAR_OPEN_KEY)
      if (v === '0') return false
      return true
    } catch {
      return true
    }
  })

  // Project-level state for step persistence
  const [activeProjectId, setActiveProjectId] = useState(() => {
    try {
      const v = sessionStorage.getItem('scout_activeProjectId')
      return v ? parseInt(v, 10) : null
    } catch {
      return null
    }
  })
  const [issueLocked, setIssueLocked] = useState(() => {
    try {
      return sessionStorage.getItem('scout_issueLocked') === '1'
    } catch {
      return false
    }
  })

  const cascadeflowRun = useMemo(
    () => analysisResult?.cascadeflow_run ?? rankedRepos?.cascadeflow_run ?? null,
    [analysisResult, rankedRepos],
  )

  // Persist activeProjectId and issueLocked to sessionStorage
  useEffect(() => {
    if (activeProjectId != null) {
      sessionStorage.setItem('scout_activeProjectId', String(activeProjectId))
    } else {
      sessionStorage.removeItem('scout_activeProjectId')
    }
  }, [activeProjectId])

  useEffect(() => {
    sessionStorage.setItem('scout_issueLocked', issueLocked ? '1' : '0')
  }, [issueLocked])

  const toggleAnalysisNav = useCallback(() => {
    setAnalysisNavOpen((prev) => {
      const next = !prev
      try {
        sessionStorage.setItem(SIDEBAR_OPEN_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  // Persist analysisResult to sessionStorage whenever it changes
  const setAnalysisResult = (result) => {
    setAnalysisResultRaw(result)
    if (result) {
      sessionStorage.setItem('scout_analysisResult', JSON.stringify(result))
    } else {
      sessionStorage.removeItem('scout_analysisResult')
    }
  }

  useEffect(() => {
    return subscribeCodeReviewSync(({ analysisResult: incoming }) => {
      if (incoming) {
        setAnalysisResult(incoming)
      }
    })
  }, [])

  useEffect(() => {
    if (location.state) {
      if (location.state.result) {
        setAnalysisResult(location.state.result)
      }
      if (location.state.repoUrl) {
        setRepoUrl(location.state.repoUrl)
        sessionStorage.setItem('scout_repoUrl', location.state.repoUrl)
        const match = location.state.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
        if (match) {
          const info = { owner: match[1], name: match[2] }
          setRepoInfo(info)
          sessionStorage.setItem('scout_repoInfo', JSON.stringify(info))
        }
      }
      if (location.state.rankedRepos) {
        setRankedRepos(location.state.rankedRepos)
        sessionStorage.setItem('scout_rankedRepos', JSON.stringify(location.state.rankedRepos))
      }
      // Pick up project context from navigation state
      if (location.state.activeProjectId != null) {
        setActiveProjectId(location.state.activeProjectId)
      }
      if (location.state.issueLocked != null) {
        setIssueLocked(!!location.state.issueLocked)
      }
    }
  }, [location.state])

  const clearAnalysis = () => {
    sessionStorage.removeItem('scout_analysisResult')
    sessionStorage.removeItem('scout_repoInfo')
    sessionStorage.removeItem('scout_repoUrl')
    sessionStorage.removeItem('scout_rankedRepos')
    sessionStorage.removeItem('scout_activeProjectId')
    sessionStorage.removeItem('scout_issueLocked')
    setAnalysisResultRaw(null)
    setRepoInfo(null)
    setRepoUrl(null)
    setRankedRepos(null)
    setActiveProjectId(null)
    setIssueLocked(false)
  }

  return (
    <div className="h-screen overflow-hidden bg-app-bg flex text-app-text">
      <div
        className={`shrink-0 h-full overflow-hidden transition-[width] duration-200 ease-out ${
          analysisNavOpen ? 'w-64' : 'w-0'
        }`}
      >
        <AnalysisSidebar
          repoInfo={repoInfo}
          onClearAnalysis={clearAnalysis}
          hasRankedRepos={!!rankedRepos}
          onCollapseNav={toggleAnalysisNav}
        />
      </div>
      {!analysisNavOpen && (
        <button
          type="button"
          onClick={toggleAnalysisNav}
          className="fixed left-3 top-24 z-40 flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm font-medium text-app-text shadow-lg hover:border-primary-500/40 hover:text-primary-400 transition-colors"
          aria-label="Show navigation"
        >
          <PanelLeft className="w-4 h-4" />
          Menu
        </button>
      )}
      <main className="flex-1 min-w-0 min-h-0 overflow-hidden bg-app-bg flex flex-col">
        <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-app-border bg-app-bg/95 px-4 py-2 text-[11px] backdrop-blur-sm shrink-0">
          {isAdmin() && (
            <>
              <span className="rounded-full border border-app-border bg-app-surface px-2 py-1 font-mono text-app-muted">
                cascadeflow: {cascadeflowRun?.mode ?? '—'}
              </span>
              {cascadeflowRun != null && cascadeflowRun.cost != null && (
                <span className="rounded-full border border-primary-500/20 bg-primary-500/10 px-2 py-1 font-mono text-primary-300">
                  ~${Number(cascadeflowRun.cost).toFixed(5)} USD
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <Outlet
            context={{
              analysisResult,
              setAnalysisResult,
              repoInfo,
              repoUrl,
              rankedRepos,
              analysisNavOpen,
              toggleAnalysisNav,
              activeProjectId,
              setActiveProjectId,
              issueLocked,
              setIssueLocked,
              cascadeflowRun,
            }}
          />
        </div>
      </main>
    </div>
  )
}

