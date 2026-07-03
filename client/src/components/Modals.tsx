import { useEffect, useState } from 'react'
import { backToEditor, runScoring, startRound } from '../game/game'
import { getRecording } from '../game/timelapse'
import { useApp } from '../state/store'
import TimelapsePlayer from './TimelapsePlayer'

function scoreColor(score: number): string {
  if (score >= 70) return '#69db7c'
  if (score >= 40) return '#ffd43b'
  return '#ff6b6b'
}

export function ScoringOverlay() {
  const phase = useApp((s) => s.phase)
  if (phase !== 'scoring') return null
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="spinner" />
        <h2>Time's up!</h2>
        <p className="muted">The AI judge is inspecting your model from every angle…</p>
      </div>
    </div>
  )
}

function AnimatedScore({ score }: { score: number }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    let raf = 0
    const start = performance.now()
    const D = 1200
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / D)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplay(Math.round(eased * score))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [score])
  return <>{display}</>
}

function Timelapse() {
  const recording = getRecording()
  if (!recording || recording.events.length < 2) return null
  return <TimelapsePlayer recording={recording} />
}

function DailyResults() {
  const dailyInfo = useApp((s) => s.dailyInfo)
  if (!dailyInfo) return null
  return (
    <div className="daily-results">
      <div className="daily-rank">
        ★ Daily challenge — rank <strong>#{dailyInfo.rank}</strong> of {dailyInfo.total} today
      </div>
      {dailyInfo.leaderboard.length > 0 && (
        <ol className="daily-board">
          {dailyInfo.leaderboard.slice(0, 5).map((e, i) => (
            <li key={i}>
              <span className="daily-team">{e.team}</span>
              <span className="daily-score">{e.score}</span>
            </li>
          ))}
        </ol>
      )}
      {dailyInfo.streaks.length > 0 && (
        <div className="daily-streaks">
          {dailyInfo.streaks.map((s) => (
            <span key={s.id} className="daily-streak">
              🔥 {s.name}: {s.streak}-day streak
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function RevealModal() {
  const phase = useApp((s) => s.phase)
  const result = useApp((s) => s.result)
  const prompt = useApp((s) => s.prompt)
  const durationSec = useApp((s) => s.durationSec)
  if (phase !== 'reveal' || !result) return null

  return (
    <div className="modal-backdrop">
      <div className="modal modal-reveal">
        <p className="muted reveal-prompt">The challenge was: <strong>{prompt}</strong></p>
        <div className="score-big" style={{ color: scoreColor(result.score) }}>
          <AnimatedScore score={result.score} />
          <span className="score-outof">/100</span>
        </div>
        <p className="verdict">“{result.one_line_verdict}”</p>
        <Timelapse />
        {result.strengths.length > 0 && (
          <ul className="feedback-list">
            {result.strengths.map((s, i) => (
              <li key={i} className="feedback-good">✓ {s}</li>
            ))}
          </ul>
        )}
        {result.issues.length > 0 && (
          <ul className="feedback-list">
            {result.issues.map((s, i) => (
              <li key={i} className="feedback-bad">⚠ {s}</li>
            ))}
          </ul>
        )}
        <DailyResults />
        <div className="modal-actions">
          <button className="btn" onClick={backToEditor}>Keep building</button>
          <button className="btn btn-primary" onClick={() => startRound(durationSec)}>New round</button>
        </div>
      </div>
    </div>
  )
}

export function GalleryModal() {
  const open = useApp((s) => s.galleryOpen)
  const history = useApp((s) => s.history)
  if (!open) return null
  const close = () => useApp.setState({ galleryOpen: false })
  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal modal-gallery" onClick={(e) => e.stopPropagation()}>
        <h2>Session gallery</h2>
        {history.length === 0 && <p className="muted">No finished rounds yet.</p>}
        <div className="gallery-grid">
          {[...history].reverse().map((e, i) => (
            <div key={`${e.at}-${i}`} className="gallery-card">
              {e.thumb ? (
                <img src={e.thumb} alt={e.prompt} className="gallery-thumb" />
              ) : (
                <div className="gallery-thumb gallery-thumb-empty">∅</div>
              )}
              <div className="gallery-meta">
                <div className="gallery-prompt">{e.prompt}</div>
                <div className="gallery-score" style={{ color: scoreColor(e.score) }}>{e.score}</div>
              </div>
              <div className="gallery-verdict muted">“{e.verdict}”</div>
            </div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  )
}

export function ErrorModal() {
  const phase = useApp((s) => s.phase)
  const errorMsg = useApp((s) => s.errorMsg)
  if (phase !== 'error') return null
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Scoring failed</h2>
        <p className="muted">{errorMsg ?? 'Something went wrong while judging the model.'}</p>
        <div className="modal-actions">
          <button className="btn" onClick={backToEditor}>Back to editor</button>
          <button className="btn btn-primary" onClick={() => void runScoring()}>Retry scoring</button>
        </div>
      </div>
    </div>
  )
}
