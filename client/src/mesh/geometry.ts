import * as THREE from 'three'
import type * as Y from 'yjs'
import { edgeKey, type Vec3 } from './meshDoc'

/** Anything that exposes the two shared mesh maps (MeshDoc or a replay doc). */
export interface MeshLike {
  verts: Y.Map<Vec3>
  faces: Y.Map<string[]>
}

/** Flat, render-ready view of the mesh, rebuilt whenever the Yjs doc changes. */
export interface RenderData {
  /** Non-indexed triangle soup (fan-triangulated faces). */
  positions: Float32Array
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

  const positions: number[] = []
  const triFace: string[] = []
  const edgeSet = new Map<string, [Vec3, Vec3]>()

  mesh.faces.forEach((vs, fid) => {
    if (vs.length < 3) return
    const pts: Vec3[] = []
    for (const v of vs) {
      const p = pos.get(v)
      if (!p) return // face references a vertex a peer deleted; skip until repaired
      pts.push(p)
    }
    for (let i = 1; i < pts.length - 1; i++) {
      positions.push(...pts[0], ...pts[i], ...pts[i + 1])
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
