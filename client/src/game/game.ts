import { awareness, getPeers, mesh, myClientId } from '../net/session'
import { useApp, type GalleryEntry, type GamePhase, type RoundModifiers } from '../state/store'
import { randomPrompt } from './prompts'
import { captureThumb, captureViews } from './capture'
import { getDaily, requestScore, submitDaily, type DailyInfo, type ScoreResult } from './api'
import { startRecording, stopRecording } from './timelapse'

/**
 * Shared game state lives in a Y.Map on the same doc as the mesh, so every
 * player sees the same prompt, timer, and result, and a player who reconnects
 * lands in the current phase automatically.
 */
export const gameMap = mesh.doc.getMap<unknown>('game')

const GAME_ORIGIN = 'game'

function setGame(entries: Record<string, unknown>) {
  mesh.doc.transact(() => {
    for (const [k, v] of Object.entries(entries)) gameMap.set(k, v)
  }, GAME_ORIGIN)
}

let prevPhase: GamePhase = 'idle'

function syncToStore() {
  const phase = (gameMap.get('phase') as GamePhase) ?? 'idle'
  if (phase === 'playing' && prevPhase !== 'playing') startRecording()
  if (phase !== 'playing' && prevPhase === 'playing') stopRecording()
  prevPhase = phase

  useApp.setState({
    phase,
    prompt: (gameMap.get('prompt') as string) ?? null,
    endsAt: (gameMap.get('endsAt') as number) ?? null,
    result: (gameMap.get('result') as ScoreResult) ?? null,
    errorMsg: (gameMap.get('error') as string) ?? null,
    daily: (gameMap.get('daily') as string) ?? null,
    dailyInfo: (gameMap.get('dailyInfo') as DailyInfo) ?? null,
    modifiers: (gameMap.get('modifiers') as RoundModifiers) ?? null,
    addsUsed: (gameMap.get('addsUsed') as number) ?? 0,
    history: (gameMap.get('history') as GalleryEntry[]) ?? [],
  })
}
gameMap.observe(syncToStore)
syncToStore()

export interface RoundOptions {
  daily?: string | null
  modifiers?: RoundModifiers | null
}

export function startRoundWith(prompt: string, durationSec: number, opts: RoundOptions = {}) {
  mesh.resetToCube()
  useApp.setState({ selection: [] })
  setGame({
    phase: 'playing',
    prompt,
    endsAt: Date.now() + durationSec * 1000,
    result: null,
    error: null,
    scoringAt: null,
    daily: opts.daily ?? null,
    dailyInfo: null,
    modifiers: opts.modifiers ?? null,
    addsUsed: 0,
  })
}

function currentModifiers(): RoundModifiers | null {
  const { startNoUndo, startBudget } = useApp.getState()
  if (!startNoUndo && startBudget == null) return null
  return { noUndo: startNoUndo, budget: startBudget }
}

export function startRound(durationSec: number) {
  startRoundWith(randomPrompt(), durationSec, { modifiers: currentModifiers() })
}

/** Start today's global challenge — same prompt for everyone, results go on the leaderboard. */
export async function startDailyChallenge() {
  const daily = await getDaily()
  startRoundWith(daily.prompt, 180, { daily: daily.date, modifiers: currentModifiers() })
}

/** Track primitive adds against the round's budget (shared across all players). */
export function consumeAddBudget() {
  mesh.doc.transact(() => {
    gameMap.set('addsUsed', ((gameMap.get('addsUsed') as number) ?? 0) + 1)
  }, GAME_ORIGIN)
}

export function backToEditor() {
  setGame({ phase: 'idle', result: null, error: null, endsAt: null })
}

/**
 * Whoever has the lowest awareness client id acts for the group (starts
 * scoring at timeout, retries if the previous scorer vanished). Any client can
 * take over, so a dropped host never blocks the round.
 */
function amElectedScorer(): boolean {
  const ids = [...awareness.getStates().keys()]
  if (ids.length === 0) return true
  return Math.min(...ids) === myClientId
}

let scoringInFlight = false

export async function runScoring() {
  if (scoringInFlight) return
  scoringInFlight = true
  setGame({ phase: 'scoring', scoringAt: Date.now() })
  try {
    const prompt = (gameMap.get('prompt') as string) ?? 'an object'
    const daily = (gameMap.get('daily') as string) ?? null
    const images = captureViews()

    // reveal + append the round to the session gallery in one transaction
    const finalize = (result: ScoreResult, extra: Record<string, unknown> = {}) => {
      const entry: GalleryEntry = {
        prompt,
        score: result.score,
        verdict: result.one_line_verdict,
        thumb: captureThumb(),
        at: Date.now(),
      }
      const history = ((gameMap.get('history') as GalleryEntry[]) ?? []).concat(entry).slice(-12)
      setGame({ phase: 'reveal', result, history, ...extra })
    }

    if (images.length === 0) {
      finalize({
        score: 0,
        recognizable: false,
        strengths: [],
        issues: ['The model is completely empty — someone deleted everything!'],
        one_line_verdict: 'You cannot sculpt the void. Zero points.',
      })
    } else if (daily) {
      const players = getPeers(true).map((p) => ({ id: p.pid, name: p.user.name }))
      let sub
      try {
        sub = await submitDaily(players, images)
      } catch {
        sub = await submitDaily(players, images)
      }
      const { result, ...dailyInfo } = sub
      finalize(result, { dailyInfo })
    } else {
      let result: ScoreResult
      try {
        result = await requestScore(prompt, images)
      } catch {
        // one retry, then give up gracefully
        result = await requestScore(prompt, images)
      }
      finalize(result)
    }
  } catch (err) {
    console.error('scoring failed', err)
    setGame({
      phase: 'error',
      error: 'The judge is unavailable right now. Check that the server is running with a valid ANTHROPIC_API_KEY, then retry.',
    })
  } finally {
    scoringInFlight = false
  }
}

// Dev-only introspection hook
;(window as unknown as Record<string, unknown>).__blendGame = { captureThumb, runScoring, gameMap }

// Round timekeeper: ends the round when the countdown expires, and rescues a
// round whose scorer disconnected mid-judging.
setInterval(() => {
  const phase = gameMap.get('phase') as GamePhase | undefined
  const endsAt = gameMap.get('endsAt') as number | undefined
  const scoringAt = gameMap.get('scoringAt') as number | undefined

  if (phase === 'playing' && endsAt && Date.now() >= endsAt && amElectedScorer()) {
    void runScoring()
  }
  if (phase === 'scoring' && scoringAt && Date.now() - scoringAt > 120_000 && amElectedScorer()) {
    void runScoring()
  }
}, 500)
