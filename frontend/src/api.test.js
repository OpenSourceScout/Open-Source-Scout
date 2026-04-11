import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./auth', () => ({ getAccessToken: () => null }))

import { runAnalyze, getFileContent } from './api'

describe('frontend–backend API contract (slide integration)', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('runAnalyze POSTs /api/analyze with repo_url and model fields', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })
    await runAnalyze({
      repo_url: 'https://github.com/acme/app',
      beginner_only: false,
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/analyze',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('https://github.com/acme/app'),
      }),
    )
    const body = JSON.parse(fetch.mock.calls[0][1].body)
    expect(body).toMatchObject({
      repo_url: 'https://github.com/acme/app',
      beginner_only: false,
    })
  })

  it('getFileContent requests encoded file path under /api/repos/.../files/', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ content: 'x', path: 'a', ref: 'main' }),
    })
    await getFileContent('owner', 'repo', 'src/App.tsx', 'main')
    const url = fetch.mock.calls[0][0]
    expect(url).toMatch(/\/api\/repos\/owner\/repo\/files\//)
    expect(url).toContain(encodeURIComponent('App.tsx'))
  })
})
