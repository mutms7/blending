import { mesh } from '../net/session'
import { useApp, type RoundModifiers } from './store'
import { consumeAddBudget } from '../game/game'
import type { PrimitiveKind } from '../mesh/primitives'
import type { Vec3 } from '../mesh/meshDoc'

function editingLocked(): boolean {
  const phase = useApp.getState().phase
  return phase === 'scoring' || phase === 'reveal'
}

/** Modifiers only bite while a round is running. */
function activeModifiers(): RoundModifiers | null {
  const s = useApp.getState()
  return s.phase === 'playing' ? s.modifiers : null
}

export function addBudgetExhausted(): boolean {
  const m = activeModifiers()
  if (!m || m.budget == null) return false
  return useApp.getState().addsUsed >= m.budget
}

export function undoDisabled(): boolean {
  return activeModifiers()?.noUndo ?? false
}

export function addPrimitive(kind: PrimitiveKind) {
  if (editingLocked() || addBudgetExhausted()) return
  const offset: Vec3 = mesh.isEmpty()
    ? [0, 0, 0]
    : [(Math.random() * 2 - 1) * 1.6, 0, (Math.random() * 2 - 1) * 1.6]
  const faces = mesh.addPrimitive(kind, offset)
  if (useApp.getState().phase === 'playing') consumeAddBudget()
  useApp.setState({ mode: 'face', selection: faces })
}

export function extrudeSelection() {
  if (editingLocked()) return
  const { mode, selection } = useApp.getState()
  if (mode !== 'face' || selection.length === 0) return
  const caps = mesh.extrudeFaces(selection, 0.4)
  useApp.setState({ selection: caps, lastAction: 'extrude' })
}

export function subdivideSelection() {
  if (editingLocked()) return
  const { mode, selection } = useApp.getState()
  if (mode !== 'face' || selection.length === 0) return
  const faces = mesh.subdivideFaces(selection)
  useApp.setState({ selection: faces, lastAction: 'subdivide' })
}

export function deleteSelection() {
  if (editingLocked()) return
  const { mode, selection } = useApp.getState()
  if (selection.length === 0) return
  mesh.deleteSelection(mode, selection)
  useApp.setState({ selection: [], lastAction: 'delete' })
}

export function undo() {
  if (editingLocked() || undoDisabled()) return
  mesh.undo.undo()
  useApp.setState({ lastAction: 'undo' })
}

export function redo() {
  if (editingLocked() || undoDisabled()) return
  mesh.undo.redo()
  useApp.setState({ lastAction: 'redo' })
}

export function resetModel() {
  if (editingLocked()) return
  mesh.resetToCube()
  useApp.setState({ selection: [] })
}
