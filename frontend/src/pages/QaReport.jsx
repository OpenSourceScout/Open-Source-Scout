import { useOutletContext, useNavigate } from 'react-router-dom'
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, Lightbulb, RefreshCw, ClipboardList } from 'lucide-react'

function getScoreColor(score) {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-yellow-600'
  return 'text-red-600'
}

function getScoreBg(score) {
  if (score >= 80) return 'bg-green-50 border-green-200'
  if (score >= 60) return 'bg-yellow-50 border-yellow-200'
  return 'bg-red-50 border-red-200'
}

function getScoreBarColor(score) {
  if (score >= 80) return 'bg-green-500'
  if (score >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function QaReport() {
  const { analysisResult, repoInfo } = useOutletContext()
  const navigate = useNavigate()

  const testing = analysisResult?.testing_output

  if (!analysisResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Analysis Data</h2>
          <p className="text-gray-500 mb-4">Run an analysis first to see the QA report.</p>
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

  if (!testing) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">QA Report Not Available</h2>
          <p className="text-gray-500 mb-4">
            Select an issue and click <strong>"Analyze This Issue"</strong> to generate a QA report.
          </p>
          <button
            onClick={() => navigate('/analysis/issues')}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600"
          >
            Go to Issue Ranking
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">QA Report</h1>
            <p className="text-sm text-gray-500">
              Testing Agent validation results for {repoInfo?.name || 'this repository'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 flex items-center gap-1">
              <RefreshCw className="w-4 h-4" />
              {testing.iterations_used} iteration{testing.iterations_used !== 1 ? 's' : ''} used
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {/* Overall Status Banner */}
        <div className={`rounded-xl border-2 p-6 mb-6 ${
          testing.overall_passed
            ? 'bg-green-50 border-green-300'
            : 'bg-red-50 border-red-300'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {testing.overall_passed ? (
                <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
              ) : (
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
              )}
              <div>
                <h2 className={`text-2xl font-bold ${
                  testing.overall_passed ? 'text-green-800' : 'text-red-800'
                }`}>
                  Pipeline QA {testing.overall_passed ? 'PASSED' : 'NEEDS IMPROVEMENT'}
                </h2>
                <p className={`text-sm ${
                  testing.overall_passed ? 'text-green-600' : 'text-red-600'
                }`}>
                  All agent outputs have been validated by the Testing Agent
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className={`text-4xl font-bold ${getScoreColor(testing.overall_score)}`}>
                {testing.overall_score}
              </div>
              <div className="text-sm text-gray-500">/ 100</div>
            </div>
          </div>
        </div>

        {/* Per-Agent Results */}
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Results</h3>
        <div className="space-y-4 mb-6">
          {testing.agent_results?.map((result, idx) => (
            <div
              key={idx}
              className={`bg-white rounded-xl border p-5 ${
                result.passed ? 'border-gray-200' : 'border-red-200'
              }`}
            >
              {/* Agent Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {result.passed ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-500" />
                  )}
                  <div>
                    <h4 className="font-semibold text-gray-900">{result.agent_name}</h4>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      result.passed
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {result.passed ? 'Passed' : 'Needs Improvement'}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-2xl font-bold ${getScoreColor(result.score)}`}>
                    {result.score}
                  </span>
                  <span className="text-sm text-gray-400"> / 100</span>
                </div>
              </div>

              {/* Score Bar */}
              <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                <div
                  className={`h-2 rounded-full transition-all ${getScoreBarColor(result.score)}`}
                  style={{ width: `${result.score}%` }}
                />
              </div>

              {/* Details */}
              {result.details && (
                <p className="text-sm text-gray-600 mb-3">{result.details}</p>
              )}

              {/* Issues Found */}
              {result.issues_found && result.issues_found.length > 0 && (
                <div className="mb-3">
                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Issues Found
                  </h5>
                  <ul className="space-y-1">
                    {result.issues_found.map((issue, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2 pl-1">
                        <span className="text-amber-500 mt-1 shrink-0">•</span>
                        <span>{issue}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {result.suggestions && result.suggestions.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Lightbulb className="w-4 h-4 text-blue-500" />
                    Suggestions
                  </h5>
                  <ul className="space-y-1">
                    {result.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-sm text-gray-600 flex items-start gap-2 pl-1">
                        <span className="text-blue-500 mt-1 shrink-0">•</span>
                        <span>{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Retry Info */}
        {testing.retry_recommended && testing.retry_agents?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="w-5 h-5 text-amber-600" />
              <h4 className="font-medium text-amber-800">Retry Information</h4>
            </div>
            <p className="text-sm text-amber-700">
              Retry was recommended for: <strong>{testing.retry_agents.join(', ')}</strong>
            </p>
            {testing.iterations_used > 1 && (
              <p className="text-sm text-amber-600 mt-1">
                The pipeline ran {testing.iterations_used} QA iterations to improve output quality.
              </p>
            )}
          </div>
        )}

        {/* Summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-gray-500" />
            Summary
          </h4>
          <pre className="text-sm text-gray-600 whitespace-pre-wrap font-sans leading-relaxed">
            {testing.summary}
          </pre>
        </div>
      </div>
    </div>
  )
}
