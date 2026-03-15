import { useState } from 'react'
import { Trophy } from 'lucide-react'
import './IssueRanking.css'

export default function IssueRanking({ results }) {
  const agent1 = results?.agent1_output
  const rankedIssues = agent1?.ranked_issues || []

  const [expanded, setExpanded] = useState(1)

  if (!results?.success || !rankedIssues.length) {
    return (
      <div className="empty-state">
        Run an analysis to see issue rankings
      </div>
    )
  }

  return (
    <div className="issue-ranking">
      <h3><Trophy className="w-5 h-5 inline mr-1" /> Top Ranked Issues</h3>
      {rankedIssues.map((issue, i) => {
        const isExpanded = expanded === i + 1
        const scoreClass = issue.score_total >= 70 ? 'high' : issue.score_total >= 50 ? 'medium' : 'low'
        const bd = issue.score_breakdown || {}
        return (
          <div key={issue.number} className="issue-card">
            <button
              className="issue-header"
              onClick={() => setExpanded(isExpanded ? null : i + 1)}
            >
              <span>#{i + 1} Issue #{issue.number}: {issue.title}</span>
              <span className={`score-badge ${scoreClass}`}>{issue.score_total}/100</span>
            </button>
            {isExpanded && (
              <div className="issue-body">
                <p>
                  <a href={issue.url} target="_blank" rel="noreferrer">View on GitHub</a>
                </p>
                {issue.labels?.length > 0 && (
                  <p><strong>Labels:</strong> {issue.labels.map((l) => `\`${l}\``).join(' ')}</p>
                )}
                <h4>Score Breakdown</h4>
                <div className="breakdown">
                  <span>Labels: {bd.labels ?? 0}/25</span>
                  <span>Clarity: {bd.clarity ?? 0}/20</span>
                  <span>Activity: {bd.activity ?? 0}/15</span>
                  <span>Size: {bd.size_estimate ?? 0}/20</span>
                  <span>Risk: {bd.risk_penalty ?? 0}</span>
                </div>
                <h4>Why This Issue?</h4>
                <ul>
                  {(issue.why || []).map((r, j) => (
                    <li key={j}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
