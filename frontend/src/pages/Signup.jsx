import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Github } from 'lucide-react'
import { setAuthSession } from '../auth'
import ScoutLogo from '../components/ScoutLogo'

const field =
  'w-full px-3 py-2 border border-app-border rounded-lg text-sm bg-app-input text-app-text placeholder:text-app-muted/50 focus:outline-none focus:ring-2 focus:ring-primary-500/60 focus:border-primary-500/40'

export default function Signup() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const onSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          display_name: displayName || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.detail || 'Signup failed')
      }
      setAuthSession(data)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err?.message || 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center px-4 text-app-text">
      <div className="w-full max-w-md bg-app-surface border border-app-border rounded-2xl p-6 shadow-xl shadow-black/30">
        <div className="flex items-center gap-3 mb-6">
          <ScoutLogo className="h-9 w-9" />
          <div>
            <div className="font-semibold text-app-text leading-tight">Open Source Scout</div>
            <div className="text-sm text-app-muted">Create your account</div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">{error}</div>
        )}

        <a
          href="/api/auth/github"
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-app-border bg-app-bg py-2.5 text-sm font-medium text-app-text transition-all duration-200 hover:border-app-muted hover:bg-app-elevated"
        >
          <Github className="h-5 w-5" aria-hidden />
          Continue with GitHub
        </a>

        <div className="relative mb-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-app-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wide">
            <span className="bg-app-surface px-2 text-app-muted">Or email</span>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">Display name (optional)</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={field}
              placeholder="Your name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={field}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-app-text mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className={field}
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent-500 text-[#0b0f14] py-2.5 rounded-lg font-semibold hover:bg-accent-600 transition-all duration-200 disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Sign Up'}
          </button>
        </form>

        <div className="mt-5 text-sm text-app-muted">
          Already have an account?{' '}
          <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
            Log in
          </Link>
        </div>
      </div>
    </div>
  )
}
