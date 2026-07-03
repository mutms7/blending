import { useEffect } from 'react'
import { useApp, type AppState } from '../state/store'

interface Step {
  title: string
  text: string
  done: (s: AppState) => boolean
}

const STEPS: Step[] = [
  {
    title: 'Look around',
    text: 'Drag with the left mouse button to orbit the camera. Scroll to zoom.',
    done: (s) => s.lastAction === 'orbit',
  },
  {
    title: 'Select a face',
    text: 'Click a face of the cube to select it (you are in Face mode).',
    done: (s) => s.mode === 'face' && s.selection.length > 0,
  },
  {
    title: 'Move it',
    text: 'Drag the colored arrows to move the selected face.',
    done: (s) => s.lastAction === 'move',
  },
  {
    title: 'Extrude',
    text: 'Press E (or the Extrude button) to pull a new block out of the selected face.',
    done: (s) => s.lastAction === 'extrude',
  },
  {
    title: 'Subdivide',
    text: 'Press D to split the selected face into four smaller faces.',
    done: (s) => s.lastAction === 'subdivide',
  },
  {
    title: 'Vertex mode',
    text: 'Press 1 to switch to Vertex mode, then click a corner point.',
    done: (s) => s.mode === 'vertex' && s.selection.length > 0,
  },
  {
    title: 'Undo',
    text: 'Press Ctrl+Z to undo your last change (only your own edits are undone).',
    done: (s) => s.lastAction === 'undo',
  },
]

function finishTutorial() {
  localStorage.setItem('bt-tutorial-done', '1')
  useApp.setState({ tutorialOpen: false })
}

export default function Tutorial() {
  const open = useApp((s) => s.tutorialOpen)
  const step = useApp((s) => s.tutorialStep)
  const phase = useApp((s) => s.phase)

  // advance when the current step's condition is met
  useEffect(() => {
    if (!open) return
    return useApp.subscribe((s) => {
      const current = STEPS[s.tutorialStep]
      if (current && current.done(s)) {
        // clear lastAction so the next step doesn't auto-complete
        useApp.setState({ tutorialStep: s.tutorialStep + 1, lastAction: null })
      }
    })
  }, [open])

  if (!open || phase !== 'idle') return null

  if (step >= STEPS.length) {
    return (
      <div className="tutorial-panel">
        <div className="tutorial-title">You're ready! 🎉</div>
        <div className="tutorial-text">
          Try a practice build from the Practice menu up top, or invite friends and start a round.
        </div>
        <button className="btn btn-primary" onClick={finishTutorial}>Done</button>
      </div>
    )
  }

  const s = STEPS[step]
  return (
    <div className="tutorial-panel">
      <div className="tutorial-progress">
        Tutorial · step {step + 1} of {STEPS.length}
      </div>
      <div className="tutorial-title">{s.title}</div>
      <div className="tutorial-text">{s.text}</div>
      <button className="btn tutorial-skip" onClick={finishTutorial}>Skip tutorial</button>
    </div>
  )
}
