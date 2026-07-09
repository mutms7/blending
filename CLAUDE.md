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
- Color is CRDT state too: `faceColors` (fill) and `vertColors` (per-vertex / painted) Y.Maps on
  the mesh doc, tracked by undo and observed in `session.ts` so edits re-render. Render priority is
  vertColor → faceColor → `DEFAULT_MESH_COLOR`. `captureViews` stays gray on purpose (the scoring
  prompt describes a gray model). `object` select mode = whole connected island via
  `connectedFaces` (`mesh/objects.ts`); it behaves like `face` everywhere colors/gizmo/delete run.
- Free-draw paint is texture-based, NOT vertex colors: each face gets a square cell in a UV atlas
  (`faceCellMap` in `mesh/geometry.ts`, packed by sorted face id) rendered onto one shared
  `CanvasTexture` (`mesh/paintTexture.ts`). Dabs are `PaintStroke`s in the `strokes` Y.Array
  (undoable, cell-local coords so they survive atlas re-packing). `PaintLayer` in `EditorCanvas`
  is a second mesh (same geometry, `raycast={()=>null}`) drawn over the surface. The brush is
  scoped by select mode (face→hit face, object→connected island, vertex/edge→`vertColors`).
  Timelapse/`captureViews` do not show paint (no overlay/uv there) — intentional.
- Free-draw paint is texture-based, NOT vertex colors: each face gets a square cell in a UV atlas
  (`faceCellMap` in `mesh/geometry.ts`, packed by sorted face id) rendered onto one shared
  `CanvasTexture` (`mesh/paintTexture.ts`). Dabs are `PaintStroke`s in the `strokes` Y.Array
  (undoable, cell-local coords so they survive atlas re-packing). `PaintLayer` in `EditorCanvas`
  is a second mesh (same geometry, `raycast={()=>null}`) drawn over the surface. The brush is
  scoped by select mode (face→hit face, object→connected island, vertex/edge→`vertColors`).
  Timelapse/`captureViews` do not show paint (no overlay/uv there) — intentional.
- Camera: `CameraRig` (in `EditorCanvas`) owns fly + smooth focus via `game/cameraBus.ts`
  (`frameObject` = whole mesh, `focusOn` = a point). Object-mode clicks call `focusOn`.
- `W/A/S/D/Q/E` are reserved for camera fly (handled by `CameraRig` inside the Canvas, not the
  App keydown switch). Tool keys avoid those letters: gizmo `G/R/T`, extrude `F`, subdivide `C`,
  delete `X`, paint toggle `P`. In paint mode OrbitControls left-drag is disabled (paint) and
  orbit moves to right-drag via `mouseButtons`.
- Camera: `CameraRig` (in `EditorCanvas`) owns fly + smooth focus via `game/cameraBus.ts`
  (`frameObject` = whole mesh, `focusOn` = a point). Object-mode clicks call `focusOn`. The corner
  view-cube (`ViewCube.tsx`) is its OWN small `<Canvas>` whose camera mirrors the main camera each
  frame via `cameraBus.mainCameraQuat`; faces/edges/corners call `viewFromDirection`.
- Starting cube seeds once in `session.ts` on first ws sync OR a fallback timer, so it still appears
  when the server is unreachable (offline/solo). Don't gate seeding on sync alone.
- `main.tsx` deliberately omits React StrictMode: the Yjs session is a module-level singleton
  (`client/src/net/session.ts`) and double-mount would tear down the websocket in dev.
- Server uses Node's built-in `node:sqlite`, unflagged on Node 24 (repo pins 24 via
  `.node-version`; deploy sets `NODE_VERSION`) — do not add better-sqlite3.
- `y-websocket/bin/utils` has no bundled types; the declaration lives in
  `server/src/y-websocket-utils.d.ts`.
- Vite HMR of `session.ts`/`game.ts` can leave stale module instances; hard-reload the browser
  after editing those files before trusting manual test results.

## Browser debug hooks (dev)

`window.__blend` = `{ mesh, awareness, useApp }`, `window.__blendGame` = `{ captureThumb, runScoring, gameMap }`.
