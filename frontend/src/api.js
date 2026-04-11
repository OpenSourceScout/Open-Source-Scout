import { getAccessToken } from './auth'
import { encodeRepoFilePathForApi } from './utils/repoPaths'

const API_BASE = '/api';

// Different timeouts for different operations
const TIMEOUTS = {
  default: 30000,      // 30 seconds for quick operations
  analysis: 600000,    // 10 minutes for full analysis
  reAnalysis: 600000,  // 10 minutes for re-analysis
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
      throw new Error(`Request timeout. The analysis is taking longer than expected. Please wait and check the backend logs at http://localhost:8001`)
    }
    console.error(`Network error calling ${API_BASE}${path}:`, error)
    throw new Error(`Network error: ${error.message}. Make sure the backend server is running on http://localhost:8001`)
  }
}

export async function signup({ email, password, display_name }) {
  const res = await apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, display_name }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Signup failed')
  }
  return res.json()
}

export async function login({ email, password }) {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Login failed')
  }
  return res.json()
}

export async function getMe() {
  const res = await apiFetch('/me')
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to load profile')
  }
  return res.json()
}

export async function searchReposByTechStack({ tech_stack, fast_model }) {
  const res = await apiFetch(`/search-repos`, {
    method: 'POST',
    body: JSON.stringify({
      tech_stack,
      fast_model: fast_model || 'openai/gpt-oss-120b',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Repository search failed');
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Analysis failed');
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    
    // Handle specific error codes
    if (res.status === 429) {
      throw new Error('API rate limit exceeded. The analysis service is busy. Please wait 30-60 seconds and try again.');
    }
    if (res.status === 500) {
      throw new Error(err.detail || 'Analysis failed on the server. Please try again.');
    }
    
    throw new Error(err.detail || 'Re-analysis failed');
  }
  return res.json();
}

export async function getFileContent(owner, repo, path, ref = 'main') {
  const encodedPath = encodeRepoFilePathForApi(path);
  const res = await apiFetch(`/repos/${owner}/${repo}/files/${encodedPath}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to load file');
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
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Push failed');
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
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Batch push failed')
  }
  return res.json()
}

export async function exportPdf(content) {
  const res = await apiFetch(`/export/pdf`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'PDF export failed');
  }
  return res.blob();
}

// --- Project endpoints ---

export async function getProjects() {
  const res = await apiFetch('/projects')
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to load projects')
  }
  return res.json()
}

export async function createProject(data) {
  const res = await apiFetch('/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to create project')
  }
  return res.json()
}

export async function getProjectById(id) {
  const res = await apiFetch(`/projects/${id}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to load project')
  }
  return res.json()
}

export async function renameProject(id, name) {
  const res = await apiFetch(`/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to rename project')
  }
  return res.json()
}

export async function deleteProject(id) {
  const res = await apiFetch(`/projects/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to delete project')
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
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Failed to load file tree')
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
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Fork choice failed')
  }
  return res.json()
}
