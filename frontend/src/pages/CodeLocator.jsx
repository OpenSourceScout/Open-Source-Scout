import { useOutletContext, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { MapPin, FileCode, Package, AlertTriangle, Pencil } from 'lucide-react'
import { getFileContent } from '../api'

// Binary file extensions that shouldn't be loaded as text
const BINARY_EXTENSIONS = ['.exe', '.dll', '.so', '.dylib', '.bin', '.dat', '.zip', '.tar', '.gz', '.rar', '.7z', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.bmp', '.webp', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.mp3', '.mp4', '.avi', '.mov', '.wav', '.woff', '.woff2', '.ttf', '.eot', '.otf']

function isBinaryFile(path) {
  if (!path) return false
  const lowerPath = path.toLowerCase()
  return BINARY_EXTENSIONS.some(ext => lowerPath.endsWith(ext))
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

  // Use agent2_output.hits from API response
  const codeLocations = analysisResult?.agent2_output?.hits || []

  // Get selected issue from navigation state if coming from Issue Ranking
  const selectedIssue = location.state?.selectedIssue

  useEffect(() => {
    if (codeLocations.length > 0 && !selectedFile) {
      setSelectedFile(codeLocations[0])
    }
  }, [codeLocations])

  const handleFileSelect = async (loc) => {
    setSelectedFile(loc)
    setError(null)

    // Check if it's a binary file
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
        // API returns {content: string, path: string, ref: string}
        const content = typeof response === 'string' ? response : response?.content
        setFileContent(content || null)
      } else {
        // No path, just show the snippet if available
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
    if (selectedFile && repoInfo) {
      navigate('/editor', {
        state: {
          repoInfo,
          filePath: selectedFile.path,
          analysisResult
        }
      })
    }
  }

  if (!analysisResult) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <MapPin className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Analysis Data</h2>
          <p className="text-gray-500 mb-4">Run an analysis first to see code locations.</p>
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
            <MapPin className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No Issue Selected</h2>
          <p className="text-gray-500 mb-4">
            Select an issue and click <strong>"Analyse This Issue"</strong> to see relevant code locations.
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Code Locator</h1>
            <p className="text-sm text-gray-500">
              {codeLocations.length} relevant code locations identified
              {selectedIssue && (
                <span className="text-primary-600"> for issue #{selectedIssue.issue_number}</span>
              )}
            </p>
          </div>
          <button
            onClick={handleOpenInEditor}
            disabled={!selectedFile}
            className="bg-primary-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Pencil className="w-4 h-4" /> Open in Editor
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* File List */}
        <div className="w-80 border-r border-gray-200 overflow-y-auto bg-white">
          <div className="p-4">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
              Relevant Files
            </h3>
            <div className="space-y-2">
              {codeLocations.map((loc, index) => (
                <div
                  key={index}
                  onClick={() => handleFileSelect(loc)}
                  className={`p-3 rounded-lg cursor-pointer transition-all ${selectedFile === loc
                      ? 'bg-primary-50 border border-primary-200'
                      : 'bg-gray-50 border border-transparent hover:bg-gray-100'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileCode className="w-4 h-4 text-gray-600 shrink-0" />
                    <span className="font-mono text-sm text-gray-900 truncate">
                      {loc.path?.split('/').pop() || loc.path || 'Unknown file'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 truncate pl-6">
                    {loc.path || 'No path available'}
                  </div>
                  {loc.symbols && loc.symbols.length > 0 && (
                    <div className="text-xs text-primary-600 mt-1 pl-6">
                      {loc.symbols.slice(0, 2).join(', ')}
                      {loc.symbols.length > 2 && ` +${loc.symbols.length - 2}`}
                    </div>
                  )}
                </div>
              ))}

              {codeLocations.length === 0 && (
                <div className="text-center py-8 text-gray-500 text-sm">
                  No code locations found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Code Preview */}
        <div className="flex-1 overflow-hidden flex flex-col bg-gray-900">
          {selectedFile ? (
            <>
              {/* File Header */}
              <div className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-gray-400 shrink-0" />
                  <span className="font-mono text-sm text-gray-300">
                    {selectedFile.path}
                  </span>
                </div>
                <a
                  href={`https://github.com/${repoInfo?.owner}/${repoInfo?.name}/blob/main/${selectedFile.path}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-gray-400 hover:text-white transition-colors"
                >
                  View on GitHub →
                </a>
              </div>

              {/* Code Content */}
              <div className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex items-center gap-2 text-gray-400">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Loading file...
                    </div>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center px-8">
                      <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                        {isBinaryFile(selectedFile?.path) ? <Package className="w-8 h-8 text-gray-400" /> : <AlertTriangle className="w-8 h-8 text-amber-400" />}
                      </div>
                      <p className="text-amber-400 mb-2 font-medium">
                        {isBinaryFile(selectedFile?.path) ? 'Binary File' : 'Failed to load file'}
                      </p>
                      <p className="text-sm text-gray-500 mb-4">{error}</p>
                      <a
                        href={`https://github.com/${repoInfo?.owner}/${repoInfo?.name}/blob/main/${selectedFile?.path}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                        </svg>
                        View on GitHub
                      </a>
                    </div>
                  </div>
                ) : fileContent ? (
                  <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed">
                    <code>{fileContent}</code>
                  </pre>
                ) : selectedFile.snippet ? (
                  <pre className="p-4 text-sm font-mono text-gray-300 leading-relaxed">
                    <code>{selectedFile.snippet}</code>
                  </pre>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <div className="text-center">
                      <p className="mb-2">Click "Load Full File" to view contents</p>
                      <p className="text-sm text-gray-600">
                        Or use the "Open in Editor" button for full editing capabilities
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Why Relevant */}
              {selectedFile.why_relevant && (
                <div className="bg-gray-800 border-t border-gray-700 p-4">
                  <h3 className="text-sm font-medium text-gray-300 mb-2">Why this file?</h3>
                  <p className="text-sm text-gray-400">{selectedFile.why_relevant}</p>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <MapPin className="w-12 h-12 text-gray-400 mb-3 mx-auto block" />
                <p>Select a file to view code</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
