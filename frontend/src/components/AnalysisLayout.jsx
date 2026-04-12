import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect, useCallback } from 'react'
import { PanelLeft } from 'lucide-react'
import AnalysisSidebar from './AnalysisSidebar'

const SIDEBAR_OPEN_KEY = 'scout_analysis_sidebar_open'

export default function AnalysisLayout() {
  const location = useLocation()
  const navigate = useNavigate()
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
    }
  }, [location.state])

  const handleBackToRepos = () => {
    if (rankedRepos) {
      navigate('/dashboard', { state: { rankedRepos } })
    } else {
      navigate('/dashboard')
    }
  }

  const clearAnalysis = () => {
    sessionStorage.removeItem('scout_analysisResult')
    sessionStorage.removeItem('scout_repoInfo')
    sessionStorage.removeItem('scout_repoUrl')
    sessionStorage.removeItem('scout_rankedRepos')
    setAnalysisResultRaw(null)
    setRepoInfo(null)
    setRepoUrl(null)
    setRankedRepos(null)
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
          onBackToRepos={rankedRepos ? handleBackToRepos : null}
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
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto bg-app-bg">
        <Outlet
          context={{
            analysisResult,
            setAnalysisResult,
            repoInfo,
            repoUrl,
            rankedRepos,
            analysisNavOpen,
            toggleAnalysisNav,
          }}
        />
      </main>
    </div>
  )
}
