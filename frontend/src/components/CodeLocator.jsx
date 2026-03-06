import { useState } from 'react'
import Editor from '@monaco-editor/react'
import { getFileContent, pushFile } from '../api'
import './CodeLocator.css'

export default function CodeLocator({ results }) {
  const agent2 = results?.agent2_output
  const agent3 = results?.agent3_output
  const repo = results?.repo

  const [editorContent, setEditorContent] = useState('')
  const [editorPath, setEditorPath] = useState(null)
  const [editorOwner, setEditorOwner] = useState(null)
  const [editorRepo, setEditorRepo] = useState(null)
  const [editorRef, setEditorRef] = useState(null)
  const [loadError, setLoadError] = useState(null)
  const [pushError, setPushError] = useState(null)
  const [pushSuccess, setPushSuccess] = useState(null)
  const [loading, setLoading] = useState(false)
  const [pushing, setPushing] = useState(false)

  const handleLoadFile = async (path) => {
    if (!repo) return
    setLoading(true)
    setLoadError(null)
    try {
      const [owner, repoName] = repo.full_name.split('/')
      const { content } = await getFileContent(owner, repoName, path, repo.default_branch)
      setEditorContent(content)
      setEditorPath(path)
      setEditorOwner(owner)
      setEditorRepo(repoName)
      setEditorRef(repo.default_branch)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClearEditor = () => {
    setEditorContent('')
    setEditorPath(null)
    setEditorOwner(null)
    setEditorRepo(null)
    setEditorRef(null)
    setLoadError(null)
    setPushError(null)
    setPushSuccess(null)
  }

  const handlePush = async () => {
    if (!editorOwner || !editorRepo || !editorPath) return
    const branchName = agent3?.pr_draft?.branch_name || `scout-edit-${agent2?.issue_number || 'edit'}`
    const commitMsg = agent3?.pr_draft?.commit_message || 'Update file via Open Source Scout'
    setPushing(true)
    setPushError(null)
    setPushSuccess(null)
    try {
      const result = await pushFile(editorOwner, editorRepo, {
        file_path: editorPath,
        content: editorContent,
        branch_name: branchName,
        commit_message: commitMsg,
        base_branch: editorRef || 'main',
      })
      setPushSuccess(result)
      handleClearEditor()
    } catch (err) {
      setPushError(err.message)
    } finally {
      setPushing(false)
    }
  }

  if (!results?.success || !agent2) {
    return (
      <div className="empty-state">
        Run an analysis to see code locations
      </div>
    )
  }

  const confidenceColor = { High: '🟢', Medium: '🟡', Low: '🔴' }

  return (
    <div className="code-locator">
      <h3>🔍 Code Analysis for Issue #{agent2.issue_number}</h3>
      <p><strong>Confidence:</strong> {confidenceColor[agent2.confidence] || '⚪'} {agent2.confidence}</p>
      {agent2.keywords?.length > 0 && (
        <p><strong>Search Keywords:</strong> {agent2.keywords.map((k) => `\`${k}\``).join(', ')}</p>
      )}
      {agent2.call_trace_hint?.length > 0 && (
        <p><strong>Call Trace Hint:</strong> {agent2.call_trace_hint.join(' → ')}</p>
      )}
      <hr />
      <h4>📁 Relevant Files</h4>
      {agent2.hits?.map((hit, i) => (
        <div key={i} className="hit-card">
          <div className="hit-header">
            <strong>{i + 1}. `{hit.path}`</strong>
            {repo && (
              <button
                className="btn-load"
                onClick={() => handleLoadFile(hit.path)}
                disabled={loading}
              >
                {loading ? 'Loading...' : 'Load full file'}
              </button>
            )}
          </div>
          {hit.symbols?.length > 0 && (
            <p><strong>Symbols:</strong> {hit.symbols.slice(0, 10).map((s) => `\`${s}\``).join(', ')}</p>
          )}
          <p><strong>Why Relevant:</strong> {hit.why_relevant}</p>
          {hit.snippet && (
            <pre className="snippet"><code>{hit.snippet.slice(0, 1500)}</code></pre>
          )}
        </div>
      ))}
      {editorPath && (
        <>
          <hr />
          <h4>✏️ Editing: `{editorPath}`</h4>
          {loadError && <div className="alert alert-error">{loadError}</div>}
          {pushError && <div className="alert alert-error">{pushError}</div>}
          {pushSuccess && (
            <div className="alert alert-success">
              Pushed to <a href={pushSuccess.branch_url} target="_blank" rel="noreferrer">
                {pushSuccess.fork_owner}/{pushSuccess.fork_repo}:{pushSuccess.branch}
              </a>
              {pushSuccess.fork_owner !== pushSuccess.upstream_owner && (
                <p><a href={pushSuccess.pr_url} target="_blank" rel="noreferrer">Open a Pull Request</a></p>
              )}
            </div>
          )}
          <div className="editor-wrap">
            <Editor
              height="400px"
              defaultLanguage="python"
              value={editorContent}
              onChange={(v) => setEditorContent(v ?? '')}
              options={{ minimap: { enabled: false } }}
            />
          </div>
          <div className="editor-actions">
            <button className="btn btn-primary" onClick={handlePush} disabled={pushing}>
              {pushing ? 'Pushing...' : '💾 Save and push'}
            </button>
            <button className="btn" onClick={handleClearEditor}>🗑️ Clear editor</button>
          </div>
        </>
      )}
      {agent2.next_files_to_check?.length > 0 && (
        <>
          <hr />
          <h4>📋 Additional Files to Check</h4>
          <ul>
            {agent2.next_files_to_check.map((f, i) => (
              <li key={i}><code>{f}</code></li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
