import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { Grid, Html, OrbitControls, TransformControls } from '@react-three/drei'
import {
  buildRenderData,
  edgesToLines,
  faceCellMap,
  facesToTriangles,
  makeLineGeometry,
  makeSurfaceGeometry,
  vertsToPoints,
  type Cell,
  type RenderData,
} from '../mesh/geometry'
import { centroidOf, selectionToVertIds, type PaintStroke, type SelMode, type Vec3 } from '../mesh/meshDoc'
import { connectedFaces } from '../mesh/objects'
import { brushDab } from '../mesh/paint'
import { drawStroke, getPaintTexture, redrawAll } from '../mesh/paintTexture'
import { transformVerts } from '../mesh/transform'
import { getPeers, mesh, publishCursor, useAwarenessVersion } from '../net/session'
import { useApp } from '../state/store'
import { focusOn, registerFocus, registerFrame, registerView } from '../game/cameraBus'
import { emitSplash, onSplash, type Splash } from '../game/paintFx'

const SELECT_COLOR = '#ff9f2a'

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')
}

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

/** Bounding center + radius of the vertices used by a set of faces. */
function objectBounds(faceIds: string[]): { center: [number, number, number]; radius: number } | null {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let n = 0
  const seen = new Set<string>()
  for (const fid of faceIds) {
    const vs = mesh.faces.get(fid)
    if (!vs) continue
    for (const v of vs) {
      if (seen.has(v)) continue
      seen.add(v)
      const p = mesh.verts.get(v)
      if (!p) continue
      n++
      minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
      minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
      minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2])
    }
  }
  if (n === 0) return null
  return {
    center: [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2],
    radius: Math.max(0.6, 0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)),
  }
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
    () => (mode === 'face' || mode === 'object' ? facesToTriangles(data, ids) : new Float32Array(0)),
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
  const tool = useApp((s) => s.tool)

  const surfGeo = useDisposable(() => makeSurfaceGeometry(data), [data])
  const edgeGeo = useDisposable(() => makeLineGeometry(data.edgePos), [data])
  const pointGeo = useDisposable(() => makeLineGeometry(data.vertPos), [data])

  const locked = phase === 'scoring' || phase === 'reveal'
  const painting = useRef(false)
  const lastSplash = useRef(0)
  // what the current brush stroke is allowed to touch (computed on pointer down)
  const scope = useRef<
    | { kind: 'tex'; faces: Set<string> | null; cells: Map<string, Cell> }
    | { kind: 'vert'; verts: Set<string> | null }
    | null
  >(null)
  // last texture-paint atlas point, so fast strokes get interpolated (no gaps)
  const lastPaint = useRef<{ fid: string; u: number; v: number } | null>(null)

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 5 || locked || tool === 'paint') return
    e.stopPropagation()
    const faceId = data.triFace[e.faceIndex ?? -1]
    if (!faceId) return
    let picked: string | string[] | null = faceId
    if (mode === 'vertex') picked = nearestVertexOfFace(faceId, e.point)
    else if (mode === 'edge') picked = nearestEdgeOfFace(faceId, e.point)
    else if (mode === 'object') picked = connectedFaces(mesh, faceId)
    if (!picked || (Array.isArray(picked) && picked.length === 0)) return
    const ids = Array.isArray(picked) ? picked : [picked]
    const { selection, setSelection } = useApp.getState()
    if (e.shiftKey) {
      // union with the current selection
      const merged = new Set(selection)
      for (const id of ids) merged.add(id)
      setSelection([...merged])
    } else {
      setSelection(ids)
      // clicking a whole object recenters the camera on it at a steady distance
      if (mode === 'object') {
        const b = objectBounds(ids)
        if (b) focusOn(b.center, b.radius)
      }
    }
  }

  const splash = (e: ThreeEvent<PointerEvent>, color: string) => {
    const now = performance.now()
    if (now - lastSplash.current > 90) {
      lastSplash.current = now
      emitSplash([e.point.x, e.point.y, e.point.z], color)
    }
  }

  const paintAt = (e: ThreeEvent<PointerEvent>) => {
    if (locked || !scope.current) return
    const st = useApp.getState()
    const sc = scope.current

    if (sc.kind === 'vert') {
      // vertex / edge mode: brush the vertex colors, restricted to any selection
      const entries = brushDab(mesh, e.point, {
        color: st.color,
        size: st.brushSize,
        opacity: st.brushOpacity,
        type: st.brushType,
      })
      const filtered = sc.verts ? entries.filter(([v]) => sc.verts!.has(v)) : entries
      if (filtered.length === 0) return
      mesh.paintVerts(filtered)
      splash(e, st.color)
      return
    }

    // face / object mode: precise canvas painting on the face under the brush.
    const fid = data.triFace[e.faceIndex ?? -1]
    const uv = e.uv
    const cell = fid ? sc.cells.get(fid) : undefined
    if (!fid || !uv || !cell || (sc.faces && !sc.faces.has(fid))) {
      lastPaint.current = null // don't interpolate across a gap / disallowed face
      return
    }
    const frac = Math.min(0.45, Math.max(0.03, st.brushSize * 0.33))
    const radiusUV = frac * cell.size
    const dabs: PaintStroke[] = []
    const stamp = (u: number, v: number) =>
      dabs.push({
        f: fid,
        u: (u - cell.u0) / cell.size,
        v: (v - cell.v0) / cell.size,
        r: frac,
        c: st.color,
        o: st.brushOpacity,
        t: st.brushType,
      })

    const lp = lastPaint.current
    if (lp && lp.fid === fid) {
      // fill the segment between the last point and this one so quick strokes stay solid
      const du = uv.x - lp.u
      const dv = uv.y - lp.v
      const dist = Math.hypot(du, dv)
      const steps = Math.max(1, Math.ceil(dist / (radiusUV * 0.5)))
      for (let i = 1; i <= steps; i++) stamp(lp.u + (du * i) / steps, lp.v + (dv * i) / steps)
    } else {
      stamp(uv.x, uv.y)
    }
    lastPaint.current = { fid, u: uv.x, v: uv.y }
    // drawing happens in the strokes observer (single path for local + remote)
    mesh.addStrokes(dabs)
    splash(e, st.color)
  }

  const beginStroke = (e: ThreeEvent<PointerEvent>) => {
    const st = useApp.getState()
    const fid = data.triFace[e.faceIndex ?? -1]
    if (st.mode === 'vertex' || st.mode === 'edge') {
      let verts: Set<string> | null = null
      if (st.selection.length > 0) {
        verts = new Set<string>()
        if (st.mode === 'vertex') st.selection.forEach((v) => verts!.add(v))
        else
          st.selection.forEach((eid) => {
            const [a, b] = eid.split('~')
            verts!.add(a)
            verts!.add(b)
          })
      }
      scope.current = { kind: 'vert', verts }
    } else {
      let faces: Set<string> | null = null
      if (st.selection.length > 0) faces = new Set(st.selection)
      else if (st.mode === 'object' && fid) faces = new Set(connectedFaces(mesh, fid))
      // face mode with no selection: faces=null, but each dab only hits its own face
      scope.current = { kind: 'tex', faces, cells: faceCellMap(mesh.faces) }
    }
  }

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool !== 'paint' || locked || e.button !== 0) return
    e.stopPropagation()
    painting.current = true
    lastPaint.current = null
    mesh.undo.stopCapturing()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    beginStroke(e)
    paintAt(e)
  }

  const handleMove = (e: ThreeEvent<PointerEvent>) => {
    publishCursor([e.point.x, e.point.y, e.point.z])
    if (tool === 'paint' && painting.current) {
      e.stopPropagation()
      paintAt(e)
    }
  }

  const endPaint = () => {
    if (painting.current) {
      painting.current = false
      scope.current = null
      lastPaint.current = null
      mesh.undo.stopCapturing()
      useApp.setState({ lastAction: 'paint' })
    }
  }

  if (data.triCount === 0) return null

  return (
    <group>
      <mesh
        geometry={surfGeo}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handleMove}
        onPointerUp={endPaint}
        onPointerOut={() => publishCursor(null)}
      >
        <meshStandardMaterial
          vertexColors
          color="#ffffff"
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
  const tool = useApp((s) => s.tool)
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

  const active = tool === 'edit' && vertIds.length > 0 && phase !== 'scoring' && phase !== 'reveal'

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
// Camera fly (WASD + QE) and "frame the object"
// ---------------------------------------------------------------------------

