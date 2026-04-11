import { Search, FolderOpen, ClipboardList, Circle } from 'lucide-react'
import './CodeLocator.css'

export default function CodeLocator({ results }) {
  const agent2 = results?.agent2_output
  const agent3 = results?.agent3_output
  const repo = results?.repo

  const openInEditor = (filePath) => {
    if (!repo) return
    const [owner, repoName] = repo.full_name.split('/')
    const ref = repo.default_branch || 'main'
    const params = new URLSearchParams({
      owner,
      repo: repoName,
      path: filePath,
      ref,
    })
    const payload = {
      analysisData: {
        agent2_output: agent2,
        agent3_output: agent3,
        repo,
      },
    }
    const analysisKey = `scout-editor-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
    try {
      sessionStorage.setItem(analysisKey, JSON.stringify(payload))
      params.set('analysisKey', analysisKey)
    } catch (e) {
      console.error('Could not store analysis for editor tab', e)
    }
    const base = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/$/, '')
    window.open(`${base}/editor?${params.toString()}`, '_blank', 'noopener,noreferrer')
  }

  if (!results?.success || !agent2) {
    return (
      <div className="empty-state">
        Run an analysis to see code locations
      </div>
    )
  }

  const ConfidenceDot = ({ level }) => {
    const colors = { High: 'text-green-500', Medium: 'text-yellow-500', Low: 'text-red-500' }
    return <Circle className={`w-3 h-3 inline fill-current ${colors[level] || 'text-gray-400'}`} />
  }

  return (
    <div className="code-locator">
      <h3><Search className="w-4 h-4 inline mr-1" /> Code Analysis for Issue #{agent2.issue_number}</h3>
      <p><strong>Confidence:</strong> <ConfidenceDot level={agent2.confidence} /> {agent2.confidence}</p>
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
                onClick={() => openInEditor(hit.path)}
              >
                Open in Editor →
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
          <h4><ClipboardList className="w-4 h-4 inline mr-1" /> Additional Files to Check</h4>
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
