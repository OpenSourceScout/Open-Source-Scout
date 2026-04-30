import { getAccessToken } from './auth'
import { encodeRepoFilePathForApi } from './utils/repoPaths'

const API_BASE = '/api';

// Different timeouts for different operations
const TIMEOUTS = {
  default: 30000,      // 30 seconds for quick operations
  analysis: 600000,    // 10 minutes for full analysis
  reAnalysis: 600000,  // 10 minutes for re-analysis
}

const BACKEND_HINT =
  'Start the API from Open-Source-Scout ( .\\run-backend.ps1 , default port 8003 ), then run npm run dev in frontend.'

function augmentGeneric500(res, detail) {
  if (res.status !== 500) return detail
  const s = String(detail || '').trim()
  if (!/^internal server error$/i.test(s)) return detail
  return `${s} — Often the API crashed while building the JSON response, or the Vite proxy reached the wrong port. ${BACKEND_HINT} Check the terminal running uvicorn for a Python traceback.`
}

/**
 * Parse error message from a failed Response (FastAPI JSON, HTML proxy page, or empty body).
 */
async function responseErrorDetail(res) {
  const text = await res.text()
  const statusFallback = res.statusText || `HTTP ${res.status}`
  const finish = (msg) => augmentGeneric500(res, msg)

  if (!text || !String(text).trim()) {
    if (res.status === 502 || res.status === 504) {
      return finish(`Cannot reach the API (${statusFallback}). ${BACKEND_HINT}`)
    }
    return finish(statusFallback)
  }
  try {
    const data = JSON.parse(text)
    if (typeof data.detail === 'string') return finish(data.detail)
    if (Array.isArray(data.detail)) {
      return finish(
        data.detail
          .map((d) => (d && typeof d.msg === 'string' ? d.msg : JSON.stringify(d)))
          .join('; '),
      )
    }
    if (data.detail != null) return finish(String(data.detail))
    if (typeof data.message === 'string') return finish(data.message)
  } catch {
    /* not JSON */
  }
  const stripped = String(text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (stripped.length) return finish(stripped.slice(0, 1200))
  if (res.status === 502 || res.status === 504) {
    return finish(`Cannot reach the API (${statusFallback}). ${BACKEND_HINT}`)
  }
  return finish(statusFallback)
}

async function apiFetch(path, options = {}, timeoutMs = TIMEOUTS.default) {
  const token = getAccessToken()
  const headers = new Headers(options.headers || {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json')
  
  try {
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    
    try {
      const res = await fetch(`${API_BASE}${path}`, { ...options, headers, signal: controller.signal })
      clearTimeout(timeoutId)
      return res
    } finally {
      clearTimeout(timeoutId)
    }
  } catch (error) {
    // Network error or timeout
    if (error.name === 'AbortError') {
      console.error(`Request timeout calling ${API_BASE}${path} after ${timeoutMs/1000}s`)
      throw new Error(`Request timeout. The analysis is taking longer than expected. ${BACKEND_HINT}`)
    }
    console.error(`Network error calling ${API_BASE}${path}:`, error)
    throw new Error(`Network error: ${error.message}. ${BACKEND_HINT}`)
  }
}

export async function signup({ email, password, display_name }) {
  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Signup failed')
  }
  return res.json()
}

export async function login({ email, password }) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Login failed')
  }
  return res.json()
}

export async function getMe() {
  const res = await apiFetch('/me')
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to load profile')
  }
  return res.json()
}

export async function searchReposByTechStack({ tech_stack, fast_model }) {
  const res = await apiFetch(`/search-repos`, {
    method: 'POST',
    body: JSON.stringify({
      tech_stack,
      fast_model: fast_model || 'meta-llama/llama-4-scout-17b-16e-instruct',
    }),
  });
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Repository search failed')
  }
  return res.json();
}

