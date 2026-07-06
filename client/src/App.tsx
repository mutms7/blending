import { useEffect } from 'react'
import EditorCanvas from './components/EditorCanvas'
import TopBar from './components/TopBar'
import Toolbar from './components/Toolbar'
import ColorPanel from './components/ColorPanel'
import HelpPanel from './components/HelpPanel'
import Tutorial from './components/Tutorial'
import { ErrorModal, GalleryModal, RevealModal, ScoringOverlay } from './components/Modals'
import { useApp } from './state/store'
import {
  deleteSelection,
  extrudeSelection,
  redo,
  subdivideSelection,
  undo,
} from './state/editorActions'
import './game/game' // starts the shared round timekeeper

export default function App() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return

      // W/A/S/D/Q/E are reserved for camera fly (handled inside the canvas).
      switch (e.key.toLowerCase()) {
        case '1':
          useApp.getState().setMode('vertex')
          break
        case '2':
          useApp.getState().setMode('edge')
          break
        case '3':
          useApp.getState().setMode('face')
          break
        case '4':
          useApp.getState().setMode('object')
          break
        case 'g':
          useApp.setState({ gizmoMode: 'translate' })
          break
        case 'r':
          useApp.setState({ gizmoMode: 'rotate' })
          break
        case 't':
          useApp.setState({ gizmoMode: 'scale' })
          break
        case 'f':
          extrudeSelection()
          break
        case 'c':
          subdivideSelection()
          break
        case 'x':
        case 'delete':
        case 'backspace':
          deleteSelection()
          break
        case 'p':
          useApp.setState((s) => ({ tool: s.tool === 'paint' ? 'edit' : 'paint' }))
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className="editor-area">
        <EditorCanvas />
        <Toolbar />
        <ColorPanel />
        <HelpPanel />
        <Tutorial />
      </div>
      <ScoringOverlay />
      <RevealModal />
      <ErrorModal />
      <GalleryModal />
    </div>
  )
}
