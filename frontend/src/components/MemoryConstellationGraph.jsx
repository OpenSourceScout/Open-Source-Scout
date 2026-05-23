import { useEffect, useMemo, useRef, useState } from 'react'
import { ExternalLink, Maximize2, Minimize2, Minus, Orbit, Plus } from 'lucide-react'

const LINK_COLORS = {
  semantic: '#0074d9',
  temporal: '#009296',
  entity: '#f59e0b',
  causal: '#8b5cf6',
}

const DEFAULT_NODE = '#38bdf8'
const ZOOM_STEP = 10
const DEFAULT_ZOOM_PERCENT = 100

function graphPayloadToForce(data) {
  const rawNodes = data?.nodes || []
  const linkCounts = new Map()
  for (const e of data?.edges || []) {
    linkCounts.set(e.source, (linkCounts.get(e.source) || 0) + 1)
    linkCounts.set(e.target, (linkCounts.get(e.target) || 0) + 1)
  }
  const nodes = rawNodes.map((n) => ({
    id: n.id,
    name: n.label || n.id,
    text: n.text || '',
    context: n.context || '',
    color: n.color || DEFAULT_NODE,
    linkCount: linkCounts.get(n.id) || 0,
  }))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const links = (data?.edges || [])
    .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      linkType: e.link_type || e.linkType || '',
      color: e.color || LINK_COLORS[e.link_type] || '#64748b',
    }))
  return { nodes, links }
}