export async function runAnalyze({ repo_url, beginner_only = true, fast_model, powerful_model }) {
  const res = await apiFetch(`/analyze`, {
    method: 'POST',
    body: JSON.stringify({
      repo_url,
      beginner_only,
      fast_model: fast_model || 'openai/gpt-oss-120b',
      powerful_model: powerful_model || 'llama-3.3-70b',
    }),
  }, TIMEOUTS.analysis);
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Analysis failed')
  }
  return res.json();
}

export async function reAnalyzeIssue({ repo_url, issue_number, fast_model, powerful_model, pathfinder_output }) {
  const payload = {
    repo_url,
    issue_number,
    fast_model: fast_model || 'openai/gpt-oss-120b',
    powerful_model: powerful_model || 'llama-3.3-70b',
  };
  if (pathfinder_output) {
    payload.pathfinder_output = pathfinder_output;
  }
  const res = await apiFetch(`/re-analyze-issue`, {
    method: 'POST',
    body: JSON.stringify(payload),
  }, TIMEOUTS.reAnalysis);
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('API rate limit exceeded. The analysis service is busy. Please wait 30-60 seconds and try again.')
    }
    const detail = await responseErrorDetail(res)
    throw new Error(detail || 'Re-analysis failed')
  }
  return res.json();
}

export async function getFileContent(owner, repo, path, ref = 'main') {
  const encodedPath = encodeRepoFilePathForApi(path);
  const res = await apiFetch(`/repos/${owner}/${repo}/files/${encodedPath}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to load file')
  }
  return res.json();
}

export async function pushFile(owner, repo, { file_path, content, branch_name, commit_message, base_branch }) {
  const res = await apiFetch(`/repos/${owner}/${repo}/push`, {
    method: 'POST',
    body: JSON.stringify({
      file_path,
      content,
      branch_name,
      commit_message,
      base_branch: base_branch || 'main',
    }),
  });
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Push failed')
  }
  return res.json();
}

export async function pushFilesBatch(owner, repo, { files, branch_name, commit_message, base_branch, target_mode }) {
  const res = await apiFetch(`/repos/${owner}/${repo}/push-batch`, {
    method: 'POST',
    body: JSON.stringify({
      files,
      branch_name,
      commit_message,
      base_branch: base_branch || 'main',
      target_mode: target_mode || 'auto',
    }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Batch push failed')
  }
  return res.json()
}

export async function exportPdf(content) {
  const res = await apiFetch(`/export/pdf`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'PDF export failed')
  }
  return res.blob();
}

// --- Project endpoints ---

export async function getProjects() {
  const res = await apiFetch('/projects')
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to load projects')
  }
  return res.json()
}

export async function createProject(data) {
  const res = await apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to create project')
  }
  return res.json()
}

export async function getProjectById(id) {
  const res = await apiFetch(`/projects/${id}`)
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to load project')
  }
  return res.json()
}

export async function renameProject(id, name) {
  const res = await apiFetch(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to rename project')
  }
  return res.json()
}

export async function deleteProject(id) {
  const res = await apiFetch(`/projects/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to delete project')
  }
  return res.json()
}

// --- File tree and editor endpoints ---

