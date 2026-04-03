import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Shield,
  Palette,
  Key,
  Globe,
  ChevronRight,
  Database,
  Smartphone,
  LogOut
} from 'lucide-react'
import { clearAuthSession } from '../auth'

const sections = [
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
  { id: 'integrations', label: 'Integrations', icon: Database },
  { id: 'api_keys', label: 'API Keys', icon: Key },
]

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile')
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
              <p className="text-app-muted text-sm mb-6">This information will be displayed publicly so be careful what you share.</p>

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
                  <textarea rows="4" defaultValue="Open source enthusiast and full stack developer." className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-lg text-app-text focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all resize-none"></textarea>
                  <p className="text-xs text-app-muted">Brief description for your profile. URLs are hyperlinked.</p>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-app-border">
              <h3 className="text-xl font-semibold text-app-text mb-4">Personal Information</h3>
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-app-text">Email address</label>
                  <input type="email" defaultValue="dev@example.com" className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-lg text-app-text focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-app-text">Location</label>
                  <input type="text" placeholder="e.g. San Francisco, CA" className="w-full px-4 py-2.5 bg-app-bg border border-app-border rounded-lg text-app-text focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/50 transition-all" />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button className="px-6 py-2.5 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-all hover:scale-[0.98] shadow-lg shadow-primary-500/20">
                Save Changes
              </button>
            </div>
          </div>
        )
      case 'appearance':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-xl font-semibold text-app-text mb-1">Theme Preferences</h3>
              <p className="text-app-muted text-sm mb-6">Customize the visual identity and aesthetic of the application.</p>

              <div className="grid sm:grid-cols-3 gap-4">
                {[
                  { id: 'light', name: 'Light', desc: 'Clean and bright' },
                  { id: 'dark', name: 'Dark', desc: 'Easy on the eyes', active: true },
                  { id: 'system', name: 'System', desc: 'Syncs with OS' }
                ].map(theme => (
                  <div key={theme.id} className={`p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 ${theme.active ? 'border-primary-500 bg-primary-500/5' : 'border-app-border bg-app-surface hover:border-primary-500/50'}`}>
                    <div className={`w-full h-24 rounded-lg mb-3 border ${theme.id === 'light' ? 'bg-gray-100 border-gray-200' : theme.id === 'dark' ? 'bg-[#0B0F14] border-gray-800' : 'bg-gradient-to-br from-gray-100 to-[#0B0F14] border-gray-500'}`}></div>
                    <h4 className="font-medium text-app-text">{theme.name}</h4>
                    <p className="text-xs text-app-muted mt-1">{theme.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 border-t border-app-border">
              <h3 className="text-xl font-semibold text-app-text mb-4">Accent Color</h3>
              <div className="flex flex-wrap gap-4">
                {[
                  { name: 'Blue', color: 'bg-blue-500', active: true },
                  { name: 'Purple', color: 'bg-purple-500' },
                  { name: 'Emerald', color: 'bg-emerald-500' },
                  { name: 'Rose', color: 'bg-rose-500' },
                  { name: 'Amber', color: 'bg-amber-500' }
                ].map(accent => (
                  <button key={accent.name} className={`w-12 h-12 rounded-full ${accent.color} flex items-center justify-center transition-transform hover:scale-110 shadow-lg ${accent.active ? 'ring-4 ring-offset-2 ring-offset-app-bg ring-blue-500' : ''}`}>
                    {accent.active && <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )
      case 'api_keys':
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
              <h3 className="text-xl font-semibold text-app-text mb-1">API Configurations</h3>
              <p className="text-app-muted text-sm mb-6">Manage external service connections for deeper analysis.</p>

              <div className="space-y-4">
                <div className="p-5 border border-app-border bg-app-surface rounded-xl hidden md:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#24292F] flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" /></svg>
                    </div>
                    <div>
                      <h4 className="font-semibold text-app-text">GitHub Personal Access Token</h4>
                      <p className="text-sm text-app-muted">Used for increasing rate limits and accessing private repositories.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-semibold">Configured</span>
                    <button className="px-4 py-2 bg-app-elevated border border-app-border rounded-lg text-sm font-medium hover:border-primary-500/50 transition-colors">Edit</button>
                  </div>
                </div>

                <div className="p-5 border border-app-border bg-app-surface rounded-xl hidden md:flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                      <Zap className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-app-text">Groq API Key</h4>
                      <p className="text-sm text-app-muted">Powering the super fast inference models for code analysis.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-semibold">Configured via .env</span>
                  </div>
                </div>
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
            <p className="text-app-muted max-w-sm mx-auto">This section is currently under development. Check back later for updates.</p>
          </div>
        )
    }
  }

  // Fallback icon definition since Zap is not imported
  const Zap = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )

  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col pt-16">
      {/* A simple header placeholder if using directly or it can sit perfectly under AnalysisLayout */}
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
          {/* Sidebar */}
          <aside className="w-full md:w-64 shrink-0">
            <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible pb-4 md:pb-0 hide-scrollbar">
              {sections.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium whitespace-nowrap ${activeTab === id
                      ? 'bg-primary-500 text-white shadow-md shadow-primary-500/20'
                      : 'text-app-muted hover:bg-app-elevated hover:text-app-text'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                </button>
              ))}

              <div className="hidden md:block my-4 border-b border-app-border"></div>

              <button
                onClick={handleLogout}
                className="hidden md:flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-red-400 hover:bg-red-500/10 whitespace-nowrap"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 bg-app-surface border border-app-border rounded-2xl p-6 sm:p-10 min-h-[600px]">
            {renderContent()}
          </main>
        </div>
      </div>
    </div>
  )
}
