import { NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  MapPin,
  FileText,
  ShieldCheck,
  Settings,
  User,
  Package,
  FolderKanban,
  PanelLeftClose,
} from 'lucide-react'
import ScoutLogo from './ScoutLogo'
import { getMe } from '../api'
import { isAdmin } from '../auth'

const NAV_ITEMS = [
  { path: '/analysis', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/analysis/repositories', label: 'Repositories', Icon: FolderOpen },
  { path: '/analysis/issues', label: 'Issue analysis', Icon: ClipboardList },
  { path: '/analysis/code', label: 'Code Locator', Icon: MapPin },
  { path: '/analysis/briefing', label: 'Contributor Briefing', Icon: FileText },
  { path: '/analysis/qa-report', label: 'QA Report', Icon: ShieldCheck, adminOnly: true },
]

const BOTTOM_NAV = [
  { path: '/projects', label: 'My Projects', Icon: FolderKanban },
  { path: '/settings', label: 'Settings', Icon: Settings },
  { path: '/profile', label: 'Profile', Icon: User },
]

const navClass = ({ isActive }) =>
  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-200 ${
    isActive
      ? 'bg-primary-500/15 text-primary-400 font-medium border border-primary-500/25'
      : 'text-app-muted hover:bg-app-elevated hover:text-app-text border border-transparent'
  }`

export default function AnalysisSidebar({ repoInfo, onBackToRepos, hasRankedRepos, onCollapseNav }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)

  useEffect(() => {
    getMe().then(setUser).catch(() => setUser(null))
  }, [])

  // Filter nav items based on access rules:
  // 1. Hide Repositories tab when user entered via direct repo URL
  // 2. Hide admin-only items (e.g. QA Report) from non-admin users
  const admin = isAdmin()
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.path === '/analysis/repositories' && !hasRankedRepos) return false
    if (item.adminOnly && !admin) return false
    return true
  })

  const displayName = user?.display_name || user?.email?.split('@')[0] || 'Guest'
  const email = user?.email || ''
  const monogram = displayName.charAt(0).toUpperCase()

  return (
    <aside className="w-64 bg-app-surface border-r border-app-border flex flex-col h-screen shrink-0">
      {/* Logo */}
      <div className="p-4 border-b border-app-border shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 cursor-pointer min-w-0" onClick={() => navigate('/')}>
            <ScoutLogo className="h-8 w-8 shrink-0" />
            <span className="font-semibold text-app-text truncate">Open Source Scout</span>
          </div>
          {onCollapseNav && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCollapseNav()
              }}
              className="shrink-0 p-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-elevated border border-transparent hover:border-app-border transition-colors"
              title="Hide navigation"
              aria-label="Hide navigation"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Active repo context */}
      {repoInfo && (
        <div className="p-4 border-b border-app-border bg-app-bg/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-app-elevated rounded-lg flex items-center justify-center border border-app-border shrink-0">
              <Package className="w-5 h-5 text-app-muted" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-app-text truncate">{repoInfo.name}</h3>
              <p className="text-xs text-app-muted truncate">{repoInfo.owner}</p>
            </div>
          </div>
          {onBackToRepos && (
            <button
              type="button"
              onClick={onBackToRepos}
              className="mt-3 w-full text-xs text-primary-400 hover:text-primary-300 text-left transition-colors"
            >
              ← Back to repositories
            </button>
          )}
        </div>
      )}

      {/* Nav links — scrolls if nav overflows */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/analysis'}
              className={navClass}
            >
              <item.Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom section — always pinned to the bottom */}
      <div className="p-4 border-t border-app-border shrink-0">
        <div className="space-y-1 mb-4">
          {BOTTOM_NAV.map((item) => (
            <NavLink key={item.path} to={item.path} className={navClass}>
              <item.Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Profile identity */}
        <div className="pt-3 border-t border-app-border flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-primary-500/20 border border-primary-500/30 flex items-center justify-center shrink-0 text-sm font-bold text-primary-400 uppercase">
            {monogram}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-app-text truncate">{displayName}</p>
            {email && <p className="text-xs text-app-muted truncate">{email}</p>}
          </div>
        </div>
      </div>
    </aside>
  )
}
