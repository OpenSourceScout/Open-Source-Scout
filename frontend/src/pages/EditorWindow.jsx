import { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react'
import { useSearchParams, useLocation } from 'react-router-dom'
import MonacoEditor, { DiffEditor } from '@monaco-editor/react'
import { FileCode, Pencil, ChevronDown, PanelLeftClose, PanelLeftOpen, Download, FileDown } from 'lucide-react'
import { getFileContent, pushFile, pushFilesBatch, exportPdf, feedbackExport, reviewAndPushCode } from '../api'
import FileTree from '../components/FileTree'
import ScoutLogo from '../components/ScoutLogo'
import TerminalDock from '../components/TerminalDock'
import { getLanguage } from '../utils/editorLanguage'
import { devDebug } from '../utils/devLog'
import './EditorWindow.css'

function extractHighlightedPathsFromAnalysis(analysis) {
  if (!analysis || typeof analysis !== 'object') return []

  const hits = analysis?.agent2_output?.hits
  if (!Array.isArray(hits)) return []

  return Array.from(
    new Set(
      hits
        .map((hit) => (typeof hit?.path === 'string' ? hit.path.trim() : ''))
        .filter(Boolean)
    )
  )
}

export default function EditorWindow() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  
  const ownerParam = searchParams.get('owner') || location.state?.repoInfo?.owner
  const repoParam = searchParams.get('repo') || location.state?.repoInfo?.name
  const pathParam = searchParams.get('path') || location.state?.filePath
  const refParam = searchParams.get('ref') || 'main'
  const analysisKey = searchParams.get('analysisKey')
  const analysisFromTabOpen = useMemo(() => {
    if (!analysisKey) return null
    try {
      const raw = sessionStorage.getItem(analysisKey) || localStorage.getItem(analysisKey)
      if (!raw) return null
      return JSON.parse(raw)
    } catch {
      return null
    }
  }, [analysisKey])
  const analysisDataParam =
    analysisFromTabOpen?.analysisData ??
    analysisFromTabOpen?.analysisResult ??
    analysisFromTabOpen ??
    location.state?.analysisData ??
    location.state?.analysisResult
  const fallbackHighlightedFiles = useMemo(
    () => extractHighlightedPathsFromAnalysis(analysisDataParam),
    [analysisDataParam]
  )

  const [owner, setOwner] = useState(ownerParam || '')
  const [repo, setRepo] = useState(repoParam || '')
  const [path, setPath] = useState(pathParam || '')
  const [branch, setBranch] = useState(refParam || 'main')
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [branchName, setBranchName] = useState('scout-edit')
  const [commitMessage, setCommitMessage] = useState('Update file via Open Source Scout')
  
  // File tree state
  const [fileTree, setFileTree] = useState([])
  const [highlightedFiles, setHighlightedFiles] = useState([])
  const [highlightedCount, setHighlightedCount] = useState(0)
  const [analysisData, setAnalysisData] = useState(analysisDataParam || {})
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [reviewing, setReviewing] = useState(false)
  const [exportingBriefing, setExportingBriefing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [reviewFeedback, setReviewFeedback] = useState(null)

  const reviewFeedbackByPath = useMemo(() => {
    if (!reviewFeedback?.file_feedback) return new Map()
    const map = new Map()
    reviewFeedback.file_feedback.forEach((entry) => {
      if (entry?.file_path) map.set(entry.file_path, entry)
    })
    return map
  }, [reviewFeedback])

  const [showReview, setShowReview] = useState(false)
  const [reviewFiles, setReviewFiles] = useState([]) // [{ path, original, modified }]
  const [reviewSelectedPath, setReviewSelectedPath] = useState(null)
  // Terminal panel is hidden by default
  const [showTerminalPanel, setShowTerminalPanel] = useState(false)
  const [showRepoPanel, setShowRepoPanel] = useState(true)
  const [showRightPanel, setShowRightPanel] = useState(true)
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [rightPanelWidth, setRightPanelWidth] = useState(250)
  const isDragging = useRef(false)
  const dragStartX = useRef(0)

  // Modified files tracking in session storage
  const modifiedFilesKey = `scout-session-${owner}-${repo}-modified`
  const modifiedContentsKey = `scout-session-${owner}-${repo}-contents`
  
  const [modifiedFiles, setModifiedFiles] = useState(() => {
    try {
      const stored = sessionStorage.getItem(modifiedFilesKey)
      return stored ? new Set(JSON.parse(stored)) : new Set()
    } catch {
      return new Set()
    }
  })

  // Persist modified files to sessionStorage
  useEffect(() => {
    sessionStorage.setItem(modifiedFilesKey, JSON.stringify(Array.from(modifiedFiles)))
  }, [modifiedFiles, modifiedFilesKey])

  // Save edited content to sessionStorage whenever content changes
  useEffect(() => {
    if (path && content) {
      try {
        const contents = JSON.parse(sessionStorage.getItem(modifiedContentsKey) || '{}')
        contents[path] = content
        sessionStorage.setItem(modifiedContentsKey, JSON.stringify(contents))
      } catch (err) {
        console.error('Failed to save edited content:', err)
      }
    }
  }, [path, content])

  const loadFile = useCallback(async (o, r, p, ref) => {
    setLoading(true)
    setError(null)
    try {
      const { content: c } = await getFileContent(o, r, p, ref || 'main')
      setContent(c)
      setOriginalContent(c)
      // Remove from modified set if this is being reloaded
      setModifiedFiles(prev => {
        const next = new Set(prev)
        next.delete(p)
        return next
      })
    } catch (err) {
      setError(err.message)
      setContent('')
      setOriginalContent('')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load file tree on mount
  useEffect(() => {
    const loadFileTree = async () => {
      if (!ownerParam || !repoParam) return
      
      try {
        // Fetch file tree with analysis metadata
        const response = await fetch(
          `/api/repos/${ownerParam}/${repoParam}/tree/with-analysis`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ref: refParam || 'HEAD',
              analysis_data: analysisDataParam || {},
              max_files: 500,
            }),
          }
        )
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.detail || `API error: ${response.status}`)
        }
        
        const data = await response.json()
        const highlightedFromTree = data.files
          ?.filter(f => f.highlighted === true && f.type === 'file')
          .map(f => f.path) || []
        const combinedHighlighted = Array.from(new Set([
          ...highlightedFromTree,
          ...fallbackHighlightedFiles,
        ]))

        const highlightedSet = new Set(combinedHighlighted)
        const normalizedFiles = (data.files || []).map((file) => {
          if (file?.type !== 'file') return file
          return {
            ...file,
            highlighted: file.highlighted === true || highlightedSet.has(file.path),
          }
        })

        setFileTree(normalizedFiles)
        setHighlightedFiles(combinedHighlighted)
        setHighlightedCount(Math.max(data.highlighted_count || 0, combinedHighlighted.length))
        
        // Debug logging (dev only)
        devDebug('Tree API Response:', {
          totalFiles: data.files?.length || 0,
          directoriesCount: data.files?.filter(f => f.type === 'dir').length || 0,
          filesCount: data.files?.filter(f => f.type === 'file').length || 0,
          highlightedCount: data.highlighted_count || 0,
          actualHighlightedInResponse: data.files?.filter(f => f.highlighted === true).length || 0,
          sampleHighlightedFiles: data.files?.filter(f => f.highlighted === true).slice(0, 3),
        })
        devDebug(`Loaded ${data.files?.length || 0} files, ${data.highlighted_count || 0} highlighted`)
      } catch (err) {
        console.error('Failed to load file tree:', err)

        if (fallbackHighlightedFiles.length > 0) {
          const fallbackFiles = fallbackHighlightedFiles.map((filePath) => ({
            path: filePath,
            type: 'file',
            size: 0,
            highlighted: true,
          }))
          setFileTree(fallbackFiles)
          setHighlightedFiles(fallbackHighlightedFiles)
          setHighlightedCount(fallbackHighlightedFiles.length)

          const msg = err.message || ''
          let reason
          if (msg.includes('401') || msg.toLowerCase().includes('unauthorized')) {
            reason = 'GitHub token is missing or expired'
          } else if (msg.includes('403') || msg.toLowerCase().includes('forbidden')) {
            reason = 'GitHub access forbidden — token may lack required scopes'
          } else if (msg.includes('429') || msg.toLowerCase().includes('rate')) {
            reason = 'GitHub API rate limit reached'
          } else {
            reason = msg || 'GitHub API unavailable'
          }
          setError(`Could not load file tree: ${reason}. Showing Code Locator highlighted files only.`)
          return
        }

        setError(`Error loading file tree: ${err.message}`)
      }
    }

    loadFileTree()
  }, [ownerParam, repoParam, refParam, analysisDataParam, fallbackHighlightedFiles])

  // Load initial file if provided
  useEffect(() => {
    if (ownerParam && repoParam && pathParam) {
      loadFile(ownerParam, repoParam, pathParam, refParam)
    }
  }, [ownerParam, repoParam, pathParam, refParam, loadFile, analysisDataParam])



  const handleFileSelect = (filePath) => {
    setPath(filePath)
    loadFile(owner, repo, filePath, branch || 'main')
  }

  const handleContentChange = (newContent) => {
    setContent(newContent ?? '')
    
    // Track modified files
    if (path && newContent !== originalContent) {
      setModifiedFiles(prev => new Set(prev).add(path))
    } else if (path && newContent === originalContent) {
      setModifiedFiles(prev => {
        const next = new Set(prev)
        next.delete(path)
        return next
      })
    }
  }

  const buildReview = async (paths) => {
    const unique = Array.from(new Set(paths)).filter(Boolean)
    if (unique.length === 0) return

    setReviewing(true)
    setError(null)
    try {
      // Load saved contents from sessionStorage
      let savedContents = {}
      try {
        savedContents = JSON.parse(sessionStorage.getItem(modifiedContentsKey) || '{}')
      } catch {}

      const originals = await Promise.all(
        unique.map(async (p) => {
          const { content: c } = await getFileContent(owner.trim(), repo.trim(), p, branch || 'main')
          return { path: p, original: c }
        })
      )
      const built = originals.map(({ path: p, original }) => ({
        path: p,
        original,
        modified: savedContents[p] ?? (p === path ? content : ''),
      }))
      setReviewFiles(built)
      setReviewSelectedPath(built[0]?.path || null)
      setShowReview(true)

      const targetIssue = analysisData?.target_issue || analysisDataParam?.target_issue
      try {
        const reviewResult = await reviewAndPushCode(
          owner.trim(),
          repo.trim(),
          {
            review_files: built.map(f => ({ path: f.path, original: f.original, modified: f.modified })),
            target_issue: targetIssue,
            briefing_markdown: briefingMarkdown,
            branch_name: branchName.trim() || 'scout-edit',
            commit_message: commitMessage.trim() || 'Update via Open Source Scout',
            base_branch: branch.trim() || 'main',
            target_mode: 'auto',
          }
        )
        setReviewFeedback(reviewResult)
      } catch (err) {
        setReviewFeedback(null)
        setError(err.message || 'Code review failed')
      }
    } catch (err) {
      setError(err.message || 'Failed to build review')
    } finally {
      setReviewing(false)
    }
  }

  const handlePush = async () => {
    if (!owner.trim() || !repo.trim() || !path.trim() || !content) {
      setError('Owner, repo, path, and content are required')
      return
    }
    await buildReview([path.trim()])
  }

  const handlePushAll = async () => {
    if (modifiedFiles.size === 0) {
      setError('No files have been modified')
      return
    }
    await buildReview(Array.from(modifiedFiles))
  }

  const finalizePushFromReview = async () => {
    if (!reviewFiles || reviewFiles.length === 0) return
    setPushing(true)
    setError(null)
    setSuccess(null)
    try {
      const filesPayload = reviewFiles.map(f => ({ file_path: f.path, content: f.modified }))

      // Proceed with the push regardless of review feedback, as per user requirement
      const result = await pushFilesBatch(owner.trim(), repo.trim(), {
        files: filesPayload,
        branch_name: branchName.trim() || 'scout-edit',
        commit_message: commitMessage.trim() || 'Update via Open Source Scout',
        base_branch: branch.trim() || 'main',
        target_mode: 'auto',
      })
      setSuccess({
        ...result,
        filesCount: result.files_count || reviewFiles.length,
      })
      const key = `scout-push-${result.upstream_owner}-${result.upstream_repo}`
      sessionStorage.setItem(key, JSON.stringify(result))
      setModifiedFiles(new Set())
      try {
        sessionStorage.setItem(modifiedContentsKey, JSON.stringify({}))
      } catch {}
      setShowReview(false)
    } catch (err) {
      setError(err.message || 'Push failed')
    } finally {
      setPushing(false)
    }
  }

  const handleClear = () => {
    setContent('')
    setOriginalContent('')
    setError(null)
    setSuccess(null)
  }

  // Briefing content for download button — try multiple sources
  const briefingMarkdown = useMemo(() => {
    // 1. From the analysis data passed to editor
    const fromParam = analysisDataParam?.agent3_output?.briefing_markdown
    if (fromParam) return fromParam
    // 2. From the main analysis session
    try {
      const raw = sessionStorage.getItem('scout_analysisResult')
      if (raw) {
        const parsed = JSON.parse(raw)
        return parsed?.agent3_output?.briefing_markdown || null
      }
    } catch { /* ignore */ }
    return null
  }, [analysisDataParam])
  const handleDownloadBriefing = async () => {
    if (!briefingMarkdown) return
    setExportingBriefing(true)
    try {
      const blob = await exportPdf(briefingMarkdown)
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `contributor_briefing_${repo || 'repo'}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      try {
        const full =
          analysisDataParam ||
          (() => {
            try {
              const raw = sessionStorage.getItem('scout_analysisResult')
              return raw ? JSON.parse(raw) : null
            } catch {
              return null
            }
          })()
        const ti = full?.target_issue
        const o = ownerParam || owner
        const r = repoParam || repo
        const bid =
          o && r && ti?.number != null ? `${o}/${r}#${ti.number}` : `${r || 'repo'}-briefing`
        feedbackExport({ briefing_id: bid, format: 'pdf' })
      } catch {
        /* ignore briefing id derivation */
      }
    } catch (err) {
      console.error('Briefing PDF export failed:', err)
      setError('Failed to export briefing as PDF: ' + err.message)
    } finally {
      setExportingBriefing(false)
    }
  }

  const startDraggingSidebar = (e) => {
    isDragging.current = true
    dragStartX.current = e.clientX
  }

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return
      const diff = e.clientX - dragStartX.current
      setSidebarWidth(prev => Math.max(200, Math.min(500, prev + diff)))
      dragStartX.current = e.clientX
    }

    const handleMouseUp = () => {
      isDragging.current = false
    }

    if (isDragging.current) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [])

  return (
    <div className="editor-window-container">
      {/* Header */}
      <header className="editor-header">
        <div className="editor-header-left">
          <div className="header-logo">
            <ScoutLogo className="h-6 w-6 rounded-md" />
            <span className="header-title">PR Pipeline Editor</span>
          </div>
        </div>
        <div className="header-actions">
          {content && (
            <>
              <button
                type="button"
                onClick={handlePush}
                disabled={pushing || reviewing}
                className="push-button"
              >
                {reviewing ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Reviewing...
                  </>
                ) : pushing ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Pushing...
                  </>
                ) : (
                  'Review & Push'
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="text-app-muted hover:text-app-text px-3 py-1.5 text-sm transition-colors"
              >
                Clear
              </button>
              {briefingMarkdown && (
                <button
                  type="button"
                  onClick={handleDownloadBriefing}
                  disabled={exportingBriefing || pushing || reviewing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-app-muted border border-app-border rounded-lg hover:border-primary-500/40 hover:text-primary-400 transition-colors disabled:opacity-40"
                  title="Download contributor briefing as PDF"
                >
                  {exportingBriefing ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Exporting…
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      Briefing PDF
                    </>
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowTerminalPanel((prev) => !prev)}
                className="editor-terminal-toggle"
              >
                {showTerminalPanel ? 'Hide Terminal' : 'Show Terminal'}
              </button>
              {modifiedFiles.size > 1 && (
                <button
                  type="button"
                  onClick={handlePushAll}
                  disabled={pushing || reviewing}
                  className="push-button-all"
                >
                  Review & Push All ({modifiedFiles.size})
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Review Modal */}
      {showReview && (
        <div className="fork-dialog-overlay" data-testid="review-changes-modal">
          <div className="review-dialog">
            <div className="review-header">
              <h2>Review changes</h2>
              {reviewFeedback && (
                <div className="review-feedback-summary">
                  <p><strong>Review Status:</strong> {reviewFeedback.overall_status}</p>
                  <p>{reviewFeedback.summary}</p>
                </div>
              )}
              <div className="review-meta">
                <span className="text-xs text-app-muted">Branch:</span>
                <span className="text-xs font-mono">{branchName}</span>
              </div>
              <button className="clear-search" onClick={() => setShowReview(false)}>✕</button>
            </div>
            <div className="review-body">
              <div className="review-sidebar">
                <div className="review-sidebar-title">Files ({reviewFiles.length})</div>
                <div className="review-file-list">
                  {reviewFiles.map(f => (
                    <div key={f.path}>
                      <button
                        type="button"
                        className={`review-file-item ${reviewSelectedPath === f.path ? 'selected' : ''}`}
                        onClick={() => setReviewSelectedPath(f.path)}
                      >
                        <span className="truncate">{f.path}</span>
                      </button>
                      {reviewFeedback && reviewSelectedPath === f.path && (
                        <div className="review-file-feedback">
                          {reviewFeedback.file_feedback.find(ff => ff.file_path === f.path)?.review_comments.map((comment, i) => (
                            <p key={i} className="text-xs text-red-400">- {comment}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="review-sidebar-form">
                  <label className="text-xs text-app-muted">Commit message</label>
                  <textarea
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    disabled={pushing || reviewing}
                    className="review-textarea"
                    rows={3}
                  />
                  <label className="text-xs text-app-muted mt-2">Branch name</label>
                  <input
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    disabled={pushing || reviewing}
                    className="review-input"
                  />
                </div>
              </div>
              <div className="review-diff">
                {(() => {
                  const current = reviewFiles.find(f => f.path === reviewSelectedPath) || reviewFiles[0]
                  if (!current) return null
                  return (
                    <DiffEditor
                      height="100%"
                      theme="vs-dark"
                      language={getLanguage(current.path)}
                      original={current.original || ''}
                      modified={current.modified || ''}
                      options={{
                        readOnly: true,
                        renderSideBySide: true,
                        minimap: { enabled: false },
                      }}
                    />
                  )
                })()}
              </div>
            </div>
            <div className="review-footer">
              <button
                type="button"
                className="text-app-muted hover:text-app-text px-3 py-1.5 text-sm transition-colors"
                onClick={() => setShowReview(false)}
                disabled={pushing || reviewing}
              >
                Back
              </button>
              <div className="review-footer-meta">
                <span className="text-xs text-app-muted">Commit:</span>
                <span className="text-xs font-mono truncate">{commitMessage || '(no message)'}</span>
              </div>
              <button
                type="button"
                onClick={finalizePushFromReview}
                disabled={pushing || reviewing}
                className="push-button"
              >
                {pushing ? 'Pushing...' : `Final Push (${reviewFiles.length})`}
              </button>
            </div>
          </div>
        </div>
      )}



      {/* Main Content */}
      <div className="editor-main-container">
        {/* Left Sidebar - File Tree */}
        {showRepoPanel && (
          <div className="editor-sidebar" style={{ width: `${sidebarWidth}px` }}>
            <div className="repo-panel-header">
              <div className="repo-panel-title-wrap">
                <span className="repo-panel-kicker">Repository</span>
                <span className="repo-panel-subtitle">File tree</span>
              </div>
              <button
                type="button"
                className="repo-collapse-btn"
                onClick={() => setShowRepoPanel(false)}
                title="Collapse repository panel"
                aria-label="Collapse repository panel"
              >
                <PanelLeftClose size={16} />
                {/* <span></span> */}
              </button>
            </div>
            {ownerParam && repoParam && (
              <FileTree
                files={fileTree}
                highlightedFiles={highlightedFiles}
                highlightedCount={highlightedCount}
                modifiedFiles={Array.from(modifiedFiles)}
                onFileSelect={handleFileSelect}
                onlyShowHighlighted={false}
              />
            )}
          </div>
        )}

        {/* Sidebar Divider */}
        {showRepoPanel && (
          <div
            className="editor-divider vertical"
            onMouseDown={startDraggingSidebar}
          />
        )}

        {/* Center - Monaco Editor */}
        <div className="editor-center">
          {/* File Info Bar */}
          {path && (
            <div className="file-info-bar">
              <FileCode className="w-4 h-4 text-app-muted" />
              <span className="font-mono text-sm">{owner}/{repo}/{path}</span>
              {modifiedFiles.has(path) && (
                <span className="file-status modified">● Modified</span>
              )}
              <span className="text-app-muted text-xs">on {branch}</span>
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
              <button onClick={() => setError(null)}>✕</button>
            </div>
          )}
          {success && (
            <div className="alert alert-success">
              <div>
                <p>
                  {success.filesCount && success.filesCount > 1 ? (
                    <>Pushed {success.filesCount} files to </>
                  ) : (
                    <>Pushed to </>
                  )}
                  <a 
                    href={success.branch_url} 
                    target="_blank" 
                    rel="noreferrer"
                    className="underline hover:opacity-80"
                  >
                    {success.fork_owner}/{success.fork_repo}:{success.branch}
                  </a>
                </p>
                {success.fork_owner !== success.upstream_owner && (
                  <p className="mt-1">
                    <a 
                      href={success.pr_url} 
                      target="_blank" 
                      rel="noreferrer"
                      className="underline hover:opacity-80"
                    >
                      Open Pull Request →
                    </a>
                  </p>
                )}
              </div>
              <button onClick={() => setSuccess(null)}>✕</button>
            </div>
          )}

          {/* Monaco Editor */}
          <div className="editor-wrapper" data-testid="editor-monaco-wrapper">
            {content ? (
              <MonacoEditor
                height="100%"
                theme="vs-dark"
                language={getLanguage(path)}
                value={content}
                onChange={handleContentChange}
                options={{
                  minimap: { enabled: true },
                  lineNumbers: 'on',
                  wordWrap: 'on',
                  fontSize: 14,
                  padding: { top: 16 },
                  formatOnPaste: true,
                  formatOnType: true,
                }}
              />
            ) : (
              <div className="editor-empty-state">
                <div className="empty-state-icon">
                  <Pencil className="w-8 h-8 text-app-muted" />
                </div>
                <h2 className="empty-state-title">
                  {loading ? 'Loading file...' : 'No file loaded'}
                </h2>
                <p className="empty-state-description">
                  {loading 
                    ? 'Fetching file contents from repository.'
                    : fileTree.length > 0
                    ? 'Select a file from the structure on the left to start editing.'
                    : 'Enter repository details to begin.'
                  }
                </p>
              </div>
            )}
          </div>

          {/* Resizable Terminal Panel */}
          <ResizableTerminalPanel show={showTerminalPanel}>
            <TerminalDock
              owner={owner}
              repo={repo}
              refName={branch}
              modifiedContentsKey={modifiedContentsKey}
              analysisData={analysisData}
            />
          </ResizableTerminalPanel>
        </div>

        {/* Right Panel - Metadata */}
        {showRightPanel && (
        <div className="editor-right-panel" style={{ width: `${rightPanelWidth}px` }}>
          <div className="right-panel-header">
            <h3 className="panel-section-title" style={{margin: 0}}>File Info</h3>
            <button
              type="button"
              onClick={() => setShowRightPanel(false)}
              className="panel-collapse-btn"
              title="Collapse panel"
            >
              ✕
            </button>
          </div>
          <div className="right-panel-content">
            <div className="panel-section-title" style={{marginTop: 0}}>Details</div>
            
            {path ? (
              <div className="panel-section">
                <div className="panel-item">
                  <span className="label">Path:</span>
                  <code className="value">{path}</code>
                </div>
                <div className="panel-item">
                  <span className="label">Status:</span>
                  <span className={`value ${modifiedFiles.has(path) ? 'modified' : 'saved'}`}>
                    {modifiedFiles.has(path) ? '🟠 Modified' : '🟢 Saved'}
                  </span>
                </div>
                <div className="panel-item">
                  <span className="label">Lines:</span>
                  <span className="value">{content.split('\n').length}</span>
                </div>
                <div className="panel-item">
                  <span className="label">Size:</span>
                  <span className="value">{(content.length / 1024).toFixed(2)} KB</span>
                </div>
              </div>
            ) : (
              <p className="text-app-muted text-sm">No file selected</p>
            )}

            <h3 className="panel-section-title">Session</h3>
            <div className="panel-section">
              <div className="panel-item">
                <span className="label">Modified Files:</span>
                <span className="value">{modifiedFiles.size}</span>
              </div>
              <div className="panel-item">
                <span className="label">Branch:</span>
                <span className="value text-xs font-mono">{branch}</span>
              </div>
            </div>

            {highlightedFiles.length > 0 && (
              <>
                <h3 className="panel-section-title">To Review</h3>
                <div className="panel-section">
                  <p className="text-xs text-app-muted mb-2">
                    {highlightedFiles.length} files need attention
                  </p>
                  <div className="highlighted-files-list scroll">
                    {highlightedFiles.map((file) => {
                      const reviewEntry = reviewFeedbackByPath.get(file)
                      const reviewNotes = reviewEntry?.review_comments || []
                      return (
                        <div key={file} className="highlighted-file-entry">
                          <div
                            className="highlighted-file-item"
                            onClick={() => handleFileSelect(file)}
                          >
                            <span className="truncate">{file.split('/').pop()}</span>
                            {modifiedFiles.has(file) && <span className="badge">✓</span>}
                          </div>
                          {reviewNotes.length > 0 && (
                            <div className="highlighted-file-feedback">
                              <span className="highlighted-file-feedback-label">Review</span>
                              <span className="highlighted-file-feedback-text">
                                {reviewNotes[0]}
                              </span>
                              {reviewNotes.length > 1 && (
                                <span className="highlighted-file-feedback-more">
                                  +{reviewNotes.length - 1} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        )}
        {!showRightPanel && (
          <button
            type="button"
            onClick={() => setShowRightPanel(true)}
            className="panel-expand-btn"
            title="Expand panel"
          >
            ◀
          </button>
        )}
        {!showRepoPanel && (
          <button
            type="button"
            onClick={() => setShowRepoPanel(true)}
            className="repo-expand-btn"
            title="Expand repository panel"
            aria-label="Expand repository panel"
          >
            <PanelLeftOpen size={16} />
            <span>Repo</span>
          </button>
        )}
      </div>
    </div>
  )
}

function clampTerminalPanelHeight(h) {
  const minH = 140
  const maxH = Math.max(minH + 40, Math.floor(typeof window !== 'undefined' ? window.innerHeight * 0.75 : 720))
  return Math.max(minH, Math.min(h, maxH))
}

function ResizableTerminalPanel({ show, children }) {
  const [height, setHeight] = useState(() => clampTerminalPanelHeight(280))
  const dragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(280)

  useLayoutEffect(() => {
    setHeight((prev) => clampTerminalPanelHeight(prev))
  }, [])

  useEffect(() => {
    const onResize = () => setHeight((prev) => clampTerminalPanelHeight(prev))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!show) return null

  const onMouseMove = (e) => {
    if (!dragging.current) return
    e.preventDefault()
    const delta = startY.current - e.clientY
    setHeight(clampTerminalPanelHeight(startHeight.current + delta))
  }

  const onMouseUp = () => {
    if (!dragging.current) return
    dragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    window.removeEventListener('mousemove', onMouseMove)
    window.removeEventListener('mouseup', onMouseUp)
  }

  const onMouseDown = (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    dragging.current = true
    startY.current = e.clientY
    startHeight.current = height
    document.body.style.cursor = 'ns-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove, { passive: false })
    window.addEventListener('mouseup', onMouseUp)
  }

  return (
    <div className="editor-terminal-panel" style={{ height: `${height}px` }}>
      <div
        className="terminal-resize-handle"
        onMouseDown={onMouseDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize terminal panel"
      />
      <div className="editor-terminal-panel-body">{children}</div>
    </div>
  )
}
