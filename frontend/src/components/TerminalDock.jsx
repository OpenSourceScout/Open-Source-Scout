import { useEffect, useMemo, useRef, useState } from 'react'
import {
  closeTerminalSession,
  createTerminalSession,
  createTerminalTab,
  getTerminalOutput,
  getTerminalSuggestions,
  openTerminalSocket,
  runTerminalCommand,
  runTerminalSuggested,
  syncTerminalFiles,
} from '../api'
import './TerminalDock.css'

export default function TerminalDock({
  owner,
  repo,
  refName,
  modifiedContentsKey,
  analysisData = null,
}) {
  const [session, setSession] = useState(null)
  const [terminals, setTerminals] = useState([])
  const [activeTerminalId, setActiveTerminalId] = useState(null)
  const [outputByTerminal, setOutputByTerminal] = useState({})
  const [commandInput, setCommandInput] = useState('')
  const [busyMessage, setBusyMessage] = useState('')
  const [error, setError] = useState(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [suggestions, setSuggestions] = useState([])
  const [suggestionIndex, setSuggestionIndex] = useState(0)
  const [dockTab, setDockTab] = useState('terminal')

  const socketRef = useRef(null)
  const pollTimerRef = useRef(null)
  const pollInFlightRef = useRef(false)
  const outputRef = useRef(null)
  const sessionIdRef = useRef(null)

  const activeOutput = useMemo(
    () => outputByTerminal[activeTerminalId] || '',
    [outputByTerminal, activeTerminalId],
  )

  const activeSuggestion = useMemo(() => {
    if (!suggestions.length) return null
    const safeIndex = Math.min(suggestionIndex, suggestions.length - 1)
    return suggestions[safeIndex]
  }, [suggestions, suggestionIndex])

  const appendOutput = (terminalId, chunk) => {
    if (!terminalId || !chunk) return
    setOutputByTerminal((prev) => ({
      ...prev,
      [terminalId]: `${prev[terminalId] || ''}${chunk}`,
    }))
  }

  const closeSocket = () => {
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
    }
    setSocketConnected(false)
  }

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current)
      pollTimerRef.current = null
    }
    pollInFlightRef.current = false
  }

  const startPolling = (sessionId, terminalId) => {
    stopPolling()
    if (!sessionId || !terminalId) return

    pollTimerRef.current = setInterval(async () => {
      if (pollInFlightRef.current) return
      pollInFlightRef.current = true
      try {
        const data = await getTerminalOutput(sessionId, terminalId, 300)
        const chunks = data.chunks || []
        if (chunks.length) {
          appendOutput(terminalId, chunks.join(''))
        }
      } catch (err) {
        setError(err.message || 'Failed to fetch terminal output')
      } finally {
        pollInFlightRef.current = false
      }
    }, 700)
  }

  const connectSocket = (sessionId, terminalId) => {
    closeSocket()

    if (!sessionId || !terminalId) return

    const ws = openTerminalSocket(sessionId, terminalId)
    socketRef.current = ws

    ws.onopen = () => {
      setSocketConnected(true)
      setError(null)
    }

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data)
        if (payload.type === 'output') {
          appendOutput(terminalId, payload.data || '')
          return
        }
        if (payload.type === 'error') {
          setError(payload.message || 'Terminal error')
        }
      } catch {
        appendOutput(terminalId, String(event.data || ''))
      }
    }

    ws.onclose = () => {
      if (socketRef.current === ws) {
        socketRef.current = null
        setSocketConnected(false)
      }
    }

    ws.onerror = () => {
      setSocketConnected(false)
    }
  }

  const getSyncedFilesPayload = () => {
    try {
      const raw = sessionStorage.getItem(modifiedContentsKey)
      if (!raw) return []
      const saved = JSON.parse(raw)
      if (!saved || typeof saved !== 'object') return []
      return Object.entries(saved).map(([path, content]) => ({ path, content }))
    } catch {
      return []
    }
  }

  const loadSuggestions = async (sessionId) => {
    try {
      const data = await getTerminalSuggestions(sessionId)
      setSuggestions(data.suggestions || [])
      setSuggestionIndex(0)
    } catch (err) {
      setError(err.message || 'Failed to load run suggestions')
    }
  }

  const createTab = async (sessionId, preferredLabel = null) => {
    const data = await createTerminalTab(sessionId, {
      label: preferredLabel,
    })
    const created = data.terminal
    setTerminals((prev) => [...prev, created])
    setActiveTerminalId(created.terminal_id)
    connectSocket(sessionId, created.terminal_id)
    startPolling(sessionId, created.terminal_id)
  }

  const startSession = async () => {
    if (!owner || !repo) {
      setError('Repository owner and name are required to start terminal')
      return
    }

    setBusyMessage('Preparing workspace terminal...')
    setError(null)

    try {
      const data = await createTerminalSession({
        owner,
        repo,
        ref: refName || 'HEAD',
        analysisData,
      })

      setSession(data)
      sessionIdRef.current = data.session_id
      setTerminals([])
      setOutputByTerminal({})
      setActiveTerminalId(null)

      await createTab(data.session_id, 'Terminal 1')
      await loadSuggestions(data.session_id)
    } catch (err) {
      setError(err.message || 'Failed to start terminal session')
    } finally {
      setBusyMessage('')
    }
  }

  const stopSession = async () => {
    closeSocket()
    stopPolling()
    const sid = sessionIdRef.current

    setSession(null)
    setTerminals([])
    setOutputByTerminal({})
    setActiveTerminalId(null)
    setSuggestions([])
    setSuggestionIndex(0)

    if (!sid) return

    sessionIdRef.current = null
    try {
      await closeTerminalSession(sid)
    } catch {
      // Session can already be gone after backend restart; ignore.
    }
  }

  const restartSession = async () => {
    await stopSession()
    await startSession()
  }

  const runCommand = async () => {
    if (!session || !activeTerminalId) {
      setError('Open a terminal tab before running a command')
      return
    }

    const command = commandInput.trim()
    if (!command) return

    setBusyMessage('Syncing files and running command...')
    setError(null)

    try {
      if (session) {
        const files = getSyncedFilesPayload()
        if (files.length) {
          await syncTerminalFiles(session.session_id, files)
        }
      }

      await runTerminalCommand(session.session_id, {
        terminal_id: activeTerminalId,
        command,
      })
      setCommandInput('')
    } catch (err) {
      setError(err.message || 'Failed to run command')
    } finally {
      setBusyMessage('')
    }
  }

  const runSuggestedCommand = async (suggestion) => {
    if (!session || !activeTerminalId || !suggestion) {
      setError('Open a terminal tab before running a suggestion')
      return
    }

    setBusyMessage('Syncing files and running suggested command...')
    setError(null)

    try {
      const files = getSyncedFilesPayload()
      if (files.length) {
        await syncTerminalFiles(session.session_id, files)
      }

      await runTerminalSuggested(session.session_id, {
        terminal_id: activeTerminalId,
        command: suggestion.command,
        cwd: suggestion.cwd || null,
      })
    } catch (err) {
      setError(err.message || 'Failed to run suggested command')
    } finally {
      setBusyMessage('')
    }
  }

  const runSuggested = async () => {
    await runSuggestedCommand(activeSuggestion)
  }

  const nextSuggestion = () => {
    if (!suggestions.length) return
    setSuggestionIndex((prev) => (prev + 1) % suggestions.length)
  }

  const switchTerminal = (terminalId) => {
    if (!session || !terminalId || terminalId === activeTerminalId) return
    setActiveTerminalId(terminalId)
    connectSocket(session.session_id, terminalId)
    startPolling(session.session_id, terminalId)
  }

  const addTerminal = async () => {
    if (!session) return
    setBusyMessage('Creating terminal tab...')
    setError(null)
    try {
      await createTab(session.session_id, `Terminal ${terminals.length + 1}`)
    } catch (err) {
      setError(err.message || 'Failed to create terminal tab')
    } finally {
      setBusyMessage('')
    }
  }

  useEffect(() => {
    const panel = outputRef.current
    if (!panel) return
    panel.scrollTop = panel.scrollHeight
  }, [activeOutput])

  useEffect(() => {
    return () => {
      stopPolling()
      closeSocket()
      const sid = sessionIdRef.current
      if (sid) {
        closeTerminalSession(sid).catch(() => {})
      }
    }
  }, [])

  useEffect(() => {
    if (!session || !activeTerminalId) {
      stopPolling()
      return
    }
    startPolling(session.session_id, activeTerminalId)
    return () => {
      stopPolling()
    }
  }, [session?.session_id, activeTerminalId])

  useEffect(() => {
    if (!session || !activeTerminalId) return
    connectSocket(session.session_id, activeTerminalId)
  }, [session?.session_id, activeTerminalId])

  const canStart = owner && repo

  return (
    <div className="terminal-dock">
      <div className="terminal-dock-header">
        <div className="terminal-dock-title">Workspace Terminal</div>
        <div className="terminal-view-tabs" role="tablist" aria-label="Terminal views">
          <button
            type="button"
            role="tab"
            aria-selected={dockTab === 'terminal'}
            className={`terminal-view-tab ${dockTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setDockTab('terminal')}
          >
            Terminal
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={dockTab === 'steps'}
            className={`terminal-view-tab ${dockTab === 'steps' ? 'active' : ''}`}
            onClick={() => setDockTab('steps')}
          >
            Run steps
          </button>
        </div>
        <div className={`terminal-connection ${socketConnected ? 'online' : 'offline'}`}>
          {socketConnected ? 'Live connected' : 'Live fallback (polling)'}
        </div>
      </div>

      {!session ? (
        <div className="terminal-empty-state">
          <p>
            {canStart
              ? 'Start an isolated terminal workspace to run this repository like an IDE terminal.'
              : 'Select a repository in the editor to enable terminal workspace.'}
          </p>
          <button
            type="button"
            className="terminal-primary"
            onClick={startSession}
            disabled={!canStart || !!busyMessage}
          >
            {busyMessage || 'Start Terminal'}
          </button>
        </div>
      ) : (
        <>
          <div className="terminal-toolbar">
            <div className="terminal-tabs">
              {terminals.map((tab) => (
                <button
                  key={tab.terminal_id}
                  type="button"
                  className={`terminal-tab ${activeTerminalId === tab.terminal_id ? 'active' : ''}`}
                  onClick={() => switchTerminal(tab.terminal_id)}
                >
                  {tab.label}
                </button>
              ))}
              <button type="button" className="terminal-tab add" onClick={addTerminal} title="New Terminal">
                <span style={{fontWeight: 'bold', fontSize: 18, lineHeight: '18px'}}>+</span>
              </button>
            </div>
            <div className="terminal-session-actions">
              <button type="button" className="terminal-secondary" onClick={restartSession}>
                Restart Session
              </button>
              <button type="button" className="terminal-secondary" onClick={stopSession}>
                Close
              </button>
            </div>
          </div>

          {activeSuggestion && (
            <div className="terminal-suggestion-strip">
              <div className="terminal-suggestion-comment">{activeSuggestion.comment}</div>
              <div className="terminal-suggestion-command">$ {activeSuggestion.command}</div>
              {activeSuggestion.cwd && (
                <div className="terminal-suggestion-cwd">cwd: {activeSuggestion.cwd}</div>
              )}
              <div className="terminal-suggestion-actions">
                <button type="button" className="terminal-primary" onClick={runSuggested} disabled={!!busyMessage}>
                  Run in terminal
                </button>
                <button type="button" className="terminal-secondary" onClick={nextSuggestion}>
                  Next step
                </button>
              </div>
            </div>
          )}

          {dockTab === 'terminal' ? (
            <>
              <div className="terminal-output" ref={outputRef}>
                <pre>{activeOutput || '# Terminal ready. Run a command to begin.\n'}</pre>
              </div>

              <div className="terminal-command-row">
                <input
                  className="terminal-command-input"
                  value={commandInput}
                  onChange={(e) => setCommandInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      runCommand()
                    }
                  }}
                  placeholder="Type command (example: uv run pytest or npm run dev)"
                  style={{maxWidth: '100%'}}
                />
                <button type="button" className="terminal-primary" onClick={runCommand}>
                  Run
                </button>
              </div>
            </>
          ) : (
            <div className="terminal-run-steps">
              {suggestions.length ? (
                suggestions.map((step, idx) => (
                  <div
                    key={`${step.command}-${idx}`}
                    className={`terminal-step-card ${idx === suggestionIndex ? 'active' : ''}`}
                  >
                    <div className="terminal-step-comment">{step.comment}</div>
                    <div className="terminal-step-command">$ {step.command}</div>
                    {step.cwd && <div className="terminal-step-cwd">cwd: {step.cwd}</div>}
                    <div className="terminal-step-actions">
                      <button
                        type="button"
                        className="terminal-primary"
                        onClick={() => runSuggestedCommand(step)}
                        disabled={!!busyMessage}
                      >
                        Run this step
                      </button>
                      <button
                        type="button"
                        className="terminal-secondary"
                        onClick={() => {
                          setSuggestionIndex(idx)
                          setDockTab('terminal')
                        }}
                      >
                        Focus in terminal
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="terminal-steps-empty">
                  No run suggestions yet. Start a terminal session to generate project-aware steps.
                </div>
              )}
            </div>
          )}
        </>
      )}

      {(error || busyMessage) && (
        <div className={`terminal-status ${error ? 'error' : 'info'}`}>
          {error || busyMessage}
        </div>
      )}
    </div>
  )
}
