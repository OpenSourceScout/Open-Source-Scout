import { NavLink, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { LayoutDashboard, Gauge, Brain } from 'lucide-react'
import ScoutLogo from './ScoutLogo'
import { getMe } from '../api'

const navClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200 ${
    isActive
      ? 'bg-primary-500/15 text-primary-400 font-medium border border-primary-500/25'
      : 'text-app-muted hover:bg-app-elevated hover:text-app-text border border-transparent'
  }`

export default function AdminSidebar() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null))
  }, [])

  const displayName = user?.display_name || user?.email?.split('@')[0] || 'Admin'
  const userEmail = user?.email || ''
  const monogram = displayName.charAt(0).toUpperCase()

  return (
    <aside className="w-64 bg-app-surface border-r border-app-border flex flex-col h-screen shrink-0 overflow-hidden">
      <div className="p-4 border-b border-app-border shrink-0">
        <div className="flex items-center gap-2">
          <ScoutLogo className="h-8 w-8 shrink-0" />
          <span className="font-semibold text-app-text truncate">Open Source Scout</span>
        </div>
      </div>

      <nav className="flex-1 min-h-0 p-4 overflow-y-auto">
        <div className="space-y-1">
          <NavLink to="/dashboard" className={navClass}>
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>
          <NavLink to="/admin/decision-trace" className={navClass}>
            <Gauge className="w-4 h-4 shrink-0" />
            <span>Decision Trace</span>
          </NavLink>
          <NavLink to="/admin/agent-memory" className={navClass}>
            <Brain className="w-4 h-4 shrink-0" />
            <span>Agent Memory</span>
          </NavLink>
        </div>
      </nav>

      <div className="mt-auto p-4 border-t border-app-border bg-app-surface/50 shrink-0">
        <Link
          to="/profile"
          className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-app-elevated transition-colors duration-200"
        >
          <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center shrink-0 text-sm font-bold text-primary-400 uppercase">
            {monogram}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-app-text truncate">{displayName}</p>
            {userEmail && <p className="text-xs text-app-muted truncate">{userEmail}</p>}
          </div>
        </Link>
      </div>
    </aside>
  )
}