const FLY_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e'])

function meshBounds(): { center: THREE.Vector3; radius: number } {
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  let n = 0
  mesh.verts.forEach((p) => {
    n++
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2])
  })
  if (n === 0) return { center: new THREE.Vector3(0, 0.5, 0), radius: 1 }
  const center = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2)
  const radius = Math.max(0.6, 0.5 * Math.hypot(maxX - minX, maxY - minY, maxZ - minZ))
  return { center, radius }
}

function CameraRig() {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3
    update: () => void
  } | null
  const held = useRef(new Set<string>())
  // smooth camera move goal (set by frame/focus, consumed in useFrame)
  const goal = useRef<{ target: THREE.Vector3; pos: THREE.Vector3 } | null>(null)

  const setGoal = (center: THREE.Vector3, radius: number) => {
    if (!controls) return
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target)
    if (dir.lengthSq() < 1e-6) dir.set(1, 0.8, 1)
    dir.normalize()
    const dist = Math.max(radius * 2.6, 2.5) // consistent framing distance
    goal.current = {
      target: center.clone(),
      pos: center.clone().addScaledVector(dir, dist),
    }
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (FLY_KEYS.has(k)) held.current.add(k)
    }
    const up = (e: KeyboardEvent) => held.current.delete(e.key.toLowerCase())
    const clear = () => held.current.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  useEffect(() => registerFrame(() => {
    const { center, radius } = meshBounds()
    setGoal(center, radius)
  }), [camera, controls])

  useEffect(() => registerFocus((c, radius) => {
    setGoal(new THREE.Vector3(c[0], c[1], c[2]), radius)
  }), [camera, controls])

  // view-cube: look at the bounding-box midpoint from a world axis, a steady step back
  useEffect(() => registerView((dir) => {
    if (!controls) return
    const { center, radius } = meshBounds()
    const d = new THREE.Vector3(dir[0], dir[1], dir[2])
    if (d.lengthSq() < 1e-6) return
    d.normalize()
    const dist = Math.max(radius * 2.8, 2.5)
    goal.current = { target: center.clone(), pos: center.clone().addScaledVector(d, dist) }
  }), [camera, controls])

  // frame the model once on first load so it isn't tucked under a panel
  useEffect(() => {
    const t = setTimeout(() => {
      if (controls && !mesh.isEmpty()) {
        const { center, radius } = meshBounds()
        setGoal(center, radius)
      }
    }, 450)
    return () => clearTimeout(t)
  }, [controls])

  useFrame((_, dt) => {
    if (!controls) return
    const target = controls.target
    const ks = held.current

    if (ks.size > 0) {
      goal.current = null // manual fly cancels any pending move
      const dir = new THREE.Vector3().subVectors(target, camera.position)
      const dist = dir.length() || 1
      dir.normalize()
      const worldUp = new THREE.Vector3(0, 1, 0)
      const right = new THREE.Vector3().crossVectors(dir, worldUp).normalize()
      // camera-relative up so Q/E follow the view angle, just like W/A/S/D
      const camUp = new THREE.Vector3().crossVectors(right, dir).normalize()
      const speed = THREE.MathUtils.clamp(dist, 2, 20) * dt * 1.3
      const move = new THREE.Vector3()
      if (ks.has('w')) move.addScaledVector(dir, speed)
      if (ks.has('s')) move.addScaledVector(dir, -speed)
      if (ks.has('d')) move.addScaledVector(right, speed)
      if (ks.has('a')) move.addScaledVector(right, -speed)
      if (ks.has('q')) move.addScaledVector(camUp, speed)
      if (ks.has('e')) move.addScaledVector(camUp, -speed)
      if (move.lengthSq() > 0) {
        camera.position.add(move)
        target.add(move)
        controls.update()
      }
      return
    }

    const g = goal.current
    if (g) {
      const k = 1 - Math.exp(-dt * 9) // smooth critically-ish damped approach
      target.lerp(g.target, k)
      camera.position.lerp(g.pos, k)
      controls.update()
      if (target.distanceToSquared(g.target) < 1e-5 && camera.position.distanceToSquared(g.pos) < 1e-5) {
        target.copy(g.target)
        camera.position.copy(g.pos)
        controls.update()
        goal.current = null
      }
    }
  })

  return null
}

