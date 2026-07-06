import { create } from 'zustand'
import type { SelMode } from '../mesh/meshDoc'
import type { DailyInfo, ScoreResult } from '../game/api'

export type GamePhase = 'idle' | 'playing' | 'scoring' | 'reveal' | 'error'
export type GizmoMode = 'translate' | 'rotate' | 'scale'
export type Tool = 'edit' | 'paint'
export type BrushType = 'marker' | 'airbrush' | 'highlighter'

export interface RoundModifiers {
  noUndo: boolean
  budget: number | null
}

export interface GalleryEntry {
  prompt: string
  score: number
  verdict: string
  thumb: string | null
  at: number
}

export interface AppState {
  // editor
  mode: SelMode
  selection: string[]
  gizmoMode: GizmoMode
  meshVersion: number
  // tools + coloring
  tool: Tool
  color: string
  brushType: BrushType
  brushSize: number
  brushOpacity: number
  // connection
  connected: boolean
  // game (mirrored from the shared Yjs game map)
  phase: GamePhase
  prompt: string | null
  endsAt: number | null
  result: ScoreResult | null
  errorMsg: string | null
  daily: string | null
  dailyInfo: DailyInfo | null
  modifiers: RoundModifiers | null
  addsUsed: number
  history: GalleryEntry[]
  galleryOpen: boolean
  // local prefs
  durationSec: number
  startNoUndo: boolean
  startBudget: number | null
  // tutorial
  lastAction: string | null
  tutorialStep: number
  tutorialOpen: boolean

  setMode: (mode: SelMode) => void
  setSelection: (ids: string[]) => void
  toggleSelected: (id: string) => void
  clearSelection: () => void
}

export const useApp = create<AppState>((set) => ({
  mode: 'face',
  selection: [],
  gizmoMode: 'translate',
  meshVersion: 0,
  tool: 'edit',
  color: '#ff6b6b',
  brushType: 'marker',
  brushSize: 0.35,
  brushOpacity: 0.9,
  connected: false,
  phase: 'idle',
  prompt: null,
  endsAt: null,
  result: null,
  errorMsg: null,
  daily: null,
  dailyInfo: null,
  modifiers: null,
  addsUsed: 0,
  history: [],
  galleryOpen: false,
  durationSec: 180,
  startNoUndo: false,
  startBudget: null,
  lastAction: null,
  tutorialStep: 0,
  tutorialOpen: typeof localStorage !== 'undefined' && !localStorage.getItem('bt-tutorial-done'),

  setMode: (mode) => set({ mode, selection: [] }),
  setSelection: (ids) => set({ selection: ids }),
  toggleSelected: (id) =>
    set((s) => ({
      selection: s.selection.includes(id)
        ? s.selection.filter((x) => x !== id)
        : [...s.selection, id],
    })),
  clearSelection: () => set({ selection: [] }),
}))
