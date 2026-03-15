import { useOutletContext, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { FileText, Download, FileDown, Package, ClipboardList, Rocket, Clock, MapPin, AlertTriangle, Github } from 'lucide-react'
import { exportPdf } from '../api'

export default function ContributorBriefing() {
  const { analysisResult, repoInfo } = useOutletContext()
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)

  // Use agent3_output from API response
  const briefing = analysisResult?.agent3_output || {}
  const targetIssue = analysisResult?.target_issue

  // Editable PR draft fields
  const [commitMessage, setCommitMessage] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [showFullPrBody, setShowFullPrBody] = useState(false)
  const [pushResult, setPushResult] = useState(null)

  // Initialize editable fields from briefing
  useEffect(() => {
    if (briefing.pr_draft) {
      setCommitMessage(briefing.pr_draft.commit_message || 'Fix issue')
      setPrTitle(briefing.pr_draft.pr_title || 'Pull Request Title')
      setPrBody(briefing.pr_draft.pr_body || '')
    }
  }, [briefing.pr_draft])

  // Load push result from sessionStorage (set by Editor after Save & Push)
  useEffect(() => {
    if (!repoInfo?.owner || !repoInfo?.name) {
      setPushResult(null)
      return
    }
    const key = `scout-push-${repoInfo.owner}-${repoInfo.name}`
    try {
      const stored = sessionStorage.getItem(key)
      const parsed = stored ? JSON.parse(stored) : null
      setPushResult(parsed?.pr_url ? parsed : null)
    } catch {
      setPushResult(null)
    }
  }, [repoInfo?.owner, repoInfo?.name])

  const handleExportPdf = async () => {
    setExporting(true)
    try {
      const blob = await exportPdf(briefing.briefing_markdown || '')
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contributor_briefing_${repoInfo?.name || 'repo'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const handleExportMarkdown = () => {
    const markdown = briefing.briefing_markdown || ''
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contributor_briefing_${repoInfo?.name || 'repo'}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  if (!analysisResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Analysis Data</h2>
          <p className="text-gray-500 mb-4">Run an analysis first to see the contributor briefing.</p>
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

  if (!analysisResult.target_issue) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Issue Selected</h2>
          <p className="text-gray-500 mb-4">
            Select an issue and click <strong>"Analyse This Issue"</strong> to see the contributor briefing.
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

  // Parse briefing markdown into sections - improved parsing
  const parseImplementationPlan = (markdown) => {
    if (!markdown) return []
    const lines = markdown.split('\n')
    const steps = []
    let currentStep = null

    for (const line of lines) {
      // Match numbered steps like "1. Step Title" or "**1. Step Title**"
      const match = line.match(/^\*?\*?(\d+)\.\s*\*?\*?\s*(.+)/)
      if (match) {
        if (currentStep) {
          // Limit description to first 150 chars
          currentStep.description = currentStep.description.trim().substring(0, 150)
          if (currentStep.description.length >= 150) {
            currentStep.description += '...'
          }
          steps.push(currentStep)
        }
        currentStep = {
          number: match[1],
          title: match[2].replace(/\*\*/g, '').replace(/`/g, '').trim().substring(0, 80),
          description: ''
        }
      } else if (currentStep && line.trim() && !line.startsWith('#') && !line.startsWith('*') && !line.startsWith('-')) {
        // Only add non-list content as description, limit accumulation
        if (currentStep.description.length < 200) {
          currentStep.description += line.trim() + ' '
        }
      }
    }
    if (currentStep) {
      currentStep.description = currentStep.description.trim().substring(0, 150)
      if (currentStep.description.length >= 150) {
        currentStep.description += '...'
      }
      steps.push(currentStep)
    }
    return steps.slice(0, 5) // Max 5 steps
  }

  const implementationSteps = parseImplementationPlan(briefing.briefing_markdown)

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Contributor Briefing</h1>
            <p className="text-sm text-gray-500">
              Your personalized guide to contributing to {repoInfo?.name || 'this repository'}
              {targetIssue?.number && ` - Issue #${targetIssue.number}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleExportMarkdown}
              disabled={!briefing.briefing_markdown}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Markdown
            </button>
            <button
              onClick={handleExportPdf}
              disabled={exporting || !briefing.briefing_markdown}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
            >
              {exporting ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Exporting...
                </>
              ) : (
                <>
                  <FileDown className="w-4 h-4" /> Export to PDF
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content with Two Columns */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Column - Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl space-y-6">

            {/* Overview Section */}
            <section>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Overview</h2>
              <div className="prose prose-sm max-w-none text-gray-600 leading-relaxed">
                {briefing.briefing_markdown ? (
                  <p>{briefing.briefing_markdown.split('\n\n')[0]}</p>
                ) : (
                  <p>No overview available.</p>
                )}
              </div>
            </section>

            {/* Risk Notes - Warning Box */}
            {briefing.risk_notes && briefing.risk_notes.length > 0 && (
              <div className="bg-amber-50 border-l-4 border-amber-400 rounded-r-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-amber-500 w-5 h-5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-amber-800 mb-2">Risk Note</h3>
                    <div className="text-sm text-amber-700 space-y-1">
                      {briefing.risk_notes.map((risk, i) => (
                        <p key={i}>{risk}</p>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Setup Instructions */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-5 h-5 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">Setup Instructions</h2>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                Clone the repository and install dependencies.
              </p>

              {/* Clone Commands */}
              <div className="bg-gray-900 rounded-lg overflow-hidden mb-4">
                <div className="p-4 font-mono text-sm text-gray-300 space-y-1">
                  <div><span className="text-green-400">git clone</span> https://github.com/{repoInfo?.owner}/{repoInfo?.name}.git</div>
                  <div><span className="text-green-400">cd</span> {repoInfo?.name}</div>
                  <div><span className="text-green-400">npm install</span></div>
                </div>
              </div>

              {/* Test Commands */}
              {briefing.test_commands && briefing.test_commands.length > 0 && (
                <>
                  <p className="text-sm text-gray-600 mb-3">Run tests or development server:</p>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                    {briefing.test_commands.map((cmd, i) => (
                      <div key={i} className="font-mono text-sm text-amber-900">
                        {cmd}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </section>

            {/* Implementation Plan */}
            {implementationSteps.length > 0 && (
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <ClipboardList className="w-5 h-5 text-gray-400" />
                  <h2 className="text-lg font-semibold text-gray-900">Implementation Plan</h2>
                </div>
                <div className="space-y-4">
                  {implementationSteps.map((step, index) => (
                    <div key={index} className="flex gap-4 bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-600 flex items-center justify-center font-semibold text-sm">
                        {index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 mb-1">{step.title}</h3>
                        {step.description && (
                          <p className="text-sm text-gray-600 leading-relaxed">{step.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Full Briefing Markdown */}
            {briefing.briefing_markdown && (
              <section className="pt-6 border-t border-gray-200">
                <details className="group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-2">
                    <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                    View Full Briefing
                  </summary>
                  <div className="mt-4 prose prose-sm max-w-none text-gray-600 bg-white rounded-lg border border-gray-200 p-4">
                    <pre className="whitespace-pre-wrap text-sm font-sans">{briefing.briefing_markdown}</pre>
                  </div>
                </details>
              </section>
            )}
          </div>
        </div>

        {/* Right Column - Fixed Sidebar (non-scrollable) */}
        <div className="w-96 border-l border-gray-200 bg-white flex-shrink-0 overflow-y-auto">
          <div className="p-6">
            <div className="space-y-6">

              {/* PR Draft Card */}
              {briefing.pr_draft && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-5 h-5 text-green-500" />
                      <span className="font-medium text-gray-900">PR Draft</span>
                    </div>
                    <span className="text-xs bg-primary-100 text-primary-700 px-2 py-1 rounded-full font-medium">
                      EDITABLE
                    </span>
                  </div>

                  <div className="p-4 space-y-4">
                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Branch Name</label>
                      <div className="mt-1 p-2 bg-gray-50 rounded-lg font-mono text-sm text-gray-700 truncate">
                        {briefing.pr_draft.branch_name || 'feature/fix-issue'}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        Commit Message
                        <span className="text-primary-500 text-xs normal-case">(editable)</span>
                      </label>
                      <input
                        type="text"
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        className="mt-1 w-full p-2 bg-white border border-gray-200 rounded-lg font-mono text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        PR Title
                        <span className="text-primary-500 text-xs normal-case">(editable)</span>
                      </label>
                      <input
                        type="text"
                        value={prTitle}
                        onChange={(e) => setPrTitle(e.target.value)}
                        className="mt-1 w-full p-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 font-medium focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-medium text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        PR Body
                        <span className="text-primary-500 text-xs normal-case">(editable)</span>
                      </label>
                      <textarea
                        value={prBody}
                        onChange={(e) => setPrBody(e.target.value)}
                        rows={showFullPrBody ? 12 : 5}
                        className="mt-1 w-full p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none"
                      />
                      <button
                        onClick={() => setShowFullPrBody(!showFullPrBody)}
                        className="mt-1 text-xs text-primary-600 hover:text-primary-700"
                      >
                        {showFullPrBody ? 'Show less' : 'Expand to edit full body'}
                      </button>
                    </div>

                    {pushResult?.pr_url ? (
                      <a
                        href={`${pushResult.pr_url}${pushResult.pr_url.includes('?') ? '&' : '?'}expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(prBody)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full bg-green-500 hover:bg-green-600 text-white py-2.5 px-4 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
                      >
                        <Github className="w-5 h-5" />
                        Create PR on GitHub
                      </a>
                    ) : (
                      <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 border border-gray-100">
                        To create a PR: go to <strong>Code Locations</strong> → <strong>Open in Editor</strong> → make your changes → <strong>Save & Push</strong>. The PR button will appear here after you push.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Difficulty & Est. Time */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-200">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Difficulty</div>
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span className="font-semibold text-gray-900">Medium</span>
                  </div>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 text-center border border-gray-200">
                  <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">Est. Time</div>
                  <div className="flex items-center justify-center gap-2">
                    <Clock className="w-5 h-5 text-primary-500" />
                    <span className="font-semibold text-gray-900">2-3 hrs</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => navigate('/analysis/code')}
                  className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <MapPin className="w-4 h-4" /> View Code Locations
                </button>
                <button
                  onClick={() => navigate('/analysis/issues')}
                  className="w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                >
                  <ClipboardList className="w-4 h-4" /> View Related Issues
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
