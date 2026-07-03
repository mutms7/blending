import { DatabaseSync } from 'node:sqlite'
import fs from 'fs'
import path from 'path'
import { scoreModel, type ScoreResult } from './score.js'

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = new DatabaseSync(path.join(DATA_DIR, 'blend.db'))

db.exec(`
  CREATE TABLE IF NOT EXISTS daily_scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    team TEXT NOT NULL,
    score INTEGER NOT NULL,
    verdict TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_daily_scores_date ON daily_scores(date, score DESC);

  CREATE TABLE IF NOT EXISTS streaks (
    player_id TEXT PRIMARY KEY,
    name TEXT,
    streak INTEGER NOT NULL,
    last_date TEXT NOT NULL
  );
`)

// ---------------------------------------------------------------------------
// Prompt of the day
// ---------------------------------------------------------------------------

const DAILY_PROMPTS = [
  'a coffee mug', 'a wooden chair', 'a rocket', 'a lighthouse', 'a snowman',
  'a sailboat', 'a birthday cake', 'a castle tower', 'an airplane', 'a windmill',
  'a piano', 'a mushroom', 'a tent', 'a bridge', 'a lamp',
  'a dog house', 'an umbrella', 'a wine glass', 'a crown', 'a duck',
  'a hammer', 'a bookshelf', 'a traffic cone', 'a bed', 'a robot',
  'a fish', 'a car', 'a staircase', 'a sword', 'a tree',
]

export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

function yesterdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export function promptForDate(date: string): string {
  let hash = 0
  for (let i = 0; i < date.length; i++) hash = (hash * 31 + date.charCodeAt(i)) >>> 0
  return DAILY_PROMPTS[hash % DAILY_PROMPTS.length]
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export interface LeaderboardEntry {
  team: string
  score: number
  verdict: string | null
}

export interface StreakInfo {
  id: string
  name: string
  streak: number
}

export function getLeaderboard(date: string, limit = 10): LeaderboardEntry[] {
  const rows = db
    .prepare('SELECT team, score, verdict FROM daily_scores WHERE date = ? ORDER BY score DESC, created_at ASC LIMIT ?')
    .all(date, limit) as unknown as LeaderboardEntry[]
  return rows
}

export interface DailyPlayer {
  id: string
  name: string
}

export interface DailySubmission {
  result: ScoreResult
  rank: number
  total: number
  leaderboard: LeaderboardEntry[]
  streaks: StreakInfo[]
}

/** Insert one submission and return its rank among today's entries. */
export function recordScore(date: string, team: string, score: number, verdict: string): { rank: number; total: number } {
  db.prepare('INSERT INTO daily_scores (date, team, score, verdict) VALUES (?, ?, ?, ?)').run(
    date,
    team.slice(0, 120),
    score,
    verdict
  )
  const better = db
    .prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE date = ? AND score > ?')
    .get(date, score) as { n: number }
  const total = (db.prepare('SELECT COUNT(*) AS n FROM daily_scores WHERE date = ?').get(date) as { n: number }).n
  return { rank: better.n + 1, total }
}

export async function submitDaily(players: DailyPlayer[], images: string[]): Promise<DailySubmission> {
  const date = todayUTC()
  const prompt = promptForDate(date)
  const result = await scoreModel(prompt, images)

  const team = players.map((p) => p.name).join(' + ') || 'Anonymous team'
  const { rank, total } = recordScore(date, team, result.score, result.one_line_verdict)

  const streaks: StreakInfo[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    streak: bumpStreak(p.id, p.name, date),
  }))

  return {
    result,
    rank,
    total,
    leaderboard: getLeaderboard(date),
    streaks,
  }
}

/**
 * Consecutive-day streak per player: same day keeps it, the day after extends
 * it, anything else resets to 1.
 */
export function bumpStreak(playerId: string, name: string, date: string): number {
  const row = db.prepare('SELECT streak, last_date FROM streaks WHERE player_id = ?').get(playerId) as
    | { streak: number; last_date: string }
    | undefined

  let streak: number
  if (!row) streak = 1
  else if (row.last_date === date) streak = row.streak
  else if (row.last_date === yesterdayOf(date)) streak = row.streak + 1
  else streak = 1

  db.prepare(
    `INSERT INTO streaks (player_id, name, streak, last_date) VALUES (?, ?, ?, ?)
     ON CONFLICT(player_id) DO UPDATE SET name = excluded.name, streak = excluded.streak, last_date = excluded.last_date`
  ).run(playerId, name.slice(0, 60), streak, date)

  return streak
}
