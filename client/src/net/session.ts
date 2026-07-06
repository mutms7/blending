import { useSyncExternalStore } from 'react'
import { WebsocketProvider } from 'y-websocket'
import { MeshDoc, type SelMode } from '../mesh/meshDoc'
import { useApp } from '../state/store'

// Where the sync websocket + scoring API live.
//   - explicit VITE_SERVER_URL always wins (e.g. client hosted separately from the server)
//   - a production build with no override talks to whoever served the bundle (same-origin),
//     which is how the single-service deploy works: the Node server serves this client
//   - dev falls back to the local server on :4000 (Vite serves the client on :5173)
export const SERVER_URL: string =
  import.meta.env.VITE_SERVER_URL ??
  (import.meta.env.PROD ? location.origin : 'http://localhost:4000')
// https -> wss, http -> ws (replace only touches the leading scheme)
const WS_URL = SERVER_URL.replace(/^http/, 'ws')

function roomFromUrl(): string {
  const url = new URL(location.href)
  let room = url.searchParams.get('room')
  if (!room) {
    room = Math.random().toString(36).slice(2, 8)
    url.searchParams.set('room', room)
    history.replaceState(null, '', url)
  }
  return room
}

export const room = roomFromUrl()
export const mesh = new MeshDoc()
export const provider = new WebsocketProvider(WS_URL, room, mesh.doc)
export const awareness = provider.awareness
export const myClientId = mesh.doc.clientID

// ---------------------------------------------------------------------------
// Identity / presence
// ---------------------------------------------------------------------------

const NAMES = [
  'Wobbly Walrus', 'Chunky Chinchilla', 'Polygon Pete', 'Vertex Vera', 'Mesh Marmot',
  'Lowpoly Lou', 'Extrude Edna', 'Bevel Bea', 'Quad Quinn', 'Normal Norm',
  'Topology Tom', 'Subdivide Sue', 'Gizmo Gus', 'Lofty Llama',
]
const COLORS = [
  '#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#38d9a9',
  '#4dabf7', '#748ffc', '#da77f2', '#f783ac', '#a9e34b',
]

export interface PresenceUser {
  name: string
  color: string
}

export const me: PresenceUser = {
  name: NAMES[Math.floor(Math.random() * NAMES.length)],
  color: COLORS[myClientId % COLORS.length],
}

/** Stable per-browser player id — powers daily-challenge streaks. */
function playerId(): string {
  let id = localStorage.getItem('bt-player-id')
  if (!id) {
    id = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('bt-player-id', id)
  }
  return id
}
export const myPlayerId = playerId()

awareness.setLocalState({
  user: me,
  pid: myPlayerId,
  cursor: null as [number, number, number] | null,
  sel: { mode: 'face' as SelMode, ids: [] as string[] },
})

export function renameMe(name: string) {
  me.name = name.slice(0, 24) || me.name
  awareness.setLocalStateField('user', { ...me })
}

let cursorLastSent = 0
export function publishCursor(point: [number, number, number] | null) {
  const now = performance.now()
  if (point !== null && now - cursorLastSent < 50) return
  cursorLastSent = now
  awareness.setLocalStateField('cursor', point)
}

// ---------------------------------------------------------------------------
// Wiring: Yjs -> store, store -> awareness
// ---------------------------------------------------------------------------

function selectionStillValid(mode: SelMode, id: string): boolean {
  if (mode === 'face' || mode === 'object') return mesh.faces.has(id)
  if (mode === 'vertex') return mesh.verts.has(id)
  const [a, b] = id.split('~')
  return mesh.verts.has(a) && mesh.verts.has(b)
}

const bumpMesh = () => {
  useApp.setState((s) => {
    const selection = s.selection.filter((id) => selectionStillValid(s.mode, id))
    return {
      meshVersion: s.meshVersion + 1,
      selection: selection.length === s.selection.length ? s.selection : selection,
    }
  })
}
mesh.verts.observe(bumpMesh)
mesh.faces.observe(bumpMesh)
mesh.faceColors.observe(bumpMesh)
mesh.vertColors.observe(bumpMesh)

// publish my selection so other players see what I'm grabbing
let lastPublished: { mode: SelMode; ids: string[] } | null = null
useApp.subscribe((s) => {
  if (!lastPublished || lastPublished.mode !== s.mode || lastPublished.ids !== s.selection) {
    lastPublished = { mode: s.mode, ids: s.selection }
    awareness.setLocalStateField('sel', lastPublished)
  }
})

provider.on('status', ({ status }: { status: string }) => {
  useApp.setState({ connected: status === 'connected' })
})

// Seed an empty room with a starting cube. Runs once, whichever comes first:
// right after the initial server sync (so we don't stomp an existing room), or a
// fallback timer so a starting cube still appears when the server is unreachable
// (solo / offline dev).
let seeded = false
function seedStartingCube() {
  if (seeded) return
  if (mesh.isEmpty() && awareness.getStates().size <= 1) {
    seeded = true
    mesh.resetToCube()
  }
}
provider.on('sync', (isSynced: boolean) => {
  if (isSynced) setTimeout(seedStartingCube, 200)
})
setTimeout(seedStartingCube, 1500)

// ---------------------------------------------------------------------------
// Awareness as a React hook (version counter -> re-render on change)
// ---------------------------------------------------------------------------

let awarenessVersion = 0
const awarenessListeners = new Set<() => void>()
awareness.on('change', () => {
  awarenessVersion++
  awarenessListeners.forEach((cb) => cb())
})

export function useAwarenessVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      awarenessListeners.add(cb)
      return () => awarenessListeners.delete(cb)
    },
    () => awarenessVersion
  )
}

export interface PeerState {
  clientId: number
  pid: string
  user: PresenceUser
  cursor: [number, number, number] | null
  sel: { mode: SelMode; ids: string[] }
}

export function getPeers(includeSelf = false): PeerState[] {
  const out: PeerState[] = []
  awareness.getStates().forEach((state, clientId) => {
    if (!includeSelf && clientId === myClientId) return
    if (!state?.user) return
    out.push({
      clientId,
      pid: (state.pid as string) ?? String(clientId),
      user: state.user as PresenceUser,
      cursor: (state.cursor as [number, number, number] | null) ?? null,
      sel: (state.sel as { mode: SelMode; ids: string[] }) ?? { mode: 'face', ids: [] },
    })
  })
  return out.sort((a, b) => a.clientId - b.clientId)
}

// Dev-only introspection hook (harmless in production, handy for debugging)
;(window as unknown as Record<string, unknown>).__blend = { mesh, awareness, useApp }

export function inviteLink(): string {
  const url = new URL(location.href)
  url.searchParams.set('room', room)
  return url.toString()
}
