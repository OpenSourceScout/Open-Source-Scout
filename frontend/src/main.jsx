import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useOutletContext } from 'react-router-dom'
import { LayoutDashboard, FolderOpen, Check, Star, Wrench, Monitor } from 'lucide-react'
import LandingPage from './components/LandingPage.jsx'
import Dashboard from './components/Dashboard.jsx'
import AnalysisLayout from './components/AnalysisLayout.jsx'
import IssueRanking from './pages/IssueRanking.jsx'
import CodeLocator from './pages/CodeLocator.jsx'
import ContributorBriefing from './pages/ContributorBriefing.jsx'
import QaReport from './pages/QaReport.jsx'
import EditorWindow from './pages/EditorWindow.jsx'
import './index.css'

// Analysis Dashboard placeholder
function AnalysisDashboard() {
  return (
    <div className="flex items-center justify-center h-full bg-gray-50">
      <div className="text-center">
        <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <LayoutDashboard className="w-10 h-10 text-primary-600" />
        </div>
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Analysis Dashboard</h2>
        <p className="text-gray-500">Select a view from the sidebar to explore your analysis results.</p>
      </div>
    </div>
  )
}

// Repositories view - shows ranked repos from tech stack search
function RepositoriesView() {
  const context = useOutletContext()
  const rankedRepos = context?.rankedRepos
  const repoInfo = context?.repoInfo

  if (!rankedRepos || !rankedRepos.ranked_repos || rankedRepos.ranked_repos.length === 0) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <FolderOpen className="w-10 h-10 text-primary-600" />
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">No Repositories</h2>
          <p className="text-gray-500">No ranked repositories available. Use tech stack search from the Dashboard.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Discovered Repositories</h2>
        <p className="text-gray-500 text-sm">
          {rankedRepos.ranked_repos.length} repositories matched your tech stack: {rankedRepos.tech_stack?.join(', ')}
        </p>
      </div>

      <div className="space-y-4">
        {rankedRepos.ranked_repos.map((repo, index) => {
          const isSelected = repoInfo && repo.full_name === `${repoInfo.owner}/${repoInfo.name}`
          return (
            <div
              key={repo.full_name}
              className={`bg-white border rounded-xl p-5 transition-shadow ${
                isSelected 
                  ? 'border-primary-500 ring-2 ring-primary-100 shadow-md' 
                  : 'border-gray-200 hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-semibold ${
                    isSelected ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600'
                  }`}>
                    #{index + 1}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{repo.full_name.split('/')[1]}</h3>
                    <p className="text-gray-500 text-sm">{repo.full_name.split('/')[0]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isSelected && (
                    <span className="bg-primary-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                      Selected
                    </span>
                  )}
                  <span className="bg-accent-100 text-accent-700 px-3 py-1 rounded-full text-sm font-medium">
                    {repo.score_total}/100
                  </span>
                </div>
              </div>

              <p className="text-gray-600 text-sm mb-4">{repo.description}</p>

              {/* Why it matches */}
              {repo.why_match && repo.why_match.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-gray-500 mb-1">Why it matches:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {repo.why_match.slice(0, 3).map((reason, i) => (
<li key={i} className="flex items-start gap-2">
                      <Check className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                      <span>{reason}</span>
                    </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Score breakdown */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500">Tech Match</div>
                  <div className="font-semibold text-gray-900">{repo.score_breakdown?.tech_match ?? '-'}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500">Beginner</div>
                  <div className="font-semibold text-gray-900">{repo.score_breakdown?.beginner_friendliness ?? '-'}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500">Activity</div>
                  <div className="font-semibold text-gray-900">{repo.score_breakdown?.activity_score ?? '-'}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500">Community</div>
                  <div className="font-semibold text-gray-900">{repo.score_breakdown?.community_score ?? '-'}</div>
                </div>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-xs text-gray-500">Issues</div>
                  <div className="font-semibold text-gray-900">{repo.score_breakdown?.issue_availability ?? '-'}</div>
                </div>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                <span className="flex items-center gap-1"><Star className="w-4 h-4" /> {repo.stars?.toLocaleString() ?? 0}</span>
                <span className="flex items-center gap-1"><Wrench className="w-4 h-4" /> {repo.open_issues ?? 0} open issues</span>
                {repo.language && <span className="flex items-center gap-1"><Monitor className="w-4 h-4" /> {repo.language}</span>}
              </div>

              <a
                href={repo.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors text-sm"
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/analysis" element={<AnalysisLayout />}>
          <Route index element={<AnalysisDashboard />} />
          <Route path="repositories" element={<RepositoriesView />} />
          <Route path="issues" element={<IssueRanking />} />
          <Route path="code" element={<CodeLocator />} />
          <Route path="briefing" element={<ContributorBriefing />} />
          <Route path="qa-report" element={<QaReport />} />
        </Route>
        <Route path="/editor" element={<EditorWindow />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
