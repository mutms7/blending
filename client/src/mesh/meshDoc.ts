import * as Y from 'yjs'
import { PRIMITIVES, type PrimitiveKind } from './primitives'

export type Vec3 = [number, number, number]
export type SelMode = 'vertex' | 'edge' | 'face'

const rid = () => Math.random().toString(36).slice(2, 10)

export const edgeKey = (a: string, b: string) => (a < b ? `${a}~${b}` : `${b}~${a}`)

export function polygonNormal(pts: Vec3[]): Vec3 {
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

export function centroidOf(pts: Vec3[]): Vec3 {
  const c: Vec3 = [0, 0, 0]
  for (const p of pts) {
    c[0] += p[0] / pts.length
    c[1] += p[1] / pts.length
    c[2] += p[2] / pts.length
  }
  return c
}

/**
 * Shared, conflict-free mesh model.
 *
 * - `verts`: vertex id -> [x, y, z]
 * - `faces`: face id -> ordered vertex ids (CCW seen from outside; 3+ verts, n-gons allowed)
 *
 * Concurrent edits merge per-key (last-writer-wins per vertex/face), which is
 * exactly the granularity we want for collaborative modeling. Undo/redo only
 * tracks this client's own transactions (LOCAL origin).
 */
export class MeshDoc {
  static readonly LOCAL = 'local-edit'
  static readonly SYSTEM = 'system'

  readonly doc: Y.Doc
  readonly verts: Y.Map<Vec3>
  readonly faces: Y.Map<string[]>
  readonly undo: Y.UndoManager

  constructor(doc = new Y.Doc()) {
    this.doc = doc
    this.verts = doc.getMap<Vec3>('verts')
    this.faces = doc.getMap<string[]>('faces')
    this.undo = new Y.UndoManager([this.verts, this.faces], {
      trackedOrigins: new Set([MeshDoc.LOCAL]),
      captureTimeout: 400,
    })
  }

  /** A user edit — tracked by undo, merged with the peers' edits. */
  edit(fn: () => void) {
    this.doc.transact(fn, MeshDoc.LOCAL)
  }

  /** A system edit (round resets, seeding) — not undoable. */
  systemEdit(fn: () => void) {
    this.doc.transact(fn, MeshDoc.SYSTEM)
  }

  isEmpty(): boolean {
    return this.verts.size === 0 && this.faces.size === 0
  }

  faceNormal(faceId: string): Vec3 | null {
    const vs = this.faces.get(faceId)
    if (!vs) return null
    const pts: Vec3[] = []
    for (const v of vs) {
      const p = this.verts.get(v)
      if (!p) return null
      pts.push(p)
    }
    return polygonNormal(pts)
  }

  addPrimitive(kind: PrimitiveKind, offset: Vec3 = [0, 0, 0]): string[] {
    const { verts, faces } = PRIMITIVES[kind]()
    const ids = verts.map(() => rid())
    const faceIds: string[] = []
    this.edit(() => {
      verts.forEach((p, i) => {
        this.verts.set(ids[i], [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]])
      })
      for (const f of faces) {
        const fid = rid()
        this.faces.set(fid, f.map((i) => ids[i]))
        faceIds.push(fid)
      }
    })
    return faceIds
  }

  moveVerts(entries: Array<[string, Vec3]>) {
    this.edit(() => {
      for (const [id, p] of entries) {
        if (this.verts.has(id)) this.verts.set(id, p)
      }
    })
  }

  /**
   * Extrude each selected face along its own normal, Blender "extrude individual
   * faces" style. Returns the new cap face ids (so the caller can select them
   * and let the player drag them out with the gizmo).
   */
  extrudeFaces(faceIds: string[], dist = 0.4): string[] {
    const created: string[] = []
    this.edit(() => {
      for (const fid of faceIds) {
        const vs = this.faces.get(fid)
        if (!vs || vs.length < 3 || vs.some((v) => !this.verts.has(v))) continue
        const pts = vs.map((v) => this.verts.get(v)!)
        const n = polygonNormal(pts)
        const dup = vs.map((v) => {
          const p = this.verts.get(v)!
          const id2 = rid()
          this.verts.set(id2, [p[0] + n[0] * dist, p[1] + n[1] * dist, p[2] + n[2] * dist])
          return id2
        })
        for (let i = 0; i < vs.length; i++) {
          const j = (i + 1) % vs.length
          this.faces.set(rid(), [vs[i], vs[j], dup[j], dup[i]])
        }
        this.faces.delete(fid)
        const capId = rid()
        this.faces.set(capId, dup)
        created.push(capId)
      }
    })
    return created
  }

  /** Split each selected face into quads around its center. Returns new face ids. */
  subdivideFaces(faceIds: string[]): string[] {
    const created: string[] = []
    this.edit(() => {
      const midCache = new Map<string, string>()
      const midpoint = (a: string, b: string): string => {
        const key = edgeKey(a, b)
        let m = midCache.get(key)
        if (!m) {
          const pa = this.verts.get(a)!
          const pb = this.verts.get(b)!
          m = rid()
          this.verts.set(m, [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2])
          midCache.set(key, m)
        }
        return m
      }
      for (const fid of faceIds) {
        const vs = this.faces.get(fid)
        if (!vs || vs.length < 3 || vs.some((v) => !this.verts.has(v))) continue
        const pts = vs.map((v) => this.verts.get(v)!)
        const cid = rid()
        this.verts.set(cid, centroidOf(pts))
        const mids = vs.map((v, i) => midpoint(v, vs[(i + 1) % vs.length]))
        this.faces.delete(fid)
        for (let i = 0; i < vs.length; i++) {
          const prev = (i - 1 + vs.length) % vs.length
          const nf = rid()
          this.faces.set(nf, [vs[i], mids[i], cid, mids[prev]])
          created.push(nf)
        }
      }
    })
    return created
  }

  deleteSelection(mode: SelMode, ids: string[]) {
    this.edit(() => {
      if (mode === 'face') {
        for (const fid of ids) this.faces.delete(fid)
      } else if (mode === 'vertex') {
        const dead = new Set(ids)
        const doomedFaces: string[] = []
        this.faces.forEach((vs, fid) => {
          if (vs.some((v) => dead.has(v))) doomedFaces.push(fid)
        })
        for (const fid of doomedFaces) this.faces.delete(fid)
        for (const v of ids) this.verts.delete(v)
      } else {
        // edge mode: delete faces that use the edge (adjacent vertex pair)
        const doomed = new Set<string>()
        for (const eid of ids) {
          const [a, b] = eid.split('~')
          this.faces.forEach((vs, fid) => {
            for (let i = 0; i < vs.length; i++) {
              const v1 = vs[i]
              const v2 = vs[(i + 1) % vs.length]
              if ((v1 === a && v2 === b) || (v1 === b && v2 === a)) doomed.add(fid)
            }
          })
        }
        for (const fid of doomed) this.faces.delete(fid)
      }
      this.pruneOrphanVerts()
    })
  }

  /** Remove vertices no longer referenced by any face. Call inside a transaction. */
  private pruneOrphanVerts() {
    const used = new Set<string>()
    this.faces.forEach((vs) => vs.forEach((v) => used.add(v)))
    const dead: string[] = []
    this.verts.forEach((_, id) => {
      if (!used.has(id)) dead.push(id)
    })
    for (const id of dead) this.verts.delete(id)
  }

  /** Wipe the model and start from a fresh cube. Not undoable (used for round resets). */
  resetToCube() {
    this.systemEdit(() => {
      const faceIds: string[] = []
      this.faces.forEach((_, id) => faceIds.push(id))
      for (const id of faceIds) this.faces.delete(id)
      const vertIds: string[] = []
      this.verts.forEach((_, id) => vertIds.push(id))
      for (const id of vertIds) this.verts.delete(id)

      const { verts, faces } = PRIMITIVES.cube()
      const ids = verts.map(() => rid())
      verts.forEach((p, i) => this.verts.set(ids[i], [p[0], p[1], p[2]]))
      for (const f of faces) this.faces.set(rid(), f.map((i) => ids[i]))
    })
    this.undo.clear()
  }
}

/** Resolve a selection (in any mode) down to the set of affected vertex ids. */
export function selectionToVertIds(mesh: MeshDoc, mode: SelMode, ids: string[]): Set<string> {
  const out = new Set<string>()
  if (mode === 'vertex') {
    for (const id of ids) if (mesh.verts.has(id)) out.add(id)
  } else if (mode === 'edge') {
    for (const eid of ids) {
      const [a, b] = eid.split('~')
      if (mesh.verts.has(a)) out.add(a)
      if (mesh.verts.has(b)) out.add(b)
    }
  } else {
    for (const fid of ids) {
      const vs = mesh.faces.get(fid)
      if (!vs) continue
      for (const v of vs) if (mesh.verts.has(v)) out.add(v)
    }
  }
  return out
}
