export function encodeRepoFilePathForApi(path) {
  if (!path) return ''
  return path.split('/').map(encodeURIComponent).join('/')
}
