import type { Vec3 } from './meshDoc'

export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'cone'

export interface PrimitiveData {
  verts: Vec3[]
  faces: number[][]
}

function polygonNormal(pts: Vec3[]): Vec3 {
  let nx = 0
  let ny = 0
  let nz = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1, z1] = pts[i]
    const [x2, y2, z2] = pts[(i + 1) % pts.length]
    nx += (y1 - y2) * (z1 + z2)
    ny += (z1 - z2) * (x1 + x2)
    nz += (x1 - x2) * (y1 + y2)
  }
  const len = Math.hypot(nx, ny, nz) || 1
  return [nx / len, ny / len, nz / len]
}

/** Flip any face whose normal points toward the solid's centroid (works for convex primitives). */
function ensureOutward(data: PrimitiveData): PrimitiveData {
  const c: Vec3 = [0, 0, 0]
  for (const v of data.verts) {
    c[0] += v[0] / data.verts.length
    c[1] += v[1] / data.verts.length
    c[2] += v[2] / data.verts.length
  }
  for (const face of data.faces) {
    const pts = face.map((i) => data.verts[i])
    const n = polygonNormal(pts)
    const fc: Vec3 = [0, 0, 0]
    for (const p of pts) {
      fc[0] += p[0] / pts.length
      fc[1] += p[1] / pts.length
      fc[2] += p[2] / pts.length
    }
    const dot = n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2])
    if (dot < 0) face.reverse()
  }
  return data
}

function cube(): PrimitiveData {
  const s = 0.5
  // sits on the ground plane: y in [0, 1]
  const verts: Vec3[] = [
    [-s, 0, -s], [s, 0, -s], [s, 0, s], [-s, 0, s],
    [-s, 1, -s], [s, 1, -s], [s, 1, s], [-s, 1, s],
  ]
  const faces = [
    [0, 1, 2, 3], // bottom
    [4, 7, 6, 5], // top
    [3, 2, 6, 7], // front (+z)
    [1, 0, 4, 5], // back (-z)
    [2, 1, 5, 6], // right (+x)
    [0, 3, 7, 4], // left (-x)
  ]
  return ensureOutward({ verts, faces })
}

function sphere(): PrimitiveData {
  const r = 0.6
  const cy = 0.6
  const w = 10 // longitude segments
  const h = 7 // latitude segments
  const verts: Vec3[] = [[0, cy + r, 0]] // top pole = 0
  for (let i = 1; i < h; i++) {
    const theta = (i * Math.PI) / h
    const y = cy + r * Math.cos(theta)
    const rr = r * Math.sin(theta)
    for (let j = 0; j < w; j++) {
      const phi = (j * 2 * Math.PI) / w
      verts.push([rr * Math.cos(phi), y, rr * Math.sin(phi)])
    }
  }
  const bottom = verts.length
  verts.push([0, cy - r, 0])

  const idx = (i: number, j: number) => 1 + (i - 1) * w + (j % w)
  const faces: number[][] = []
  for (let j = 0; j < w; j++) faces.push([0, idx(1, j), idx(1, j + 1)])
  for (let i = 1; i < h - 1; i++) {
    for (let j = 0; j < w; j++) {
      faces.push([idx(i, j), idx(i, j + 1), idx(i + 1, j + 1), idx(i + 1, j)])
    }
  }
  for (let j = 0; j < w; j++) faces.push([bottom, idx(h - 1, j + 1), idx(h - 1, j)])
  return ensureOutward({ verts, faces })
}

function cylinder(): PrimitiveData {
  const r = 0.5
  const n = 12
  const verts: Vec3[] = []
  for (let j = 0; j < n; j++) {
    const phi = (j * 2 * Math.PI) / n
    verts.push([r * Math.cos(phi), 0, r * Math.sin(phi)])
  }
  for (let j = 0; j < n; j++) {
    const phi = (j * 2 * Math.PI) / n
    verts.push([r * Math.cos(phi), 1, r * Math.sin(phi)])
  }
  const faces: number[][] = []
  for (let j = 0; j < n; j++) {
    const j1 = (j + 1) % n
    faces.push([j, j1, n + j1, n + j])
  }
  faces.push(Array.from({ length: n }, (_, j) => n + j)) // top cap
  faces.push(Array.from({ length: n }, (_, j) => n - 1 - j)) // bottom cap
  return ensureOutward({ verts, faces })
}

function cone(): PrimitiveData {
  const r = 0.6
  const h = 1.1
  const n = 12
  const verts: Vec3[] = []
  for (let j = 0; j < n; j++) {
    const phi = (j * 2 * Math.PI) / n
    verts.push([r * Math.cos(phi), 0, r * Math.sin(phi)])
  }
  const apex = verts.length
  verts.push([0, h, 0])
  const faces: number[][] = []
  for (let j = 0; j < n; j++) faces.push([j, (j + 1) % n, apex])
  faces.push(Array.from({ length: n }, (_, j) => n - 1 - j)) // base cap
  return ensureOutward({ verts, faces })
}

export const PRIMITIVES: Record<PrimitiveKind, () => PrimitiveData> = {
  cube,
  sphere,
  cylinder,
  cone,
}
