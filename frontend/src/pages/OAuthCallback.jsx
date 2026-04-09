import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { setAccessToken, setAuthSession } from '../auth'
import { getMe } from '../api'
import ScoutLogo from '../components/ScoutLogo'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const query = new URLSearchParams(window.location.search)
      const qErr = query.get('error')
      if (qErr) {
        if (!cancelled) setError(qErr)
        return
      }

      const rawHash = window.location.hash.startsWith('#')
        ? window.location.hash.slice(1)
        : window.location.hash
      const frag = new URLSearchParams(rawHash)
      const token = frag.get('access_token')
      if (!token) {
        if (!cancelled) setError('Missing access token. Try signing in again.')
        return
      }

      try {
        setAccessToken(token)
        const user = await getMe()
        if (cancelled) return
        setAuthSession({ access_token: token, user })
        navigate('/dashboard', { replace: true })
      } catch (e) {
        if (!cancelled) setError(e?.message || 'Could not complete sign-in')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (error) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center px-4 text-app-text">
        <div className="w-full max-w-md bg-app-surface border border-app-border rounded-2xl p-6 shadow-xl shadow-black/30 text-center">
          <ScoutLogo className="h-9 w-9 mx-auto mb-4" />
          <h1 className="font-semibold text-app-text mb-2">GitHub sign-in failed</h1>
          <p className="text-sm text-app-muted mb-6">{error}</p>
          <Link
            to="/login"
            className="inline-flex items-center justify-center w-full bg-primary-500/15 text-primary-300 border border-primary-500/30 py-2.5 rounded-lg font-medium hover:bg-primary-500/25 transition-colors"
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center px-4 text-app-text">
      <div className="flex flex-col items-center gap-4">
        <div className="h-9 w-9 border-2 border-primary-500/30 border-t-primary-400 rounded-full animate-spin" />
        <p className="text-sm text-app-muted">Completing sign-in…</p>
      </div>
    </div>
  )
}
