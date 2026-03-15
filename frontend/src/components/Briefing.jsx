import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { FileDown, FileText, ClipboardList, FlaskConical, AlertTriangle } from 'lucide-react'
import { exportPdf } from '../api'
import './Briefing.css'

export default function Briefing({ results }) {
  const agent3 = results?.agent3_output
  const [copyMsg, setCopyMsg] = useState(null)

  if (!results?.success || !agent3) {
    return (
      <div className="empty-state">
        Run an analysis to see the briefing document
      </div>
    )
  }

  const pr = agent3.pr_draft || {}
  const handleDownloadMd = () => {
    const blob = new Blob([agent3.briefing_markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contributor_briefing.md'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDownloadPdf = async () => {
    try {
      const blob = await exportPdf(agent3.briefing_markdown)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'contributor_briefing.pdf'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      alert(err.message)
    }
  }

  const handleCopyPR = () => {
    const text = `Branch: ${pr.branch_name}
Commit: ${pr.commit_message}
Title: ${pr.pr_title}

${pr.pr_body}`
    navigator.clipboard.writeText(text).then(() => {
      setCopyMsg('Copied!')
      setTimeout(() => setCopyMsg(null), 2000)
    })
  }

  return (
    <div className="briefing">
      <div className="briefing-actions">
        <button className="btn" onClick={handleDownloadMd}><FileDown className="w-4 h-4 inline mr-1" /> Download Markdown</button>
        <button className="btn" onClick={handleDownloadPdf}><FileText className="w-4 h-4 inline mr-1" /> Download PDF</button>
        <button className="btn" onClick={handleCopyPR}>
          <ClipboardList className="w-4 h-4 inline mr-1" /> Copy PR Draft {copyMsg && `(${copyMsg})`}
        </button>
      </div>
      <hr />
      <div className="briefing-markdown">
        <ReactMarkdown>{agent3.briefing_markdown}</ReactMarkdown>
      </div>
      <hr />
      <h4><FileText className="w-4 h-4 inline mr-1" /> PR Draft</h4>
      <pre className="pr-commands">
        <code>git checkout -b {pr.branch_name}</code>
        <code>git commit -m {JSON.stringify(pr.commit_message)}</code>
        <code># PR Title: {pr.pr_title}</code>
      </pre>
      <details>
        <summary>Full PR Body</summary>
        <div className="pr-body">
          <ReactMarkdown>{pr.pr_body || ''}</ReactMarkdown>
        </div>
      </details>
      {agent3.test_commands?.length > 0 && (
        <>
          <h4><FlaskConical className="w-4 h-4 inline mr-1" /> Test Commands</h4>
          {agent3.test_commands.map((cmd, i) => (
            <pre key={i} className="pr-commands"><code>{cmd}</code></pre>
          ))}
        </>
      )}
      {agent3.risk_notes?.length > 0 && (
        <>
          <h4><AlertTriangle className="w-4 h-4 inline mr-1" /> Risk Notes</h4>
          <ul className="risk-notes">
            {agent3.risk_notes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
