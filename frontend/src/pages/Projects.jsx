import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  FolderOpen,
  Pencil,
  Trash2,
  Check,
  X,
  Loader2,
  Search,
  Code,
  AlertTriangle,
} from 'lucide-react'
import { getProjects, renameProject, deleteProject, getProjectById } from '../api'

function formatDate(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  } catch {
    return String(iso)
  }
}

export default function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [limit, setLimit] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [loadingProjectId, setLoadingProjectId] = useState(null)

  const fetchProjects = async () => {
    try {
      const data = await getProjects()
      setProjects(data.projects || [])
      setLimit(data.limit || 5)
    } catch (e) {
      setError(e.message || 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  const handleRename = async (id) => {
    if (!editName.trim()) return
    setActionLoading(true)
    try {
      await renameProject(id, editName.trim())
      setEditingId(null)
      setEditName('')
      await fetchProjects()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (id) => {
    setActionLoading(true)
    try {
      await deleteProject(id)
      setDeletingId(null)
      await fetchProjects()
    } catch (e) {
      setError(e.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleOpenProject = async (project) => {
    setLoadingProjectId(project.id)
    try {
      const full = await getProjectById(project.id)
      const analysisResult = full.analysis_result || null
      const repoUrl = full.repo_url || null

      // Store in session for AnalysisLayout to pick up
      if (analysisResult) {
        sessionStorage.setItem('scout_analysisResult', JSON.stringify(analysisResult))
      }
      if (repoUrl) {
        sessionStorage.setItem('scout_repoUrl', repoUrl)
        const match = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
        if (match) {
          sessionStorage.setItem('scout_repoInfo', JSON.stringify({ owner: match[1], name: match[2] }))
        }
      }

      navigate('/analysis', {
        state: {
          result: analysisResult,
          repoUrl,
        },
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setLoadingProjectId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-app-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  const usedCount = projects.length
  const canCreate = usedCount < limit

  return (
    <div className="min-h-screen bg-app-bg text-app-text">
      <header className="bg-app-surface border-b border-app-border px-6 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm bg-app-surface/95">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate('/dashboard')}
            className="p-2 text-app-muted hover:text-app-text rounded-lg hover:bg-app-elevated transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-app-text">My Projects</h1>
            <p className="text-sm text-app-muted">
              {usedCount}/{limit} projects used
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="text-sm text-primary-400 hover:text-primary-300 transition-colors">
            Dashboard
          </Link>
          <Link to="/profile" className="text-sm text-app-muted hover:text-app-text transition-colors">
            Profile
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-auto text-red-300 hover:text-red-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Usage bar */}
        <div className="bg-app-surface border border-app-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-app-text">Free Plan Usage</span>
            <span className="text-sm text-app-muted">
              {usedCount} / {limit} projects
            </span>
          </div>
          <div className="h-2 bg-app-bg rounded-full overflow-hidden border border-app-border">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                usedCount >= limit ? 'bg-red-500' : 'bg-accent-500'
              }`}
              style={{ width: `${Math.min((usedCount / limit) * 100, 100)}%` }}
            />
          </div>
          {!canCreate && (
            <p className="text-xs text-amber-400 mt-2">
              You&apos;ve reached the free plan limit. Delete an existing project to create a new one.
            </p>
          )}
        </div>

        {/* New project button */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          disabled={!canCreate}
          className="w-full border-2 border-dashed border-app-border rounded-xl p-6 flex items-center justify-center gap-3 text-app-muted hover:border-primary-500/50 hover:text-primary-400 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-app-border disabled:hover:text-app-muted"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">New Project</span>
        </button>

        {/* Project list */}
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-app-surface border border-app-border rounded-full flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-10 h-10 text-app-muted" />
            </div>
            <h2 className="text-xl font-semibold text-app-text mb-2">No projects yet</h2>
            <p className="text-app-muted mb-6 max-w-sm mx-auto">
              Create your first project by searching for repositories using your tech stack or analyzing a specific repository.
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="bg-accent-500 text-[#0b0f14] px-6 py-3 rounded-lg font-semibold hover:bg-accent-600 transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create First Project
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {projects.map((project) => {
              const isEditing = editingId === project.id
              const isDeleting = deletingId === project.id
              const isLoadingThis = loadingProjectId === project.id

              return (
                <div
                  key={project.id}
                  className="bg-app-surface border border-app-border rounded-xl p-5 transition-all duration-200 hover:border-app-border/80 group"
                >
                  {/* Delete confirmation */}
                  {isDeleting ? (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-amber-400">
                        <AlertTriangle className="w-5 h-5 shrink-0" />
                        <span className="text-sm font-medium">Delete &quot;{project.name}&quot;? This cannot be undone.</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDelete(project.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          {actionLoading ? 'Deleting...' : 'Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingId(null)}
                          disabled={actionLoading}
                          className="px-4 py-2 border border-app-border rounded-lg text-sm text-app-muted hover:text-app-text transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
                            project.project_type === 'tech_stack'
                              ? 'bg-primary-500/15 border-primary-500/25'
                              : 'bg-accent-500/15 border-accent-500/25'
                          }`}>
                            {project.project_type === 'tech_stack' ? (
                              <Search className="w-5 h-5 text-primary-400" />
                            ) : (
                              <Code className="w-5 h-5 text-accent-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleRename(project.id)
                                    if (e.key === 'Escape') { setEditingId(null); setEditName('') }
                                  }}
                                  autoFocus
                                  className="px-2 py-1 border border-primary-500/50 rounded-md text-sm bg-app-input text-app-text focus:outline-none focus:ring-2 focus:ring-primary-500/50 flex-1"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRename(project.id)}
                                  disabled={actionLoading}
                                  className="p-1.5 text-accent-400 hover:text-accent-300 transition-colors"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingId(null); setEditName('') }}
                                  className="p-1.5 text-app-muted hover:text-app-text transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            ) : (
                              <h3 className="font-semibold text-app-text truncate">{project.name}</h3>
                            )}
                            <p className="text-xs text-app-muted mt-0.5">
                              {project.project_type === 'tech_stack' ? 'Tech Stack Search' : 'Repository Analysis'}
                              {' · '}
                              {formatDate(project.created_at)}
                            </p>
                          </div>
                        </div>

                        {!isEditing && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingId(project.id)
                                setEditName(project.name)
                              }}
                              className="p-2 text-app-muted hover:text-primary-400 hover:bg-app-elevated rounded-lg transition-all"
                              title="Rename project"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeletingId(project.id)
                              }}
                              className="p-2 text-app-muted hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                              title="Delete project"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Project details */}
                      <div className="flex flex-wrap gap-2 mb-4">
                        {project.project_type === 'tech_stack' && project.tech_stack && (
                          project.tech_stack.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 bg-primary-500/15 text-primary-300 border border-primary-500/25 rounded text-xs font-medium"
                            >
                              {tag}
                            </span>
                          ))
                        )}
                        {project.repo_full_name && (
                          <span className="px-2 py-0.5 bg-app-bg text-app-muted border border-app-border rounded text-xs font-medium">
                            {project.repo_full_name}
                          </span>
                        )}
                        {project.selected_issue_number && (
                          <span className="px-2 py-0.5 bg-accent-500/15 text-accent-400 border border-accent-500/25 rounded text-xs font-medium">
                            Issue #{project.selected_issue_number}
                          </span>
                        )}
                      </div>

                      {/* Open project button */}
                      <button
                        type="button"
                        onClick={() => handleOpenProject(project)}
                        disabled={isLoadingThis}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-app-bg border border-app-border rounded-lg text-sm text-app-muted hover:border-primary-500/50 hover:text-primary-400 transition-all disabled:opacity-50"
                      >
                        {isLoadingThis ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </>
                        ) : (
                          <>
                            <FolderOpen className="w-4 h-4" />
                            Open Project
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
