import { useOutletContext, useNavigate } from 'react-router-dom'
import { useState } from 'react'

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
  const { analysisResult, repoInfo } = useOutletContext()
  const navigate = useNavigate()
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [filterDifficulty, setFilterDifficulty] = useState('all')

  // Use agent1_output.ranked_issues from API response
  const issues = analysisResult?.agent1_output?.ranked_issues || []
  
  const filteredIssues = filterDifficulty === 'all' 
    ? issues 
    : issues.filter(i => {
        const diff = getDifficultyFromLabels(i.labels)
        return diff === filterDifficulty
      })

  const handleIssueSelect = (issue) => {
    setSelectedIssue(issue)
  }

  const handleViewCode = (issue) => {
    navigate('/analysis/code', { 
      state: { 
        ...useOutletContext,
        selectedIssue: issue 
      } 
    })
  }

  if (!analysisResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">📋</span>
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
                className={`bg-white border rounded-xl p-4 cursor-pointer transition-all ${
                  selectedIssue?.number === issue.number
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
            )})}

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
                          <span>📄</span>
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                  <button
                    onClick={() => handleViewCode(selectedIssue)}
                    className="flex-1 bg-primary-500 text-white py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors"
                  >
                    View Code Location
                  </button>
                  {selectedIssue.url && (
                    <a
                      href={selectedIssue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
                    >
                      View on GitHub
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <span className="text-4xl mb-3 block">👈</span>
                <p>Select an issue to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
