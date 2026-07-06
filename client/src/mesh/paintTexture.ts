import * as THREE from 'three'
import type { PaintStroke } from './meshDoc'
import type { Cell } from './geometry'

// One shared offscreen canvas backs the paint atlas. Each face owns a square
// cell; brush dabs are rasterized into the cell at the hit's uv. Clipping to the
// cell keeps paint from bleeding across face edges (each face is its own canvas).

const SIZE = 2048

let canvas: HTMLCanvasElement | null = null
let ctx: CanvasRenderingContext2D | null = null
let texture: THREE.CanvasTexture | null = null

function ensure() {
  if (texture && ctx) return
  canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  ctx = canvas.getContext('2d')!
  texture = new THREE.CanvasTexture(canvas)
  texture.flipY = false // uv (u,v) maps straight to canvas (u,v) top-left origin
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
}

export function getPaintTexture(): THREE.CanvasTexture {
  ensure()
  return texture!
}

function clear() {
  ensure()
  ctx!.clearRect(0, 0, SIZE, SIZE)
}

function rgba(hex: string, a: number): string {
  const c = new THREE.Color(hex)
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${a})`
}

/** Draw one dab. `u`,`v` are absolute atlas coords (0..1); `radiusUV` in atlas units. */
export function drawDab(
  cell: Cell,
  u: number,
  v: number,
  radiusUV: number,
  color: string,
  flow: number,
  type: string
) {
  ensure()
  const c = ctx!
  const px = u * SIZE
  const py = v * SIZE
  const r = Math.max(1, radiusUV * SIZE)

  c.save()
  c.beginPath()
  c.rect(cell.u0 * SIZE, cell.v0 * SIZE, cell.size * SIZE, cell.size * SIZE)
  c.clip()

  if (type === 'airbrush') {
    const g = c.createRadialGradient(px, py, 0, px, py, r)
    g.addColorStop(0, rgba(color, flow))
    g.addColorStop(1, rgba(color, 0))
    c.fillStyle = g
  } else {
    c.globalAlpha = type === 'highlighter' ? flow * 0.4 : flow
    c.fillStyle = rgba(color, 1)
  }
  c.beginPath()
  c.arc(px, py, r, 0, Math.PI * 2)
  c.fill()
  c.restore()
  c.globalAlpha = 1

  texture!.needsUpdate = true
}

/** Replay one stored stroke into its (current) cell. */
export function drawStroke(s: PaintStroke, cells: Map<string, Cell>) {
  const cell = cells.get(s.f)
  if (!cell) return
  const u = cell.u0 + s.u * cell.size
  const v = cell.v0 + s.v * cell.size
  drawDab(cell, u, v, s.r * cell.size, s.c, s.o, s.t)
}

/** Repaint the whole atlas from scratch (topology changed, or after an undo). */
export function redrawAll(strokes: PaintStroke[], cells: Map<string, Cell>) {
  clear()
  for (const s of strokes) drawStroke(s, cells)
  if (texture) texture.needsUpdate = true
}
