import { applyColorToSelection } from '../state/editorActions'
import { frameObject } from '../game/cameraBus'
import { useApp, type BrushType } from '../state/store'

const PALETTE = [
  '#ff6b6b', '#ff922b', '#ffd43b', '#a9e34b', '#51cf66',
  '#20c997', '#22b8cf', '#4dabf7', '#748ffc', '#9775fa',
  '#da77f2', '#f783ac', '#ffffff', '#adb5bd', '#495057', '#212529',
]

const BRUSHES: Array<{ type: BrushType; label: string; hint: string }> = [
  { type: 'marker', label: 'Marker', hint: 'Solid, opaque coverage' },
  { type: 'airbrush', label: 'Airbrush', hint: 'Soft edges, builds up on repeat passes' },
  { type: 'highlighter', label: 'Highlighter', hint: 'Translucent wash of color' },
]

export default function ColorPanel() {
  const tool = useApp((s) => s.tool)
  const color = useApp((s) => s.color)
  const brushType = useApp((s) => s.brushType)
  const brushSize = useApp((s) => s.brushSize)
  const brushOpacity = useApp((s) => s.brushOpacity)
  const selection = useApp((s) => s.selection)
  const mode = useApp((s) => s.mode)
  const phase = useApp((s) => s.phase)

  const locked = phase === 'scoring' || phase === 'reveal'

  return (
    <div className="color-panel">
      <div className="tool-group">
        <div className="tool-title">View</div>
        <button className="btn" title="Center the camera on the model" onClick={frameObject}>
          ⌂ Frame
        </button>
      </div>

      <div className="tool-group">
        <div className="tool-title">Tool</div>
        <div className="seg">
          <button
            className={`btn ${tool === 'edit' ? 'btn-active' : ''}`}
            onClick={() => useApp.setState({ tool: 'edit' })}
          >
            Edit
          </button>
          <button
            className={`btn ${tool === 'paint' ? 'btn-active' : ''}`}
            title="Free-draw on the surface (P)"
            onClick={() => useApp.setState({ tool: 'paint' })}
          >
            Paint <kbd>P</kbd>
          </button>
        </div>
      </div>

      <div className="tool-group">
        <div className="tool-title">Color</div>
        <div className="swatches">
          {PALETTE.map((c) => (
            <button
              key={c}
              className={`swatch ${color.toLowerCase() === c.toLowerCase() ? 'swatch-active' : ''}`}
              style={{ background: c }}
              onClick={() => useApp.setState({ color: c })}
              aria-label={c}
            />
          ))}
        </div>
        <label className="color-custom">
          Custom
          <input
            type="color"
            value={color}
            onChange={(e) => useApp.setState({ color: e.target.value })}
          />
        </label>
      </div>

      {tool === 'edit' ? (
        <div className="tool-group">
          <div className="tool-title">Apply</div>
          <button
            className="btn btn-primary"
            disabled={locked || selection.length === 0}
            title="Fill the current selection with the chosen color"
            onClick={applyColorToSelection}
          >
            Color {mode} selection
          </button>
          <div className="panel-hint muted">
            Pick vertices, edges, faces, or a whole object, then apply.
          </div>
        </div>
      ) : (
        <div className="tool-group">
          <div className="tool-title">Brush</div>
          {BRUSHES.map((b) => (
            <button
              key={b.type}
              className={`btn ${brushType === b.type ? 'btn-active' : ''}`}
              title={b.hint}
              onClick={() => useApp.setState({ brushType: b.type })}
            >
              {b.label}
            </button>
          ))}
          <label className="slider-row">
            <span>Size</span>
            <input
              type="range"
              min={0.1}
              max={1.2}
              step={0.05}
              value={brushSize}
              onChange={(e) => useApp.setState({ brushSize: Number(e.target.value) })}
            />
          </label>
          <label className="slider-row">
            <span>Flow</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={brushOpacity}
              onChange={(e) => useApp.setState({ brushOpacity: Number(e.target.value) })}
            />
          </label>
          <div className="panel-hint muted">Left-drag to paint · right-drag to orbit.</div>
        </div>
      )}
    </div>
  )
}
