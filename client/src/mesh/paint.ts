import * as THREE from 'three'
import { DEFAULT_MESH_COLOR } from './geometry'
import type { BrushType } from '../state/store'
import type { MeshDoc } from './meshDoc'

export interface BrushOpts {
  color: string
  size: number
  opacity: number
  type: BrushType
}

// hardness: 1 = flat coverage to the edge, 0 = full linear falloff from center.
// build: multiplier on how much of the color lands per dab.
const PROFILE: Record<BrushType, { hardness: number; build: number }> = {
  marker: { hardness: 0.85, build: 1 },
  airbrush: { hardness: 0, build: 0.5 },
  highlighter: { hardness: 0.5, build: 0.35 },
}

const _base = new THREE.Color()
const _brush = new THREE.Color()
const _out = new THREE.Color()

/**
 * Compute the blended vertex colors for one brush dab centered at `point`.
 * Every vertex within `size` of the point is nudged toward the brush color by a
 * strength that depends on distance and brush profile. Returns [vertId, hex]
 * pairs ready for `mesh.paintVerts` — plus whether anything was hit.
 */
export function brushDab(mesh: MeshDoc, point: THREE.Vector3, opts: BrushOpts): Array<[string, string]> {
  const { color, size, opacity } = opts
  const prof = PROFILE[opts.type]
  const r2 = size * size

  // per-vertex base color: an explicit vertex color, else a fill color from any
  // face using it, else the default gray — matching what the renderer shows.
  const faceColorOfVert = new Map<string, string>()
  if (mesh.faceColors.size > 0) {
    mesh.faces.forEach((vs, fid) => {
      const fc = mesh.faceColors.get(fid)
      if (!fc) return
      for (const v of vs) if (!faceColorOfVert.has(v)) faceColorOfVert.set(v, fc)
    })
  }

  _brush.set(color)
  const entries: Array<[string, string]> = []
  const tmp = new THREE.Vector3()

  mesh.verts.forEach((p, vid) => {
    const d2 = tmp.set(p[0], p[1], p[2]).distanceToSquared(point)
    if (d2 > r2) return
    const d = Math.sqrt(d2)
    const falloff = 1 - d / size // 1 at center -> 0 at edge
    const coverage = prof.hardness + (1 - prof.hardness) * falloff
    const strength = Math.min(1, opacity * prof.build * coverage)
    if (strength <= 0) return

    const baseHex = mesh.vertColors.get(vid) ?? faceColorOfVert.get(vid) ?? DEFAULT_MESH_COLOR
    _base.set(baseHex)
    _out.lerpColors(_base, _brush, strength)
    entries.push([vid, `#${_out.getHexString()}`])
  })

  return entries
}
