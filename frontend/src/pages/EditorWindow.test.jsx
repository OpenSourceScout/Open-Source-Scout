import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const getFileContent = vi.fn()

vi.mock('../auth', () => ({ getAccessToken: () => null }))
vi.mock('@monaco-editor/react', () => ({
  default: function MockMonaco() {
    return <div data-testid="monaco-editor">monaco</div>
  },
  DiffEditor: () => null,
}))
vi.mock('../api', () => ({
  getFileContent: (...args) => getFileContent(...args),
  pushFile: vi.fn(),
  pushFilesBatch: vi.fn(),
  createTerminalSession: vi.fn(),
  closeTerminalSession: vi.fn(),
  createTerminalTab: vi.fn(),
  getTerminalSuggestions: vi.fn(),
  runTerminalSuggested: vi.fn(),
  runTerminalCommand: vi.fn(),
  getTerminalOutput: vi.fn(),
  syncTerminalFiles: vi.fn(),
  openTerminalSocket: vi.fn(),
}))

import EditorWindow from './EditorWindow'

describe('EditorWindow (view / edit flow)', () => {
  beforeEach(() => {
    getFileContent.mockReset()
    getFileContent.mockResolvedValue({ content: 'print("hi")\n', path: 'src/a.py' })
    vi.stubGlobal(
      'fetch',
      vi.fn((url) => {
        if (String(url).includes('/tree/with-analysis')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ files: [], highlighted_count: 0, total: 0 }),
          })
        }
        return Promise.resolve({ ok: false, status: 404, json: async () => ({}) })
      }),
    )
    const mem = {}
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => mem[k] ?? null,
      setItem: (k, v) => {
        mem[k] = String(v)
      },
      removeItem: (k) => {
        delete mem[k]
      },
      clear: () => {
        Object.keys(mem).forEach((k) => delete mem[k])
      },
    })
  })

  it('loads file from query params and renders Monaco editor shell', async () => {
    render(
      <MemoryRouter initialEntries={['/editor?owner=o&repo=r&path=src%2Fa.py']}>
        <Routes>
          <Route path="/editor" element={<EditorWindow />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('PR Pipeline Editor')).toBeInTheDocument()

    await waitFor(() => {
      expect(getFileContent).toHaveBeenCalled()
    })
    expect(getFileContent).toHaveBeenCalledWith('o', 'r', 'src/a.py', 'main')

    expect(await screen.findByTestId('monaco-editor')).toBeInTheDocument()
  })
})
