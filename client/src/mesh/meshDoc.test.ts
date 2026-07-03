import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import { MeshDoc, edgeKey, selectionToVertIds } from './meshDoc'

describe('MeshDoc', () => {
  it('adds a cube primitive (8 verts, 6 faces)', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    expect(m.verts.size).toBe(8)
    expect(m.faces.size).toBe(6)
    expect(faces).toHaveLength(6)
  })

  it('generates outward-facing convex primitives', () => {
    for (const kind of ['cube', 'sphere', 'cylinder', 'cone'] as const) {
      const m = new MeshDoc()
      m.addPrimitive(kind)
      // centroid of the solid
      const c = [0, 0, 0]
      m.verts.forEach((p) => {
        c[0] += p[0] / m.verts.size
        c[1] += p[1] / m.verts.size
        c[2] += p[2] / m.verts.size
      })
      m.faces.forEach((_, fid) => {
        const n = m.faceNormal(fid)!
        const vs = m.faces.get(fid)!
        const fc = [0, 0, 0]
        for (const v of vs) {
          const p = m.verts.get(v)!
          fc[0] += p[0] / vs.length
          fc[1] += p[1] / vs.length
          fc[2] += p[2] / vs.length
        }
        const dot = n[0] * (fc[0] - c[0]) + n[1] * (fc[1] - c[1]) + n[2] * (fc[2] - c[2])
        expect(dot, `${kind} face ${fid} should face outward`).toBeGreaterThan(0)
      })
    }
  })

  it('extrudes a face: +4 verts, net +4 faces, cap offset along the normal', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    const target = faces[1] // top face in cube's face order
    const normal = m.faceNormal(target)!
    const caps = m.extrudeFaces([target], 0.5)

    expect(caps).toHaveLength(1)
    expect(m.verts.size).toBe(12)
    expect(m.faces.size).toBe(10)
    expect(m.faces.has(target)).toBe(false)

    // cap normal should match the source normal (same winding)
    const capNormal = m.faceNormal(caps[0])!
    for (let i = 0; i < 3; i++) expect(capNormal[i]).toBeCloseTo(normal[i], 5)
  })

  it('subdivides a quad into 4 quads sharing midpoints', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    const created = m.subdivideFaces([faces[0]])
    expect(created).toHaveLength(4)
    // 8 original + 4 edge midpoints + 1 center
    expect(m.verts.size).toBe(13)
    expect(m.faces.size).toBe(9)
    for (const f of created) expect(m.faces.get(f)).toHaveLength(4)
  })

  it('shares midpoints when subdividing adjacent faces together', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    m.subdivideFaces(faces) // all six faces at once
    // 8 corners + 12 edge midpoints (shared!) + 6 face centers
    expect(m.verts.size).toBe(26)
    expect(m.faces.size).toBe(24)
  })

  it('deleting all faces prunes every orphaned vertex', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    m.deleteSelection('face', [...m.faces.keys()])
    expect(m.faces.size).toBe(0)
    expect(m.verts.size).toBe(0)
  })

  it('deleting a vertex removes its faces and orphans', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    const victim = [...m.verts.keys()][0]
    m.deleteSelection('vertex', [victim])
    // a cube corner touches 3 faces; 3 remain
    expect(m.faces.size).toBe(3)
    expect(m.verts.has(victim)).toBe(false)
  })

  it('deleting an edge removes the two faces sharing it', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    const someFace = [...m.faces.keys()][0]
    const vs = m.faces.get(someFace)!
    const eid = edgeKey(vs[0], vs[1])
    m.deleteSelection('edge', [eid])
    expect(m.faces.size).toBe(4)
  })

  it('undo only rewinds local edits, not a peer’s', () => {
    // two docs synced manually
    const a = new MeshDoc()
    const b = new MeshDoc(new Y.Doc())
    const pipe = (from: Y.Doc, to: Y.Doc) => {
      from.on('update', (u: Uint8Array) => Y.applyUpdate(to, u))
    }
    pipe(a.doc, b.doc)
    pipe(b.doc, a.doc)

    a.addPrimitive('cube') // A's local edit
    expect(b.verts.size).toBe(8)

    b.addPrimitive('cone') // B's local edit, remote from A's perspective
    const total = a.verts.size
    expect(total).toBeGreaterThan(8)

    a.undo.undo() // should remove A's cube only
    expect(a.faces.size).toBe(b.faces.size)
    expect(a.verts.size).toBe(total - 8)

    b.undo.undo() // should remove B's cone only
    expect(b.verts.size).toBe(0)
  })

  it('moveVerts ignores vertices deleted by a peer', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    m.moveVerts([['nonexistent', [1, 2, 3]]])
    expect(m.verts.has('nonexistent')).toBe(false)
  })

  it('selectionToVertIds resolves all modes', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    const face = faces[0]
    const vs = m.faces.get(face)!
    expect(selectionToVertIds(m, 'face', [face]).size).toBe(4)
    expect(selectionToVertIds(m, 'edge', [edgeKey(vs[0], vs[1])]).size).toBe(2)
    expect(selectionToVertIds(m, 'vertex', [vs[0], 'ghost']).size).toBe(1)
  })

  it('resetToCube clears history so rounds cannot be undone into', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    m.extrudeFaces([[...m.faces.keys()][0]], 0.5)
    m.resetToCube()
    expect(m.verts.size).toBe(8)
    m.undo.undo() // nothing to undo — reset cleared the stack
    expect(m.verts.size).toBe(8)
  })
})