// ---------------------------------------------------------------------------
// Paint splash particles
// ---------------------------------------------------------------------------

const SPLASH_LIFE = 520
const SPLASH_COUNT = 7
const splashGeo = new THREE.SphereGeometry(1, 8, 8)

function SplashBurst({ splash, onDone }: { splash: Splash; onDone: () => void }) {
  const group = useRef<THREE.Group>(null)
  const born = useRef(performance.now())
  const done = useRef(false)
  const dirs = useMemo(() => {
    const out: THREE.Vector3[] = []
    for (let i = 0; i < SPLASH_COUNT; i++) {
      out.push(
        new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1)
          .normalize()
          .multiplyScalar(0.12 + Math.random() * 0.16)
      )
    }
    return out
  }, [])

  useFrame(() => {
    const g = group.current
    if (!g) return
    const t = (performance.now() - born.current) / SPLASH_LIFE
    if (t >= 1) {
      if (!done.current) {
        done.current = true
        onDone()
      }
      return
    }
    const ease = 1 - (1 - t) * (1 - t)
    g.children.forEach((child, i) => {
      const d = dirs[i]
      child.position.set(d.x * ease, d.y * ease + ease * 0.05, d.z * ease)
      const s = Math.max(0.001, (1 - t) * 0.06)
      child.scale.setScalar(s)
    })
  })

  return (
    <group ref={group} position={splash.pos}>
      {dirs.map((_, i) => (
        <mesh key={i} geometry={splashGeo}>
          <meshBasicMaterial color={splash.color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      ))}
    </group>
  )
}