export async function fetchRepoFileTree(owner, repo, ref = 'HEAD', analysisData = {}, maxFiles = 500) {
  const res = await apiFetch(`/repos/${owner}/${repo}/tree/with-analysis`, {
    method: 'POST',
    body: JSON.stringify({
      ref,
      analysis_data: analysisData,
      max_files: maxFiles,
    }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to load file tree')
  }
  return res.json()
}

export async function makeForkChoice(owner, repo, choice, issueNumber = null) {
  const res = await apiFetch(`/repos/${owner}/${repo}/fork-choice`, {
    method: 'POST',
    body: JSON.stringify({
      choice,
      issue_number: issueNumber,
    }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Fork choice failed')
  }
  return res.json()
}

// --- Terminal endpoints ---

export async function createTerminalSession({ owner, repo, ref = 'HEAD' }) {
  const res = await apiFetch('/terminal/sessions', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, ref }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to create terminal session')
  }
  return res.json()
}

export async function closeTerminalSession(sessionId) {
  const res = await apiFetch(`/terminal/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to close terminal session')
  }
  return res.json()
}

export async function syncTerminalFiles(sessionId, files) {
  const res = await apiFetch(`/terminal/${encodeURIComponent(sessionId)}/sync-files`, {
    method: 'POST',
    body: JSON.stringify({ files }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to sync files')
  }
  return res.json()
}

export async function createTerminalTab(sessionId, { label = null, cwd = null } = {}) {
  const res = await apiFetch(`/terminal/${encodeURIComponent(sessionId)}/terminals`, {
    method: 'POST',
    body: JSON.stringify({ label, cwd }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to create terminal tab')
  }
  return res.json()
}

export async function listTerminalTabs(sessionId) {
  const res = await apiFetch(`/terminal/${encodeURIComponent(sessionId)}/terminals`)
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to list terminals')
  }
  return res.json()
}

export async function getTerminalSuggestions(sessionId) {
  const res = await apiFetch(`/terminal/${encodeURIComponent(sessionId)}/suggestions`)
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to load terminal suggestions')
  }
  return res.json()
}

export async function runTerminalSuggested(sessionId, payload) {
  const res = await apiFetch(`/terminal/${encodeURIComponent(sessionId)}/run-suggested`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to run suggested command')
  }
  return res.json()
}

export async function runTerminalCommand(sessionId, payload) {
  const res = await apiFetch(`/terminal/${encodeURIComponent(sessionId)}/run`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to run terminal command')
  }
  return res.json()
}

export async function getTerminalOutput(sessionId, terminalId, maxChunks = 300) {
  const res = await apiFetch(
    `/terminal/${encodeURIComponent(sessionId)}/${encodeURIComponent(terminalId)}/output?max_chunks=${encodeURIComponent(maxChunks)}`,
  )
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to fetch terminal output')
  }
  return res.json()
}

export function openTerminalSocket(sessionId, terminalId) {
  if (typeof window === 'undefined') {
    throw new Error('WebSocket terminal is only available in browser context')
  }
  const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const url = `${scheme}://${window.location.host}${API_BASE}/terminal/${encodeURIComponent(sessionId)}/${encodeURIComponent(terminalId)}`
  return new WebSocket(url)
}

// --- Project step persistence ---

export async function selectProjectIssue(projectId, { issue_number, issue_title, target_issue }) {
  const res = await apiFetch(`/projects/${projectId}/select-issue`, {
    method: 'PATCH',
    body: JSON.stringify({ issue_number, issue_title, target_issue }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to lock issue selection')
  }
  return res.json()
}

export async function saveProjectCodeLocator(projectId, codeLocatorOutput) {
  const res = await apiFetch(`/projects/${projectId}/code-locator`, {
    method: 'PATCH',
    body: JSON.stringify({ code_locator_output: codeLocatorOutput }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to save code locator output')
  }
  return res.json()
}

export async function saveProjectBriefing(projectId, briefingOutput) {
  const res = await apiFetch(`/projects/${projectId}/briefing`, {
    method: 'PATCH',
    body: JSON.stringify({ briefing_output: briefingOutput }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to save briefing')
  }
  return res.json()
}

export async function saveProjectTesting(projectId, testingOutput) {
  const res = await apiFetch(`/projects/${projectId}/testing`, {
    method: 'PATCH',
    body: JSON.stringify({ testing_output: testingOutput }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to save testing output')
  }
  return res.json()
}

export async function saveProjectAnalysisResult(projectId, analysisResult) {
  const res = await apiFetch(`/projects/${projectId}/analysis-result`, {
    method: 'PATCH',
    body: JSON.stringify({ analysis_result: analysisResult }),
  })
  if (!res.ok) {
    throw new Error((await responseErrorDetail(res)) || 'Failed to save analysis result')
  }
  return res.json()
}
