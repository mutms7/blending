import * as THREE from 'three'
import type { Vec3 } from './meshDoc'
import type { GizmoMode } from '../state/store'

export interface PivotState {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
  scale: THREE.Vector3
}

/**
 * Compute new vertex positions for a gizmo drag. `startVerts` are the vertex
 * positions when the drag began, `origin` is the pivot's start position (the
 * selection centroid). The pivot starts each drag at identity rotation/scale,
 * so its current transform IS the drag delta.
 */
export function transformVerts(
  startVerts: Map<string, Vec3>,
  origin: THREE.Vector3,
  gizmoMode: GizmoMode,
  pivot: PivotState
): Array<[string, Vec3]> {
  const entries: Array<[string, Vec3]> = []
  const v = new THREE.Vector3()

  if (gizmoMode === 'translate') {
    const d = pivot.position.clone().sub(origin)
    startVerts.forEach((p, id) => entries.push([id, [p[0] + d.x, p[1] + d.y, p[2] + d.z]]))
  } else if (gizmoMode === 'rotate') {
    startVerts.forEach((p, id) => {
      v.set(p[0], p[1], p[2]).sub(origin).applyQuaternion(pivot.quaternion).add(origin)
      entries.push([id, [v.x, v.y, v.z]])
    })
  } else {
    const s = pivot.scale
    startVerts.forEach((p, id) => {
      entries.push([
        id,
        [
          origin.x + (p[0] - origin.x) * s.x,
          origin.y + (p[1] - origin.y) * s.y,
          origin.z + (p[2] - origin.z) * s.z,
        ],
      ])
    })
  }
  return entries
}
