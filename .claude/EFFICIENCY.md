# Working Efficiently in This Repo

Rules to keep Claude Code sessions on Resonance HiFi / EnzoOS fast and cheap:
avoid redundant exploration, avoid reading more than the task needs, and keep
generated documentation scannable instead of prose-heavy. Read this once per
session (it's imported by `.claude/CLAUDE.md`) instead of re-discovering the
codebase layout from scratch.

## 1. Codebase map — use this instead of exploring blind

Line counts as of the last audit (2026-07-02). Files over ~300 lines should
**never be read in full** for a targeted task — Grep for the symbol/route
first, then `Read` with `offset`/`limit` around the match.

### Backend (`server/`)
| File | Lines | What's in it |
|---|---|---|
| `player.js` | 2219 | **Largest file in the repo.** CamillaDSP config generator, DAC detection, DSD bypass, seek/volume/queue routes, Tidal/Qobuz routes, lyrics, favorites/history routes. Grep for the route path (e.g. `router.post('/seek'`) rather than reading top-to-bottom. |
| `event-service.js` | 682 | Central event bus — `emit()`/`handleEvent()` switch statement is the source of truth for every WS event type (`SET_SOURCE`, `SET_STANDBY`, `BROADCAST_STATE`, etc.) and the standby side-effects (`applyStandby`). |
| `db.js` | 340 | SQLite schema + all query helpers. Small enough to read in full if touching persistence. |
| `metadata.js` | 337 | MusicBrainz/Last.fm/TheAudioDB aggregator — self-contained, rarely needs cross-referencing other files. |
| `spotify-auth.js` | 324 | PKCE OAuth flow + token refresh. |
| `streaming.js` | 290 | Tidal/Qobuz auth + search + stream-URL resolution. |
| `system.js` | 218 | Wi-Fi, storage, backup/restore, factory reset routes. |
| `websocket.js` | 211 | WS upgrade/auth, `broadcast()`, the `arecord` VU-meter monitor. |
| `update.js` | 167 | OTA trigger (`scripts/update.sh` runner), health/log endpoints. |
| `index.js` | 159 | Express app wiring, route mounting, HTTP+HTTPS server setup. |
| `auth.js` | 141 | Bearer-token issue/verify, QR-token store, loopback trust check. |

### Frontend (`src/`)
| File | Lines | What's in it |
|---|---|---|
| `pages/Kiosk.jsx` | 1399 | Kiosk touchscreen controller — second-largest file. Has its own copies of transport/volume/source-switch logic, duplicated (not shared) with `RemoteControl.jsx`. When fixing a control-flow bug, **check both files** — they diverge easily (see `AUDIT_REPORT.md`/`TODO.md` for known divergences). |
| `pages/RemoteControl.jsx` | 677 | Phone remote controller — the other half of every duplicated-logic pair above. |
| `websocket.js` | 362 | Client-side WS handler (`useResonanceWS`) — every `case`-style `if (type === '...')` block here has a matching `broadcast()` call somewhere in `server/event-service.js` or `server/websocket.js`. |
| `api/spotify.js` | 225 | Spotify Web Playback SDK wrapper. |
| `components/kiosk/` | 13 files | Kiosk-only overlays (Settings, System Admin, Universal Search, etc.) |
| `components/remote/` | 17 files | Remote-only screens/tabs (mirrors of the kiosk overlays above, NOT shared components). |
| `i18n/locales/` | `en.js` + `pt.js` | Translation keys — must stay 1:1; a string added to one and not the other is a real bug (see `TODO.md`). |

### Not code — check these before re-deriving known facts
- `TODO.md` — current, actionable audit findings (bugs/security/deploy), kept up to date as of 2026-07-02.
- `IMPROVEMENTS.md` — feature-gap analysis vs. commercial HiFi platforms (Sonos/HEOS/BluOS/Roon).
- `AUDIT_REPORT.md` — an **older, partially stale** media-controls audit. Most of its HIGH/MED items are already fixed (see the note at the bottom of `TODO.md`) — don't re-investigate an item from this file without checking whether `TODO.md` already confirmed it fixed.
- `CHANGELOG.md` — what shipped recently; check `[Unreleased]` before assuming a feature doesn't exist yet.
- `docs/ARCHITECTURE.md` — Mermaid diagrams of the audio chain, app data flow, EventService sequence, boot process, CamillaDSP pipeline stages, and Spotify OAuth flow (in Portuguese).

## 2. Reading rules

- **Grep/Glob before Read.** Never open a 1000+ line file to "see what's in
  it" — search for the symbol, route, or component name first.
- **Never shell out to `cat`/`head`/`grep`/`find`** for anything the Read/
  Grep/Glob tools cover — this is already a global rule, repeating it here
  because `server/player.js` and `Kiosk.jsx` are large enough to tempt a
  full-file `cat`.
- **Don't re-read a file you just edited** — a successful `Edit` call means
  the match was found and applied; there's nothing to verify by reading it
  back.
- **Kiosk/Remote parity checks**: because `Kiosk.jsx` and `RemoteControl.jsx`
  duplicate control logic instead of sharing it, a bug-fix task in one
  almost always needs a Grep (not a full Read) of the equivalent handler in
  the other to check whether the same bug exists there.

## 3. Delegating to subagents

- **Single targeted lookup** (one symbol, one route, one component) → Grep
  directly in the main thread. No agent.
- **Cross-cutting search spanning `server/` and `src/`** (e.g. "find every
  place X source is referenced") → spawn an `Explore` agent rather than
  chaining several manual Greps — keeps exploration noise out of the main
  context window.
- **Independent multi-file audits** (e.g. "audit the frontend" + "audit the
  install scripts") → spawn separate agents **in parallel**, each scoped to
  a distinct file set, and have each report back a short findings list
  (under ~700 words) rather than raw file dumps. This is how the 2026-07-02
  audit that produced `TODO.md` was done — reuse that pattern rather than
  reading every file in the main thread.
- Don't spawn an agent for something answerable in 1-2 tool calls — the
  agent's own cold-start context costs more than the lookup.

## 4. Documentation output rules

- New root-level docs (`TODO.md`, `IMPROVEMENTS.md`-style) should be
  **scannable, not prose**: severity/priority tags, `file:line` references,
  one paragraph max per item. A future session re-reading these to avoid
  duplicate work should be able to skim in seconds.
- Prefer **updating an existing doc** (`CHANGELOG.md`, `README.md`, this
  codebase map) over creating a new markdown file — new files fragment
  context that future sessions have to discover and read separately.
- Don't paste full file contents back into chat responses when a
  `file:line` reference plus a one-sentence summary makes the same point.

## 5. Git/GitHub workflow

- Standing rule (see `CLAUDE.md`): always commit + push, never ask for
  confirmation.
- Prefer `git log --oneline` over `git log -p`; only pull full patches when
  patch content itself is needed.
- When checking GitHub state via the `github` MCP tools, pass
  `minimal_output: true` and paginate in small batches (5-10 items) rather
  than fetching everything.
- This repo's audit/feature-doc branch (`claude/project-audit-findings-*`)
  gets merged via PR + squash rather than pushed straight to `main` — once
  a PR from that branch merges, restart it from `origin/main` for the next
  piece of follow-up work instead of stacking on the merged history.

## 6. Scope calibration

- A single bug-fix request → go straight to the implicated file(s) via
  Grep. Skip full-project exploration.
- A "full audit" / "what's missing" request → the parallel-subagent pattern
  in §3 above, synthesized into one scannable doc. Don't re-run a full audit
  that `TODO.md`/`IMPROVEMENTS.md` already cover — check those first and
  only investigate what's genuinely new or unverified.
