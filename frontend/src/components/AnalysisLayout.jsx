import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import AnalysisSidebar from './AnalysisSidebar'

export default function AnalysisLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const [repoInfo, setRepoInfo] = useState(() => {
    // Try to restore from sessionStorage
    const saved = sessionStorage.getItem('scout_repoInfo')
    return saved ? JSON.parse(saved) : null
  })
  const [analysisResult, setAnalysisResult] = useState(() => {
    const saved = sessionStorage.getItem('scout_analysisResult')
    return saved ? JSON.parse(saved) : null
  })
  const [rankedRepos, setRankedRepos] = useState(() => {
    const saved = sessionStorage.getItem('scout_rankedRepos')
    return saved ? JSON.parse(saved) : null
  })

  useEffect(() => {
    // Get data from navigation state (when coming from Dashboard)
    if (location.state) {
      if (location.state.result) {
        setAnalysisResult(location.state.result)
        sessionStorage.setItem('scout_analysisResult', JSON.stringify(location.state.result))
      }
      if (location.state.repoUrl) {
        // Extract repo info from URL
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
    sessionStorage.removeItem('scout_rankedRepos')
    setAnalysisResult(null)
    setRepoInfo(null)
    setRankedRepos(null)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <AnalysisSidebar 
        repoInfo={repoInfo} 
        onBackToRepos={rankedRepos ? handleBackToRepos : null}
        onClearAnalysis={clearAnalysis}
      />
      <main className="flex-1 overflow-y-auto">
        <Outlet context={{ analysisResult, repoInfo, rankedRepos }} />
      </main>
    </div>
  )
}
