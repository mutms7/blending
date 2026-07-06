import { useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { frameObject, mainCameraQuat, viewFromDirection } from '../game/cameraBus'

// A real orientation cube in the bottom-left corner. It lives in its own small
// canvas whose camera mirrors the main camera each frame, so the cube tumbles
// with the scene (like Blender/Fusion). Clicking a face frames the whole model
// from that world axis (handled by the camera rig).

interface Face {
  label: string
  position: [number, number, number]
  rotation: [number, number, number]
  dir: [number, number, number]
}

const H = Math.PI / 2
const FACES: Face[] = [
  { label: 'FRONT', position: [0, 0, 0.5], rotation: [0, 0, 0], dir: [0, 0, 1] },
  { label: 'BACK', position: [0, 0, -0.5], rotation: [0, Math.PI, 0], dir: [0, 0, -1] },
  { label: 'RIGHT', position: [0.5, 0, 0], rotation: [0, H, 0], dir: [1, 0, 0] },
  { label: 'LEFT', position: [-0.5, 0, 0], rotation: [0, -H, 0], dir: [-1, 0, 0] },
  { label: 'TOP', position: [0, 0.5, 0], rotation: [-H, 0, 0], dir: [0, 1, 0] },
  { label: 'BOTTOM', position: [0, -0.5, 0], rotation: [H, 0, 0], dir: [0, -1, 0] },
]

const labelCache = new Map<string, THREE.CanvasTexture>()
function labelTexture(text: string): THREE.CanvasTexture {
  const cached = labelCache.get(text)
  if (cached) return cached
  const c = document.createElement('canvas')
  c.width = 128
  c.height = 128
  const x = c.getContext('2d')!
  x.fillStyle = '#333b49'
  x.fillRect(0, 0, 128, 128)
  x.strokeStyle = '#566173'
  x.lineWidth = 6
  x.strokeRect(3, 3, 122, 122)
  x.fillStyle = '#eef1f6'
  x.font = 'bold 21px sans-serif'
  x.textAlign = 'center'
  x.textBaseline = 'middle'
  x.fillText(text, 64, 66)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  labelCache.set(text, tex)
  return tex
}

type Vec3 = [number, number, number]

// 12 edges: a chunky box along each cube edge; clicking gives the diagonal view
// between the two adjacent faces.
const EDGES: Array<{ position: Vec3; size: Vec3; dir: Vec3 }> = []
for (const a of [-1, 1]) {
  for (const b of [-1, 1]) {
    EDGES.push({ position: [0, a * 0.5, b * 0.5], size: [0.66, 0.16, 0.16], dir: [0, a, b] })
    EDGES.push({ position: [a * 0.5, 0, b * 0.5], size: [0.16, 0.66, 0.16], dir: [a, 0, b] })
    EDGES.push({ position: [a * 0.5, b * 0.5, 0], size: [0.16, 0.16, 0.66], dir: [a, b, 0] })
  }
}

// 8 corners: clicking gives the three-face diagonal view.
const CORNERS: Array<{ position: Vec3; dir: Vec3 }> = []
for (const x of [-1, 1])
  for (const y of [-1, 1])
    for (const z of [-1, 1]) CORNERS.push({ position: [x * 0.5, y * 0.5, z * 0.5], dir: [x, y, z] })

function CubeMesh() {
  const [hover, setHover] = useState<string | null>(null)

  const hoverProps = (id: string, dir: Vec3) => ({
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      setHover(id)
      document.body.style.cursor = 'pointer'
    },
    onPointerOut: () => {
      setHover((h) => (h === id ? null : h))
      document.body.style.cursor = ''
    },
    onPointerDown: (e: { stopPropagation: () => void }) => {
      e.stopPropagation()
      viewFromDirection(dir)
    },
  })

  return (
    <group>
      {FACES.map((f) => (
        <mesh key={f.label} position={f.position} rotation={f.rotation} {...hoverProps(`f-${f.label}`, f.dir)}>
          <planeGeometry args={[0.9, 0.9]} />
          <meshBasicMaterial
            map={labelTexture(f.label)}
            color={hover === `f-${f.label}` ? '#4dabf7' : '#ffffff'}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}

      {EDGES.map((ed, i) => (
        <mesh key={`e${i}`} position={ed.position} {...hoverProps(`e-${i}`, ed.dir)}>
          <boxGeometry args={ed.size} />
          <meshBasicMaterial color={hover === `e-${i}` ? '#4dabf7' : '#3d4656'} toneMapped={false} />
        </mesh>
      ))}

      {CORNERS.map((cn, i) => (
        <mesh key={`c${i}`} position={cn.position} {...hoverProps(`c-${i}`, cn.dir)}>
          <boxGeometry args={[0.18, 0.18, 0.18]} />
          <meshBasicMaterial color={hover === `c-${i}` ? '#4dabf7' : '#4a5568'} toneMapped={false} />
        </mesh>
      ))}
    </group>
  )
}

function MirrorCamera() {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const d = 2.7
    camera.position.set(0, 0, d).applyQuaternion(mainCameraQuat)
    camera.up.set(0, 1, 0).applyQuaternion(mainCameraQuat)
    camera.lookAt(0, 0, 0)
  })
  return null
}

export default function ViewCube() {
  return (
    <div className="viewcube">
      <Canvas
        style={{ width: 104, height: 104 }}
        camera={{ position: [0, 0, 2.7], fov: 38 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 2]}
      >
        <MirrorCamera />
        <CubeMesh />
      </Canvas>
      <button className="btn viewcube-home" title="Frame the whole model (3/4 view)" onClick={frameObject}>
        ⌂ Frame
      </button>
    </div>
  )
}
