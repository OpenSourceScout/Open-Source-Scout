import { useEffect, useState } from 'react'
import ScoutLogo from './ScoutLogo'

const AGENT_STEPS = [
  { agent: 'Triage Nurse', message: 'Fetching and ranking open issues with AI…' },
  { agent: 'Archaeologist', message: 'Cloning the repo and locating relevant code…' },
  { agent: 'Senior Dev', message: 'Drafting fix plan and contributor briefing…' },
  { agent: 'Testing Agent', message: 'Validating agent outputs (QA loop)…' },
]

export default function AgentPipelineLoader({ repoLabel = '' }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % AGENT_STEPS.length)
    }, 4500)
    return () => clearInterval(id)
  }, [])

  const step = AGENT_STEPS[stepIndex]

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 px-6">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full border-2 border-accent-500/30 border-t-accent-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <ScoutLogo className="h-12 w-12" />
        </div>
      </div>
      <h2 className="text-xl font-semibold text-app-text mb-2">Running multi-agent analysis</h2>
      <p className="text-app-muted text-sm text-center max-w-md mb-4">
        {repoLabel
          ? `Analyzing ${repoLabel} — each agent calls Groq live (not cached results).`
          : 'Each agent calls Groq live (not cached results).'}
      </p>
      <div className="rounded-xl border border-app-border bg-app-surface px-4 py-3 text-center max-w-md">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-400 mb-1">
          {step.agent}
        </p>
        <p className="text-sm text-app-text animate-pulse">{step.message}</p>
      </div>
      <p className="text-xs text-app-muted/70 mt-6">This usually takes 1–3 minutes</p>
    </div>
  )
}
