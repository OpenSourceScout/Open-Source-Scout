import { useOutletContext, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ClipboardList, FileText, ArrowLeft, Lock } from 'lucide-react'
import { reAnalyzeIssue, selectProjectIssue, saveProjectCodeLocator, saveProjectBriefing, saveProjectTesting } from '../api'

function getDifficultyFromLabels(labels) {
  if (!labels || labels.length === 0) return null
  const labelLower = labels.map((l) => l.toLowerCase())
  if (labelLower.some((l) => l.includes('good first') || l.includes('beginner') || l.includes('easy'))) {
    return 'easy'
  }
  if (labelLower.some((l) => l.includes('medium') || l.includes('intermediate'))) {
    return 'medium'
  }
  if (labelLower.some((l) => l.includes('hard') || l.includes('advanced') || l.includes('complex'))) {
    return 'hard'
  }
  return null
}

function getDifficultyColor(difficulty) {
  switch (difficulty?.toLowerCase()) {
    case 'easy':
    case 'beginner':
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25'
    case 'medium':
    case 'intermediate':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
    case 'hard':
    case 'advanced':
      return 'bg-red-500/15 text-red-400 border border-red-500/25'
    default:
      return 'bg-app-elevated text-app-muted border border-app-border'
  }
}

function getScoreColor(score) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function formatIssueDate(iso) {
  if (!iso) return null
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d)
  } catch {
    return null
  }
}

