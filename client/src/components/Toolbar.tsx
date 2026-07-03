import {
  addPrimitive,
  deleteSelection,
  extrudeSelection,
  redo,
  resetModel,
  subdivideSelection,
  undo,
} from '../state/editorActions'
import { useApp, type GizmoMode } from '../state/store'
import type { SelMode } from '../mesh/meshDoc'

const MODES: Array<{ mode: SelMode; label: string; key: string }> = [
  { mode: 'vertex', label: 'Vertex', key: '1' },
  { mode: 'edge', label: 'Edge', key: '2' },
  { mode: 'face', label: 'Face', key: '3' },
]

const GIZMOS: Array<{ mode: GizmoMode; label: string; key: string }> = [
  { mode: 'translate', label: 'Move', key: 'W' },
  { mode: 'rotate', label: 'Rotate', key: 'R' },
  { mode: 'scale', label: 'Scale', key: 'S' },
]

export default function Toolbar() {
  const mode = useApp((s) => s.mode)
  const selection = useApp((s) => s.selection)
  const gizmoMode = useApp((s) => s.gizmoMode)
  const setMode = useApp((s) => s.setMode)
  const phase = useApp((s) => s.phase)
  const modifiers = useApp((s) => s.modifiers)
  const addsUsed = useApp((s) => s.addsUsed)

  const locked = phase === 'scoring' || phase === 'reveal'
  const hasSel = selection.length > 0
  const faceSel = mode === 'face' && hasSel
  const playing = phase === 'playing'
  const noAdds = locked || (playing && modifiers?.budget != null && addsUsed >= modifiers.budget)
  const noUndo = locked || (playing && (modifiers?.noUndo ?? false))

  return (
    <div className="toolbar">
      <div className="tool-group">
        <div className="tool-title">Add</div>
        <button className="btn" disabled={noAdds} onClick={() => addPrimitive('cube')}>Cube</button>
        <button className="btn" disabled={noAdds} onClick={() => addPrimitive('sphere')}>Sphere</button>
        <button className="btn" disabled={noAdds} onClick={() => addPrimitive('cylinder')}>Cylinder</button>
        <button className="btn" disabled={noAdds} onClick={() => addPrimitive('cone')}>Cone</button>
      </div>

      <div className="tool-group">
        <div className="tool-title">Select</div>
        {MODES.map(({ mode: m, label, key }) => (
          <button
            key={m}
            className={`btn ${mode === m ? 'btn-active' : ''}`}
            title={`Shortcut: ${key}`}
            onClick={() => setMode(m)}
          >
            {label} <kbd>{key}</kbd>
          </button>
        ))}
      </div>

      <div className="tool-group">
        <div className="tool-title">Gizmo</div>
        {GIZMOS.map(({ mode: g, label, key }) => (
          <button
            key={g}
            className={`btn ${gizmoMode === g ? 'btn-active' : ''}`}
            title={`Shortcut: ${key}`}
            onClick={() => useApp.setState({ gizmoMode: g })}
          >
            {label} <kbd>{key}</kbd>
          </button>
        ))}
      </div>

      <div className="tool-group">
        <div className="tool-title">Edit</div>
        <button className="btn" disabled={locked || !faceSel} title="Extrude selected faces (E)" onClick={extrudeSelection}>
          Extrude <kbd>E</kbd>
        </button>
        <button className="btn" disabled={locked || !faceSel} title="Subdivide selected faces (D)" onClick={subdivideSelection}>
          Subdivide <kbd>D</kbd>
        </button>
        <button className="btn" disabled={locked || !hasSel} title="Delete selection (X)" onClick={deleteSelection}>
          Delete <kbd>X</kbd>
        </button>
      </div>

      <div className="tool-group">
        <div className="tool-title">History</div>
        <button className="btn" disabled={noUndo} title="Undo (Ctrl+Z)" onClick={undo}>Undo</button>
        <button className="btn" disabled={noUndo} title="Redo (Ctrl+Shift+Z)" onClick={redo}>Redo</button>
        <button
          className="btn btn-danger"
          disabled={locked}
          onClick={() => {
            if (window.confirm('Reset the shared model to a fresh cube for everyone?')) resetModel()
          }}
        >
          Reset
        </button>
      </div>
    </div>
  )
}
