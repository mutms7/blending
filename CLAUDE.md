# Blend Together — dev notes

Co-op 3D modeling party game. npm workspaces monorepo: `client/` (React + Vite + react-three-fiber)
and `server/` (Node + Express + y-websocket + Anthropic scoring). See README.md for architecture.

## Commands

- `npm run dev` — both servers via concurrently (client :5173, server :4000)
- `npm run typecheck` / `npm run build` — both workspaces (also `-w client` / `-w server`)
- `npm test` — client vitest suite (mesh core) + server node:test suite (daily/streak logic)
- `node scripts/fake-player.mjs <room>` — headless second player for testing multiplayer
  (joins the room, shows a cursor/selection, wiggles a vertex for ~25s)

## Things that are easy to get wrong

- `ANTHROPIC_API_KEY` lives in `server/.env` only — never import server config into the client.
- The mesh is CRDT state: all edits must go through `MeshDoc` methods (`client/src/mesh/meshDoc.ts`)
  inside `edit()` (undoable, user action) or `systemEdit()` (not undoable, e.g. round resets).
  Undo tracks only the `local-edit` transaction origin.
- Shared round state (phase, prompt, timer, modifiers, history) lives in the `game` Y.Map on the
  same doc (`client/src/game/game.ts`); mirror changes to the zustand store in `syncToStore`.
- `main.tsx` deliberately omits React StrictMode: the Yjs session is a module-level singleton
  (`client/src/net/session.ts`) and double-mount would tear down the websocket in dev.
- Server uses Node's built-in `node:sqlite` (Node 20.19+/22+) — do not add better-sqlite3.
- `y-websocket/bin/utils` has no bundled types; the declaration lives in
  `server/src/y-websocket-utils.d.ts`.
- Vite HMR of `session.ts`/`game.ts` can leave stale module instances; hard-reload the browser
  after editing those files before trusting manual test results.

## Browser debug hooks (dev)

`window.__blend` = `{ mesh, awareness, useApp }`, `window.__blendGame` = `{ captureThumb, runScoring, gameMap }`.
