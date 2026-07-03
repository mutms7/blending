declare module 'y-websocket/bin/utils' {
  import type { IncomingMessage } from 'http'
  import type WebSocket from 'ws'

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    opts?: { docName?: string; gc?: boolean }
  ): void
}
