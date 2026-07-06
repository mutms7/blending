# Blend Together

A co-op 3D modeling party game for the browser. Friends join a room via link, get a prompt
("a coffee mug", "a rocket"), and collaboratively sculpt **one shared low-poly model**
against a countdown. When time runs out, the app screenshots the model from six angles,
sends them to Claude (vision), and gets back a 0–100 match score with specific,
actionable feedback. Lightweight Blender meets Jackbox.

## Quick start (local dev)

Requires Node 20+.

```bash
npm install

# server config — the API key lives ONLY on the server
cp server/.env.example server/.env
#   then edit server/.env and set ANTHROPIC_API_KEY=sk-ant-...

npm run dev
```

- Client: http://localhost:5173 (a random `?room=` is created; share the URL to invite people)
- Server: http://localhost:4000 (HTTP scoring API + Yjs websocket sync on the same port)

Open the same room URL in a second browser window to see live multiplayer — or run
`node scripts/fake-player.mjs <room-id>` to spawn a headless test player that joins the
room, shows a live cursor and selection, and edits the model for ~25 seconds.

### How to play

1. First-time visitors get an interactive tutorial (orbit, select, move, extrude, subdivide, undo).
2. Free-build to warm up, or pick a solo **Practice** lesson (table → mug → sailboat → windmill),
   each scored by the same AI pipeline.
3. Click **Start round**: everyone gets the same prompt and timer, the model resets to a cube,
   and the group builds together. Optional **modifiers** spice things up: *No undo* and a
   *primitive budget* (max adds per round), enforced for every player in the room.
4. Or take on the **★ Daily** challenge: one global prompt per day; your team's score goes on
   the server-wide leaderboard, and each player builds a per-day streak.
5. On timeout the AI judge scores the model. The reveal screen shows the score, feedback, a
   **sped-up timelapse replay** of the build, and (for dailies) your rank and streaks.
6. Every finished round lands in the session **Gallery** — a side-by-side grid of prompts,
   thumbnails, scores, and verdicts.

### Modeling tools

- **Select modes** `1`/`2`/`3`/`4` — vertex, edge, face, or whole **object**. Object mode
  clicks a face and grabs the entire connected island (a cube you added, an extruded arm),
  computed on the fly from shared vertices (no group ids stored in the CRDT).
- **Gizmo** `G`/`R`/`T` — move, rotate, scale. Rotate and scale operate around the
  selection's centroid, so you can twist an extruded arm or taper a rocket nose the
  Blender way. Drag the arrows/rings/handles.
- **Edit** `F` extrude · `C` subdivide · `X` delete.
- **Color** (Edit tool) — pick vertices/edges/faces/an object, choose a color, and hit
  *Color … selection*. Face and object selections get a flat fill; vertex/edge selections
  set per-vertex colors that override the fill.
- **Paint** (`P`) — free-draw directly on the surface. Left-drag paints, right-drag orbits.
  Painting on faces is **precise**: each face is its own little canvas (a UV atlas texture),
  so you can draw anywhere on a face, not just at its corners. Three pen types: **Marker**
  (solid), **Airbrush** (soft, builds up on repeat passes), and **Highlighter** (translucent
  wash), with size and flow sliders. A paint-splash burst pops on each dab. Strokes are stored
  in the shared doc, so paint syncs live to everyone and is undoable.
  - The **select mode scopes the brush**: in **face** mode you paint only the face under the
    cursor; in **object** mode paint stays on the object you're touching; in **vertex**/**edge**
    mode the brush colors vertices/edges instead. If something is selected, painting is confined
    to it; clear the selection to paint anything.

### Camera / navigation

- **Orbit** left-drag · **zoom** scroll · **pan** right-drag.
- **Fly** `W`/`A`/`S`/`D` to move, `Q`/`E` up/down — all six are relative to the camera angle,
  and speed scales with distance to the target.
- **Click an object** (object mode) to smoothly recenter the camera on it at a consistent
  framing distance. The model also auto-frames on load so it isn't tucked under a panel.
- **View-cube** (bottom-left) — click a face/edge/corner to snap the camera to that angle,
  like the navigation gizmo in Blender/Fusion. The **⌂ Frame** button recenters on the model.

`Ctrl+Z` / `Ctrl+Shift+Z` undo/redo (color and paint changes are undoable too).

### Tests

`npm test` runs both suites:

- **client** (vitest): the mesh core — primitives, extrude/subdivide/delete invariants,
  orphan pruning, per-client undo across two synced docs, gizmo transform math, object
  connectivity (connected-component islands), and coloring/brush blending
- **server** (node:test): daily-challenge logic — prompt determinism, leaderboard
  ranking, and streak rules (same-day, consecutive-day, gaps, month boundaries)

## Architecture

```
client/  React + TypeScript + Vite, Three.js via @react-three/fiber + drei
  src/mesh/       mesh data model (Yjs), geometry+color building, object connectivity, brush math
  src/net/        room session: websocket provider, awareness, presence
  src/game/       round state machine, screenshot capture, timelapse recorder, API client, fx buses
  src/state/      zustand UI store + editor actions
  src/components/ canvas scene, toolbar, color/paint panel, HUD, tutorial, timelapse player, modals

server/  Node + TypeScript (one process, one port)
  src/index.ts    express HTTP API + y-websocket room sync (ws upgrade)
  src/score.ts    Anthropic Messages API call (vision + structured output)
  src/daily.ts    daily challenge: SQLite (built-in node:sqlite), leaderboard, streaks
```

### The sync model

The shared model is a Yjs document, synced through `y-websocket` (the room name is the
websocket path). Two shared maps represent the mesh:

