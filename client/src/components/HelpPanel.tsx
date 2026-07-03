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
          <div><kbd>Click</kbd> select · <kbd>Shift+Click</kbd> multi-select</div>
          <div><kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> vertex / edge / face mode</div>
          <div><kbd>W</kbd>/<kbd>R</kbd>/<kbd>S</kbd> move / rotate / scale gizmo</div>
          <div><kbd>E</kbd> extrude · <kbd>D</kbd> subdivide · <kbd>X</kbd> delete</div>
          <div><kbd>Ctrl+Z</kbd> undo · <kbd>Ctrl+Shift+Z</kbd> redo</div>
          <div className="muted">Drag the arrows to move the selection.</div>
        </div>
      )}
    </div>
  )
}
