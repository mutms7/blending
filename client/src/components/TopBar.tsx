import { useEffect, useState } from 'react'
import { getPeers, inviteLink, me, myClientId, renameMe, useAwarenessVersion } from '../net/session'
import { useApp } from '../state/store'
import { startDailyChallenge, startRound, startRoundWith } from '../game/game'

const LESSONS: Array<{ label: string; prompt: string; durationSec: number }> = [
  { label: 'Lesson 1: a table (easy)', prompt: 'a table', durationSec: 240 },
  { label: 'Lesson 2: a coffee mug', prompt: 'a coffee mug', durationSec: 240 },
  { label: 'Lesson 3: a sailboat', prompt: 'a sailboat', durationSec: 300 },
  { label: 'Lesson 4: a windmill (hard)', prompt: 'a windmill', durationSec: 300 },
]

function Countdown({ endsAt }: { endsAt: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, Math.ceil((endsAt - now) / 1000))
  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')
  return <span className={`countdown ${remaining <= 15 ? 'countdown-low' : ''}`}>{mm}:{ss}</span>
}

function ModifierBadges() {
  const modifiers = useApp((s) => s.modifiers)
  const addsUsed = useApp((s) => s.addsUsed)
  const daily = useApp((s) => s.daily)
  if (!modifiers && !daily) return null
  return (
    <span className="mod-badges">
      {daily && <span className="mod-badge mod-daily">Daily</span>}
      {modifiers?.noUndo && <span className="mod-badge">No undo</span>}
      {modifiers?.budget != null && (
        <span className="mod-badge">
          Adds {addsUsed}/{modifiers.budget}
        </span>
      )}
    </span>
  )
}

function GameStatus() {
  const phase = useApp((s) => s.phase)
  const prompt = useApp((s) => s.prompt)
  const endsAt = useApp((s) => s.endsAt)
  const durationSec = useApp((s) => s.durationSec)
  const startNoUndo = useApp((s) => s.startNoUndo)
  const startBudget = useApp((s) => s.startBudget)
  const historyCount = useApp((s) => s.history.length)
  const [dailyBusy, setDailyBusy] = useState(false)

  if (phase === 'playing' && prompt && endsAt) {
    return (
      <div className="game-status">
        <span className="prompt-label">Build:</span>
        <span className="prompt-text">{prompt}</span>
        <Countdown endsAt={endsAt} />
        <ModifierBadges />
      </div>
    )
  }
  if (phase === 'scoring') {
    return <div className="game-status muted">Judging your masterpiece…</div>
  }
  if (phase === 'reveal' || phase === 'error') {
    return <div className="game-status muted">Round over</div>
  }
  return (
    <div className="game-status">
      <span className="muted">Free build</span>
      <select
        className="duration-select"
        value={durationSec}
        onChange={(e) => useApp.setState({ durationSec: Number(e.target.value) })}
      >
        <option value={60}>1 min</option>
        <option value={120}>2 min</option>
        <option value={180}>3 min</option>
        <option value={300}>5 min</option>
      </select>
      <button className="btn btn-primary" onClick={() => startRound(useApp.getState().durationSec)}>
        Start round
      </button>
      <button
        className="btn"
        disabled={dailyBusy}
        title="One shared prompt per day — results go on the global leaderboard"
        onClick={async () => {
          setDailyBusy(true)
          try {
            await startDailyChallenge()
          } catch {
            window.alert('Could not reach the server for the daily challenge.')
          } finally {
            setDailyBusy(false)
          }
        }}
      >
        {dailyBusy ? 'Loading…' : '★ Daily'}
      </button>
      <select
        className="duration-select"
        value=""
        title="Solo practice builds, scored by the same AI judge"
        onChange={(e) => {
          const lesson = LESSONS[Number(e.target.value)]
          if (lesson) startRoundWith(lesson.prompt, lesson.durationSec)
        }}
      >
        <option value="" disabled>
          Practice…
        </option>
        {LESSONS.map((l, i) => (
          <option key={i} value={i}>
            {l.label}
          </option>
        ))}
      </select>
      <label className="mod-toggle" title="Disable undo/redo for the next round">
        <input
          type="checkbox"
          checked={startNoUndo}
          onChange={(e) => useApp.setState({ startNoUndo: e.target.checked })}
        />
        No undo
      </label>
      <select
        className="duration-select"
        title="Limit how many primitives can be added during the next round"
        value={startBudget ?? ''}
        onChange={(e) =>
          useApp.setState({ startBudget: e.target.value === '' ? null : Number(e.target.value) })
        }
      >
        <option value="">Budget: off</option>
        <option value={3}>Budget: 3 adds</option>
        <option value={5}>Budget: 5 adds</option>
        <option value={8}>Budget: 8 adds</option>
      </select>
      {historyCount > 0 && (
        <button className="btn" onClick={() => useApp.setState({ galleryOpen: true })}>
          Gallery ({historyCount})
        </button>
      )}
    </div>
  )
}

function Players() {
  useAwarenessVersion()
  const peers = getPeers(true)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink())
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy this invite link:', inviteLink())
    }
  }

  return (
    <div className="players">
      {peers.map((p) => {
        const isMe = p.clientId === myClientId
        return (
          <button
            key={p.clientId}
            className={`player-chip ${isMe ? 'player-me' : ''}`}
            title={isMe ? 'Click to rename yourself' : p.user.name}
            onClick={() => {
              if (!isMe) return
              const name = window.prompt('Your name:', me.name)
              if (name) renameMe(name)
            }}
          >
            <span className="player-dot" style={{ background: p.user.color }} />
            {p.user.name}
            {isMe ? ' (you)' : ''}
          </button>
        )
      })}
      <button className="btn" onClick={copy}>{copied ? 'Copied!' : 'Invite'}</button>
    </div>
  )
}

export default function TopBar() {
  const connected = useApp((s) => s.connected)
  return (
    <div className="topbar">
      <div className="topbar-left">
        <span className="logo">Blend&nbsp;Together</span>
        <span className={`conn-dot ${connected ? 'conn-on' : 'conn-off'}`} title={connected ? 'Connected' : 'Offline — solo mode'} />
      </div>
      <GameStatus />
      <Players />
    </div>
  )
}
