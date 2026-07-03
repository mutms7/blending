import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, type ThreeEvent } from '@react-three/fiber'
import { Grid, Html, OrbitControls, TransformControls } from '@react-three/drei'
import {
  buildRenderData,
  edgesToLines,
  facesToTriangles,
  makeLineGeometry,
  makeSurfaceGeometry,
  vertsToPoints,
  type RenderData,
} from '../mesh/geometry'
import { centroidOf, selectionToVertIds, type SelMode, type Vec3 } from '../mesh/meshDoc'
import { transformVerts } from '../mesh/transform'
import { getPeers, mesh, publishCursor, useAwarenessVersion } from '../net/session'
import { useApp } from '../state/store'

const SELECT_COLOR = '#ff9f2a'

function useDisposable<T extends { dispose(): void }>(factory: () => T, deps: unknown[]): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obj = useMemo(factory, deps)
  useEffect(() => () => obj.dispose(), [obj])
  return obj
}

// ---------------------------------------------------------------------------
// Picking helpers
// ---------------------------------------------------------------------------

function nearestVertexOfFace(faceId: string, point: THREE.Vector3): string | null {
  const vs = mesh.faces.get(faceId)
  if (!vs) return null
  let best: string | null = null
  let bestD = Infinity
  const tmp = new THREE.Vector3()
  for (const v of vs) {
    const p = mesh.verts.get(v)
    if (!p) continue
    const d = tmp.set(p[0], p[1], p[2]).distanceToSquared(point)
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}

function nearestEdgeOfFace(faceId: string, point: THREE.Vector3): string | null {
  const vs = mesh.faces.get(faceId)
  if (!vs) return null
  let best: string | null = null
  let bestD = Infinity
  const line = new THREE.Line3()
  const closest = new THREE.Vector3()
  for (let i = 0; i < vs.length; i++) {
    const a = mesh.verts.get(vs[i])
    const b = mesh.verts.get(vs[(i + 1) % vs.length])
    if (!a || !b) continue
    line.start.set(a[0], a[1], a[2])
    line.end.set(b[0], b[1], b[2])
    line.closestPointToPoint(point, true, closest)
    const d = closest.distanceToSquared(point)
    if (d < bestD) {
      bestD = d
      const [x, y] = [vs[i], vs[(i + 1) % vs.length]]
      best = x < y ? `${x}~${y}` : `${y}~${x}`
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Overlay primitives
// ---------------------------------------------------------------------------

function TriOverlay({ positions, color, opacity }: { positions: Float32Array; color: string; opacity: number }) {
  const geo = useDisposable(() => makeLineGeometry(positions), [positions])
  if (positions.length === 0) return null
  return (
    <mesh geometry={geo} renderOrder={2}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        depthWrite={false}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-2}
      />
    </mesh>
  )
}

function LineOverlay({ positions, color, opacity }: { positions: Float32Array; color: string; opacity: number }) {
  const geo = useDisposable(() => makeLineGeometry(positions), [positions])
  if (positions.length === 0) return null
  return (
    <lineSegments geometry={geo} renderOrder={3}>
      <lineBasicMaterial color={color} transparent opacity={opacity} depthTest={false} />
    </lineSegments>
  )
}

function PointOverlay({ positions, color, size, opacity }: { positions: Float32Array; color: string; size: number; opacity: number }) {
  const geo = useDisposable(() => makeLineGeometry(positions), [positions])
  if (positions.length === 0) return null
  return (
    <points geometry={geo} renderOrder={4}>
      <pointsMaterial color={color} size={size} sizeAttenuation={false} transparent opacity={opacity} depthTest={false} />
    </points>
  )
}

function SelectionShapes({
  data,
  mode,
  ids,
  color,
  opacity,
}: {
  data: RenderData
  mode: SelMode
  ids: string[]
  color: string
  opacity: number
}) {
  const tris = useMemo(
    () => (mode === 'face' ? facesToTriangles(data, ids) : new Float32Array(0)),
    [data, mode, ids]
  )
  const lines = useMemo(
    () => (mode === 'edge' ? edgesToLines(mesh, ids) : new Float32Array(0)),
    [data, mode, ids]
  )
  const points = useMemo(
    () => (mode === 'vertex' ? vertsToPoints(mesh, ids) : new Float32Array(0)),
    [data, mode, ids]
  )
  return (
    <>
      <TriOverlay positions={tris} color={color} opacity={opacity * 0.45} />
      <LineOverlay positions={lines} color={color} opacity={opacity} />
      <PointOverlay positions={points} color={color} size={10} opacity={opacity} />
    </>
  )
}

// ---------------------------------------------------------------------------
// The editable mesh
// ---------------------------------------------------------------------------

function EditableMesh({ data }: { data: RenderData }) {
  const mode = useApp((s) => s.mode)
  const phase = useApp((s) => s.phase)

  const surfGeo = useDisposable(() => makeSurfaceGeometry(data), [data])
  const edgeGeo = useDisposable(() => makeLineGeometry(data.edgePos), [data])
  const pointGeo = useDisposable(() => makeLineGeometry(data.vertPos), [data])

  const locked = phase === 'scoring' || phase === 'reveal'

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5 || locked) return
    e.stopPropagation()
    const faceId = data.triFace[e.faceIndex ?? -1]
    if (!faceId) return
    let picked: string | null = faceId
    if (mode === 'vertex') picked = nearestVertexOfFace(faceId, e.point)
    else if (mode === 'edge') picked = nearestEdgeOfFace(faceId, e.point)
    if (!picked) return
    const { selection, toggleSelected, setSelection } = useApp.getState()
    if (e.shiftKey) toggleSelected(picked)
    else if (!(selection.length === 1 && selection[0] === picked)) setSelection([picked])
  }

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    publishCursor([e.point.x, e.point.y, e.point.z])
  }

  if (data.triCount === 0) return null

  return (
    <group>
      <mesh
        geometry={surfGeo}
        onClick={handleClick}
        onPointerMove={handleMove}
        onPointerOut={() => publishCursor(null)}
      >
        <meshStandardMaterial
          color="#9fb4d8"
          roughness={0.75}
          metalness={0.08}
          flatShading
          side={THREE.DoubleSide}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>
      <lineSegments geometry={edgeGeo}>
        <lineBasicMaterial color="#2c3140" transparent opacity={0.9} />
      </lineSegments>
      {mode === 'vertex' && (
        <points geometry={pointGeo}>
          <pointsMaterial color="#aab3c5" size={6} sizeAttenuation={false} />
        </points>
      )}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Transform gizmo — moves the selected vertices/edges/faces
// ---------------------------------------------------------------------------

function SelectionGizmo({ data }: { data: RenderData }) {
  const mode = useApp((s) => s.mode)
  const selection = useApp((s) => s.selection)
  const gizmoMode = useApp((s) => s.gizmoMode)
  const phase = useApp((s) => s.phase)
  const [pivot, setPivot] = useState<THREE.Object3D | null>(null)
  const dragging = useRef(false)
  const dragStart = useRef<{ pivot: THREE.Vector3; verts: Map<string, Vec3> } | null>(null)

  const vertIds = useMemo(
    () => [...selectionToVertIds(mesh, mode, selection)],
    [mode, selection, data]
  )

  const centroid = useMemo(() => {
    const pts = vertIds
      .map((id) => mesh.verts.get(id))
      .filter((p): p is Vec3 => Boolean(p))
    if (pts.length === 0) return new THREE.Vector3()
    return new THREE.Vector3(...centroidOf(pts))
  }, [vertIds, data])

  useEffect(() => {
    if (pivot && !dragging.current) {
      pivot.position.copy(centroid)
      pivot.quaternion.identity()
      pivot.scale.set(1, 1, 1)
    }
  }, [pivot, centroid, gizmoMode])

  const active = vertIds.length > 0 && phase !== 'scoring' && phase !== 'reveal'

  const onDown = () => {
    if (!pivot) return
    dragging.current = true
    mesh.undo.stopCapturing()
    const verts = new Map<string, Vec3>()
    for (const id of vertIds) {
      const p = mesh.verts.get(id)
      if (p) verts.set(id, [p[0], p[1], p[2]])
    }
    dragStart.current = { pivot: pivot.position.clone(), verts }
  }

  const onChange = () => {
    if (!dragging.current || !dragStart.current || !pivot) return
    const { pivot: origin, verts } = dragStart.current
    mesh.moveVerts(transformVerts(verts, origin, gizmoMode, pivot))
  }

  const onUp = () => {
    dragging.current = false
    dragStart.current = null
    mesh.undo.stopCapturing()
    if (pivot) {
      // start the next drag from a clean transform
      pivot.quaternion.identity()
      pivot.scale.set(1, 1, 1)
    }
    useApp.setState({ lastAction: 'move' })
  }

  return (
    <>
      <object3D ref={setPivot} />
      {active && pivot && (
        <TransformControls
          object={pivot}
          mode={gizmoMode}
          size={0.7}
          onMouseDown={onDown}
          onMouseUp={onUp}
          onObjectChange={onChange}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Other players: cursors + tinted selections
// ---------------------------------------------------------------------------

function PeerPresence({ data }: { data: RenderData }) {
  useAwarenessVersion()
  const peers = getPeers()
  return (
    <>
      {peers.map((p) => (
        <group key={p.clientId}>
          {p.cursor && (
            <group position={p.cursor}>
              <mesh>
                <sphereGeometry args={[0.045, 12, 12]} />
                <meshBasicMaterial color={p.user.color} />
              </mesh>
              <Html center distanceFactor={10} style={{ pointerEvents: 'none' }}>
                <div className="cursor-label" style={{ borderColor: p.user.color }}>
                  {p.user.name}
                </div>
              </Html>
            </group>
          )}
          {p.sel.ids.length > 0 && (
            <SelectionShapes data={data} mode={p.sel.mode} ids={p.sel.ids} color={p.user.color} opacity={0.5} />
          )}
        </group>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Scene + canvas
// ---------------------------------------------------------------------------

function Scene() {
  const meshVersion = useApp((s) => s.meshVersion)
  const mode = useApp((s) => s.mode)
  const selection = useApp((s) => s.selection)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => buildRenderData(mesh), [meshVersion])

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[5, 8, 4]} intensity={1.3} />
      <directionalLight position={[-6, 3, -5]} intensity={0.4} />
      <Grid
        position={[0, -0.002, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellColor="#2a2f3a"
        sectionSize={2.5}
        sectionColor="#3a4152"
        fadeDistance={28}
        infiniteGrid
      />
      <EditableMesh data={data} />
      <SelectionShapes data={data} mode={mode} ids={selection} color={SELECT_COLOR} opacity={1} />
      <PeerPresence data={data} />
      <SelectionGizmo data={data} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={1}
        maxDistance={40}
        onEnd={() => useApp.setState({ lastAction: 'orbit' })}
      />
    </>
  )
}

export default function EditorCanvas() {
  const downPos = useRef<[number, number] | null>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      downPos.current = [e.clientX, e.clientY]
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [])

  return (
    <div className="canvas-wrap">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [4.5, 4, 6.5], fov: 45 }}
        onPointerMissed={(e) => {
          const d = downPos.current
          if (!d) return
          const dist = Math.hypot(e.clientX - d[0], e.clientY - d[1])
          if (dist < 6) useApp.getState().clearSelection()
        }}
      >
        <color attach="background" args={['#15171c']} />
        <Scene />
      </Canvas>
    </div>
  )
}
