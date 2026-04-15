import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Palette,
  Key,
  ChevronRight,
  Database,
  LogOut,
  Eye,
  EyeOff,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { clearAuthSession, getAccessToken } from '../auth'

const sections = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Database },
  { id: 'api_keys', label: 'API Keys', icon: Key },
]

async function saveGitHubToken(token) {
  const accessToken = getAccessToken()
  const res = await fetch('/api/user/github-token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ token }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save token')
  return data
}

function GitHubTokenForm() {
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleSave = async (e) => {
    e.preventDefault()
    if (!token.trim()) return
    setSaving(true)
    setError(null)
    setResult(null)
    try {
      const data = await saveGitHubToken(token.trim())
      setResult(data)
      setToken('')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <input
            type={showToken ? 'text' : 'password'}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            className="w-full px-4 py-2.5 pr-10 bg-app-bg border border-app-border rounded-lg text-app-text font-mono text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all"
            disabled={saving}
          />
          <button
            type="button"
            onClick={() => setShowToken((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-app-muted hover:text-app-text transition-colors"
          >
            {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <button
          type="submit"
          disabled={saving || !token.trim()}
          className="px-5 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all shrink-0"
        >
          {saving ? 'Saving…' : 'Save Token'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {result && (
        <div className={`p-4 rounded-lg border text-sm space-y-1 ${result.has_fork_access ? 'bg-green-500/10 border-green-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
          <div className="flex items-center gap-2 font-medium">
            {result.has_fork_access
              ? <><CheckCircle className="w-4 h-4 text-green-400" /><span className="text-green-400">Token saved — @{result.github_login}</span></>
              : <><AlertTriangle className="w-4 h-4 text-amber-400" /><span className="text-amber-400">Saved, but missing scope</span></>
            }
          </div>
          <p className="text-app-muted">
            Scopes: <code className="font-mono text-xs">{result.scopes.join(', ') || '(none)'}</code>
          </p>
          {result.warning && <p className="text-amber-400 text-xs">{result.warning}</p>}
        </div>
      )}

      <p className="text-xs text-app-muted">
        Token needs the <code className="font-mono">public_repo</code> scope to fork repositories.{' '}
        <a
          href="https://github.com/settings/tokens/new?scopes=public_repo&description=Open+Source+Scout"
          target="_blank"
          rel="noreferrer"
          className="text-primary-400 hover:underline inline-flex items-center gap-1"
        >
          Generate one now <ExternalLink className="w-3 h-3" />
        </a>
      </p>
    </form>
  )
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('api_keys')
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuthSession()
    navigate('/')
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-xl font-semibold text-app-text mb-1">Public Profile</h3>
              <p className="text-app-muted text-sm mb-6">This information will be displayed publicly.</p>
              <div className="flex items-center gap-6 mb-8">
                <div className="w-24 h-24 rounded-full bg-primary-500/10 border-2 border-primary-500/20 flex items-center justify-center text-3xl font-bold text-primary-400">
                  DP
                </div>
                <div>
                  <button className="px-4 py-2 bg-app-elevated border border-app-border rounded-lg text-sm font-medium text-app-text hover:border-primary-500/50 hover:text-primary-400 transition-all mb-2">
                    Change Avatar
                  </button>
                  <p className="text-xs text-app-muted">JPG, GIF or PNG. 1MB max.</p>
                </div>
              </div>
              <div className="grid gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-app-text">Display Name</label>
                  <input type="text" defaultValue="Developer" className="w-full sm:max-w-md px-4 py-2.5 bg-app-bg border border-app-border rounded-lg text-app-text focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-app-text">Bio</label>
                  <textarea rows="4" defaultValue="Open source enthusiast and full stack developer." className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-lg text-app-text focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all resize-none" />
                  <p className="text-xs text-app-muted">Brief description for your profile.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <button className="px-6 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-all shadow-lg shadow-primary-500/20">
                Save Changes
              </button>
            </div>
          </div>
        )

      case 'api_keys':
        return (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-xl font-semibold text-app-text mb-1">API Keys &amp; Tokens</h3>
              <p className="text-app-muted text-sm mb-6">
                Connect your GitHub account so Open Source Scout can fork repositories and push your changes.
              </p>

              {/* GitHub PAT */}
              <div className="p-5 border border-app-border bg-app-surface rounded-xl space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#24292F] flex items-center justify-center shrink-0">
                    <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-app-text">GitHub Personal Access Token</h4>
                    <p className="text-sm text-app-muted">Required for forking repositories and pushing your code changes.</p>
                  </div>
                </div>
                <GitHubTokenForm />
              </div>

              {/* Groq */}
              <div className="p-5 border border-app-border bg-app-surface rounded-xl flex items-center justify-between mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-semibold text-app-text">Groq API Key</h4>
                    <p className="text-sm text-app-muted">Powers the super fast inference models for code analysis.</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-semibold shrink-0">Configured via .env</span>
              </div>
            </div>
          </div>
        )

      default:
        return (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in duration-500">
            <div className="w-20 h-20 bg-app-elevated rounded-full flex items-center justify-center mb-6">
              <SettingsIcon className="w-8 h-8 text-app-muted" />
            </div>
            <h3 className="text-xl font-semibold text-app-text mb-2">Section Coming Soon</h3>
            <p className="text-app-muted max-w-sm mx-auto">This section is currently under development.</p>
          </div>
        )
    }
  }

  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col pt-16">
      <div className="absolute top-0 w-full h-16 border-b border-app-border bg-app-surface/80 backdrop-blur-md px-6 flex items-center z-10">
        <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <ChevronRight className="w-5 h-5 text-app-muted rotate-180" />
          <span className="font-medium text-app-muted">Back to Dashboard</span>
        </Link>
      </div>

      <div className="max-w-6xl mx-auto w-full px-6 py-12 flex-1">
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-2">Settings</h1>
          <p className="text-app-muted text-lg">Manage your account settings and application preferences.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-10">
          <aside className="w-full md:w-64 shrink-0">
            <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-4 md:pb-0 hide-scrollbar">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium whitespace-nowrap ${
                    activeTab === id
                      ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
                      : 'text-app-muted hover:bg-app-elevated hover:text-app-text'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}
              <div className="hidden md:block my-4 border-b border-app-border" />
              <button
                onClick={handleLogout}
                className="hidden md:flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-red-400 hover:bg-red-500/10 whitespace-nowrap"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>
          </aside>

          <main className="flex-1 bg-app-surface border border-app-border rounded-2xl p-6 sm:p-10 min-h-[600px]">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  )
}
