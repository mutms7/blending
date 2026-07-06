import { describe, expect, it } from 'vitest'
import { MeshDoc } from './meshDoc'
import { connectedFaces } from './objects'

describe('connectedFaces', () => {
  it('returns all 6 faces of a lone cube from any face', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    for (const f of faces) {
      expect(new Set(connectedFaces(m, f))).toEqual(new Set(faces))
    }
  })

  it('separates two disjoint primitives into two islands', () => {
    const m = new MeshDoc()
    const cube = m.addPrimitive('cube', [0, 0, 0])
    const cone = m.addPrimitive('cone', [8, 0, 0]) // far away, no shared verts

    const islandA = new Set(connectedFaces(m, cube[0]))
    const islandB = new Set(connectedFaces(m, cone[0]))

    expect(islandA).toEqual(new Set(cube))
    expect(islandB).toEqual(new Set(cone))
    // disjoint
    for (const f of cube) expect(islandB.has(f)).toBe(false)
  })

  it('keeps an extruded arm part of the same object', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    const caps = m.extrudeFaces([faces[1]], 0.5)
    const island = new Set(connectedFaces(m, caps[0]))
    // the whole thing is still one connected object
    expect(island.size).toBe(m.faces.size)
  })

  it('returns empty for an unknown face id', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    expect(connectedFaces(m, 'nope')).toEqual([])
  })
})
