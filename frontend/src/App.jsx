import { useState } from 'react'
import { runAnalyze, getFileContent, pushFile, exportPdf } from './api'
import Header from './components/Header'
import Sidebar from './components/Sidebar'
import IssueRanking from './components/IssueRanking'
import CodeLocator from './components/CodeLocator'
import Briefing from './components/Briefing'
import './App.css'

const TABS = [
  { id: 'issues', label: '🏆 Issue Ranking' },
  { id: 'code', label: '🔍 Code Locator' },
  { id: 'briefing', label: '📋 Contributor Briefing' },
]

function App() {
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('issues')

  const handleAnalyze = async (config) => {
    setLoading(true)
    setError(null)
    try {
      const data = await runAnalyze(config)
      setResults(data)
      setActiveTab('issues')
    } catch (err) {
      setError(err.message)
      setResults({ success: false, error: err.message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <Header />
      <div className="app-body">
        <Sidebar onAnalyze={handleAnalyze} loading={loading} />
        <main className="main">
          {error && (
            <div className="alert alert-error">
              ❌ {error}
            </div>
          )}
          {results?.success ? (
            <>
              {results.repo && (
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
                {activeTab === 'issues' && <IssueRanking results={results} />}
                {activeTab === 'code' && <CodeLocator results={results} />}
                {activeTab === 'briefing' && <Briefing results={results} />}
              </div>
            </>
          ) : (
            <div className="welcome">
              <h2>Welcome to Open Source Scout! 🎉</h2>
              <p>This tool helps you find and contribute to open-source projects by:</p>
              <ol>
                <li><strong>🔍 Finding beginner-friendly issues</strong> – We analyze and rank issues</li>
                <li><strong>📍 Locating relevant code</strong> – We search the codebase to find where to make changes</li>
                <li><strong>📝 Generating a contribution guide</strong> – We create a detailed briefing with fix plans and PR drafts</li>
              </ol>
              <h3>Getting Started</h3>
              <ol>
                <li>Enter a GitHub repository URL in the sidebar</li>
                <li>Choose your options (beginner mode, model selection)</li>
                <li>Click &quot;Generate Analysis&quot;</li>
                <li>Explore the results across the three tabs</li>
              </ol>
              <p>Use one of the demo repos in the sidebar, or paste any public GitHub repository URL.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
