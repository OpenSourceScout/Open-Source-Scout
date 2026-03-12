import { useState } from 'react'
import { runAnalyze, searchReposByTechStack, getFileContent, pushFile, exportPdf } from './api'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import IssueRanking from './components/IssueRanking'
import CodeLocator from './components/CodeLocator'
import Briefing from './components/Briefing'
import RepoRanking from './components/RepoRanking'
import './App.css'

const TABS = [
  { id: 'issues', label: '🏆 Issue Ranking' },
  { id: 'code', label: '🔍 Code Locator' },
  { id: 'briefing', label: '📋 Contributor Briefing' },
]

// View modes for the app
const VIEW_MODE = {
  WELCOME: 'welcome',
  REPO_SELECTION: 'repo_selection',
  ANALYSIS: 'analysis',
  VIEW_REPOS: 'view_repos'  // View repos after analysis (read-only)
}

function App() {
  const [results, setResults] = useState(null)
  const [repoSearchResults, setRepoSearchResults] = useState(null)
  const [selectedRepo, setSelectedRepo] = useState(null)  // Track which repo was selected
  const [viewMode, setViewMode] = useState(VIEW_MODE.WELCOME)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('issues')

  const handleAnalyze = async (config) => {
    setLoading(true)
    setError(null)
    setRepoSearchResults(null)
    setSelectedRepo(null)
    try {
      const data = await runAnalyze(config)
      setResults(data)
      setViewMode(VIEW_MODE.ANALYSIS)
      setActiveTab('issues')
    } catch (err) {
      setError(err.message)
      setResults({ success: false, error: err.message })
      setViewMode(VIEW_MODE.ANALYSIS)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchRepos = async (config) => {
    setLoading(true)
    setError(null)
    setResults(null)
    setSelectedRepo(null)
    try {
      const data = await searchReposByTechStack(config)
      setRepoSearchResults(data)
      setViewMode(VIEW_MODE.REPO_SELECTION)
    } catch (err) {
      setError(err.message)
      setRepoSearchResults(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectRepo = async (repo) => {
    // When user selects a repo, run the full analysis
    // Keep repoSearchResults so user can go back
    setLoading(true)
    setError(null)
    setSelectedRepo(repo)
    try {
      const data = await runAnalyze({
        repo_url: repo.url,
        beginner_only: true,
        fast_model: 'openai/gpt-oss-120b',
        powerful_model: 'llama-3.3-70b'
      })
      setResults(data)
      setViewMode(VIEW_MODE.ANALYSIS)
      setActiveTab('issues')
    } catch (err) {
      setError(err.message)
      setResults({ success: false, error: err.message })
      setViewMode(VIEW_MODE.ANALYSIS)
    } finally {
      setLoading(false)
    }
  }

  const handleBackToRepos = () => {
    setViewMode(VIEW_MODE.VIEW_REPOS)
  }

  const handleBackToAnalysis = () => {
    setViewMode(VIEW_MODE.ANALYSIS)
  }

  const renderContent = () => {
    // Show repo selection view (initial selection)
    if (viewMode === VIEW_MODE.REPO_SELECTION && repoSearchResults) {
      return (
        <div className="repo-selection-view">
          {repoSearchResults.tech_stack && (
            <div className="tech-stack-info">
              <strong>Your Tech Stack:</strong>{' '}
              {repoSearchResults.tech_stack.join(', ')}
            </div>
          )}
          <RepoRanking
            repos={repoSearchResults.ranked_repos}
            onSelectRepo={handleSelectRepo}
            loading={loading}
            readOnly={false}
          />
        </div>
      )
    }

    // Show repos in read-only mode (viewing after analysis)
    if (viewMode === VIEW_MODE.VIEW_REPOS && repoSearchResults) {
      return (
        <div className="repo-selection-view">
          <div className="view-repos-header">
            <button className="btn-back" onClick={handleBackToAnalysis}>
              ← Back to Analysis
            </button>
            <span className="view-repos-note">
              Viewing previous repository search results (selection disabled)
            </span>
          </div>
          {repoSearchResults.tech_stack && (
            <div className="tech-stack-info">
              <strong>Your Tech Stack:</strong>{' '}
              {repoSearchResults.tech_stack.join(', ')}
            </div>
          )}
          <RepoRanking
            repos={repoSearchResults.ranked_repos}
            onSelectRepo={() => { }}
            loading={false}
            readOnly={true}
            selectedRepoName={selectedRepo?.full_name}
          />
        </div>
      )
    }

    // Show analysis view
    if (viewMode === VIEW_MODE.ANALYSIS) {
      return (
        <>
          {/* Back to repos button when we have repo search results */}
          {repoSearchResults && (
            <div className="back-to-repos">
              <button className="btn-back-repos" onClick={handleBackToRepos}>
                📋 View Top 5 Repositories
              </button>
            </div>
          )}
          {results?.success && results.repo && (
            <div className="repo-info">
              <strong>Repository:</strong>{' '}
              <a href={results.repo.html_url} target="_blank" rel="noreferrer">
                {results.repo.full_name}
              </a>
              {' | '}
              <strong>Language:</strong> {results.repo.language || 'Unknown'}
              {' | '}
              <strong>Stars:</strong> ⭐ {results.repo.stargazers_count}
              {' | '}
              <strong>Open Issues:</strong> 📋 {results.repo.open_issues_count}
              {results.duration_seconds && (
                <span className="duration">
                  {' | '}Analysis completed in {results.duration_seconds.toFixed(1)}s
                </span>
              )}
            </div>
          )}
          <div className="tabs">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                className={`tab ${activeTab === id ? 'active' : ''}`}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="tab-content">
            {activeTab === 'issues' && (results?.success ? (
              <IssueRanking results={results} />
            ) : (
              <div className="empty-state">
                {results?.error ? `Error: ${results.error}` : 'Run an analysis to see issue rankings'}
              </div>
            ))}
            {activeTab === 'code' && (results?.success ? <CodeLocator results={results} /> : (
              <div className="empty-state">Run an analysis to see code locations</div>
            ))}
            {activeTab === 'briefing' && (results?.success ? <Briefing results={results} /> : (
              <div className="empty-state">Run an analysis to see the briefing document</div>
            ))}
          </div>
        </>
      )
    }

    // Show welcome view
    return (
      <div className="welcome">
        <h2>Welcome to Open Source Scout! 🎉</h2>
        <p>This tool helps you find and contribute to open-source projects by:</p>
        <ol>
          <li><strong>🔍 Finding beginner-friendly issues</strong> – We analyze and rank issues</li>
          <li><strong>📍 Locating relevant code</strong> – We search the codebase to find where to make changes</li>
          <li><strong>📝 Generating a contribution guide</strong> – We create a detailed briefing with fix plans and PR drafts</li>
        </ol>

        <h3>Two Ways to Start</h3>
        <div className="start-options">
          <div className="start-option">
            <h4>📦 Option 1: Enter Repository URL</h4>
            <p>If you know which project you want to contribute to, enter the GitHub URL directly.</p>
          </div>
          <div className="start-option">
            <h4>🛠️ Option 2: Enter Your Tech Stack</h4>
            <p>Tell us your skills (Python, React, etc.) and we&apos;ll find the best matching repositories for you!</p>
          </div>
        </div>

        <h3>Getting Started</h3>
        <ol>
          <li>Choose your input mode in the sidebar (Repository URL or Tech Stack)</li>
          <li>Enter your repository URL or add your technologies</li>
          <li>Click the action button to start</li>
          <li>Explore the results and start contributing!</li>
        </ol>
        <p>Use one of the demo repos in the sidebar, or paste any public GitHub repository URL.</p>
      </div>
    )
  }

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar
          onAnalyze={handleAnalyze}
          onSearchRepos={handleSearchRepos}
          loading={loading}
        />
        <main className="main">
          {error && (
            <div className="alert alert-error">
              ❌ {error}
            </div>
          )}
          {renderContent()}
        </main>
      </div>
    </div>
  )
}

export default App
