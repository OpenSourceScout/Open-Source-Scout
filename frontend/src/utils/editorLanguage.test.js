import { describe, it, expect } from 'vitest'
import { getLanguage, EXT_TO_LANG } from './editorLanguage'

describe('editor language mapping (Monaco)', () => {
  it('maps common extensions', () => {
    expect(getLanguage('src/app.tsx')).toBe('typescript')
    expect(getLanguage('README.md')).toBe('markdown')
    expect(getLanguage('main.py')).toBe('python')
  })

  it('falls back to plaintext for unknown extensions', () => {
    expect(getLanguage('Dockerfile')).toBe('plaintext')
    expect(getLanguage('')).toBe('plaintext')
  })

  it('exports a stable extension table', () => {
    expect(EXT_TO_LANG.py).toBe('python')
    expect(EXT_TO_LANG.yml).toBe('yaml')
  })
})
