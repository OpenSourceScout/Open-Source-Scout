import './CodeLocator.css'

export default function CodeLocator({ results }) {
  const agent2 = results?.agent2_output
  const agent3 = results?.agent3_output
  const repo = results?.repo

  const openInNewTab = (filePath) => {
    if (!repo) return
    const [owner, repoName] = repo.full_name.split('/')
    const branchName = agent3?.pr_draft?.branch_name || `scout-edit-${agent2?.issue_number || 'edit'}`
    const commitMessage = agent3?.pr_draft?.commit_message || 'Update file via Open Source Scout'
    const params = new URLSearchParams({
      owner,
      repo: repoName,
      path: filePath,
      ref: repo.default_branch || 'main',
      branchName,
      commitMessage,
    })
    const base = window.location.origin + (window.location.pathname || '').replace(/\/$/, '')
    window.open(`${base}/editor?${params.toString()}`, '_blank')
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
                onClick={() => openInNewTab(hit.path)}
              >
                Load full file
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
