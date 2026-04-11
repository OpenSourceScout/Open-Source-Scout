import { describe, it, expect } from 'vitest'
import { encodeRepoFilePathForApi } from './repoPaths'

describe('encodeRepoFilePathForApi (editor / file viewer URLs)', () => {
  it('encodes each path segment for GitHub contents API', () => {
    expect(encodeRepoFilePathForApi('src/components/App.tsx')).toBe(
      'src/components/App.tsx'.split('/').map(encodeURIComponent).join('/'),
    )
    expect(encodeRepoFilePathForApi('weird name/file.txt')).toContain('%20')
  })

  it('returns empty string for falsy path', () => {
    expect(encodeRepoFilePathForApi('')).toBe('')
  })
})
