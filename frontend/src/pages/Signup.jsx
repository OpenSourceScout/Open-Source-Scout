import { Github } from 'lucide-react'
import { Link } from 'react-router-dom'
import ScoutLogo from '../components/ScoutLogo'

export default function Signup() {
  const handleGithubClick = (e) => {
    e.preventDefault()
    window.location.href = '/api/auth/github'
  }

  return (
    <div className="min-h-screen bg-app-bg flex items-center justify-center px-4 text-app-text">
      <div className="w-full max-w-md bg-app-surface border border-app-border rounded-2xl p-6 shadow-xl shadow-black/30">
        <div className="flex items-center gap-3 mb-8">
          <ScoutLogo className="h-9 w-9" />
          <div>
            <div className="font-semibold text-app-text leading-tight">Open Source Scout</div>
            <div className="text-sm text-app-muted">Create your account</div>
          </div>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-app-muted text-center mb-6">
            Sign up with your GitHub account to get started
          </p>

          <button
            onClick={handleGithubClick}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-app-border bg-app-bg py-3 text-sm font-medium text-app-text transition-all duration-200 hover:border-app-muted hover:bg-app-elevated"
          >
            <Github className="h-5 w-5" aria-hidden />
            Continue with GitHub
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-app-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-primary-400 hover:text-primary-300 font-medium transition-colors">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
