import * as THREE from 'three'
import type * as Y from 'yjs'
import { edgeKey, polygonNormal, type Vec3 } from './meshDoc'

/** Base fill of an unpainted surface (matches the old flat material color). */
export const DEFAULT_MESH_COLOR = '#9fb4d8'

// ---------------------------------------------------------------------------
// Paint UV atlas: every face gets its own square cell in one shared texture,
// so free-draw paint on one face never bleeds onto its neighbours.
// ---------------------------------------------------------------------------

/** A face's square region in the [0,1] paint atlas. */
export interface Cell {
  u0: number
  v0: number
  size: number
}

// keep paint a little inside each cell so bilinear filtering can't sample a neighbour
const CELL_INSET = 0.06

/** Deterministic face -> atlas cell packing (stable for a given face set). */
export function faceCellMap(faces: Y.Map<string[]>): Map<string, Cell> {
  const ids: string[] = []
  faces.forEach((_, fid) => ids.push(fid))
  ids.sort()
  const grid = Math.max(1, Math.ceil(Math.sqrt(ids.length)))
  const size = 1 / grid
  const cells = new Map<string, Cell>()
  ids.forEach((fid, k) => {
    cells.set(fid, { u0: (k % grid) * size, v0: Math.floor(k / grid) * size, size })
  })
  return cells
}

/** Normalized [0,1]^2 coordinates of a face's vertices in its own plane. */
function faceLocalUVs(pts: Vec3[]): Array<[number, number]> {
  const n = polygonNormal(pts)
  const o = pts[0]
  let tx = pts[1][0] - o[0], ty = pts[1][1] - o[1], tz = pts[1][2] - o[2]
  if (tx * tx + ty * ty + tz * tz < 1e-9) {
    tx = pts[2][0] - o[0]; ty = pts[2][1] - o[1]; tz = pts[2][2] - o[2]
  }
  const tl = Math.hypot(tx, ty, tz) || 1
  tx /= tl; ty /= tl; tz /= tl
  // bitangent = n x t
  const bx = n[1] * tz - n[2] * ty
  const by = n[2] * tx - n[0] * tz
  const bz = n[0] * ty - n[1] * tx
  const loc = pts.map((p): [number, number] => {
    const dx = p[0] - o[0], dy = p[1] - o[1], dz = p[2] - o[2]
    return [dx * tx + dy * ty + dz * tz, dx * bx + dy * by + dz * bz]
  })
  let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity
  for (const [u, v] of loc) {
    minU = Math.min(minU, u); maxU = Math.max(maxU, u)
    minV = Math.min(minV, v); maxV = Math.max(maxV, v)
  }
  const du = maxU - minU || 1
  const dv = maxV - minV || 1
  return loc.map(([u, v]) => [(u - minU) / du, (v - minV) / dv])
}

/**
 * Anything that exposes the shared mesh maps (MeshDoc or a replay doc). The
 * color maps are optional so a bare {verts, faces} still renders (in default gray).
 */
export interface MeshLike {
  verts: Y.Map<Vec3>
  faces: Y.Map<string[]>
  faceColors?: Y.Map<string>
  vertColors?: Y.Map<string>
}

// hex -> linear rgb, cached (THREE.Color handles the sRGB->linear conversion)
const _c = new THREE.Color()
const colorCache = new Map<string, [number, number, number]>()
function rgbOf(hex: string): [number, number, number] {
  let v = colorCache.get(hex)
  if (!v) {
    _c.set(hex)
    v = [_c.r, _c.g, _c.b]
    colorCache.set(hex, v)
  }
  return v
}

/** Flat, render-ready view of the mesh, rebuilt whenever the Yjs doc changes. */
export interface RenderData {
  /** Non-indexed triangle soup (fan-triangulated faces). */
  positions: Float32Array
  /** Per-triangle-corner linear rgb (parallel to positions). */
  colors: Float32Array
  /** Per-triangle-corner paint-atlas uv (parallel to positions). */
  uvs: Float32Array
  /** Face id for each triangle in `positions`. */
  triFace: string[]
  vertIds: string[]
  vertPos: Float32Array
  edgeIds: string[]
  edgePos: Float32Array
  triCount: number
}

