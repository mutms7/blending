import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import * as Y from 'yjs'
import { buildRenderData, makeSurfaceGeometry, type MeshLike } from '../mesh/geometry'
import type { Vec3 } from '../mesh/meshDoc'
import type { Recording } from '../game/timelapse'

const PLAYBACK_MS = 6000
const W = 380
const H = 240

/** Sped-up 3D replay of the round, rendered from the recorded Yjs update log. */
export default function TimelapsePlayer({ recording }: { recording: Recording }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [run, setRun] = useState(0) // bump to replay
  const [done, setDone] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    setDone(false)

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setSize(W, H, false)
    const cam = new THREE.PerspectiveCamera(40, W / H, 0.01, 200)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#101318')
    scene.add(new THREE.AmbientLight('#ffffff', 0.6))
    const key = new THREE.DirectionalLight('#ffffff', 1.4)
    key.position.set(5, 8, 4)
    scene.add(key)

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.75,
      metalness: 0.08,
      flatShading: true,
      side: THREE.DoubleSide,
    })

    const doc = new Y.Doc()
    Y.applyUpdate(doc, recording.base)
    const meshLike: MeshLike = {
      verts: doc.getMap<Vec3>('verts'),
      faces: doc.getMap<string[]>('faces'),
      faceColors: doc.getMap<string>('faceColors'),
      vertColors: doc.getMap<string>('vertColors'),
    }

    let meshObj: THREE.Mesh | null = null
    const center = new THREE.Vector3(0, 0.5, 0)
    let radius = 1.5

    const rebuild = () => {
      if (meshObj) {
        scene.remove(meshObj)
        meshObj.geometry.dispose()
        meshObj = null
      }
      const data = buildRenderData(meshLike)
      if (data.triCount === 0) return
      const geo = makeSurfaceGeometry(data)
      meshObj = new THREE.Mesh(geo, mat)
      scene.add(meshObj)
      const bs = geo.boundingSphere
      if (bs) {
        center.copy(bs.center)
        radius = Math.max(bs.radius, 0.8)
      }
    }
    rebuild()

    let applied = 0
    let raf = 0
    const startT = performance.now()

    const tick = (now: number) => {
      const p = Math.min(1, (now - startT) / PLAYBACK_MS)
      const targetT = p * recording.durationMs
      let dirty = false
      while (applied < recording.events.length && recording.events[applied].t <= targetT) {
        Y.applyUpdate(doc, recording.events[applied].update)
        applied++
        dirty = true
      }
      if (dirty) rebuild()

      const az = 0.6 + p * Math.PI * 1.6
      const dist = radius * 3
      cam.position.set(
        center.x + dist * Math.cos(0.5) * Math.sin(az),
        center.y + dist * Math.sin(0.5),
        center.z + dist * Math.cos(0.5) * Math.cos(az)
      )
      cam.lookAt(center)
      renderer.render(scene, cam)

      if (p < 1) raf = requestAnimationFrame(tick)
      else setDone(true)
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      if (meshObj) meshObj.geometry.dispose()
      mat.dispose()
      renderer.dispose()
      doc.destroy()
    }
  }, [recording, run])

  return (
    <div className="timelapse">
      <canvas ref={canvasRef} width={W} height={H} className="timelapse-canvas" />
      {done && (
        <button className="btn timelapse-replay" onClick={() => setRun((r) => r + 1)}>
          ↺ Replay
        </button>
      )}
    </div>
  )
}
