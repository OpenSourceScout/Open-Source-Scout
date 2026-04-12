import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import {
  LayoutDashboard,
  Star,
  GitFork,
  AlertCircle,
  Code2,
  Globe,
  FileText,
  Loader2,
  ExternalLink,
} from 'lucide-react'

const LANGUAGE_COLORS = {
  JavaScript: '#f1e05a',
  TypeScript: '#3178c6',
  Python: '#3572A5',
  Java: '#b07219',
  Go: '#00ADD8',
  Rust: '#dea584',
  'C++': '#f34b7d',
  C: '#555555',
  Ruby: '#701516',
  PHP: '#4F5D95',
  Swift: '#F05138',
  Kotlin: '#A97BFF',
  Dart: '#00B4AB',
  HTML: '#e34c26',
  CSS: '#563d7c',
  Shell: '#89e051',
  Lua: '#000080',
  Scala: '#c22d40',
  R: '#198CE7',
  Vue: '#41b883',
}

export default function AnalysisDashboard() {
  const context = useOutletContext()
  const analysisResult = context?.analysisResult
  const repoInfo = context?.repoInfo
  const repoUrl = context?.repoUrl

  const [readme, setReadme] = useState(null)
  const [readmeLoading, setReadmeLoading] = useState(false)
  const [readmeError, setReadmeError] = useState(null)

  const repo = analysisResult?.repo

  useEffect(() => {
    const owner = repoInfo?.owner
    const name = repoInfo?.name
    if (!owner || !name) return

    const cacheKey = `scout_readme_summary_${owner}_${name}`
    let cancelled = false

    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed?.summary && typeof parsed.summary === 'string') {
          setReadme(parsed.summary)
          setReadmeError(null)
          setReadmeLoading(false)
          return
        }
      }
    } catch {
      /* fetch below */
    }

    setReadme(null)
    setReadmeError(null)

    const fetchReadme = async () => {
      setReadmeLoading(true)

      try {
        const res = await fetch(`/api/repos/${owner}/${name}/readme-summary`)
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          const text = data.summary
          setReadme(text)
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify({ summary: text }))
          } catch {
            /* quota / private mode */
          }
        } else {
          setReadmeError('Failed to load README summary.')
        }
      } catch (err) {
        if (!cancelled) setReadmeError('Error connecting to backend.')
      }
      if (!cancelled) setReadmeLoading(false)
    }

    fetchReadme()
    return () => {
      cancelled = true
    }
  }, [repoInfo?.owner, repoInfo?.name])

  // No analysis result yet
  if (!analysisResult || !repo) {
    return (
      <div className="flex items-center justify-center h-full min-h-[50vh] bg-app-bg">
        <div className="text-center px-4">
          <div className="w-20 h-20 bg-primary-500/15 border border-primary-500/25 rounded-full flex items-center justify-center mx-auto mb-6">
            <LayoutDashboard className="w-10 h-10 text-primary-400" />
          </div>
          <h2 className="text-2xl font-semibold text-app-text mb-2">Analysis Dashboard</h2>
          <p className="text-app-muted max-w-sm mx-auto">Select a view from the sidebar to explore your analysis results.</p>
        </div>
      </div>
    )
  }

  const repoName = repo.full_name?.split('/')[1] || repoInfo?.name || 'Repository'
  const ownerName = repo.full_name?.split('/')[0] || repoInfo?.owner || ''
  const description = repo.description || 'No description available.'
  const primaryLang = repo.language || null
  const languages = repo.languages || {}
  const stars = repo.stargazers_count ?? 0
  const issues = repo.open_issues_count ?? 0
  const topics = repo.topics || []
  const htmlUrl = repo.html_url || repoUrl || '#'

  // Calculate language percentages
  const totalBytes = Object.values(languages).reduce((sum, v) => sum + v, 0)
  const langEntries = Object.entries(languages)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)

  return (
    <div className="p-6 bg-app-bg min-h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-app-surface border border-app-border rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-12 h-12 bg-primary-500/15 border border-primary-500/25 rounded-xl flex items-center justify-center">
                  <Code2 className="w-6 h-6 text-primary-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-app-text">{repoName}</h1>
                  <p className="text-sm text-app-muted">{ownerName}</p>
                </div>
              </div>
              <p className="text-app-muted mt-3 max-w-2xl leading-relaxed">{description}</p>
            </div>
            <a
              href={htmlUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-app-elevated border border-app-border rounded-lg text-sm text-app-muted hover:text-primary-400 hover:border-primary-500/50 transition-all shrink-0"
            >
              <ExternalLink className="w-4 h-4" />
              GitHub
            </a>
          </div>

          {/* Topics */}
          {topics.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {topics.map((topic) => (
                <span
                  key={topic}
                  className="px-2.5 py-1 bg-primary-500/10 text-primary-300 border border-primary-500/20 rounded-full text-xs font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-app-surface border border-app-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-amber-500/15 border border-amber-500/25 rounded-lg flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{stars.toLocaleString()}</p>
              <p className="text-xs text-app-muted">Stars</p>
            </div>
          </div>

          <div className="bg-app-surface border border-app-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-green-500/15 border border-green-500/25 rounded-lg flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{issues.toLocaleString()}</p>
              <p className="text-xs text-app-muted">Open Issues</p>
            </div>
          </div>

          <div className="bg-app-surface border border-app-border rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-500/15 border border-blue-500/25 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-app-text">{primaryLang || '—'}</p>
              <p className="text-xs text-app-muted">Primary Language</p>
            </div>
          </div>
        </div>

        {/* Tech Stack / Languages */}
        {langEntries.length > 0 && (
          <div className="bg-app-surface border border-app-border rounded-xl p-6">
            <h2 className="text-lg font-semibold text-app-text mb-4 flex items-center gap-2">
              <Code2 className="w-5 h-5 text-primary-400" />
              Tech Stack
            </h2>

            {/* Language bar */}
            <div className="h-3 rounded-full overflow-hidden flex mb-4 border border-app-border">
              {langEntries.map(([lang, bytes]) => {
                const pct = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0
                const color = LANGUAGE_COLORS[lang] || '#8b8b8b'
                return (
                  <div
                    key={lang}
                    style={{ width: `${pct}%`, backgroundColor: color }}
                    title={`${lang}: ${pct.toFixed(1)}%`}
                    className="transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                  />
                )
              })}
            </div>

            {/* Language list */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {langEntries.map(([lang, bytes]) => {
                const pct = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0
                const color = LANGUAGE_COLORS[lang] || '#8b8b8b'
                return (
                  <div key={lang} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-app-text font-medium">{lang}</span>
                    <span className="text-app-muted">{pct.toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* README */}
        <div className="bg-app-surface border border-app-border rounded-xl p-6">
          <h2 className="text-lg font-semibold text-app-text mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-400" />
            README
          </h2>

          {readmeLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
              <span className="ml-3 text-app-muted">Loading README...</span>
            </div>
          ) : readmeError ? (
            <p className="text-app-muted text-sm py-4">{readmeError}</p>
          ) : readme ? (
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-app-text prose-headings:border-b prose-headings:border-app-border prose-headings:pb-2 prose-headings:mt-6
              prose-p:text-app-muted prose-p:leading-relaxed prose-p:mb-5
              prose-ul:space-y-2 prose-ol:space-y-2
              prose-li:text-app-muted prose-li:leading-relaxed
              prose-a:text-primary-400 prose-a:no-underline hover:prose-a:underline
              prose-strong:text-app-text
              prose-code:text-accent-400 prose-code:bg-app-elevated prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:border prose-code:border-app-border
              prose-pre:bg-app-bg prose-pre:border prose-pre:border-app-border prose-pre:rounded-lg prose-pre:my-4
              prose-img:max-w-full prose-img:m-0 prose-img:inline-block prose-img:my-4
              prose-blockquote:border-primary-500/50 prose-blockquote:text-app-muted prose-blockquote:my-4
              prose-hr:border-app-border prose-hr:my-6
              prose-table:border-app-border prose-table:my-5
              prose-th:text-app-text prose-th:border-app-border prose-th:px-3 prose-th:py-1.5
              prose-td:text-app-muted prose-td:border-app-border prose-td:px-3 prose-td:py-1.5
            ">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
              >
                {readme}
              </ReactMarkdown>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
