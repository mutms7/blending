import { describe, expect, it } from 'vitest'
import { MeshDoc } from './meshDoc'
import { buildRenderData, faceCellMap } from './geometry'

describe('paint UV atlas', () => {
  it('emits one uv per position and packs faces into distinct cells', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    const data = buildRenderData(m)

    // a uv (2) for every position (3)
    expect(data.uvs.length).toBe((data.positions.length / 3) * 2)

    const cells = faceCellMap(m.faces)
    expect(cells.size).toBe(6)

    // cells are distinct and inside the unit square
    const seen = new Set<string>()
    cells.forEach((c) => {
      seen.add(`${c.u0.toFixed(4)},${c.v0.toFixed(4)}`)
      expect(c.u0).toBeGreaterThanOrEqual(0)
      expect(c.v0).toBeGreaterThanOrEqual(0)
      expect(c.u0 + c.size).toBeLessThanOrEqual(1.0001)
      expect(c.v0 + c.size).toBeLessThanOrEqual(1.0001)
    })
    expect(seen.size).toBe(6)
  })

  it('keeps each triangle’s uvs inside its own face cell (no bleed)', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    const data = buildRenderData(m)
    const cells = faceCellMap(m.faces)

    for (let t = 0; t < data.triCount; t++) {
      const c = cells.get(data.triFace[t])!
      for (let k = 0; k < 3; k++) {
        const u = data.uvs[(t * 3 + k) * 2]
        const v = data.uvs[(t * 3 + k) * 2 + 1]
        expect(u).toBeGreaterThanOrEqual(c.u0 - 1e-6)
        expect(u).toBeLessThanOrEqual(c.u0 + c.size + 1e-6)
        expect(v).toBeGreaterThanOrEqual(c.v0 - 1e-6)
        expect(v).toBeLessThanOrEqual(c.v0 + c.size + 1e-6)
      }
    }
  })

  it('gives more faces a finer grid', () => {
    const m = new MeshDoc()
    m.addPrimitive('cube')
    m.subdivideFaces([...m.faces.keys()]) // 24 faces
    const cells = faceCellMap(m.faces)
    expect(cells.size).toBe(24)
    // grid = ceil(sqrt(24)) = 5 -> cell size 1/5
    cells.forEach((c) => expect(c.size).toBeCloseTo(1 / 5, 6))
  })
})
