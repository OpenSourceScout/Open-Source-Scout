const API_BASE = '/api';

export async function runAnalyze({ repo_url, beginner_only = true, fast_model, powerful_model }) {
  const res = await fetch(`${API_BASE}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      repo_url,
      beginner_only,
      fast_model: fast_model || 'qwen-qwq-32b',
      powerful_model: powerful_model || 'llama-3.3-70b',
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Analysis failed');
  }
  return res.json();
}

export async function getFileContent(owner, repo, path, ref = 'main') {
  const encodedPath = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/files/${encodedPath}?ref=${encodeURIComponent(ref)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to load file');
  }
  return res.json();
}

export async function pushFile(owner, repo, { file_path, content, branch_name, commit_message, base_branch }) {
  const res = await fetch(`${API_BASE}/repos/${owner}/${repo}/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

export async function exportPdf(content) {
  const res = await fetch(`${API_BASE}/export/pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'PDF export failed');
  }
  return res.blob();
}
