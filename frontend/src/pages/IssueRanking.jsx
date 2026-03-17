import { useOutletContext, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ClipboardList, FileText, Search, ArrowLeft } from 'lucide-react'
import { reAnalyzeIssue } from '../api'

function getDifficultyFromLabels(labels) {
  if (!labels || labels.length === 0) return null
  const labelLower = labels.map(l => l.toLowerCase())
  if (labelLower.some(l => l.includes('good first') || l.includes('beginner') || l.includes('easy'))) {
    return 'easy'
  }
  if (labelLower.some(l => l.includes('medium') || l.includes('intermediate'))) {
    return 'medium'
  }
  if (labelLower.some(l => l.includes('hard') || l.includes('advanced') || l.includes('complex'))) {
    return 'hard'
  }
  return null
}

function getDifficultyColor(difficulty) {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
    case 'beginner':
      return 'bg-green-100 text-green-700'
    case 'medium':
    case 'intermediate':
      return 'bg-yellow-100 text-yellow-700'
    case 'hard':
    case 'advanced':
      return 'bg-red-100 text-red-700'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

export default function IssueRanking() {
  const { analysisResult, setAnalysisResult, repoUrl, rankedRepos } = useOutletContext()
  const navigate = useNavigate()
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [filterDifficulty, setFilterDifficulty] = useState('all')
  const [analyzingIssue, setAnalyzingIssue] = useState(null)   // issue number being re-analyzed
  const [analyzeError, setAnalyzeError] = useState(null)

  const issues = analysisResult?.agent1_output?.ranked_issues || []

  const filteredIssues = filterDifficulty === 'all'
    ? issues
    : issues.filter(i => {
      const diff = getDifficultyFromLabels(i.labels)
      return diff === filterDifficulty
    })

  const handleIssueSelect = (issue) => {
    setSelectedIssue(issue)
    setAnalyzeError(null)
  }

  const handleViewCode = async (issue) => {
    if (!repoUrl) {
      setAnalyzeError('Repository URL not found. Please re-run the analysis from the Dashboard.')
      return
    }
    setAnalyzingIssue(issue.number)
    setAnalyzeError(null)
    try {
      const result = await reAnalyzeIssue({
        repo_url: repoUrl,
        issue_number: issue.number,
        pathfinder_output: rankedRepos || undefined,
      })
      // Merge new agent2/agent3 outputs into the shared analysisResult
      setAnalysisResult({
        ...analysisResult,
        target_issue: result.target_issue,
        agent2_output: result.agent2_output,
        agent3_output: result.agent3_output,
        testing_output: result.testing_output,
      })
      navigate('/analysis/code')
    } catch (err) {
      setAnalyzeError(err.message || 'Re-analysis failed. Please try again.')
    } finally {
      setAnalyzingIssue(null)
    }
  }

  if (!analysisResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-gray-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Analysis Data</h2>
          <p className="text-gray-500 mb-4">Run an analysis first to see issue rankings.</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Issue Ranking</h1>
            <p className="text-sm text-gray-500">
              {issues.length} issues analyzed and ranked by contribution potential
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={filterDifficulty}
              onChange={(e) => setFilterDifficulty(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="all">All Difficulties</option>
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Issue List */}
        <div className="w-1/2 border-r border-gray-200 overflow-y-auto">
          <div className="p-4 space-y-3">
            {filteredIssues.map((issue, index) => {
              const difficulty = getDifficultyFromLabels(issue.labels)
              return (
                <div
                  key={issue.number || index}
                  onClick={() => handleIssueSelect(issue)}
                  className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${selectedIssue?.number === issue.number
                    ? 'border-primary-300 ring-2 ring-primary-100'
                    : 'border-gray-200 hover:border-gray-300'
                    }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">#{issue.number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(difficulty)}`}>
                        {difficulty || 'Standard'}
                      </span>
                    </div>
                    <span className={`font-semibold ${getScoreColor(issue.score_total)}`}>
                      {issue.score_total}/100
                    </span>
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1 line-clamp-2">
                    {issue.title}
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {issue.why?.join(' ') || ''}
                  </p>

                  {/* Labels */}
                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {issue.labels.slice(0, 3).map((label, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                        >
                          {label}
                        </span>
                      ))}
                      {issue.labels.length > 3 && (
                        <span className="text-xs text-gray-400">+{issue.labels.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {filteredIssues.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No issues found matching the filter.
              </div>
            )}
          </div>
        </div>

        {/* Issue Detail */}
        <div className="w-1/2 overflow-y-auto bg-gray-50">
          {selectedIssue ? (
            <div className="p-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(getDifficultyFromLabels(selectedIssue.labels))}`}>
                    {getDifficultyFromLabels(selectedIssue.labels) || 'Standard'}
                  </span>
                  <span className={`text-2xl font-bold ${getScoreColor(selectedIssue.score_total)}`}>
                    {selectedIssue.score_total}/100
                  </span>
                </div>

                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  {selectedIssue.title}
                </h2>

                {/* Why selected */}
                {selectedIssue.why && selectedIssue.why.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-2">Why this issue?</h3>
                    <ul className="space-y-1">
                      {selectedIssue.why.map((reason, i) => (
                        <li key={i} className="text-gray-600 text-sm flex gap-2">
                          <span className="text-primary-500">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Score Breakdown */}
                {selectedIssue.score_breakdown && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Score Breakdown</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(selectedIssue.score_breakdown).map(([key, value]) => (
                        <div key={key} className="bg-gray-50 rounded-lg p-3">
                          <div className="text-xs text-gray-500 capitalize">
                            {key.replace(/_/g, ' ')}
                          </div>
                          <div className="text-lg font-semibold text-gray-900">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Relevant Files */}
                {selectedIssue.relevant_files && selectedIssue.relevant_files.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">Relevant Files</h3>
                    <div className="space-y-2">
                      {selectedIssue.relevant_files.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg text-sm font-mono text-gray-600"
                        >
                          <FileText className="w-4 h-4 shrink-0" />
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleViewCode(selectedIssue)}
                      disabled={analyzingIssue === selectedIssue.number}
                      className="flex-1 bg-primary-500 text-white py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {analyzingIssue === selectedIssue.number ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Analyzing...
                        </>
                      ) : (
                        'Analyze This Issue'
                      )}
                    </button>
                    {selectedIssue.url && (
                      <a
                        href={selectedIssue.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        GitHub
                      </a>
                    )}
                  </div>
                  {analyzeError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                      {analyzeError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <ArrowLeft className="w-12 h-12 text-gray-400 mx-auto mb-3 block" />
                <p>Select an issue to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
