import { NavLink, useLocation, useNavigate } from 'react-router-dom'
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
} from 'lucide-react'
import ScoutLogo from './ScoutLogo'

const NAV_ITEMS = [
  { path: '/analysis', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/analysis/repositories', label: 'Repositories', Icon: FolderOpen },
  { path: '/analysis/issues', label: 'Issue Ranking', Icon: ClipboardList },
  { path: '/analysis/code', label: 'Code Locator', Icon: MapPin },
  { path: '/analysis/briefing', label: 'Contributor Briefing', Icon: FileText },
  { path: '/analysis/qa-report', label: 'QA Report', Icon: ShieldCheck },
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

export default function AnalysisSidebar({ repoInfo, onBackToRepos }) {
  const navigate = useNavigate()

  return (
    <aside className="w-64 bg-app-surface border-r border-app-border flex flex-col h-screen">
      <div className="p-4 border-b border-app-border">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
          <ScoutLogo className="h-8 w-8" />
          <span className="font-semibold text-app-text">Open Source Scout</span>
        </div>
      </div>

      {repoInfo && (
        <div className="p-4 border-b border-app-border bg-app-bg/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-app-elevated rounded-lg flex items-center justify-center border border-app-border">
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

      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.path} to={item.path} className={navClass}>
              <item.Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      <div className="p-4 border-t border-app-border">
        <div className="space-y-1">
          {BOTTOM_NAV.map((item) => (
            <NavLink key={item.path} to={item.path} className={navClass}>
              <item.Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-app-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-app-elevated border border-app-border" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-app-text truncate">Contributor</p>
            <p className="text-xs text-app-muted">Session</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