function PaintSplashes() {
  const [bursts, setBursts] = useState<Splash[]>([])
  useEffect(() => onSplash((s) => setBursts((b) => [...b.slice(-16), s])), [])
  return (
    <>
      {bursts.map((b) => (
        <SplashBurst key={b.id} splash={b} onDone={() => setBursts((x) => x.filter((y) => y.id !== b.id))} />
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Paint overlay: the shared paint atlas rendered on a copy of the surface,
// sitting just above it so free-draw ink shows on top of the fill color.
// ---------------------------------------------------------------------------

function PaintLayer({ data }: { data: RenderData }) {
  const geo = useDisposable(() => makeSurfaceGeometry(data), [data])
  const tex = useMemo(() => getPaintTexture(), [])

  // repaint the whole atlas whenever topology changes (cell packing shifts)
  useEffect(() => {
    redrawAll(mesh.strokes.toArray(), faceCellMap(mesh.faces))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // reconcile with stroke changes. Draw only the *new* dabs incrementally (cheap,
  // works for local + remote alike); only fall back to a full repaint on deletes
  // (undo/redo), which are rare.
  useEffect(() => {
    const obs = (event: { changes: { delta: Array<{ insert?: unknown; delete?: number }> } }) => {
      const cells = faceCellMap(mesh.faces)
      let deleted = false
      for (const d of event.changes.delta) {
        if (Array.isArray(d.insert)) for (const s of d.insert) drawStroke(s as PaintStroke, cells)
        else if (d.delete) deleted = true
      }
      if (deleted) redrawAll(mesh.strokes.toArray(), cells)
    }
    mesh.strokes.observe(obs)
    return () => mesh.strokes.unobserve(obs)
  }, [])

  if (data.triCount === 0) return null
  return (
    <mesh geometry={geo} raycast={() => null} renderOrder={1}>
      <meshStandardMaterial
        map={tex}
        transparent
        depthWrite={false}
        roughness={0.7}
        metalness={0.05}
        side={THREE.DoubleSide}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Scene + canvas
// ---------------------------------------------------------------------------

function Scene() {
  const meshVersion = useApp((s) => s.meshVersion)
  const mode = useApp((s) => s.mode)
  const selection = useApp((s) => s.selection)
  const tool = useApp((s) => s.tool)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const data = useMemo(() => buildRenderData(mesh), [meshVersion])

  // In paint mode, left-drag paints — orbit moves to right-drag so both coexist.
  const mouseButtons =
    tool === 'paint'
      ? { LEFT: undefined, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }

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
      <PaintLayer data={data} />
      <SelectionShapes data={data} mode={mode} ids={selection} color={SELECT_COLOR} opacity={1} />
      <PeerPresence data={data} />
      <SelectionGizmo data={data} />
      <PaintSplashes />
      <CameraRig />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        minDistance={1}
        maxDistance={40}
        mouseButtons={mouseButtons}
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
