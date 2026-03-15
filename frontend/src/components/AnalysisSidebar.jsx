import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  FolderOpen,
  ClipboardList,
  MapPin,
  FileText,
  Settings,
  User,
  Package,
  ChevronLeft,
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/analysis', label: 'Dashboard', Icon: LayoutDashboard },
  { path: '/analysis/repositories', label: 'Repositories', Icon: FolderOpen },
  { path: '/analysis/issues', label: 'Issue Ranking', Icon: ClipboardList },
  { path: '/analysis/code', label: 'Code Locator', Icon: MapPin },
  { path: '/analysis/briefing', label: 'Contributor Briefing', Icon: FileText },
]

const BOTTOM_NAV = [
  { path: '/settings', label: 'Settings', Icon: Settings },
  { path: '/profile', label: 'Profile', Icon: User },
]

export default function AnalysisSidebar({ repoInfo, onBackToRepos }) {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-screen">
      {/* Logo */}
      <div className="p-4 border-b border-gray-100">
        <div 
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm">🔭</span>
          </div>
          <span className="font-semibold text-gray-900">Open Source Scout</span>
        </div>
      </div>

      {/* Repo Info */}
      {repoInfo && (
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
              <Package className="w-5 h-5 text-gray-500" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-gray-900 truncate">{repoInfo.name}</h3>
              <p className="text-xs text-gray-500 truncate">{repoInfo.owner}</p>
            </div>
          </div>
          {onBackToRepos && (
            <button
              onClick={onBackToRepos}
              className="mt-3 w-full text-xs text-primary-600 hover:text-primary-700 text-left"
            >
              ← Back to repositories
            </button>
          )}
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 p-4 overflow-y-auto">
        <div className="space-y-1">
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Bottom Navigation */}
      <div className="p-4 border-t border-gray-100">
        <div className="space-y-1">
          {BOTTOM_NAV.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-primary-50 text-primary-700 font-medium'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`
              }
            >
              <item.Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </div>
        
        {/* User */}
        <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3">
          <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">User</p>
            <p className="text-xs text-gray-500">Free Plan</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
