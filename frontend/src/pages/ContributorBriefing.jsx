import { useOutletContext, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  FileText,
  Download,
  FileDown,
  ClipboardList,
  Rocket,
  Clock,
  MapPin,
  AlertTriangle,
  Github,
  PanelLeftClose,
  PanelLeft,
  PanelRightClose,
  ChevronLeft,
} from 'lucide-react'
import { exportPdf } from '../api'

const briefingProseClass =
  'prose prose-invert prose-base max-w-none ' +
  'prose-headings:text-app-text prose-headings:font-semibold prose-headings:tracking-tight ' +
  'prose-headings:border-b prose-headings:border-app-border prose-headings:pb-3 prose-headings:mt-8 prose-headings:first:mt-0 ' +
  'prose-p:text-app-muted prose-p:leading-relaxed prose-p:mb-4 ' +
  'prose-ul:my-4 prose-ol:my-4 prose-ul:space-y-2 prose-ol:space-y-2 ' +
  'prose-li:text-app-muted prose-li:leading-relaxed ' +
  'prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline ' +
  'prose-strong:text-app-text ' +
  'prose-code:text-accent-400 prose-code:bg-app-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em] prose-code:border prose-code:border-app-border prose-code:font-normal ' +
  'prose-pre:bg-[#0b0f14] prose-pre:border prose-pre:border-app-border prose-pre:rounded-xl prose-pre:my-5 prose-pre:shadow-inner ' +
  'prose-blockquote:border-l-primary-500/50 prose-blockquote:text-app-muted prose-blockquote:my-5 prose-blockquote:bg-app-bg/50 prose-blockquote:py-1 prose-blockquote:rounded-r-lg ' +
  'prose-hr:border-app-border prose-hr:my-8 ' +
  'prose-table:border-app-border prose-table:my-6 prose-table:text-sm ' +
  'prose-th:text-app-text prose-th:border-app-border prose-th:px-3 prose-th:py-2 prose-th:bg-app-elevated ' +
  'prose-td:text-app-muted prose-td:border-app-border prose-td:px-3 prose-td:py-2'

const toolBtn =
  'inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-3 py-2 text-sm font-medium text-app-muted hover:border-primary-500/40 hover:text-primary-400 transition-colors'