export default function MemoryConstellationGraph({
  graphData,
  loading,
  error,
  bankId,
  hindsightUiUrl = 'https://ui.hindsight.vectorize.io',
}) {
  const containerRef = useRef(null)
  const viewportRef = useRef(null)
  const graphRef = useRef(null)
  const [ForceGraph, setForceGraph] = useState(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 })
  const [zoomPercent, setZoomPercent] = useState(DEFAULT_ZOOM_PERCENT)
  const [zoomInput, setZoomInput] = useState(String(DEFAULT_ZOOM_PERCENT))
  const baseCameraDistanceRef = useRef(null)

  useEffect(() => {
    let active = true
    import('react-force-graph-3d')
      .then((mod) => {
        if (active) setForceGraph(() => mod.default)
      })
      .catch(() => {
        if (active) setForceGraph(null)
      })
    return () => {
      active = false
    }
  }, [])

  const forceData = useMemo(() => graphPayloadToForce(graphData), [graphData])

  const getCameraState = () => {
    if (!graphRef.current) return null

    const graph = graphRef.current
    const camera = graph.camera?.()
    const controls = graph.controls?.()
    if (!camera) return null

    const target = controls?.target || { x: 0, y: 0, z: 0 }
    const dx = camera.position.x - target.x
    const dy = camera.position.y - target.y
    const dz = camera.position.z - target.z
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz)
    if (!Number.isFinite(distance) || distance <= 0) return null

    return {
      target,
      dx,
      dy,
      dz,
      distance,
    }
  }

  const normalizeZoomPercent = (value) => {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    return Math.max(Math.floor(parsed), 0)
  }

  const applyZoomPercent = (nextPercent, transitionMs = 220) => {
    const normalized = normalizeZoomPercent(nextPercent)
    if (normalized == null || !graphRef.current) return

    const state = getCameraState()
    if (!state) return

    if (!baseCameraDistanceRef.current) {
      baseCameraDistanceRef.current = state.distance
    }

    const baseDistance = baseCameraDistanceRef.current || state.distance
    const nextDistance =
      normalized === 0
        ? baseDistance * 100
        : baseDistance * (DEFAULT_ZOOM_PERCENT / normalized)

    const scale = nextDistance / state.distance
    const nextPos = {
      x: state.target.x + state.dx * scale,
      y: state.target.y + state.dy * scale,
      z: state.target.z + state.dz * scale,
    }

    graphRef.current.cameraPosition(nextPos, state.target, transitionMs)
    setZoomPercent(normalized)
    setZoomInput(String(normalized))
  }

  const changeZoomByStep = (delta) => {
    const current = normalizeZoomPercent(zoomPercent) ?? DEFAULT_ZOOM_PERCENT
    applyZoomPercent(Math.max(0, current + delta))
  }

  const commitZoomInput = () => {
    const parsed = normalizeZoomPercent(zoomInput)
    if (parsed == null) {
      setZoomInput(String(zoomPercent))
      return
    }
    applyZoomPercent(parsed)
  }

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateSize = () => {
      const rect = viewport.getBoundingClientRect()
      setGraphSize({
        width: Math.max(Math.floor(rect.width), 0),
        height: Math.max(Math.floor(rect.height), 0),
      })
    }

    updateSize()

    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      updateSize()
    })
    observer.observe(viewport)

    return () => {
      observer.disconnect()
    }
  }, [fullscreen])

  useEffect(() => {
    if (!graphRef.current || forceData.nodes.length === 0 || graphSize.width <= 0 || graphSize.height <= 0) return

    const fitGraph = () => {
      try {
        graphRef.current.zoomToFit(500, 80)
        const state = getCameraState()
        if (state) {
          baseCameraDistanceRef.current = state.distance
        }
        setZoomPercent(DEFAULT_ZOOM_PERCENT)
        setZoomInput(String(DEFAULT_ZOOM_PERCENT))
      } catch {
        /* ignore */
      }
    }

    const initialFit = setTimeout(fitGraph, 250)
    const lateFit = setTimeout(fitGraph, 900)

    return () => {
      clearTimeout(initialFit)
      clearTimeout(lateFit)
    }
  }, [forceData, fullscreen, graphSize])

  const panelClass = fullscreen
    ? 'fixed inset-0 z-[70] m-0 h-[100dvh] w-screen rounded-none border-0'
    : 'relative rounded-xl border border-app-border'

  return (
    <div
      ref={containerRef}
      className={`${panelClass} bg-[#020617] overflow-hidden`}
      style={fullscreen ? { height: '100dvh', width: '100vw' } : { height: 'min(480px, 55vh)' }}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-slate-950/80 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <Orbit className="h-4 w-4 text-primary-400" />
          <span className="font-medium text-slate-100">Memory constellation</span>
          <span className="text-slate-500">
            {forceData.nodes.length} nodes · {forceData.links.length} links
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-slate-900/60 px-1 py-1 text-[11px] text-slate-300">
            <button
              type="button"
              onClick={() => changeZoomByStep(-ZOOM_STEP)}
              className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-primary-300"
              title="Zoom out"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <input
              type="number"
              min="0"
              step="10"
              value={zoomInput}
              onChange={(e) => setZoomInput(e.target.value)}
              onBlur={commitZoomInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitZoomInput()
              }}
              className="w-14 rounded border border-white/10 bg-transparent px-1 py-0.5 text-center text-[11px] text-slate-200 focus:border-primary-500/50 focus:outline-none"
              aria-label="Zoom percentage"
            />
            <span className="text-slate-400">%</span>
            <button
              type="button"
              onClick={() => changeZoomByStep(ZOOM_STEP)}
              className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-primary-300"
              title="Zoom in"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          {bankId && (
            <a
              href={hindsightUiUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:border-primary-500/40 hover:text-primary-300"
            >
              Open Hindsight
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="rounded-md border border-white/10 p-1.5 text-slate-300 hover:border-primary-500/40 hover:text-primary-300"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      <div ref={viewportRef} className="absolute inset-0 pt-11">
        {loading && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Building memory map…
          </div>
        )}
        {!loading && error && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-amber-300/90">
            {error}
          </div>
        )}
        {!loading && !error && forceData.nodes.length === 0 && (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            No graph data yet. Use the app to retain memories, then refresh.
          </div>
        )}
        {!loading && !error && ForceGraph && forceData.nodes.length > 0 && (
          <ForceGraph
            ref={graphRef}
            graphData={forceData}
            backgroundColor="#020617"
            width={graphSize.width || undefined}
            height={graphSize.height || undefined}
            nodeLabel={(n) => n.name || n.id}
            nodeColor={(n) => n.color || DEFAULT_NODE}
            nodeVal={(n) => 2 + Math.min(n.linkCount || 0, 12) * 0.35}
            linkColor={(l) => l.color || LINK_COLORS[l.linkType] || '#475569'}
            linkOpacity={0.45}
            linkWidth={0.6}
            onNodeClick={(node) => setSelected(node)}
            enableNavigationControls
            showNavInfo={false}
          />
        )}
      </div>

      {selected && (
        <div className="absolute bottom-3 left-3 right-3 z-20 max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-slate-950/90 p-3 text-xs text-slate-200 backdrop-blur-sm">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="font-medium text-primary-300">{selected.name}</p>
            <button
              type="button"
              className="text-slate-500 hover:text-slate-300"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          {selected.context && (
            <span className="mr-2 rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-400">
              {selected.context}
            </span>
          )}
          {selected.text && <p className="mt-2 leading-relaxed text-slate-300">{selected.text}</p>}
        </div>
      )}

      <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden sm:flex flex-col gap-1 rounded-lg border border-white/10 bg-slate-950/70 px-2 py-2 text-[10px] text-slate-400">
        {Object.entries(LINK_COLORS).map(([type, color]) => (
          <span key={type} className="flex items-center gap-1.5 capitalize">
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            {type}
          </span>
        ))}
      </div>
    </div>
  )
}
