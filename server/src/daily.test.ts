import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'

// point the module at a throwaway database BEFORE importing it
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'blend-test-'))

const { bumpStreak, getLeaderboard, promptForDate, recordScore } = await import('./daily.js')

test('promptForDate is deterministic per date and varies across dates', () => {
  assert.equal(promptForDate('2026-07-03'), promptForDate('2026-07-03'))
  const prompts = new Set(
    ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'].map(promptForDate)
  )
  assert.ok(prompts.size >= 2, 'different dates should not all share one prompt')
})

test('recordScore ranks by score and getLeaderboard sorts descending', () => {
  const d = '2030-01-01'
  const first = recordScore(d, 'Team A', 50, 'ok')
  assert.deepEqual(first, { rank: 1, total: 1 })

  const higher = recordScore(d, 'Team B', 80, 'great')
  assert.deepEqual(higher, { rank: 1, total: 2 })

  const middle = recordScore(d, 'Team C', 60, 'fine')
  assert.deepEqual(middle, { rank: 2, total: 3 })

  const board = getLeaderboard(d)
  assert.deepEqual(board.map((e) => e.team), ['Team B', 'Team C', 'Team A'])

  // other days don't leak in
  assert.equal(getLeaderboard('2030-01-02').length, 0)
})

test('streaks: same day keeps, next day extends, gap resets', () => {
  assert.equal(bumpStreak('p1', 'Pat', '2030-03-01'), 1)
  assert.equal(bumpStreak('p1', 'Pat', '2030-03-01'), 1, 'same-day resubmit does not double-count')
  assert.equal(bumpStreak('p1', 'Pat', '2030-03-02'), 2, 'consecutive day extends')
  assert.equal(bumpStreak('p1', 'Pat', '2030-03-03'), 3)
  assert.equal(bumpStreak('p1', 'Pat', '2030-03-10'), 1, 'gap resets')
})

test('streaks handle month boundaries', () => {
  assert.equal(bumpStreak('p2', 'Mo', '2030-01-31'), 1)
  assert.equal(bumpStreak('p2', 'Mo', '2030-02-01'), 2)
})

test('streaks are per player', () => {
  assert.equal(bumpStreak('p3', 'Solo', '2030-05-05'), 1)
  assert.equal(bumpStreak('p4', 'Other', '2030-05-06'), 1)
})
