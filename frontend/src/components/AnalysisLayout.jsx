import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import AnalysisSidebar from './AnalysisSidebar'

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
      } catch (_) { }
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
        const match = location.state.repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/)
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
      <AnalysisSidebar
        repoInfo={repoInfo}
        onBackToRepos={rankedRepos ? handleBackToRepos : null}
        onClearAnalysis={clearAnalysis}
        hasRankedRepos={!!rankedRepos}
      />
      <main className="flex-1 overflow-y-auto bg-app-bg">
        <Outlet context={{ analysisResult, setAnalysisResult, repoInfo, repoUrl, rankedRepos }} />
      </main>
    </div>
  )
}
