import { useEffect, useState } from 'react'
import ScoutLogo from './ScoutLogo'

const PHASE1_STEPS = [
  { agent: 'Triage Nurse', message: 'Fetching and ranking open issues with AI…' },
]

const FULL_PIPELINE_STEPS = [
  { agent: 'Triage Nurse', message: 'Fetching and ranking open issues with AI…' },
  { agent: 'Archaeologist', message: 'Cloning the repo and locating relevant code…' },
  { agent: 'Senior Dev', message: 'Drafting fix plan and contributor briefing…' },
  { agent: 'Testing Agent', message: 'Validating agent outputs (QA loop)…' },
]

export default function AgentPipelineLoader({ repoLabel = '', phase = 'phase1' }) {
  const steps = phase === 'full' ? FULL_PIPELINE_STEPS : PHASE1_STEPS
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    if (steps.length <= 1) return undefined
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length)
    }, 4500)
    return () => clearInterval(id)
  }, [steps.length])

  const step = steps[stepIndex]

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 px-6">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full border-2 border-accent-500/30 border-t-accent-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <ScoutLogo className="h-12 w-12" />
        </div>
      </div>
      <h2 className="text-xl font-semibold text-app-text mb-2">
        {phase === 'full' ? 'Running multi-agent analysis' : 'Analyzing repository'}
      </h2>
      <p className="text-app-muted text-sm text-center max-w-md mb-4">
        {repoLabel
          ? phase === 'full'
            ? `Analyzing ${repoLabel} — each agent calls Groq live (not cached results).`
            : `Ranking issues for ${repoLabel} with Triage Nurse.`
          : phase === 'full'
            ? 'Each agent calls Groq live (not cached results).'
            : 'Triage Nurse is fetching and ranking open issues.'}
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