export function buildRenderData(mesh: MeshLike): RenderData {
  const vertIds: string[] = []
  const vertPos: number[] = []
  const pos = new Map<string, Vec3>()
  mesh.verts.forEach((p, id) => {
    pos.set(id, p)
    vertIds.push(id)
    vertPos.push(p[0], p[1], p[2])
  })

  const faceColors = mesh.faceColors
  const vertColors = mesh.vertColors
  const defaultRgb = rgbOf(DEFAULT_MESH_COLOR)
  const colorFor = (vid: string, fid: string): [number, number, number] => {
    const vc = vertColors?.get(vid)
    if (vc) return rgbOf(vc)
    const fc = faceColors?.get(fid)
    if (fc) return rgbOf(fc)
    return defaultRgb
  }

  const cells = faceCellMap(mesh.faces)

  const positions: number[] = []
  const colors: number[] = []
  const uvs: number[] = []
  const triFace: string[] = []
  const edgeSet = new Map<string, [Vec3, Vec3]>()

  mesh.faces.forEach((vs, fid) => {
    if (vs.length < 3) return
    for (const v of vs) {
      if (!pos.has(v)) return // face references a vertex a peer deleted; skip until repaired
    }
    // paint-atlas uv per polygon vertex (cell + inset)
    const cell = cells.get(fid) ?? { u0: 0, v0: 0, size: 1 }
    const local = faceLocalUVs(vs.map((v) => pos.get(v)!))
    const span = cell.size * (1 - 2 * CELL_INSET)
    const faceUV = local.map(([lu, lv]): [number, number] => [
      cell.u0 + cell.size * CELL_INSET + lu * span,
      cell.v0 + cell.size * CELL_INSET + lv * span,
    ])

    for (let i = 1; i < vs.length - 1; i++) {
      const corners = [0, i, i + 1]
      for (const ci of corners) {
        const p = pos.get(vs[ci])!
        positions.push(p[0], p[1], p[2])
        const [r, g, b] = colorFor(vs[ci], fid)
        colors.push(r, g, b)
        uvs.push(faceUV[ci][0], faceUV[ci][1])
      }
      triFace.push(fid)
    }
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]
      const b = vs[(i + 1) % vs.length]
      const key = edgeKey(a, b)
      if (!edgeSet.has(key)) edgeSet.set(key, [pos.get(a)!, pos.get(b)!])
    }
  })

  const edgeIds: string[] = []
  const edgePos: number[] = []
  edgeSet.forEach(([a, b], key) => {
    edgeIds.push(key)
    edgePos.push(...a, ...b)
  })

  return {
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    triFace,
    vertIds,
    vertPos: new Float32Array(vertPos),
    edgeIds,
    edgePos: new Float32Array(edgePos),
    triCount: triFace.length,
  }
}

export function makeSurfaceGeometry(data: RenderData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(data.positions, 3))
  if (data.colors.length === data.positions.length) {
    geo.setAttribute('color', new THREE.BufferAttribute(data.colors, 3))
  }
  if (data.uvs.length === (data.positions.length / 3) * 2) {
    geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs, 2))
  }
  geo.computeVertexNormals() // non-indexed -> per-triangle flat normals
  geo.computeBoundingSphere()
  return geo
}

export function makeLineGeometry(linePositions: Float32Array): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(linePositions, 3))
  return geo
}

export function makePointGeometry(pointPositions: Float32Array): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pointPositions, 3))
  return geo
}

/** Triangle positions for the given faces (selection highlight overlay). */
export function facesToTriangles(data: RenderData, faceIds: Iterable<string>): Float32Array {
  const wanted = new Set(faceIds)
  const out: number[] = []
  for (let t = 0; t < data.triCount; t++) {
    if (!wanted.has(data.triFace[t])) continue
    for (let k = 0; k < 9; k++) out.push(data.positions[t * 9 + k])
  }
  return new Float32Array(out)
}

/** Line segment positions for the given edge ids. */
export function edgesToLines(mesh: MeshLike, edgeIds: Iterable<string>): Float32Array {
  const out: number[] = []
  for (const eid of edgeIds) {
    const [a, b] = eid.split('~')
    const pa = mesh.verts.get(a)
    const pb = mesh.verts.get(b)
    if (!pa || !pb) continue
    out.push(...pa, ...pb)
  }
  return new Float32Array(out)
}

/** Point positions for the given vertex ids. */
export function vertsToPoints(mesh: MeshLike, vertIds: Iterable<string>): Float32Array {
  const out: number[] = []
  for (const id of vertIds) {
    const p = mesh.verts.get(id)
    if (p) out.push(...p)
  }
  return new Float32Array(out)
}
