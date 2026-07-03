import 'dotenv/config'
import http from 'http'
import express from 'express'
import cors from 'cors'
import { WebSocketServer } from 'ws'
import { setupWSConnection } from 'y-websocket/bin/utils'
import { scoreModel } from './score.js'
import { getLeaderboard, promptForDate, submitDaily, todayUTC, type DailyPlayer } from './daily.js'

const PORT = Number(process.env.PORT ?? 4000)

const app = express()
app.use(cors())
app.use(express.json({ limit: '30mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

const DATA_URL_PREFIX = /^data:image\/png;base64,/

app.post('/score', async (req, res) => {
  const { prompt, images } = req.body ?? {}

  if (typeof prompt !== 'string' || prompt.length === 0 || prompt.length > 200) {
    return res.status(400).json({ error: 'invalid_prompt' })
  }
  if (
    !Array.isArray(images) ||
    images.length === 0 ||
    images.length > 8 ||
    images.some((img) => typeof img !== 'string' || img.length === 0)
  ) {
    return res.status(400).json({ error: 'invalid_images' })
  }

  const cleaned = images.map((img: string) => img.replace(DATA_URL_PREFIX, ''))

  try {
    const result = await scoreModel(prompt, cleaned)
    res.json(result)
  } catch (err) {
    console.error('[score] failed:', err)
    res.status(502).json({ error: 'scoring_failed' })
  }
})

app.get('/daily', (_req, res) => {
  const date = todayUTC()
  res.json({ date, prompt: promptForDate(date), leaderboard: getLeaderboard(date) })
})

app.post('/daily/submit', async (req, res) => {
  const { players, images } = req.body ?? {}

  if (
    !Array.isArray(players) ||
    players.length === 0 ||
    players.length > 16 ||
    players.some((p) => typeof p?.id !== 'string' || typeof p?.name !== 'string')
  ) {
    return res.status(400).json({ error: 'invalid_players' })
  }
  if (
    !Array.isArray(images) ||
    images.length === 0 ||
    images.length > 8 ||
    images.some((img) => typeof img !== 'string' || img.length === 0)
  ) {
    return res.status(400).json({ error: 'invalid_images' })
  }

  const cleaned = images.map((img: string) => img.replace(DATA_URL_PREFIX, ''))
  const cleanPlayers: DailyPlayer[] = players.map((p) => ({
    id: String(p.id).slice(0, 64),
    name: String(p.name).slice(0, 60),
  }))

  try {
    const submission = await submitDaily(cleanPlayers, cleaned)
    res.json(submission)
  } catch (err) {
    console.error('[daily] failed:', err)
    res.status(502).json({ error: 'scoring_failed' })
  }
})

const server = http.createServer(app)

// Yjs room sync: the websocket path is the room name (e.g. ws://host/room-abc123)
const wss = new WebSocketServer({ server })
wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req)
})

server.listen(PORT, () => {
  console.log(`blend-together server listening on http://localhost:${PORT}`)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('WARNING: ANTHROPIC_API_KEY is not set — /score will fail. See server/.env.example')
  }
})
