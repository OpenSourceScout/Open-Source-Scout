import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import MonacoEditor from '@monaco-editor/react'
import { getFileContent, pushFile } from '../api'

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
  const branchNameParam = searchParams.get('branchName') || 'scout-edit'
  const commitMessageParam = searchParams.get('commitMessage') || 'Update file via Open Source Scout'

  const [owner, setOwner] = useState(ownerParam || '')
  const [repo, setRepo] = useState(repoParam || '')
  const [path, setPath] = useState(pathParam || '')
  const [branch, setBranch] = useState(refParam || 'main')
  const [content, setContent] = useState('')
  const [branchName, setBranchName] = useState(branchNameParam)
  const [commitMessage, setCommitMessage] = useState(commitMessageParam)
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const loadFile = useCallback(async (o, r, p, ref) => {
    setLoading(true)
    setError(null)
    try {
      const { content: c } = await getFileContent(o, r, p, ref || 'main')
      setContent(c)
    } catch (err) {
      setError(err.message)
      setContent('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (ownerParam && repoParam && pathParam) {
      loadFile(ownerParam, repoParam, pathParam, refParam)
    }
  }, [ownerParam, repoParam, pathParam, refParam, loadFile])

  const handleLoad = async () => {
    if (!owner.trim() || !repo.trim() || !path.trim()) {
      setError('Owner, repo, and path are required')
      return
    }
    await loadFile(owner.trim(), repo.trim(), path.trim(), branch.trim() || 'main')
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
    } catch (err) {
      setError(err.message)
    } finally {
      setPushing(false)
    }
  }

  const handleClear = () => {
    setContent('')
    setError(null)
    setSuccess(null)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary-500 rounded flex items-center justify-center">
              <span className="text-white text-xs">🔭</span>
            </div>
            <span className="font-semibold text-white">Open Source Scout</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {content && (
            <>
              <input
                placeholder="Branch name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                disabled={pushing}
                className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-40"
              />
              <input
                placeholder="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                disabled={pushing}
                className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 w-64"
              />
              <button 
                onClick={handlePush} 
                disabled={pushing}
                className="bg-primary-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
              >
                {pushing ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
                onClick={handleClear}
                className="text-gray-400 hover:text-white px-3 py-1.5 text-sm"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      {/* File Path Bar */}
      {!ownerParam && (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-3">
          <div className="flex items-center gap-3">
            <input
              placeholder="Owner (e.g. encode)"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={loading}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              placeholder="Repo (e.g. httpx)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              disabled={loading}
              className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              placeholder="File path (e.g. README.md)"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              disabled={loading}
              className="flex-[2] px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <input
              placeholder="Branch (main)"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={loading}
              className="w-32 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <button 
              onClick={handleLoad} 
              disabled={loading}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load file'}
            </button>
          </div>
        </div>
      )}

      {/* Current file indicator */}
      {pathParam && (
        <div className="bg-gray-800 border-b border-gray-700 px-6 py-2 flex items-center gap-2">
          <span className="text-gray-400">📄</span>
          <span className="font-mono text-sm text-gray-300">{ownerParam}/{repoParam}/{pathParam}</span>
          <span className="text-gray-500 text-xs ml-2">on {refParam}</span>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mt-4 p-3 bg-green-900/50 border border-green-700 rounded-lg text-green-200 text-sm">
          <p>
            Pushed to{' '}
            <a 
              href={success.branch_url} 
              target="_blank" 
              rel="noreferrer"
              className="text-green-300 underline hover:text-green-100"
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
                className="text-green-300 underline hover:text-green-100"
              >
                Open a Pull Request →
              </a>
            </p>
          )}
        </div>
      )}

      {/* Editor */}
      <div className="flex-1">
        {content ? (
          <MonacoEditor
            height="calc(100vh - 120px)"
            theme="vs-dark"
            language={getLanguage(path)}
            value={content}
            onChange={(v) => setContent(v ?? '')}
            options={{
              minimap: { enabled: true },
              lineNumbers: 'on',
              wordWrap: 'on',
              fontSize: 14,
              padding: { top: 16 },
            }}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">✏️</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-300 mb-2">
                {loading ? 'Loading file...' : 'No file loaded'}
              </h2>
              <p className="text-gray-500">
                {loading 
                  ? 'Please wait while we fetch the file contents.'
                  : 'Enter repository details above and click "Load file" to start editing.'
                }
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
