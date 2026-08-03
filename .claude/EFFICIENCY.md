# Working Efficiently in This Repo

Rules to keep Claude Code sessions on Resonance HiFi / EnzoOS fast and cheap:
avoid redundant exploration, avoid reading more than the task needs, and keep
generated documentation scannable instead of prose-heavy. Read this once per
session (it's imported by `.claude/CLAUDE.md`) instead of re-discovering the
codebase layout from scratch.

## 1. Codebase map — use this instead of exploring blind

Line counts as of the last audit (2026-08-02). Files over ~300 lines should
**never be read in full** for a targeted task — Grep for the symbol/route
first, then `Read` with `offset`/`limit` around the match.

### Backend (`server/`)
| File | Lines | What's in it |
|---|---|---|
| `player.js` | 2254 | **Largest file in the repo.** DAC detection, signal-path API, DSD bypass, seek/volume/queue routes, library browsing (artists/albums/tracks/folders/search), Tidal/Qobuz routes, lyrics, favorites/history routes. The CamillaDSP config generator itself moved to `camilla-config.js` (below) — don't expect to find `generateCamillaConfig()` here. Grep for the route path (e.g. `router.post('/seek'`) rather than reading top-to-bottom. |
| `camilla-config.js` | 1127 | CamillaDSP YAML config generator (`generateCamillaConfig()`/`updateCamillaConfigFromSettings()`), DAC detection (`detectDac()`), PipeWire/ALSA config writers, EQ band migration + FIR/Conv integration, auto-headroom math. Extracted out of `player.js` as "the one genuinely self-contained subsystem." See `.claude/docs/camilladsp.md`. |
| `event-service.js` | 939 | Central event bus — `emit()`/`handleEvent()` switch statement is the source of truth for every WS event type (`SET_SOURCE`, `SET_STANDBY`, `BROADCAST_STATE`, etc.), standby side-effects (`applyStandby`), EQ band migration (`migrateBands()`), and cross-source volume layering (`getEffectiveVolumeDb()`, Spotify Level Trim). |
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
- **Pick the cheapest model that can do the job.** Usage stats (2026-07)
  show subagent-heavy sessions account for ~95% of this machine's spend,
  so the model each agent runs on matters more than any other single
  choice. Route:
  - Mechanical lookups ("where is X defined/handled/referenced", route or
    event tracing, Kiosk/Remote parity greps) → **`scout`** (project agent,
    `.claude/agents/scout.md`, pinned to Haiku, read-only). It returns
    `file:line` lists, not analysis.
  - Broader sweeps needing judgment about relevance → `Explore` with
    `model: "sonnet"` passed explicitly.
  - Only agents that must write nontrivial code or reason about
    architecture should inherit the main (expensive) model.
- Never re-spawn a fresh agent to continue work an earlier agent already
  has context for — `SendMessage` to the existing agent instead; a new
  spawn re-derives everything from a cold start.

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

## 7. Automated context management

Two hooks in `.claude/hooks/` (wired in `.claude/settings.json`) automate
what used to be manual habits — memory/CLAUDE.md text can't trigger actions,
only hooks can:

- **`session-start-context.cjs`** (`SessionStart` hook) — injects the full
  contents of `.claude/docs/README.md` as additional context at the start
  of every session, so the docs index (§ above, "Reference Docs") is known
  from turn one without an extra `Read` call. It only loads the index, not
  every file under `.claude/docs/` — full doc files are still read on demand
  per §1/§6, matching this file's own "don't read more than the task needs"
  rule.
- **`context-nudge.cjs`** (`Stop` hook) — after each assistant turn, reads
  the newest `usage` record from the transcript tail to get the **real**
  context size (input + cache-read + cache-creation tokens; falls back to
  `bytes / 4` only if no usage record is found — the byte count over-counts
  after `/compact` because the transcript keeps pre-compact turns). From
  ~100k tokens it prints a `systemMessage` suggesting `/compact` (same
  task) or `/clear` (new task), re-nudging every ~40k of further growth.
  It also nudges once a session passes ~6h of age (and every 6h after) to
  catch forgotten loop/background sessions — see §8. State is tracked
  per-session under the OS temp dir. This is the concrete automation behind
  the general rule: **`/compact` mid-task, `/clear` when switching tasks**
  — long sessions cost more even with prompt caching, because every turn
  re-sends the full history and only the unchanged prefix is discounted.
  (The threshold was originally 150k; 2026-07 usage stats showed 91% of
  spend still landed above 150k — the nudge fired only after the expensive
  zone was already reached — hence 100k now.)

Built-in auto-compact (`autoCompactEnabled`, on by default) still handles
hard context-limit compaction on its own; these hooks exist for the softer,
earlier nudge these thresholds don't cover.

## 8. Long-running & loop sessions

Usage stats (2026-07): ~95% of this machine's spend came from sessions
active 8+ hours, almost all of it at >150k context. Duration alone isn't
the cost — every turn of a big-context session re-sends the history — so
these rules are about not letting long sessions *stay* big:

- **`/clear` between independent loop iterations.** If a `/loop` or
  babysit session's iterations don't need each other's history, each one
  should start near-empty. A loop session riding above the ~100k nudge is
  a bug in the loop's design, not a fact of life.
- **Don't poll.** Background Bash tasks and subagents re-invoke the
  session when they finish — a wakeup that just checks on them burns a
  full-context turn for nothing. Schedule wakeups only for external state
  the harness can't track (CI, a deploy, the QEMU VM coming back up), and
  when merely idling pick intervals of 20+ minutes, not minutes.
- **Prefer a scheduled cloud agent (`/schedule`) over keeping a local
  session alive** for genuinely periodic jobs — a cron-style agent starts
  each run with a fresh, small context instead of dragging one 8-hour
  session's history along.
- When an overnight/background session really is needed, start it from
  `/clear` with a one-paragraph brief (goal, constraints, done-criteria)
  rather than handing it a full interactive session's history.
