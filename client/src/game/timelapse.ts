import * as Y from 'yjs'
import { mesh } from '../net/session'

/**
 * Records the round as a stream of Yjs updates so the reveal screen can play
 * back a sped-up 3D replay. The recording is local to this client: a player who
 * joined mid-round replays from the moment they joined, which is exactly what
 * they saw.
 */
export interface Recording {
  base: Uint8Array
  events: Array<{ t: number; update: Uint8Array }>
  durationMs: number
}

let base: Uint8Array | null = null
let events: Array<{ t: number; update: Uint8Array }> = []
let startedAt = 0
let recording = false
let finished: Recording | null = null

mesh.doc.on('update', (update: Uint8Array) => {
  if (recording) events.push({ t: Date.now() - startedAt, update })
})

export function startRecording() {
  base = Y.encodeStateAsUpdate(mesh.doc)
  events = []
  startedAt = Date.now()
  recording = true
  finished = null
}

export function stopRecording() {
  if (!recording || !base) return
  recording = false
  finished = { base, events, durationMs: Math.max(1, Date.now() - startedAt) }
}

export function getRecording(): Recording | null {
  return finished
}
