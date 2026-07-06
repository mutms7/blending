import type * as Y from 'yjs'

/** Just the face map — enough to walk connectivity (works for MeshDoc or a replay doc). */
interface FacesLike {
  faces: Y.Map<string[]>
}

/**
 * All faces in the same connected "object" as `startFaceId`: the set reachable
 * by hopping between faces that share at least one vertex. This is how the
 * `object` select mode turns a single click into a whole mesh island (a cube you
 * added, an extruded arm, etc.), without the CRDT needing to store group ids.
 */
export function connectedFaces(mesh: FacesLike, startFaceId: string): string[] {
  if (!mesh.faces.has(startFaceId)) return []

  // vertex id -> face ids that use it
  const vertToFaces = new Map<string, string[]>()
  mesh.faces.forEach((vs, fid) => {
    for (const v of vs) {
      const list = vertToFaces.get(v)
      if (list) list.push(fid)
      else vertToFaces.set(v, [fid])
    }
  })

  const seen = new Set<string>([startFaceId])
  const stack = [startFaceId]
  while (stack.length) {
    const fid = stack.pop()!
    const vs = mesh.faces.get(fid)
    if (!vs) continue
    for (const v of vs) {
      for (const nb of vertToFaces.get(v) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb)
          stack.push(nb)
        }
      }
    }
  }
  return [...seen]
}
