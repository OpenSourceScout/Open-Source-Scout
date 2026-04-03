import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useOutletContext, Navigate } from 'react-router-dom'
import { LayoutDashboard, FolderOpen, Check, Star, Wrench, Monitor } from 'lucide-react'
import LandingPage from './components/LandingPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import AnalysisLayout from './components/AnalysisLayout.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import IssueRanking from './pages/IssueRanking.jsx'
import CodeLocator from './pages/CodeLocator.jsx'
import ContributorBriefing from './pages/ContributorBriefing.jsx'
import QaReport from './pages/QaReport.jsx'
import EditorWindow from './pages/EditorWindow.jsx'
import Profile from './pages/Profile.jsx'
import Projects from './pages/Projects.jsx'
import AnalysisDashboard from './pages/AnalysisDashboard.jsx'
import './index.css'
import { isLoggedIn } from './auth'

// RepositoriesView - shows ranked repos from tech stack search
function RepositoriesView() {
  const context = useOutletContext()
  const rankedRepos = context?.rankedRepos
  const repoInfo = context?.repoInfo

  if (!rankedRepos || !rankedRepos.ranked_repos || rankedRepos.ranked_repos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh] bg-app-bg">
        <div className="text-center px-4">
          <div className="w-20 h-20 bg-primary-500/15 border border-primary-500/25 rounded-full flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-10 h-10 text-primary-400" />
          </div>
          <h2 className="text-2xl font-semibold text-app-text mb-2">No Repositories</h2>
          <p className="text-app-muted max-w-sm mx-auto">No ranked repositories available. Use tech stack search from the Dashboard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 bg-app-bg min-h-full">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-app-text">Discovered Repositories</h2>
        <p className="text-app-muted text-sm">
          {rankedRepos.ranked_repos.length} repositories matched your tech stack: {rankedRepos.tech_stack?.join(', ')}
        </p>
      </div>

      <div className="space-y-4">
        {rankedRepos.ranked_repos.map((repo, index) => {
          const isSelected = repoInfo && repo.full_name === `${repoInfo.owner}/${repoInfo.name}`
          return (
            <div
              key={repo.full_name}
              className={`bg-app-surface border rounded-xl p-5 transition-all duration-200 ${
                isSelected
                  ? 'border-primary-500 ring-2 ring-primary-500/20 shadow-lg shadow-black/20'
                  : 'border-app-border hover:border-primary-500/30'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold border ${
                      isSelected
                        ? 'bg-primary-500 text-white border-primary-400'
                        : 'bg-app-elevated text-app-muted border-app-border'
                    }`}
                  >
                    #{index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-app-text">{repo.full_name.split('/')[1]}</h3>
                    <p className="text-app-muted text-sm">{repo.full_name.split('/')[0]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isSelected && (
                    <span className="bg-primary-500 text-white px-2 py-1 rounded-full text-xs font-medium">Selected</span>
                  )}
                  <span className="bg-accent-500/15 text-accent-400 border border-accent-500/25 px-3 py-1 rounded-full text-sm font-medium">
                    {repo.score_total}/100
                  </span>
                </div>
              </div>

              <p className="text-app-muted text-sm mb-4">{repo.description}</p>

              {repo.why_match && repo.why_match.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-app-muted mb-1">Why it matches:</p>
                  <ul className="text-sm text-app-text space-y-1">
                    {repo.why_match.slice(0, 3).map((reason, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-accent-400 shrink-0 mt-0.5" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-5 gap-2 mb-4">
                {[
                  ['tech_match', 'Tech Match'],
                  ['beginner_friendliness', 'Beginner'],
                  ['activity', 'Activity'],
                  ['community', 'Community'],
                  ['issue_availability', 'Issues'],
                ].map(([key, label]) => (
                  <div key={key} className="text-center p-2 bg-app-bg rounded-lg border border-app-border">
                    <div className="text-xs text-app-muted">{label}</div>
                    <div className="font-semibold text-app-text">{repo.score_breakdown?.[key] ?? '-'}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 text-sm text-app-muted mb-4">
                <span className="flex items-center gap-1">
                  <Star className="w-4 h-4" /> {repo.stars?.toLocaleString() ?? 0}
                </span>
                <span className="flex items-center gap-1">
                  <Wrench className="w-4 h-4" /> {repo.open_issues ?? 0} open issues
                </span>
                {repo.language && (
                  <span className="flex items-center gap-1">
                    <Monitor className="w-4 h-4" /> {repo.language}
                  </span>
                )}
              </div>

              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-app-border rounded-lg text-app-muted hover:border-primary-500/50 hover:text-primary-400 transition-colors text-sm"
              >
                View on GitHub →
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RequireAuth({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return children
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/analysis" element={<RequireAuth><AnalysisLayout /></RequireAuth>}>
          <Route index element={<AnalysisDashboard />} />
          <Route path="repositories" element={<RepositoriesView />} />
          <Route path="issues" element={<IssueRanking />} />
          <Route path="code" element={<CodeLocator />} />
          <Route path="briefing" element={<ContributorBriefing />} />
          <Route path="qa-report" element={<QaReport />} />
        </Route>
        <Route path="/editor" element={<RequireAuth><EditorWindow /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
