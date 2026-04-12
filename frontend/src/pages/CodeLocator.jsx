import { useOutletContext, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { MapPin, FileCode, Package, AlertTriangle, Pencil } from 'lucide-react'
import { getFileContent } from '../api'

const BINARY_EXTENSIONS = [
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.bmp',
  '.webp',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.mp3',
  '.mp4',
  '.avi',
  '.mov',
  '.wav',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
]

function isBinaryFile(path) {
  if (!path) return false
  const lowerPath = path.toLowerCase()
  return BINARY_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))
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

export default function CodeLocator() {
  const context = useOutletContext()
  const analysisResult = context?.analysisResult
  const repoInfo = context?.repoInfo

  const location = useLocation()
  const navigate = useNavigate()

  const [selectedFile, setSelectedFile] = useState(null)
  const [fileContent, setFileContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const codeLocations = analysisResult?.agent2_output?.hits || []
  const selectedIssue = location.state?.selectedIssue
  const targetIssue = analysisResult?.target_issue
  const issueNumber = targetIssue?.number ?? selectedIssue?.issue_number
  const issueOpened = formatIssueDate(targetIssue?.created_at)

  useEffect(() => {
    if (codeLocations.length > 0 && !selectedFile) {
      setSelectedFile(codeLocations[0])
    }
  }, [codeLocations])

  const handleFileSelect = async (loc) => {
    setSelectedFile(loc)
    setError(null)

    if (isBinaryFile(loc?.path)) {
      setFileContent(null)
      setError('Binary files cannot be displayed. Use "View on GitHub" to see this file.')
      setLoading(false)
      return
    }

    setLoading(true)

    try {
      if (repoInfo && loc?.path) {
        const response = await getFileContent(repoInfo.owner, repoInfo.name, loc.path)
        const content = typeof response === 'string' ? response : response?.content
        setFileContent(content || null)
      } else {
        setFileContent(loc?.snippet || null)
      }
    } catch (err) {
      console.error('Failed to load file:', err)
      setError(err.message || 'Failed to load file')
      setFileContent(null)
    } finally {
      setLoading(false)
    }
  }

  const handleOpenInEditor = () => {
    if (!selectedFile || !repoInfo) return
    const ref = analysisResult?.repo?.default_branch || 'main'
    const params = new URLSearchParams({
      owner: repoInfo.owner,
      repo: repoInfo.name,
      path: selectedFile.path,
      ref,
    })
    if (analysisResult) {
      const analysisKey = `scout-editor-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
      try {
        sessionStorage.setItem(analysisKey, JSON.stringify(analysisResult))
        params.set('analysisKey', analysisKey)
      } catch (e) {
        console.error('Could not store analysis for editor tab', e)
      }
    }
    const base = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/$/, '')
    window.open(`${base}/editor?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  const emptyState = (title, body, btnLabel, onNavigate) => (
    <div className="flex items-center justify-center h-full min-h-[50vh] bg-app-bg">
      <div className="text-center px-4">
        <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-4">
          <MapPin className="w-8 h-8 text-app-muted" />
        </div>
        <h2 className="text-xl font-semibold text-app-text mb-2">{title}</h2>
        <p className="text-app-muted mb-4 max-w-md mx-auto">{body}</p>
        <button
          type="button"
          onClick={onNavigate}
          className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600 transition-colors"
        >
          {btnLabel}
        </button>
      </div>
    </div>
  )

  if (!analysisResult) {
    return emptyState(
      'No Analysis Data',
      'Run an analysis first to see code locations.',
      'Go to Dashboard',
      () => navigate('/dashboard')
    )
  }

  if (!analysisResult.target_issue) {
    return emptyState(
      'No Issue Selected',
      <>Select an issue and click <strong className="text-app-text">Analyze This Issue</strong> to see relevant code locations.</>,
      'Go to Issue Ranking',
      () => navigate('/analysis/issues')
    )
  }

  return (
    <div className="h-full flex flex-col bg-app-bg text-app-text">
      <header className="bg-app-surface border-b border-app-border px-6 py-4 shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-app-text">Code Locator</h1>
            <p className="text-sm text-app-muted">
              {codeLocations.length} relevant code locations identified
              {issueNumber != null && (
                <span className="text-primary-400"> for issue #{issueNumber}</span>
              )}
            </p>
            {targetIssue && (
              <div className="mt-2 text-sm text-app-text space-y-1">
                <p className="font-medium leading-snug">{targetIssue.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-app-muted">
                  {issueOpened && <span>Opened {issueOpened}</span>}
                  {targetIssue.html_url && (
                    <a
                      href={targetIssue.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-400 hover:underline"
                    >
                      View issue on GitHub
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={handleOpenInEditor}
            disabled={!selectedFile}
            className="bg-accent-500 text-[#0b0f14] px-4 py-2 rounded-lg font-semibold hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            <Pencil className="w-4 h-4" /> Open in Editor
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="w-80 border-r border-app-border overflow-y-auto bg-app-surface shrink-0">
          <div className="p-4">
            <h3 className="text-xs font-medium text-app-muted uppercase tracking-wide mb-3">Relevant Files</h3>
            <div className="space-y-2">
              {codeLocations.map((loc, index) => (
                <div
                  key={index}
                  onClick={() => handleFileSelect(loc)}
                  className={`p-3 rounded-lg cursor-pointer transition-all duration-200 border ${
                    selectedFile === loc
                      ? 'bg-primary-500/10 border-primary-500/40'
                      : 'bg-app-bg border-transparent hover:border-app-border'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="w-4 h-4 text-app-muted shrink-0" />
                    <span className="font-mono text-sm text-app-text truncate">
                      {loc.path?.split('/').pop() || loc.path || 'Unknown file'}
                    </span>
                  </div>
                  <div className="text-xs text-app-muted truncate pl-6">{loc.path || 'No path available'}</div>
                  {loc.symbols && loc.symbols.length > 0 && (
                    <div className="text-xs text-primary-400 mt-1 pl-6">
                      {loc.symbols.slice(0, 2).join(', ')}
                      {loc.symbols.length > 2 && ` +${loc.symbols.length - 2}`}
                    </div>
                  )}
                </div>
              ))}

              {codeLocations.length === 0 && (
                <div className="text-center py-8 text-app-muted text-sm">No code locations found.</div>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col bg-[#0b0f14] min-w-0">
          {selectedFile ? (
            <>
              <div className="bg-app-surface px-4 py-2 flex items-center justify-between border-b border-app-border">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="w-4 h-4 text-app-muted shrink-0" />
                  <span className="font-mono text-sm text-app-text truncate">{selectedFile.path}</span>
                </div>
                <a
                  href={`https://github.com/${repoInfo?.owner}/${repoInfo?.name}/blob/main/${selectedFile.path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-app-muted hover:text-primary-400 transition-colors shrink-0 ml-2"
                >
                  View on GitHub →
                </a>
              </div>

              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full min-h-[200px]">
                    <div className="flex items-center gap-2 text-app-muted">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Loading file...
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full min-h-[200px]">
                    <div className="text-center px-8">
                      <div className="w-16 h-16 bg-app-surface rounded-full flex items-center justify-center mx-auto mb-4 border border-app-border">
                        {isBinaryFile(selectedFile?.path) ? (
                          <Package className="w-8 h-8 text-app-muted" />
                        ) : (
                          <AlertTriangle className="w-8 h-8 text-amber-400" />
                        )}
                      </div>
                      <p className="text-amber-400 mb-2 font-medium">
                        {isBinaryFile(selectedFile?.path) ? 'Binary File' : 'Failed to load file'}
                      </p>
                      <p className="text-sm text-app-muted mb-4">{error}</p>
                      <a
                        href={`https://github.com/${repoInfo?.owner}/${repoInfo?.name}/blob/main/${selectedFile?.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-app-surface hover:bg-app-elevated border border-app-border text-app-text px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        View on GitHub
                      </a>
                    </div>
                  </div>
                ) : fileContent ? (
                  <pre className="p-4 text-sm font-mono text-[#e6edf3] leading-relaxed">
                    <code>{fileContent}</code>
                  </pre>
                ) : selectedFile.snippet ? (
                  <pre className="p-4 text-sm font-mono text-[#e6edf3] leading-relaxed">
                    <code>{selectedFile.snippet}</code>
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-app-muted min-h-[200px]">
                    <div className="text-center">
                      <p className="mb-2">Select a file to view contents</p>
                      <p className="text-sm text-app-muted/80">Use Open in Editor for full editing.</p>
                    </div>
                  </div>
                )}
              </div>

              {selectedFile.why_relevant && (
                <div className="bg-app-surface border-t border-app-border p-4">
                  <h3 className="text-sm font-medium text-app-text mb-2">Why this file?</h3>
                  <p className="text-sm text-app-muted">{selectedFile.why_relevant}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-app-muted min-h-[200px]">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-app-border mb-3 mx-auto block" />
                <p>Select a file to view code</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
