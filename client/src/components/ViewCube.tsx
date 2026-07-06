import { frameObject, viewFromDirection } from '../game/cameraBus'

// Bottom-left navigation widget. Each button frames the whole model from a world
// axis: the camera rig centers on the bounding-box midpoint and eases to a steady
// distance back along that axis. "3/4" reframes to a comfortable default angle.

const VIEWS: Array<{ label: string; dir: [number, number, number] }> = [
  { label: 'Front', dir: [0, 0, 1] },
  { label: 'Back', dir: [0, 0, -1] },
  { label: 'Top', dir: [0, 1, 0] },
  { label: 'Left', dir: [-1, 0, 0] },
  { label: 'Right', dir: [1, 0, 0] },
  { label: 'Bottom', dir: [0, -1, 0] },
]

export default function ViewCube() {
  return (
    <div className="viewcube">
      <div className="tool-title">View</div>
      <div className="viewcube-grid">
        {VIEWS.map((v) => (
          <button
            key={v.label}
            className="btn viewcube-btn"
            title={`Look from ${v.label.toLowerCase()}`}
            onClick={() => viewFromDirection(v.dir)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <button className="btn viewcube-home" title="Frame the whole model (3/4 view)" onClick={frameObject}>
        ⌂ 3/4 view
      </button>
    </div>
  )
}
