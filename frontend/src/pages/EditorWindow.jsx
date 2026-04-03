import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import MonacoEditor from '@monaco-editor/react'
import { FileCode, Pencil, ChevronDown } from 'lucide-react'
import { getFileContent, pushFile } from '../api'
import FileTree from '../components/FileTree'
import ScoutLogo from '../components/ScoutLogo'
import './EditorWindow.css'

const EXT_TO_LANG = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  jsx: 'javascript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  html: 'html',
  css: 'css',
  yaml: 'yaml',
  yml: 'yaml',
}

function getLanguage(path) {
  const ext = path?.split('.').pop()?.toLowerCase() || ''
  return EXT_TO_LANG[ext] || 'plaintext'
}

export default function EditorWindow() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  
  const ownerParam = searchParams.get('owner') || location.state?.repoInfo?.owner
  const repoParam = searchParams.get('repo') || location.state?.repoInfo?.name
  const pathParam = searchParams.get('path') || location.state?.filePath
  const refParam = searchParams.get('ref') || 'main'
  const analysisDataParam = location.state?.analysisData || location.state?.analysisResult

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
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showForkDialog, setShowForkDialog] = useState(false)
  const [forkChoiceLoading, setForkChoiceLoading] = useState(false)
  const [forkInfo, setForkInfo] = useState(null)
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
        setFileTree(data.files || [])
        setHighlightedCount(data.highlighted_count || 0)
        
        // Extract highlighted files from the response
        const highlighted = data.files
          ?.filter(f => f.highlighted === true && f.type === 'file')
          .map(f => f.path) || []
        setHighlightedFiles(highlighted)
        
        // Debug logging
        console.debug('Tree API Response:', {
          totalFiles: data.files?.length || 0,
          directoriesCount: data.files?.filter(f => f.type === 'dir').length || 0,
          filesCount: data.files?.filter(f => f.type === 'file').length || 0,
          highlightedCount: data.highlighted_count || 0,
          actualHighlightedInResponse: data.files?.filter(f => f.highlighted === true).length || 0,
          sampleHighlightedFiles: data.files?.filter(f => f.highlighted === true).slice(0, 3),
        })
        console.debug(`Loaded ${data.files?.length || 0} files, ${data.highlighted_count || 0} highlighted`)
      } catch (err) {
        console.error('Failed to load file tree:', err)
        setError(`Error loading file tree: ${err.message}`)
      }
    }

    loadFileTree()
  }, [ownerParam, repoParam, refParam, analysisDataParam])

  // Load initial file if provided
  useEffect(() => {
    if (ownerParam && repoParam && pathParam) {
      // Show fork dialog if needed
      if (!forkInfo && analysisDataParam) {
        setShowForkDialog(true)
      }
      loadFile(ownerParam, repoParam, pathParam, refParam)
    }
  }, [ownerParam, repoParam, pathParam, refParam, loadFile, analysisDataParam, forkInfo])

  const handleForkChoice = async (choice) => {
    setForkChoiceLoading(true)
    try {
      const response = await fetch(`/api/repos/${owner}/${repo}/fork-choice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Fork choice failed')
      }

      const data = await response.json()
      setForkInfo(data)
      setShowForkDialog(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setForkChoiceLoading(false)
    }
  }

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

  const handlePush = async () => {
    if (!owner.trim() || !repo.trim() || !path.trim() || !content) {
      setError('Owner, repo, path, and content are required')
      return
    }
    setPushing(true)
    setError(null)
    setSuccess(null)
    try {
      const result = await pushFile(owner.trim(), repo.trim(), {
        file_path: path.trim(),
        content,
        branch_name: branchName.trim() || 'scout-edit',
        commit_message: commitMessage.trim() || 'Update file via Open Source Scout',
        base_branch: branch.trim() || 'main',
      })
      setSuccess(result)
      const key = `scout-push-${result.upstream_owner}-${result.upstream_repo}`
      sessionStorage.setItem(key, JSON.stringify(result))
    } catch (err) {
      setError(err.message)
    } finally {
      setPushing(false)
    }
  }

  const handlePushAll = async () => {
    // Push all modified files
    if (modifiedFiles.size === 0) {
      setError('No files have been modified')
      return
    }
    
    setPushing(true)
    setError(null)
    setSuccess(null)
    
    try {
      const filesToPush = Array.from(modifiedFiles)
      console.log('🚀 Push All: Files to push:', filesToPush)
      
      const results = []
      let hasErrors = false
      
      // Load saved contents from sessionStorage
      let savedContents = {}
      try {
        savedContents = JSON.parse(sessionStorage.getItem(modifiedContentsKey) || '{}')
        console.log('📦 Loaded saved contents keys:', Object.keys(savedContents))
      } catch (err) {
        console.error('Failed to load saved contents:', err)
      }
      
      for (const filePath of filesToPush) {
        try {
          // Get the edited content from sessionStorage
          const editedContent = savedContents[filePath]
          
          console.log(`📄 Pushing ${filePath}:`, { hasContent: !!editedContent, length: editedContent?.length })
          
          if (!editedContent) {
            console.warn(`⚠️  No edited content found for ${filePath}, skipping`)
            hasErrors = true
            continue
          }
          
          const result = await pushFile(owner.trim(), repo.trim(), {
            file_path: filePath,
            content: editedContent,
            branch_name: branchName.trim() || 'scout-edit',
            commit_message: commitMessage.trim() || 'Update file via Open Source Scout',
            base_branch: branch.trim() || 'main',
          })
          console.log(`✅ Push successful for ${filePath}:`, result)
          results.push(result)
        } catch (err) {
          hasErrors = true
          console.error(`❌ Failed to push ${filePath}:`, err)
          setError(prev => prev ? `${prev}\n${err.message}` : err.message)
        }
      }
      
      if (results.length > 0) {
        // Use the last result as the success indicator (all should go to same branch/fork)
        setSuccess({
          ...results[0],
          filesCount: results.length,
          message: `Pushed ${results.length} files to ${results[0].fork_owner}/${results[0].fork_repo}:${results[0].branch}`
        })
        setModifiedFiles(new Set()) // Clear modified files after successful push
        // Clear saved contents for pushed files
        try {
          const remaining = { ...savedContents }
          filesToPush.forEach(f => delete remaining[f])
          sessionStorage.setItem(modifiedContentsKey, JSON.stringify(remaining))
        } catch (err) {
          console.error('Failed to clear saved contents:', err)
        }
      }
      
      if (hasErrors && results.length === 0) {
        setError('Failed to push all files. No files were pushed successfully.')
      } else if (hasErrors) {
        // Keep the individual error messages already set
      }
    } catch (err) {
      setError(err.message || 'Failed to push all files')
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

  const inputDark =
    'px-3 py-1.5 bg-app-input border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-muted/60 focus:outline-none focus:ring-2 focus:ring-primary-500/50'

  return (
    <div className="editor-window-container">
      {/* Header */}
      <header className="editor-header">
        <div className="editor-header-left">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="header-back-btn"
          >
            ← Back
          </button>
          <div className="header-logo">
            <ScoutLogo className="h-6 w-6 rounded-md" />
            <span className="header-title">PR Pipeline Editor</span>
          </div>
        </div>
        <div className="header-actions">
          {content && (
            <>
              <div className="action-group">
                <input
                  placeholder="Branch"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  disabled={pushing}
                  className={`${inputDark} w-40`}
                />
                <input
                  placeholder="Message"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  disabled={pushing}
                  className={`${inputDark} w-64`}
                />
              </div>
              <button
                type="button"
                onClick={handlePush}
                disabled={pushing}
                className="push-button"
              >
                {pushing ? (
                  <>
                    <svg className="spinner" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Pushing...
                  </>
                ) : (
                  'Save & Push'
                )}
              </button>
              <button
                type="button"
                onClick={handleClear}
                className="text-app-muted hover:text-app-text px-3 py-1.5 text-sm transition-colors"
              >
                Clear
              </button>
              {modifiedFiles.size > 1 && (
                <button
                  type="button"
                  onClick={handlePushAll}
                  className="text-xs px-2 py-1 border border-app-border rounded text-app-muted hover:text-app-text"
                >
                  Push All ({modifiedFiles.size})
                </button>
              )}
            </>
          )}
        </div>
      </header>

      {/* Fork Dialog */}
      {showForkDialog && (
        <div className="fork-dialog-overlay">
          <div className="fork-dialog">
            <h2>Edit Repository</h2>
            <p>
              Choose how you'd like to edit <code>{owner}/{repo}</code>:
            </p>
            <div className="fork-dialog-actions">
              <button
                onClick={() => handleForkChoice('fork')}
                disabled={forkChoiceLoading}
                className="fork-dialog-button fork-button"
              >
                {forkChoiceLoading ? 'Creating fork...' : '🍴 Fork Repository'}
                <span className="fork-dialog-hint">Create a fork in your account</span>
              </button>
              <button
                onClick={() => handleForkChoice('original')}
                disabled={forkChoiceLoading}
                className="fork-dialog-button original-button"
              >
                📝 Edit on Original
                <span className="fork-dialog-hint">If you have write access</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="editor-main-container">
        {/* Left Sidebar - File Tree */}
        <div className="editor-sidebar" style={{ width: `${sidebarWidth}px` }}>
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

        {/* Sidebar Divider */}
        <div
          className="editor-divider vertical"
          onMouseDown={startDraggingSidebar}
        />

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
          <div className="editor-wrapper">
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
        </div>

        {/* Right Panel - Metadata */}
        <div className="editor-right-panel" style={{ width: `${rightPanelWidth}px` }}>
          <div className="right-panel-content">
            <h3 className="panel-section-title">File Info</h3>
            
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
                  <div className="highlighted-files-list">
                    {highlightedFiles.slice(0, 5).map(file => (
                      <div
                        key={file}
                        className="highlighted-file-item"
                        onClick={() => handleFileSelect(file)}
                      >
                        <span className="truncate">{file.split('/').pop()}</span>
                        {modifiedFiles.has(file) && <span className="badge">✓</span>}
                      </div>
                    ))}
                    {highlightedFiles.length > 5 && (
                      <div className="text-xs text-app-muted p-2">
                        +{highlightedFiles.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