export default function ContributorBriefing() {
  const outlet = useOutletContext() || {}
  const {
    analysisResult,
    repoInfo,
    analysisNavOpen = true,
    toggleAnalysisNav,
  } = outlet
  const navigate = useNavigate()
  const [exporting, setExporting] = useState(false)
  const [prPanelOpen, setPrPanelOpen] = useState(true)

  const briefing = analysisResult?.agent3_output || {}
  const targetIssue = analysisResult?.target_issue

  const [commitMessage, setCommitMessage] = useState('')
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [showFullPrBody, setShowFullPrBody] = useState(false)
  const [pushResult, setPushResult] = useState(null)

  useEffect(() => {
    if (briefing.pr_draft) {
      setCommitMessage(briefing.pr_draft.commit_message || 'Fix issue')
      setPrTitle(briefing.pr_draft.pr_title || 'Pull Request Title')
      setPrBody(briefing.pr_draft.pr_body || '')
    }
  }, [briefing.pr_draft])

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
      <div className="flex items-center justify-center min-h-[50vh] bg-app-bg px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold text-app-text mb-2">No Analysis Data</h2>
          <p className="text-app-muted mb-4">Run an analysis first to see the contributor briefing.</p>
          <button
            type="button"
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
      <div className="flex items-center justify-center min-h-[50vh] bg-app-bg px-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold text-app-text mb-2">No Issue Selected</h2>
          <p className="text-app-muted mb-4">
            Select an issue and click <strong className="text-app-text">Analyze This Issue</strong> to see the contributor briefing.
          </p>
          <button
            type="button"
            onClick={() => navigate('/analysis/issues')}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600"
          >
            Go to issue analysis
          </button>
        </div>
      </div>
    )
  }

  const field =
    'mt-1.5 w-full min-w-0 p-2.5 bg-app-input border border-app-border rounded-lg text-sm text-app-text focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/40 outline-none'

  const mainColumn = (
    <div className="min-w-0 space-y-8">
      {briefing.risk_notes && briefing.risk_notes.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-400 w-5 h-5 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h3 className="font-semibold text-amber-100 mb-2 text-sm uppercase tracking-wide">Risk notes</h3>
              <ul className="text-sm text-amber-50/90 space-y-2 list-disc pl-4">
                {briefing.risk_notes.map((risk, i) => (
                  <li key={i}>{risk}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {briefing.test_commands && briefing.test_commands.length > 0 && (
        <section className="rounded-xl border border-app-border bg-app-surface/80 p-6 shadow-sm">
          <h2 className="text-base font-semibold text-app-text mb-1">Suggested test commands</h2>
          <p className="text-sm text-app-muted mb-4">Run from the repo root unless the README says otherwise.</p>
          <div className="rounded-lg border border-app-border bg-[#0b0f14] p-4 font-mono text-sm text-[#e6edf3] space-y-2 leading-relaxed">
            {briefing.test_commands.map((cmd, i) => (
              <div key={i} className="break-all">
                {cmd}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-app-border bg-app-surface p-6 sm:p-8 shadow-sm">
        {briefing.briefing_markdown ? (
          <div>
            <ReactMarkdown 
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({node, ...props}) => <h1 className="text-2xl font-bold text-app-text mt-0 mb-4 tracking-tight border-b border-app-border pb-2" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-xl font-semibold text-app-text mt-6 mb-3 tracking-tight" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-lg font-medium text-app-text mt-5 mb-2" {...props} />,
                p: ({node, ...props}) => <p className="text-app-muted leading-relaxed mb-4" {...props} />,
                ul: ({node, ...props}) => <ul className="list-disc pl-5 my-4 space-y-2 text-app-muted" {...props} />,
                ol: ({node, ...props}) => <ol className="list-decimal pl-5 my-4 space-y-2 text-app-muted" {...props} />,
                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                a: ({node, ...props}) => <a className="text-primary-400 no-underline hover:underline hover:text-primary-300 transition-colors" {...props} />,
                strong: ({node, ...props}) => <strong className="font-semibold text-app-text" {...props} />,
                code: ({node, className, children, ...props}) => {
                  const inline = !String(children).includes('\n')
                  return inline ? (
                    <code className="text-accent-400 bg-app-elevated px-1.5 py-0.5 rounded text-[0.85em] border border-app-border font-mono font-normal" {...props}>
                      {children}
                    </code>
                  ) : (
                    <code className="block w-full bg-[#0b0f14] border border-app-border rounded-xl my-5 p-4 overflow-x-auto text-sm text-[#e6edf3] font-mono shadow-inner" {...props}>
                      {children}
                    </code>
                  )
                },
                pre: ({node, ...props}) => <pre className="m-0 p-0 bg-transparent border-none" {...props} />,
                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-primary-500/50 text-app-muted my-5 bg-app-bg/50 py-2 pl-4 rounded-r-lg" {...props} />,
                hr: ({node, ...props}) => <hr className="border-app-border my-8" {...props} />,
                table: ({node, ...props}) => <div className="overflow-x-auto"><table className="w-full border-collapse border border-app-border my-6 text-sm" {...props} /></div>,
                th: ({node, ...props}) => <th className="text-left text-app-text border border-app-border px-3 py-2 bg-app-elevated font-semibold" {...props} />,
                td: ({node, ...props}) => <td className="text-app-muted border border-app-border px-3 py-2" {...props} />,
              }}
            >
              {briefing.briefing_markdown}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-app-muted">No briefing content was returned for this run.</p>
        )}
      </section>
    </div>
  )

  const prSidebar = briefing.pr_draft && (
    <aside className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:self-start">
      <div className="rounded-2xl border border-app-border bg-app-surface shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-app-border bg-app-elevated">
          <div className="flex items-center gap-2 min-w-0">
            <Rocket className="w-5 h-5 text-accent-400 shrink-0" />
            <span className="font-semibold text-app-text truncate">PR draft</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase tracking-wider bg-primary-500/15 text-primary-300 px-2 py-1 rounded-md font-semibold border border-primary-500/25">
              Editable
            </span>
            <button
              type="button"
              onClick={() => setPrPanelOpen(false)}
              className="p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-bg border border-transparent hover:border-app-border transition-colors"
              aria-label="Hide PR panel"
              title="Hide PR panel"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-medium text-app-muted uppercase tracking-wide">Branch name</label>
            <div className="mt-1.5 p-2.5 bg-app-input border border-app-border rounded-lg font-mono text-sm text-app-text truncate">
              {briefing.pr_draft.branch_name || 'feature/fix-issue'}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-app-muted uppercase tracking-wide">Commit message</label>
            <input type="text" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} className={`${field} font-mono`} />
          </div>

          <div>
            <label className="text-xs font-medium text-app-muted uppercase tracking-wide">PR title</label>
            <input type="text" value={prTitle} onChange={(e) => setPrTitle(e.target.value)} className={`${field} font-medium`} />
          </div>

          <div>
            <label className="text-xs font-medium text-app-muted uppercase tracking-wide">PR body</label>
            <textarea
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              rows={showFullPrBody ? 12 : 5}
              className="mt-1.5 w-full min-w-0 p-3 bg-app-input border border-app-border rounded-lg text-sm text-app-text focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500/40 outline-none resize-y min-h-[120px]"
            />
            <button
              type="button"
              onClick={() => setShowFullPrBody(!showFullPrBody)}
              className="mt-2 text-xs text-primary-400 hover:text-primary-300"
            >
              {showFullPrBody ? 'Show less' : 'Expand body'}
            </button>
          </div>

          {pushResult?.pr_url ? (
            <a
              href={`${pushResult.pr_url}${pushResult.pr_url.includes('?') ? '&' : '?'}expand=1&title=${encodeURIComponent(prTitle)}&body=${encodeURIComponent(prBody)}`}
              target="_blank"
              rel="noreferrer"
              className="w-full bg-accent-500 hover:bg-accent-600 text-[#0b0f14] py-3 px-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Github className="w-5 h-5" />
              Create PR on GitHub
            </a>
          ) : (
            <p className="text-xs text-app-muted leading-relaxed bg-app-input rounded-lg p-4 border border-app-border">
              After you push from the editor: <span className="text-app-text font-medium">Code Locator</span> →{' '}
              <span className="text-app-text font-medium">Open in Editor</span> → commit →{' '}
              <span className="text-app-text font-medium">Review & Push</span>. The PR shortcut appears here.
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-app-border bg-app-bg p-4 text-center">
          <div className="text-[10px] text-app-muted uppercase tracking-wide mb-2">Difficulty</div>
          <div className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="font-semibold text-app-text text-sm">Medium</span>
          </div>
        </div>
        <div className="rounded-xl border border-app-border bg-app-bg p-4 text-center">
          <div className="text-[10px] text-app-muted uppercase tracking-wide mb-2">Est. time</div>
          <div className="flex items-center justify-center gap-2">
            <Clock className="w-4 h-4 text-primary-400 shrink-0" />
            <span className="font-semibold text-app-text text-sm">2–3 hrs</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate('/analysis/code')}
          className="w-full border border-app-border rounded-xl py-2.5 px-3 text-sm font-medium text-app-muted hover:border-primary-500/40 hover:text-primary-400 flex items-center justify-center gap-2 transition-colors"
        >
          <MapPin className="w-4 h-4" /> Code locations
        </button>
        <button
          type="button"
          onClick={() => navigate('/analysis/issues')}
          className="w-full border border-app-border rounded-xl py-2.5 px-3 text-sm font-medium text-app-muted hover:border-primary-500/40 hover:text-primary-400 flex items-center justify-center gap-2 transition-colors"
        >
          <ClipboardList className="w-4 h-4" /> Issue analysis
        </button>
      </div>
    </aside>
  )

  return (
    <div className="min-h-full bg-app-bg text-app-text pb-12">
      {!prPanelOpen && (
        <button
          type="button"
          onClick={() => setPrPanelOpen(true)}
          className="fixed right-0 top-1/2 z-30 -translate-y-1/2 flex flex-col items-center gap-1.5 rounded-l-xl border border-r-0 border-app-border bg-app-surface py-3 px-2 shadow-lg hover:border-primary-500/40 transition-colors"
          aria-label="Show PR draft panel"
          title="Show PR draft"
        >
          <ChevronLeft className="w-4 h-4 text-app-muted shrink-0" />
          <Rocket className="w-4 h-4 text-accent-400 shrink-0" />
          <span className="text-[10px] font-semibold text-app-text leading-tight text-center">PR</span>
        </button>
      )}

      <header className="border-b border-app-border bg-app-surface/90 backdrop-blur-sm sticky top-0 z-20">
        <div className="max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-5 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <h1 className="text-2xl sm:text-3xl font-bold text-app-text tracking-tight">Contributor briefing</h1>
              <p className="text-sm sm:text-base text-app-muted leading-relaxed max-w-2xl">
                Guide for contributing to <span className="text-app-text font-medium">{repoInfo?.name || 'this repository'}</span>
                {targetIssue?.number != null && (
                  <>
                    {' '}
                    · Issue <span className="text-primary-400 font-medium">#{targetIssue.number}</span>
                  </>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {typeof toggleAnalysisNav === 'function' && (
                <button
                  type="button"
                  onClick={toggleAnalysisNav}
                  className={toolBtn}
                  title={analysisNavOpen ? 'Hide left navigation' : 'Show left navigation'}
                >
                  {analysisNavOpen ? (
                    <>
                      <PanelLeftClose className="w-4 h-4" />
                      <span className="hidden sm:inline">Hide nav</span>
                    </>
                  ) : (
                    <>
                      <PanelLeft className="w-4 h-4" />
                      <span className="hidden sm:inline">Show nav</span>
                    </>
                  )}
                </button>
              )}
              {prPanelOpen ? (
                <button type="button" onClick={() => setPrPanelOpen(false)} className={`${toolBtn} hidden xl:inline-flex`}>
                  <PanelRightClose className="w-4 h-4" />
                  <span>Hide PR panel</span>
                </button>
              ) : (
                <button type="button" onClick={() => setPrPanelOpen(true)} className={`${toolBtn} hidden xl:inline-flex`}>
                  <Rocket className="w-4 h-4 text-accent-400" />
                  <span>Show PR panel</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleExportMarkdown}
                disabled={!briefing.briefing_markdown}
                className={`${toolBtn} disabled:opacity-40`}
              >
                <Download className="w-4 h-4" />
                Markdown
              </button>
              <button
                type="button"
                onClick={handleExportPdf}
                disabled={exporting || !briefing.briefing_markdown}
                className="inline-flex items-center gap-2 rounded-lg bg-accent-500 text-[#0b0f14] px-4 py-2 text-sm font-semibold hover:bg-accent-600 disabled:opacity-40 transition-colors"
              >
                {exporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Exporting…
                  </>
                ) : (
                  <>
                    <FileDown className="w-4 h-4" />
                    PDF
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div
        className={`max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 pt-8 sm:pt-10 ${
          prPanelOpen ? 'grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_min(400px,36vw)] gap-10 xl:gap-12' : 'max-w-4xl'
        }`}
      >
        {mainColumn}
        {prPanelOpen && prSidebar}
      </div>

      {!prPanelOpen && briefing.pr_draft && (
        <div className="xl:hidden fixed bottom-4 right-4 z-30">
          <button
            type="button"
            onClick={() => setPrPanelOpen(true)}
            className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-4 py-3 text-sm font-semibold text-app-text shadow-lg hover:border-primary-500/40"
          >
            <Rocket className="w-4 h-4 text-accent-400" />
            PR draft
          </button>
        </div>
      )}
    </div>
  )
}
