import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import MonacoEditor from '@monaco-editor/react'
import { FileCode, Pencil } from 'lucide-react'
import { getFileContent, pushFile } from '../api'
import ScoutLogo from '../components/ScoutLogo'

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
      // Store for ContributorBriefing to show PR button
      const key = `scout-push-${result.upstream_owner}-${result.upstream_repo}`
      sessionStorage.setItem(key, JSON.stringify(result))
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

  const inputDark =
    'px-3 py-1.5 bg-app-input border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-muted/60 focus:outline-none focus:ring-2 focus:ring-primary-500/50'

  return (
    <div className="min-h-screen bg-app-bg flex flex-col text-app-text">
      <header className="bg-app-surface border-b border-app-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-app-muted hover:text-app-text transition-colors"
          >
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <ScoutLogo className="h-6 w-6 rounded-md" />
            <span className="font-semibold text-app-text">Open Source Scout</span>
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
                className={`${inputDark} w-40`}
              />
              <input
                placeholder="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                disabled={pushing}
                className={`${inputDark} w-64`}
              />
              <button
                type="button"
                onClick={handlePush}
                disabled={pushing}
                className="bg-accent-500 text-[#0b0f14] px-4 py-1.5 rounded-lg text-sm font-semibold hover:bg-accent-600 disabled:opacity-50 flex items-center gap-2 transition-colors"
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
                type="button"
                onClick={handleClear}
                className="text-app-muted hover:text-app-text px-3 py-1.5 text-sm transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      </header>

      {/* File Path Bar */}
      {!ownerParam && (
        <div className="bg-app-surface border-b border-app-border px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <input
              placeholder="Owner (e.g. encode)"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-[120px] px-3 py-2 bg-app-input border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <input
              placeholder="Repo (e.g. httpx)"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              disabled={loading}
              className="flex-1 min-w-[120px] px-3 py-2 bg-app-input border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <input
              placeholder="File path (e.g. README.md)"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              disabled={loading}
              className="flex-[2] min-w-[180px] px-3 py-2 bg-app-input border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <input
              placeholder="Branch (main)"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              disabled={loading}
              className="w-32 px-3 py-2 bg-app-input border border-app-border rounded-lg text-sm text-app-text placeholder:text-app-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            />
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading}
              className="bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-600 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Load file'}
            </button>
          </div>
        </div>
      )}

      {/* Current file indicator */}
      {pathParam && (
        <div className="bg-app-surface border-b border-app-border px-6 py-2 flex items-center gap-2">
          <FileCode className="w-4 h-4 text-app-muted" />
          <span className="font-mono text-sm text-app-text">{ownerParam}/{repoParam}/{pathParam}</span>
          <span className="text-app-muted text-xs ml-2">on {refParam}</span>
        </div>
      )}

      {/* Alerts */}
      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-900/50 border border-red-700 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mx-6 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-200 text-sm">
          <p>
            Pushed to{' '}
            <a 
              href={success.branch_url} 
              target="_blank" 
              rel="noreferrer"
              className="text-emerald-300 underline hover:text-emerald-100"
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
                className="text-emerald-300 underline hover:text-emerald-100"
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
          <div className="flex items-center justify-center h-full text-app-muted bg-app-bg">
            <div className="text-center px-4">
              <div className="w-16 h-16 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-4">
                <Pencil className="w-8 h-8 text-app-muted" />
              </div>
              <h2 className="text-xl font-semibold text-app-text mb-2">
                {loading ? 'Loading file...' : 'No file loaded'}
              </h2>
              <p className="text-app-muted max-w-sm mx-auto">
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
