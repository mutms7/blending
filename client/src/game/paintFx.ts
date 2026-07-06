// Tiny event bus so the paint handler (inside the mesh) can fire a splash burst
// that the <PaintSplashes> renderer picks up, without threading refs around.

export interface Splash {
  id: number
  pos: [number, number, number]
  color: string
}

let seq = 0
const listeners = new Set<(s: Splash) => void>()

export function emitSplash(pos: [number, number, number], color: string) {
  const s: Splash = { id: seq++, pos, color }
  listeners.forEach((l) => l(s))
}

export function onSplash(cb: (s: Splash) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
