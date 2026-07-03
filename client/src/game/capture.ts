import * as THREE from 'three'
import { buildRenderData, makeSurfaceGeometry } from '../mesh/geometry'
import { mesh } from '../net/session'

// [azimuth°, elevation°]: front, right, back, left, top, three-quarter
const DEFAULT_VIEWS: Array<[number, number]> = [
  [0, 12],
  [90, 12],
  [180, 12],
  [270, 12],
  [0, 88],
  [45, 32],
]

/** A single small three-quarter shot for the session gallery. */
export function captureThumb(size = 144): string | null {
  const shots = captureViews(size, [DEFAULT_VIEWS[5]])
  return shots[0] ?? null
}

/**
 * Render the current shared model from six spread-out angles into base64 PNGs.
 * Uses a dedicated offscreen renderer built straight from the mesh data, so the
 * shots contain only the model — no grid, gizmo, or player cursors.
 */
export function captureViews(size = 512, views: Array<[number, number]> = DEFAULT_VIEWS): string[] {
  const data = buildRenderData(mesh)
  if (data.triCount === 0) return []

  const geo = makeSurfaceGeometry(data)
  const mat = new THREE.MeshStandardMaterial({
    color: '#b6bdc9',
    roughness: 0.8,
    metalness: 0.05,
    flatShading: true,
    side: THREE.DoubleSide,
  })

  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#20242c')
  scene.add(new THREE.Mesh(geo, mat))
  scene.add(new THREE.AmbientLight('#ffffff', 0.7))
  const key = new THREE.DirectionalLight('#ffffff', 1.6)
  key.position.set(5, 8, 4)
  scene.add(key)
  const fill = new THREE.DirectionalLight('#ffffff', 0.5)
  fill.position.set(-6, 3, -5)
  scene.add(fill)

  const bs = geo.boundingSphere ?? new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1)
  const dist = Math.max(bs.radius, 0.5) * 2.8
  const cam = new THREE.PerspectiveCamera(40, 1, 0.01, dist * 10)

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
  renderer.setSize(size, size)

  const shots: string[] = []
  for (const [azDeg, elDeg] of views) {
    const az = (azDeg * Math.PI) / 180
    const el = (elDeg * Math.PI) / 180
    cam.position.set(
      bs.center.x + dist * Math.cos(el) * Math.sin(az),
      bs.center.y + dist * Math.sin(el),
      bs.center.z + dist * Math.cos(el) * Math.cos(az)
    )
    cam.lookAt(bs.center)
    renderer.render(scene, cam)
    shots.push(renderer.domElement.toDataURL('image/png'))
  }

  renderer.dispose()
  geo.dispose()
  mat.dispose()
  return shots
}
