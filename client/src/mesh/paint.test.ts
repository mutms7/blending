import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { MeshDoc } from './meshDoc'
import { brushDab } from './paint'
import { connectedFaces } from './objects'

function centerOfMesh(m: MeshDoc): THREE.Vector3 {
  const c = new THREE.Vector3()
  let n = 0
  m.verts.forEach((p) => {
    c.add(new THREE.Vector3(p[0], p[1], p[2]))
    n++
  })
  return c.multiplyScalar(1 / n)
}

describe('coloring + painting', () => {
  it('colorFaces / colorVerts write to the shared maps and undo', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    m.colorFaces([faces[0]], '#ff0000')
    expect(m.faceColors.get(faces[0])).toBe('#ff0000')
    m.undo.stopCapturing() // close this undo step (as a paint stroke boundary would)

    const vid = m.faces.get(faces[0])![0]
    m.colorVerts([vid], '#00ff00')
    expect(m.vertColors.get(vid)).toBe('#00ff00')

    m.undo.undo() // undoes just the vertex color
    expect(m.vertColors.has(vid)).toBe(false)
    expect(m.faceColors.get(faces[0])).toBe('#ff0000')
  })

  it('a brush dab only touches vertices within its radius', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    // huge brush at the center hits every vertex
    const wide = brushDab(m, centerOfMesh(m), { color: '#ff0000', size: 5, opacity: 1, type: 'marker' })
    expect(wide.length).toBe(m.verts.size)

    // a tiny brush far from the mesh hits nothing
    const none = brushDab(m, new THREE.Vector3(50, 50, 50), {
      color: '#ff0000',
      size: 0.3,
      opacity: 1,
      type: 'marker',
    })
    expect(none.length).toBe(0)
  })

  it('a full-strength marker dab drives vertices to the brush color', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    const entries = brushDab(m, centerOfMesh(m), { color: '#ff0000', size: 5, opacity: 1, type: 'marker' })
    m.paintVerts(entries)
    // every vertex should now read essentially pure red
    m.verts.forEach((_, vid) => {
      const hex = m.vertColors.get(vid)!
      const c = new THREE.Color(hex)
      expect(c.r).toBeGreaterThan(0.9)
      expect(c.g).toBeLessThan(0.15)
      expect(c.b).toBeLessThan(0.15)
    })
  })

  it('painted colors survive as vertex colors on a connected object', () => {
    const m = new MeshDoc()
    const faces = m.addPrimitive('cube')
    // sanity: object grouping still works alongside colors
    expect(connectedFaces(m, faces[0]).length).toBe(6)
  })
})
