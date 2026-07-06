import { useMemo, useState } from 'react'
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

function CubeMesh() {
  const [hover, setHover] = useState<number | null>(null)
  const edges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), [])
  return (
    <group>
      {FACES.map((f, i) => (
        <mesh
          key={f.label}
          position={f.position}
          rotation={f.rotation}
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(i)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHover((h) => (h === i ? null : h))
            document.body.style.cursor = ''
          }}
          onPointerDown={(e) => {
            e.stopPropagation()
            viewFromDirection(f.dir)
          }}
        >
          <planeGeometry args={[0.96, 0.96]} />
          <meshBasicMaterial
            map={labelTexture(f.label)}
            color={hover === i ? '#4dabf7' : '#ffffff'}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
      <lineSegments geometry={edges}>
        <lineBasicMaterial color="#657289" />
      </lineSegments>
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
