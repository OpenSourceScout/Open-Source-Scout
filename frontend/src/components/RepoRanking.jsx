import { Target, Monitor, Star, ClipboardList, Check, Loader2, Rocket } from 'lucide-react'
import './RepoRanking.css'

/**
 * Component to display ranked repositories found by Pathfinder agent.
 * Shows top 5 repos with scores and allows user to select one.
 */
export default function RepoRanking({ repos, onSelectRepo, loading, readOnly = false, selectedRepoName = null }) {
  if (!repos || repos.length === 0) {
    return (
      <div className="repo-ranking-empty">
        <h3>No repositories found</h3>
        <p>Try adjusting your tech stack or adding more skills.</p>
      </div>
    )
  }

  const getScoreColor = (score) => {
    if (score >= 70) return '#22c55e'
    if (score >= 50) return '#eab308'
    if (score >= 30) return '#f97316'
    return '#ef4444'
  }

  return (
    <div className="repo-ranking">
      <div className="repo-ranking-header">
        <h2><Target className="w-5 h-5 inline mr-1" /> Top Matching Repositories</h2>
        <p>Based on your tech stack, we found these beginner-friendly projects:</p>
      </div>

      <div className="repo-list">
        {repos.map((repo, index) => {
          const isSelected = selectedRepoName === repo.full_name
          return (
            <div key={repo.full_name} className={`repo-card ${isSelected ? 'selected' : ''}`}>
              <div className="repo-rank">#{index + 1}</div>
              
              <div className="repo-main">
                <div className="repo-header">
                  <h3 className="repo-name">
                    <a href={repo.url} target="_blank" rel="noreferrer">
                      {repo.full_name}
                    </a>
                    {isSelected && <span className="selected-badge"><Check className="w-3 h-3 inline" /> Selected</span>}
                  </h3>
                  <div 
                    className="repo-score"
                    style={{ backgroundColor: getScoreColor(repo.score_total) }}
                  >
                    {repo.score_total}/100
                  </div>
                </div>
                
                <p className="repo-description">{repo.description}</p>
                
                <div className="repo-meta">
                  {repo.language && (
                    <span className="meta-item language">
                      <Monitor className="w-4 h-4 inline" /> {repo.language}
                    </span>
                  )}
                  <span className="meta-item stars">
                    <Star className="w-4 h-4 inline" /> {repo.stars.toLocaleString()}
                  </span>
                  <span className="meta-item issues">
                    <ClipboardList className="w-4 h-4 inline" /> {repo.open_issues} issues
                  </span>
                </div>

                {repo.topics && repo.topics.length > 0 && (
                  <div className="repo-topics">
                    {repo.topics.map(topic => (
                      <span key={topic} className="topic-tag">{topic}</span>
                    ))}
                  </div>
                )}
                
                <div className="score-breakdown">
                  <h4>Score Breakdown</h4>
                  <div className="score-bars">
                    <ScoreBar 
                      label="Tech Match" 
                      score={repo.score_breakdown.tech_match} 
                      max={40} 
                    />
                    <ScoreBar 
                      label="Beginner Friendly" 
                      score={repo.score_breakdown.beginner_friendliness} 
                      max={25} 
                    />
                    <ScoreBar 
                      label="Activity" 
                      score={repo.score_breakdown.activity} 
                      max={15} 
                    />
                    <ScoreBar 
                      label="Community" 
                      score={repo.score_breakdown.community} 
                      max={10} 
                    />
                    <ScoreBar 
                      label="Issues" 
                      score={repo.score_breakdown.issue_availability} 
                      max={10} 
                    />
                  </div>
                </div>
                
                <div className="repo-reasons">
                  <h4>Why this matches you:</h4>
                  <ul>
                    {repo.why_match.map((reason, i) => (
                      <li key={i}>{reason}</li>
                    ))}
                  </ul>
                </div>
              </div>
              
              <div className="repo-action">
                {readOnly ? (
                  isSelected ? (
                    <div className="selected-indicator">
                      <Check className="w-4 h-4 inline" /> Analyzed
                    </div>
                  ) : (
                    <div className="disabled-indicator">
                      Selection locked
                    </div>
                  )
                ) : (
                  <button 
                    className="btn-select"
                    onClick={() => onSelectRepo(repo)}
                    disabled={loading}
                  >
                    {loading ? <><Loader2 className="w-4 h-4 inline animate-spin mr-1" /> Loading...</> : <><Rocket className="w-4 h-4 inline mr-1" /> Select & Analyze</>}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScoreBar({ label, score, max }) {
  const percentage = (score / max) * 100
  
  return (
    <div className="score-bar-container">
      <span className="score-label">{label}</span>
      <div className="score-bar-bg">
        <div 
          className="score-bar-fill" 
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="score-value">{score}/{max}</span>
    </div>
  )
}
