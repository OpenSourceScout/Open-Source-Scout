import { useOutletContext, useNavigate } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Lightbulb, RefreshCw, ClipboardList } from 'lucide-react'
import { saveProjectTesting } from '../api'

function getScoreColor(score) {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-red-400'
}

function getScoreBarColor(score) {
  if (score >= 80) return 'bg-emerald-500'
  if (score >= 60) return 'bg-amber-500'
  return 'bg-red-500'
}

export default function QaReport() {
  const { analysisResult, repoInfo, activeProjectId } = useOutletContext()
  const navigate = useNavigate()

  const testing = analysisResult?.testing_output

  // Persist testing output to DB when available
  const savedTestingRef = useRef(false)
  useEffect(() => {
    if (
      activeProjectId &&
      testing &&
      !savedTestingRef.current
    ) {
      savedTestingRef.current = true
      saveProjectTesting(activeProjectId, testing).catch(
        (err) => console.warn('Could not persist testing output:', err)
      )
    }
  }, [activeProjectId, testing])

  const empty = (title, body, btn) => (
    <div className="flex items-center justify-center h-full min-h-[50vh] bg-app-bg">
      <div className="text-center px-4">
        <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="w-8 h-8 text-app-muted" />
        </div>
        <h2 className="text-xl font-semibold text-app-text mb-2">{title}</h2>
        <p className="text-app-muted mb-4 max-w-md mx-auto">{body}</p>
        <button
          type="button"
          onClick={btn.onClick}
          className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors"
        >
          {btn.label}
        </button>
      </div>
    </div>
  )

  if (!analysisResult) {
    return empty('No Analysis Data', 'Run an analysis first to see the QA report.', {
      label: 'Go to Dashboard',
      onClick: () => navigate('/dashboard'),
    })
  }

  if (!testing) {
    return empty(
      'QA Report Not Available',
      <>Select an issue and click <strong className="text-app-text">Analyze This Issue</strong> to generate a QA report.</>,
      { label: 'Go to issue analysis', onClick: () => navigate('/analysis/issues') }
    )
  }

  return (
    <div className="h-full flex flex-col bg-app-bg text-app-text">
      <header className="bg-app-surface border-b border-app-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-app-text">QA Report</h1>
            <p className="text-sm text-app-muted">
              Testing Agent validation results for {repoInfo?.name || 'this repository'}
            </p>
          </div>
          <span className="text-sm text-app-muted flex items-center gap-1">
            <RefreshCw className="w-4 h-4" />
            {testing.iterations_used} iteration{testing.iterations_used !== 1 ? 's' : ''} used
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div
          className={`rounded-xl border-2 p-6 mb-6 ${
            testing.overall_passed
              ? 'bg-emerald-500/10 border-emerald-500/40'
              : 'bg-red-500/10 border-red-500/40'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {testing.overall_passed ? (
                <div className="w-14 h-14 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
              ) : (
                <div className="w-14 h-14 bg-red-500/20 rounded-full flex items-center justify-center border border-red-500/30">
                  <XCircle className="w-8 h-8 text-red-400" />
                </div>
              )}
              <div>
                <h2
                  className={`text-2xl font-bold ${
                    testing.overall_passed ? 'text-emerald-300' : 'text-red-300'
                  }`}
                >
                  Pipeline QA {testing.overall_passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}
                </h2>
                <p className={`text-sm ${testing.overall_passed ? 'text-emerald-400/90' : 'text-red-400/90'}`}>
                  All agent outputs have been validated by the Testing Agent
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <div className={`text-4xl font-bold ${getScoreColor(testing.overall_score)}`}>{testing.overall_score}</div>
              <div className="text-sm text-app-muted">/ 100</div>
            </div>
          </div>
        </div>

        <h3 className="text-lg font-semibold text-app-text mb-4">Agent Results</h3>
        <div className="space-y-4 mb-6">
          {testing.agent_results?.map((result, idx) => (
            <div
              key={idx}
              className={`bg-app-surface rounded-xl border p-5 ${
                result.passed ? 'border-app-border' : 'border-red-500/40'
              }`}
            >
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  {result.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <h4 className="font-semibold text-app-text">{result.agent_name}</h4>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
                        result.passed
                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                          : 'bg-red-500/15 text-red-400 border-red-500/25'
                      }`}
                    >
                      {result.passed ? 'Passed' : 'Needs Improvement'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getScoreColor(result.score)}`}>{result.score}</span>
                  <span className="text-sm text-app-muted"> / 100</span>
                </div>
              </div>

              <div className="w-full bg-app-bg rounded-full h-2 mb-4 border border-app-border">
                <div
                  className={`h-2 rounded-full transition-all ${getScoreBarColor(result.score)}`}
                  style={{ width: `${result.score}%` }}
                />
              </div>

              {result.details && <p className="text-sm text-app-muted mb-3">{result.details}</p>}

              {result.issues_found && result.issues_found.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium text-app-text mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    Issues Found
                  </h5>
                  <ul className="space-y-1">
                    {result.issues_found.map((issue, i) => (
                      <li key={i} className="text-sm text-app-muted flex items-start gap-2 pl-1">
                        <span className="text-amber-400 mt-1 shrink-0">•</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.suggestions && result.suggestions.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-app-text mb-2 flex items-center gap-1">
                    <Lightbulb className="w-4 h-4 text-primary-400" />
                    Suggestions
                  </h5>
                  <ul className="space-y-1">
                    {result.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm text-app-muted flex items-start gap-2 pl-1">
                        <span className="text-primary-400 mt-1 shrink-0">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {testing.retry_recommended && testing.retry_agents?.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-amber-400" />
              <h4 className="font-medium text-amber-200">Retry Information</h4>
            </div>
            <p className="text-sm text-amber-200/90">
              Retry was recommended for: <strong>{testing.retry_agents.join(', ')}</strong>
            </p>
            {testing.iterations_used > 1 && (
              <p className="text-sm text-amber-300/80 mt-1">
                The pipeline ran {testing.iterations_used} QA iterations to improve output quality.
              </p>
            )}
          </div>
        )}

        <div className="bg-app-surface rounded-xl border border-app-border p-5">
          <h4 className="font-semibold text-app-text mb-3 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-app-muted" />
            Summary
          </h4>
          <pre className="text-sm text-app-muted whitespace-pre-wrap font-sans leading-relaxed">{testing.summary}</pre>
        </div>
      </div>
    </div>
  )
}
