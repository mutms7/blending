import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { transformVerts } from './transform'
import type { Vec3 } from './meshDoc'

function pivotAt(x: number, y: number, z: number) {
  return {
    position: new THREE.Vector3(x, y, z),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
  }
}

describe('transformVerts', () => {
  const verts = new Map<string, Vec3>([
    ['a', [1, 0, 0]],
    ['b', [-1, 0, 0]],
  ])
  const origin = new THREE.Vector3(0, 0, 0)

  it('translate applies the pivot displacement to every vertex', () => {
    const p = pivotAt(0.5, 2, -1)
    const out = new Map(transformVerts(verts, origin, 'translate', p))
    expect(out.get('a')).toEqual([1.5, 2, -1])
    expect(out.get('b')).toEqual([-0.5, 2, -1])
  })

  it('rotate spins vertices around the centroid', () => {
    const p = pivotAt(0, 0, 0)
    p.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2) // 90° about Y
    const out = new Map(transformVerts(verts, origin, 'rotate', p))
    // (1,0,0) rotated 90° about +Y -> (0,0,-1)
    const a = out.get('a')!
    expect(a[0]).toBeCloseTo(0)
    expect(a[1]).toBeCloseTo(0)
    expect(a[2]).toBeCloseTo(-1)
  })

  it('rotate around a non-zero centroid keeps the centroid fixed', () => {
    const c = new THREE.Vector3(1, 0, 0)
    const p = pivotAt(1, 0, 0)
    p.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    const out = new Map(transformVerts(verts, c, 'rotate', p))
    // 'a' sits exactly on the centroid -> unchanged
    const a = out.get('a')!
    expect(a[0]).toBeCloseTo(1)
    expect(a[2]).toBeCloseTo(0)
    // 'b' is 2 units left of centroid -> flips to 2 units right
    const b = out.get('b')!
    expect(b[0]).toBeCloseTo(3)
  })

  it('scale grows vertices away from the centroid per axis', () => {
    const p = pivotAt(0, 0, 0)
    p.scale.set(2, 1, 3)
    const twoD = new Map<string, Vec3>([['v', [1, 1, 1]]])
    const out = new Map(transformVerts(twoD, origin, 'scale', p))
    expect(out.get('v')).toEqual([2, 1, 3])
  })

  it('scale about a non-zero centroid', () => {
    const c = new THREE.Vector3(1, 0, 0)
    const p = pivotAt(1, 0, 0)
    p.scale.set(0.5, 0.5, 0.5)
    const out = new Map(transformVerts(verts, c, 'scale', p))
    expect(out.get('a')![0]).toBeCloseTo(1) // on centroid, stays
    expect(out.get('b')![0]).toBeCloseTo(0) // -1 is 2 left of c -> 1 left of c
  })
})
