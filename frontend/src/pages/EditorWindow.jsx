import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import MonacoEditor from '@monaco-editor/react'
import { getFileContent, pushFile } from '../api'
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
  const ownerParam = searchParams.get('owner')
  const repoParam = searchParams.get('repo')
  const pathParam = searchParams.get('path')
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
    <div className="editor-panel editor-window">
      <h3>Editor – {pathParam ? `Editing ${pathParam}` : 'Load a file'}</h3>
      {!ownerParam && (
        <p className="editor-desc">Load any file from a GitHub repo, or open from Code Locator via &quot;Load full file&quot;.</p>
      )}
      <div className="editor-form">
        <input
          placeholder="Owner (e.g. encode)"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          disabled={loading}
        />
        <input
          placeholder="Repo (e.g. httpx)"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          disabled={loading}
        />
        <input
          placeholder="File path (e.g. README.md)"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={loading}
        />
        <input
          placeholder="Branch (default: main)"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
          disabled={loading}
        />
        <button className="btn btn-load" onClick={handleLoad} disabled={loading}>
          {loading ? 'Loading...' : 'Load file'}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {success && (
        <div className="alert alert-success">
          Pushed to <a href={success.branch_url} target="_blank" rel="noreferrer">
            {success.fork_owner}/{success.fork_repo}:{success.branch}
          </a>
          {success.fork_owner !== success.upstream_owner && (
            <p><a href={success.pr_url} target="_blank" rel="noreferrer">Open a Pull Request</a></p>
          )}
        </div>
      )}
      {content && (
        <>
          <div className="editor-toolbar">
            <div className="editor-push-form">
              <input
                placeholder="Branch name for push"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                disabled={pushing}
              />
              <input
                placeholder="Commit message"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                disabled={pushing}
              />
            </div>
            <div className="editor-actions">
              <button className="btn btn-primary" onClick={handlePush} disabled={pushing}>
                {pushing ? 'Pushing...' : 'Save and push'}
              </button>
              <button className="btn" onClick={handleClear}>Clear</button>
            </div>
          </div>
          <div className="monaco-wrap">
            <MonacoEditor
              height="calc(100vh - 200px)"
              theme="vs-dark"
              language={getLanguage(path)}
              value={content}
              onChange={(v) => setContent(v ?? '')}
              options={{
                minimap: { enabled: true },
                lineNumbers: 'on',
                wordWrap: 'on',
                fontSize: 14,
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}
