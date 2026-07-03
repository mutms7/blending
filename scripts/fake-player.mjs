// Headless second player: joins a room, shows presence, and edits the mesh.
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import WebSocket from 'ws'

const room = process.argv[2]
if (!room) {
  console.error('usage: node bot.mjs <room>')
  process.exit(1)
}

const doc = new Y.Doc()
const provider = new WebsocketProvider('ws://localhost:4000', room, doc, {
  WebSocketPolyfill: WebSocket,
})
const awareness = provider.awareness

provider.on('status', (e) => console.log('[bot] status:', e.status))

provider.on('sync', (synced) => {
  if (!synced) return
  const verts = doc.getMap('verts')
  const faces = doc.getMap('faces')
  console.log('[bot] synced. verts:', verts.size, 'faces:', faces.size)

  // pick a face to "select" and a vertex to wiggle
  const faceId = [...faces.keys()][0]
  const vertId = faces.get(faceId)?.[0]
  console.log('[bot] selecting face', faceId, 'and wiggling vert', vertId)

  awareness.setLocalState({
    user: { name: 'Bot Bob', color: '#da77f2' },
    pid: 'bot-bob',
    cursor: [1.2, 1.2, 0.6],
    sel: { mode: 'face', ids: faceId ? [faceId] : [] },
  })

  const base = vertId ? [...verts.get(vertId)] : null
  let t = 0
  const timer = setInterval(() => {
    t += 0.25
    if (base && vertId && verts.has(vertId)) {
      doc.transact(() => {
        verts.set(vertId, [base[0], base[1] + Math.sin(t) * 0.35 + 0.35, base[2]])
      }, 'bot')
    }
    awareness.setLocalStateField('cursor', [1.2 + Math.sin(t) * 0.4, 1.2, 0.6 + Math.cos(t) * 0.4])
  }, 250)

  setTimeout(() => {
    clearInterval(timer)
    console.log('[bot] done, disconnecting')
    provider.destroy()
    process.exit(0)
  }, 25000)
})
