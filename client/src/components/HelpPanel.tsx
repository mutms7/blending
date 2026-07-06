import { useState } from 'react'

export default function HelpPanel() {
  const [open, setOpen] = useState(true)
  return (
    <div className="help-panel">
      <button className="btn help-toggle" onClick={() => setOpen((o) => !o)}>
        {open ? 'Hide controls' : 'Controls'}
      </button>
      {open && (
        <div className="help-body">
          <div><kbd>Drag</kbd> orbit · <kbd>Scroll</kbd> zoom · <kbd>Right-drag</kbd> pan</div>
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> fly · <kbd>Q</kbd> up · <kbd>E</kbd> down</div>
          <div><kbd>Click</kbd> select · <kbd>Shift+Click</kbd> add to selection</div>
          <div><kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd>/<kbd>4</kbd> vertex / edge / face / object</div>
          <div><kbd>G</kbd>/<kbd>R</kbd>/<kbd>T</kbd> move / rotate / scale gizmo</div>
          <div><kbd>F</kbd> extrude · <kbd>C</kbd> subdivide · <kbd>X</kbd> delete</div>
          <div><kbd>P</kbd> paint mode · <kbd>Ctrl+Z</kbd> undo · <kbd>Ctrl+Shift+Z</kbd> redo</div>
          <div className="muted">Use the view-cube (bottom-left) to snap to a side.</div>
        </div>
      )}
    </div>
  )
}
