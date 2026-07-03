import { SERVER_URL } from '../net/session'

export interface ScoreResult {
  score: number
  recognizable: boolean
  strengths: string[]
  issues: string[]
  one_line_verdict: string
}

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

export interface DailyChallenge {
  date: string
  prompt: string
  leaderboard: LeaderboardEntry[]
}

export interface DailyInfo {
  rank: number
  total: number
  leaderboard: LeaderboardEntry[]
  streaks: StreakInfo[]
}

async function post<T>(path: string, body: unknown, timeoutMs = 120_000): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${SERVER_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

export function requestScore(prompt: string, images: string[]): Promise<ScoreResult> {
  return post<ScoreResult>('/score', { prompt, images })
}

export async function getDaily(): Promise<DailyChallenge> {
  const res = await fetch(`${SERVER_URL}/daily`)
  if (!res.ok) throw new Error(`daily fetch failed: ${res.status}`)
  return (await res.json()) as DailyChallenge
}

export function submitDaily(
  players: Array<{ id: string; name: string }>,
  images: string[]
): Promise<DailyInfo & { result: ScoreResult }> {
  return post<DailyInfo & { result: ScoreResult }>('/daily/submit', { players, images })
}
