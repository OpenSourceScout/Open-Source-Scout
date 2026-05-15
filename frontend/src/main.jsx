import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useOutletContext, Navigate } from 'react-router-dom'
import { FolderOpen } from 'lucide-react'
import LandingPage from './components/LandingPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import AnalysisLayout from './components/AnalysisLayout.jsx'
import Login from './pages/Login.jsx'
import Signup from './pages/Signup.jsx'
import OAuthCallback from './pages/OAuthCallback.jsx'
import IssueRanking from './pages/IssueRanking.jsx'
import CodeLocator from './pages/CodeLocator.jsx'
import ContributorBriefing from './pages/ContributorBriefing.jsx'
import QaReport from './pages/QaReport.jsx'
import EditorWindow from './pages/EditorWindow.jsx'
import Profile from './pages/Profile.jsx'
import Projects from './pages/Projects.jsx'
import AnalysisDashboard from './pages/AnalysisDashboard.jsx'
import SettingsPage from './pages/Settings.jsx'
import './index.css'
import { isLoggedIn, isAdmin } from './auth'

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

      <div className="space-y-6">
        {rankedRepos.ranked_repos.map((repo, index) => {
          const isSelected = repoInfo && repo.full_name === `${repoInfo.owner}/${repoInfo.name}`
          const repoName = repo.full_name.split('/')[1] || repo.full_name
          const owner = repo.full_name.split('/')[0] || ''

          return (
            <article
              key={repo.full_name}
              className={`bg-app-surface/50 border rounded-2xl p-6 transition-colors hover:bg-app-surface ${isSelected ? 'border-primary-500 shadow-lg shadow-primary-500/10' : 'border-app-border'}`}
            >
              {/* Header Section */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-5">
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg shrink-0 ${isSelected ? 'bg-primary-500 text-white border border-primary-400' : 'bg-app-elevated border border-app-border text-app-muted'}`}>
                    #{index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-xl text-app-text mb-1 flex items-center gap-2">
                      {repoName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-app-muted">
                      <span className="font-medium text-app-text/70">{owner}</span>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-amber-400/80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg> 
                          {repo.stargazers_count?.toLocaleString() || repo.stars?.toLocaleString() || 0}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <svg className="w-4 h-4 text-app-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> 
                          {repo.open_issues_count?.toLocaleString() || repo.open_issues?.toLocaleString() || 0} issues
                        </span>
                        {(repo.language) && (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-primary-500/80"></span> 
                            {repo.language}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 bg-app-bg px-4 py-2 border border-app-border rounded-xl">
                  <span className="text-xl font-bold text-primary-400">
                    {repo.score_total} <span className="text-sm font-medium text-app-muted">/100</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-app-muted">Match Score</span>
                </div>
              </div>

              {/* Description */}
              {repo.description && repo.description !== 'No description available' && (
                <p className="mb-6 text-base text-app-text/90 leading-relaxed">
                  {repo.description}
                </p>
              )}

              {/* Why it matches */}
              {repo.why_match && repo.why_match.length > 0 && (
                <div className="mb-6 bg-primary-500/5 rounded-xl p-4 border border-primary-500/10">
                  <p className="text-xs font-semibold text-primary-400 capitalize tracking-wide mb-3">Why it matches</p>
                  <ul className="text-sm text-app-text/80 space-y-2">
                    {repo.why_match.slice(0, 3).map((reason, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <svg className="w-4 h-4 text-primary-400/70 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        <span className="leading-snug">{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Metrics Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                {[
                  ['tech_match', 'Tech Match'],
                  ['beginner_friendliness', 'Beginner'],
                  ['activity', 'Activity'],
                  ['community', 'Community'],
                  ['issue_availability', 'Issues'],
                ].map(([key, label]) => (
                  <div key={key} className="p-3 bg-app-bg rounded-xl border border-app-border">
                    <div className="text-[11px] font-semibold tracking-wide text-app-muted uppercase mb-1">{label}</div>
                    <div className="font-medium text-app-text">{repo.score_breakdown?.[key] ?? '-'}</div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3 pt-6 border-t border-app-border/60">
                {isSelected && (
                  <span className="inline-flex w-fit items-center gap-2 rounded-lg bg-primary-500/10 text-primary-400 px-5 py-2.5 text-sm font-medium border border-primary-500/20">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Currently Selected
                  </span>
                )}
                <a
                  href={repo.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-app-border rounded-lg text-app-text hover:bg-app-elevated transition-colors text-sm font-medium"
                >
                  View Source
                </a>
              </div>
            </article>
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

function RequireAdmin({ children }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  if (!isAdmin()) {
    return <Navigate to="/dashboard" replace />
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
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/analysis" element={<RequireAuth><AnalysisLayout /></RequireAuth>}>
          <Route index element={<AnalysisDashboard />} />
          <Route path="repositories" element={<RepositoriesView />} />
          <Route path="issues" element={<IssueRanking />} />
          <Route path="code" element={<CodeLocator />} />
          <Route path="briefing" element={<ContributorBriefing />} />
          <Route path="qa-report" element={<RequireAdmin><QaReport /></RequireAdmin>} />
        </Route>
        <Route path="/editor" element={<RequireAuth><EditorWindow /></RequireAuth>} />
        <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
        <Route path="/projects" element={<RequireAuth><Projects /></RequireAuth>} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