- `verts`: vertex id → `[x, y, z]`
- `faces`: face id → ordered list of vertex ids (CCW from outside; n-gons allowed)

Concurrent edits merge **per key**: two people moving different vertices never conflict,
and two people moving the *same* vertex resolve last-writer-wins on that vertex alone.
Faces are fan-triangulated into a non-indexed `BufferGeometry` on every change (models
are small, so full rebuilds stay comfortably within frame budget). A face that
temporarily references a deleted vertex (mid-merge) is simply skipped until repaired.

Everything else rides on the same doc:

- **Undo/redo** is a `Y.UndoManager` tracking only the local client's transaction origin,
  so you undo *your own* edits, never a teammate's. Round resets use a separate origin
  and are not undoable.
- **Game state** (`phase`, `prompt`, `endsAt`, `result`) lives in a `game` Y.Map, so the
  timer and reveal are synchronized, and a player who reconnects lands in the current
  phase with the current model (Yjs resyncs automatically).
- **Presence** uses Yjs awareness: name, color, live 3D cursor (throttled to 20 Hz), and
  the current selection, which peers render tinted in that player's color.

There is no privileged host. Any player can start a round; when the countdown expires,
the connected client with the lowest awareness id is elected to run scoring, and a
watchdog re-elects if that client disappears mid-judging — a dropped "host" never
strands the round.

Round modifiers, the primitive-add counter, the daily-challenge flag, and the session
gallery all live in the same shared game map, so they are enforced and visible for every
player identically. The timelapse is the one deliberately local piece: each client records
the round as a log of Yjs updates (from the moment *they* joined) and replays it into a
throwaway doc on the reveal screen — no extra network traffic, and late joiners replay
exactly what they saw.

### How scoring works

1. The elected client rebuilds the model into a fresh offscreen Three.js scene (no grid,
   gizmos, or cursors) and renders 512×512 PNGs from six angles: front, right, back,
   left, top, and a three-quarter view.
2. It POSTs `{ prompt, images }` to `POST /score`. On failure the client retries once,
   then shows a friendly error state with a retry button.
3. The server calls the Anthropic Messages API (`claude-opus-4-8` by default, override
   with `SCORING_MODEL`) with all six images and a judging rubric. The response format is
   locked to a JSON schema via structured outputs (`output_config.format`), so the reply
   is guaranteed to parse:

```json
{
  "score": 0-100,
  "recognizable": true,
  "strengths": ["clear cylindrical body", "handle is present and attached"],
  "issues": ["handle is too thick relative to the cup"],
  "one_line_verdict": "That's a mug alright — a mug that skips arm day never."
}
```

The API key is read from `ANTHROPIC_API_KEY` on the server only; it never reaches the
client bundle.

### The daily challenge

The server derives one prompt per UTC day (seeded hash into a curated list) and stores
results in SQLite via Node's built-in `node:sqlite` — no native dependencies. `GET /daily`
returns today's prompt and top-10 leaderboard; `POST /daily/submit` scores the screenshots
server-side (so scores can't be forged), records the team's entry, updates each player's
consecutive-day streak (keyed by a persistent per-browser id), and returns rank +
leaderboard + streaks in one shot. The database lives in `server/data/blend.db`
(configurable via `DATA_DIR`).

## Deployment

WebSockets need a stateful host, so this deploys as **one always-on Node service** that serves
everything, the built client, the scoring API, and the Yjs room sync, on a single port and
origin. That's what makes online multiplayer "just work": friends open the same
`https://your-app/?room=<code>` link (or share the **Invite** button), and their browsers sync
against the server that served the page. No separate client/API URLs to keep in step.

**Render (recommended, config included).** Push the repo to GitHub, then in Render pick
**New + → Blueprint** and point it at the repo — [`render.yaml`](render.yaml) provisions the
service. Set `ANTHROPIC_API_KEY` (a secret in the dashboard). Build is `npm install && npm run
build`; start is `npm start`. Render injects `$PORT` (the server reads it) and terminates TLS,
so sync is upgraded to `wss://` automatically. Any host that runs a long-lived Node 22+ process
(Railway, Fly, a VPS) works the same way with those two commands.

- The build order matters: root `npm run build` builds the server then the client, so
  `client/dist/` exists for the server to serve at boot.
- Optionally override `SCORING_MODEL`. `$PORT` defaults to 4000 if unset.

**Hosting the client separately (optional).** If you'd rather put the static bundle on a CDN
(Netlify, Vercel, Cloudflare Pages) and run only the API/sync as the Node service, build the
client with `VITE_SERVER_URL=https://your-server.example.com` — an explicit `VITE_SERVER_URL`
always overrides the same-origin default.

Room documents are held in server memory (rooms are ephemeral party lobbies); restarting
the server clears in-progress models. On Render's free tier the process also sleeps after
inactivity and cold-starts on the next visit.

## Phase status

- ✅ Phase 0 — single-player mesh editor (primitives, vertex/edge/face selection, move
  gizmo, extrude, subdivide, delete, undo/redo)
- ✅ Phase 1 — game loop (prompt, countdown, 6-angle capture, AI scoring, reveal, error
  handling with retry)
- ✅ Phase 2 — multiplayer (room links, live mesh sync, colored cursors + selections,
  synchronized rounds, reconnect handling)
- ✅ Phase 3 — onboarding (interactive tutorial gated on real actions, scored practice
  lessons)
- ✅ Phase 4 — daily challenge with global leaderboard + per-player streaks (SQLite),
  run modifiers (no undo, primitive budget), timelapse replay, session gallery
