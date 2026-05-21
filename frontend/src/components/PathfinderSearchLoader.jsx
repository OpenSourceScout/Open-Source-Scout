import { useEffect, useState } from 'react'
import ScoutLogo from './ScoutLogo'

const STEPS = [
  'Understanding your search preferences…',
  'Querying GitHub for matching repositories…',
  'Scoring activity, issues, stack fit, and community…',
  'Personalizing top matches with AI…',
]

export default function PathfinderSearchLoader({ techStack = [], searchPrompt = '' }) {
  const [stepIndex, setStepIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % STEPS.length)
    }, 3200)
    return () => clearInterval(id)
  }, [])

  const stackLabel = techStack.length ? techStack.join(', ') : null
  const contextLabel = searchPrompt.trim()
    ? `"${searchPrompt.trim().slice(0, 80)}${searchPrompt.length > 80 ? '…' : ''}"`
    : stackLabel
      ? stackLabel
      : 'your preferences'

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] py-20 px-6">
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-full border-2 border-primary-500/30 border-t-primary-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <ScoutLogo className="h-12 w-12" />
        </div>
      </div>
      <h2 className="text-xl font-semibold text-app-text mb-2">Searching live on GitHub</h2>
      <p className="text-app-muted text-sm text-center max-w-md mb-6">
        Finding repositories for {contextLabel}. This runs a fresh search each time — not cached results.
      </p>
      <p className="text-sm text-primary-400 font-medium animate-pulse">{STEPS[stepIndex]}</p>
    </div>
  )
}