function bodyPreview(body, maxLen = 140) {
  if (!body || !String(body).trim()) return null
  const t = String(body).replace(/\s+/g, ' ').trim()
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen)}…`
}

export default function IssueRanking() {
  const { analysisResult, setAnalysisResult, repoUrl, rankedRepos, activeProjectId, issueLocked, setIssueLocked } = useOutletContext()
  const navigate = useNavigate()
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [filterDifficulty, setFilterDifficulty] = useState('all')
  const [analyzingIssue, setAnalyzingIssue] = useState(null)
  const [analyzeError, setAnalyzeError] = useState(null)

  const issues = analysisResult?.agent1_output?.ranked_issues || []

  const filteredIssues =
    filterDifficulty === 'all'
      ? issues
      : issues.filter((i) => {
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
      setAnalysisResult({
        ...analysisResult,
        target_issue: result.target_issue,
        agent2_output: result.agent2_output,
        agent3_output: result.agent3_output,
        testing_output: result.testing_output,
      })
      // Persist all outputs to the project in DB
      if (activeProjectId) {
        try {
          await selectProjectIssue(activeProjectId, {
            issue_number: issue.number,
            issue_title: issue.title,
            target_issue: result.target_issue,
          })
          if (setIssueLocked) setIssueLocked(true)
        } catch (lockErr) {
          // 409 means already locked — that's fine
          if (!lockErr.message?.includes('already locked')) {
            console.warn('Could not lock issue in project:', lockErr)
          }
        }
        // Persist agent outputs (fire-and-forget, non-blocking)
        if (result.agent2_output) {
          saveProjectCodeLocator(activeProjectId, result.agent2_output).catch(
            (err) => console.warn('Could not persist code locator output:', err)
          )
        }
        if (result.agent3_output) {
          saveProjectBriefing(activeProjectId, result.agent3_output).catch(
            (err) => console.warn('Could not persist briefing output:', err)
          )
        }
        if (result.testing_output) {
          saveProjectTesting(activeProjectId, result.testing_output).catch(
            (err) => console.warn('Could not persist testing output:', err)
          )
        }
      }
      navigate('/analysis/code')
    } catch (err) {
      setAnalyzeError(err.message || 'Re-analysis failed. Please try again.')
    } finally {
      setAnalyzingIssue(null)
    }
  }

  if (!analysisResult) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh] bg-app-bg">
        <div className="text-center px-4">
          <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardList className="w-8 h-8 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold text-app-text mb-2">No Analysis Data</h2>
          <p className="text-app-muted mb-4">Run an analysis first to see issue rankings.</p>
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors"
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-app-bg text-app-text">
      <header className="bg-app-surface border-b border-app-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-lg font-semibold text-app-text">Issue analysis</h1>
            <p className="text-sm text-app-muted">
              {issues.length} issues from the triage agent, ranked for contribution fit
            </p>
          </div>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="px-3 py-2 border border-app-border rounded-lg text-sm bg-app-input text-app-text focus:outline-none focus:ring-2 focus:ring-primary-500/50"
          >
            <option value="all">All Difficulties</option>
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-1/2 border-r border-app-border overflow-y-auto bg-app-bg">
          <div className="p-4 space-y-3">
            {filteredIssues.map((issue, index) => {
              const difficulty = getDifficultyFromLabels(issue.labels)
              const descriptionPreview = bodyPreview(issue.body)
              const openedAt = formatIssueDate(issue.created_at)
              return (
                <div
                  key={issue.number || index}
                  onClick={() => handleIssueSelect(issue)}
                  className={`bg-app-surface border rounded-xl p-4 cursor-pointer transition-all duration-200 ${
                    selectedIssue?.number === issue.number
                      ? 'border-primary-500 ring-2 ring-primary-500/20'
                      : 'border-app-border hover:border-app-border/80'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-app-muted">#{issue.number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getDifficultyColor(difficulty)}`}>
                        {difficulty || 'Standard'}
                      </span>
                    </div>
                    <span className={`font-semibold ${getScoreColor(issue.score_total)}`}>{issue.score_total}/100</span>
                  </div>
                  <h3 className="font-medium text-app-text mb-1 line-clamp-2">{issue.title}</h3>
                  {descriptionPreview && (
                    <p className="text-xs text-app-muted/90 line-clamp-2 mb-1">{descriptionPreview}</p>
                  )}
                  <p className="text-sm text-app-muted line-clamp-2">{issue.why?.join(' ') || ''}</p>
                  {(openedAt || issue.comments != null) && (
                    <p className="text-xs text-app-muted/80 mt-2">
                      {openedAt && <span>Opened {openedAt}</span>}
                      {openedAt && issue.comments != null && <span> · </span>}
                      {issue.comments != null && <span>{issue.comments} comments</span>}
                    </p>
                  )}

                  {issue.labels && issue.labels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {issue.labels.slice(0, 3).map((label, i) => (
                        <span key={i} className="px-2 py-0.5 bg-app-bg text-app-muted border border-app-border rounded text-xs">
                          {label}
                        </span>
                      ))}
                      {issue.labels.length > 3 && (
                        <span className="text-xs text-app-muted">+{issue.labels.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {filteredIssues.length === 0 && (
              <div className="text-center py-8 text-app-muted">No issues found matching the filter.</div>
            )}
          </div>
        </div>

        <div className="w-1/2 overflow-y-auto bg-app-bg">
          {selectedIssue ? (
            <div className="p-6">
              <div className="bg-app-surface rounded-xl border border-app-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${getDifficultyColor(
                      getDifficultyFromLabels(selectedIssue.labels)
                    )}`}
                  >
                    {getDifficultyFromLabels(selectedIssue.labels) || 'Standard'}
                  </span>
                  <span className={`text-2xl font-bold ${getScoreColor(selectedIssue.score_total)}`}>
                    {selectedIssue.score_total}/100
                  </span>
                </div>

                <div className="mb-4">
                  <h2 className="text-xl font-semibold text-app-text mb-2">{selectedIssue.title}</h2>
                  <p className="text-sm text-app-muted">
                    Issue #{selectedIssue.number}
                    {formatIssueDate(selectedIssue.created_at) && (
                      <>
                        {' '}
                        · Opened {formatIssueDate(selectedIssue.created_at)}
                      </>
                    )}
                    {formatIssueDate(selectedIssue.updated_at) && (
                      <>
                        {' '}
                        · Updated {formatIssueDate(selectedIssue.updated_at)}
                      </>
                    )}
                    {selectedIssue.comments != null && (
                      <>
                        {' '}
                        · {selectedIssue.comments} comments
                      </>
                    )}
                  </p>
                </div>

                <div className="mb-6">
                  <h3 className="text-sm font-medium text-app-text mb-2">Issue description</h3>
                  <div className="bg-app-bg border border-app-border rounded-lg p-4 max-h-56 overflow-y-auto">
                    {selectedIssue.body?.trim() ? (
                      <pre className="text-sm text-app-muted whitespace-pre-wrap font-sans leading-relaxed">
                        {selectedIssue.body}
                      </pre>
                    ) : (
                      <p className="text-sm text-app-muted italic">No description on GitHub.</p>
                    )}
                  </div>
                </div>

                {selectedIssue.why && selectedIssue.why.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-app-text mb-2">Why this issue?</h3>
                    <ul className="space-y-1">
                      {selectedIssue.why.map((reason, i) => (
                        <li key={i} className="text-app-muted text-sm flex gap-2">
                          <span className="text-primary-400">•</span>
                          {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedIssue.score_breakdown && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-app-text mb-3">Score Breakdown</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(selectedIssue.score_breakdown).map(([key, value]) => (
                        <div key={key} className="bg-app-bg border border-app-border rounded-lg p-3">
                          <div className="text-xs text-app-muted capitalize">{key.replace(/_/g, ' ')}</div>
                          <div className="text-lg font-semibold text-app-text">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedIssue.relevant_files && selectedIssue.relevant_files.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-app-text mb-3">Relevant Files</h3>
                    <div className="space-y-2">
                      {selectedIssue.relevant_files.map((file, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-2 bg-app-bg border border-app-border rounded-lg text-sm font-mono text-app-muted"
                        >
                          <FileText className="w-4 h-4 shrink-0 text-primary-400" />
                          {file}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleViewCode(selectedIssue)}
                      disabled={analyzingIssue === selectedIssue.number || issueLocked}
                      className="flex-1 bg-accent-500 text-[#0b0f14] py-2 rounded-lg font-semibold hover:bg-accent-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {analyzingIssue === selectedIssue.number ? (
                        <>
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          Analyzing...
                        </>
                      ) : issueLocked ? (
                        <>
                          <Lock className="w-4 h-4" />
                          Issue Locked
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
                        className="px-4 py-2 border border-app-border rounded-lg text-app-muted hover:border-primary-500/50 hover:text-primary-400 transition-colors"
                      >
                        GitHub
                      </a>
                    )}
                  </div>
                  {analyzeError && (
                    <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{analyzeError}</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[200px] text-app-muted">
              <div className="text-center">
                <ArrowLeft className="w-12 h-12 text-app-border mx-auto mb-3 block" />
                <p>Select an issue to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
