# AI DJ Mode — `server/dj.js`

A self-contained "source" that plays Spotify tracks from the user's own
library with a locally-generated (Ollama) + locally-synthesized (Piper TTS)
voice announcer between tracks, like a radio DJ. Spotify-only (explicit
product direction — not local/Qobuz/Tidal). The whole feature lives in this
one file: one import + one `app.use()` in `server/index.js`, and `'DJ_STATE'`
in event-service.js's PASSTHROUGH set. Deleting those three touchpoints
removes the feature completely.

Client: mood-picker cards on the kiosk and both remotes (phone + tablet) —
see git history for the matching frontend commits. Voice control (a
different feature, browser Web Speech API, no relation to DJ's own AI) is
covered separately in [voice-control.md](voice-control.md).

## Prerequisites — NOT installed by `install.sh`

Ollama, Piper, and ffmpeg are manually installed prerequisites on top of a
normal install — DJ mode simply won't start (Ollama fetch fails / Piper spawn
fails) on a box that doesn't have them. Verified live on the real Pi 4
(2026-08-02):

| Component | Version | Notes |
|---|---|---|
| Ollama | 0.32.5 | Installed via the official `curl -fsSL https://ollama.com/install.sh \| sh`, which registers its own systemd service (`ollama.service`, boot-enabled) — this is the ONE piece of the stack that runs as a persistent daemon; Piper/ffmpeg are just binaries invoked per-call |
| Model | `qwen2.5:1.5b` (Q4, ~986 MB) | Hardcoded in `OLLAMA_MODEL` — this is the only model DJ mode actually calls. `ollama list` may show other pulled models (e.g. an unused `llama3.2:1b-instruct-q4_K_M` from earlier experimentation) — safe to `ollama rm` anything that isn't `qwen2.5:1.5b` |
| Piper | binary at `/opt/piper-tts/piper/piper` | espeak-ng data at `/opt/piper-tts/piper/espeak-ng-data` |
| Piper voices | `/opt/piper-tts/piper/voices/*.onnx` | Only `en_US-ryan-high.onnx` and `pt_PT-tugao-medium.onnx` are referenced by `VOICES` — `en_US-lessac-medium.onnx` present on disk is a leftover from before the 2026-08-01 voice change, safe to delete |
| ffmpeg | 6.1.1 (Ubuntu) | Used only to resample/boost/limit the announcement clip — see Audio path below |

**Live-benchmarked hardware reality (Pi 4, 4GB, 2026-07-31)**: qwen2.5:1.5b
generates a ~15-word line in ~10-12s once warm, ~44s cold. Piper (`-high`
voice tier) adds ~3s load + roughly real-time synthesis. This is the entire
reason the architecture below never generates synchronously between tracks.

## Architecture — never block music on the AI

The one rule everything else follows (AUDIT-2026-08-01): **the music must
never wait on Ollama/Piper.** The next segment is always generated in the
background while the CURRENT track plays (minutes of runway vs ~20s of
worst-case generation), and `runLoop()` only ever plays an announcement that
finished generating in time AND matches the exact track about to play
(`forTrack.uri`). If it isn't ready, that track just plays with no intro —
there is no code path that blocks playback waiting on the LLM or TTS.

Track handoff also fires **~8s before** the current track actually ends
(`waitForSpotifyTrackEnd`'s `HANDOFF_LEAD_MS`), not after Spotify reports it
over — eliminates poll-detection lag and means Spotify's own end-of-track
autoplay never gets a window to run (paired with `LIBRESPOT_AUTOPLAY=off` in
`spotify-daemon.js`).

### Announcement cadence: per block, not per song

Only prepared at a block boundary (the "check-in" line, using the block's
last song as material) or right after a mood pivot — NOT before every
individual track. A manual skip is indistinguishable from a natural
track-end here, so per-song announcing meant skipping through songs
re-triggered a fresh line every time. `SONGS_PER_SET = 5`.

### Ollama call — `generateLine()`

`POST http://127.0.0.1:11434/api/generate`, `stream: false`,
`keep_alive: '15m'` (keeps the model warm between calls within one session —
`stop()` explicitly overrides this with `keep_alive: 0`, Ollama's documented
way to unload immediately, since there's no separate unload endpoint).
`options: { num_predict: 50, num_ctx: 512, temperature: 0.95 }`.

System prompt enforces persona + format (no prefixes, no markdown/emoji, max
15 words, vary the opening). **Prompt-following alone isn't reliable on a
model this small** — live testing showed qwen2.5:1.5b using quote marks
despite explicit instructions not to — so `sanitizeSpokenLine()` is the real
enforcement layer: strips emoji/markdown/quotes/prefixes, hard-truncates to
`maxWords` (18), guarantees terminal punctuation. Treat the prompt as a
steering hint, not a contract; treat the sanitizer as the actual safety net
when changing either.

Three prompt shapes selected by context: normal (track/artist/type/
popularity/era/energy/focus), check-in (block just ended), pivot (mood
button just pressed — "you're changing the vibe live right now").

`{era_context}` (`eraContextFor()`) and `{popularity}`/`{album_type}` come
straight from Spotify's own track/album API fields — no heuristic, unlike an
earlier local-library version of this feature.

### Piper synthesis — `synthesizeRaw()` / `synthesize()`

`piper --model <voice> --output_file <tmp>.raw.wav --espeak_data <dir>
--length_scale 1.2`, text piped via stdin. `--length_scale` is a
phoneme-duration multiplier (1.0 = native pace); 1.2 was tuned live after
being reported as talking too fast.

**Piper's voice models output 22050Hz mono** — live-tested playing that
straight into the shared PipeWire graph (which runs 44.1/48kHz stereo)
triggered a `snd_pcm_hw_params_set_rate: Invalid argument` crash loop in
CamillaDSP. Piper has no built-in resample flag, so ffmpeg immediately
upsamples to 48000Hz stereo (`CLIP_RATE`) — this is why ffmpeg is a hard
dependency, not just a nice-to-have.

### Audio ducking — `duckThroughCut()`, the hard constraint

CamillaDSP's `SetVolume` is a single master gain applied to the
already-mixed signal — by the time it sees anything, the announcement clip
and the Spotify track have already summed at the shared ALSA loopback
(librespot writes straight to `camilla_input` dmix; the clip reaches the
same loopback via `pw-play --target ResonanceInput` → PipeWire loopback
module). **There is no way to duck "just the music" at that stage.**

Spotify's own per-device volume was tried and ruled out: `PUT
/me/player/volume` against the real device returns 200 and echoes the new
value back, but librespot never actually applies it and never fires a
`volume_set` onevent (confirmed live via `journalctl` — nothing, even after
5+ seconds). It simply doesn't reach the device for API-driven changes.

The only combination that works: duck the shared master by `DUCK_DB = 14`
dB (≈ reduces linear amplitude to ~20%) for the duration of the cut +
announcement, then fade back up in 6 steps over ~700ms — AND pre-boost the
announcement clip's own gain by the same 14dB during `synthesize()`'s ffmpeg
pass (`volume=14dB,alimiter=limit=0.97:level=disabled` — the limiter exists
specifically because a flat +14dB boost with no ceiling would clip audibly;
`level=disabled` stops alimiter's own auto-gain from fighting the boost).
Once played back through the ducked master, the clip lands near its original
loudness while the music (never independently boosted) is genuinely quieter
underneath it.

**Every track handoff ducks now, not just announced ones** (2026-08-02) —
Spotify's Web API has no crossfade primitive, it can only replace what's
playing instantly, so even a plain cut briefly ducks/holds/fades rather than
switching at full volume (requested live: "we don't add breaks between
songs, Spotify DJ is like this, they mix the end and start like radio").

### Voice audio path

Piper's WAV plays via `pw-play --target ResonanceInput` — the same PipeWire
virtual sink every other source (MPD/Spotify/AirPlay/Bluetooth) converges on
(see install.sh) — no asound.conf/camilladsp.yml/PipeWire config changes
needed. `resonance-api`'s systemd unit doesn't set `PIPEWIRE_REMOTE`/
`XDG_RUNTIME_DIR` (only the audio daemons' own units do), so `dj.js` sets
`PW_ENV` explicitly per `pw-play` call (`PW_UID = 1000`, matching install.sh's
`$TARGET_UID` assumption).

### Device targeting — avoiding the "phone steals state" trap

`/me/player` reports the account's ACTIVE device, which is not necessarily
the Pi's — with the Spotify app open on a phone, it returns the phone's
state instead. This previously caused two bugs: rebroadcasting the phone's
(usually paused, unrelated) state to every screen, and reading
`is_playing:false` from the phone as "track ended," skipping through an
entire block in seconds. Fixed by tracking `state.deviceId` explicitly
(`ensureSpotifyDevice()`) and ignoring any poll response that isn't that
exact device (`isOurDevice` check in `waitForSpotifyTrackEnd`) — no "unknown
device is fine" fallback, since that's exactly what let the phone back in.

`start()` also stops MPD unconditionally (`mpc stop`) before claiming the
source, regardless of what the previously-tracked source was — a stale
`cachedSourceState` (e.g. right after a `resonance-api` restart) would
otherwise skip the normal source-switch teardown and leave MPD's stream
mixed into the shared PipeWire input alongside DJ's Spotify audio (reported
live as "DJ is passing radio").

## Mood system

`POST /api/dj/mood { mood }` — `mood` ∈ `hype | chill | casual | dramatic |
playful`, or `null`/omitted to clear back to a random per-line energy roll.
Pinning a mood while a session is active also **pivots immediately**: cuts
the current track, discards whatever was queued/pre-generated for the old
lineup (bumps `state.generation` so any in-flight background `prepare()` for
the stale lineup is discarded on resolve instead of clobbering the fresh
one), and draws a fresh block avoiding anything already played this session
(`pickTracks()` prefers unplayed tracks, falls back to the full pool once
everything's been heard).

## Routes

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/dj/start` | Start a session — builds the track pool (Liked Songs + medium-term Top Tracks, deduped), claims the librespot device, sets `active_source = dj` |
| `POST` | `/api/dj/stop` | Stop, pause Spotify, unload the Ollama model (`keep_alive: 0`), clean up any orphaned clip |
| `POST` | `/api/dj/mood` | `{ mood }` — pin/clear the announcer's energy; pivots immediately if a session is active |
| `GET` | `/api/dj/status` | `{ active, upNext, mood, moods, queue }` — `queue` is shaped like Spotify's own queue response so the remote's existing "Up Next" UI works unmodified while `source === 'dj'` (DJ never touches the real `/me/player/queue`, so that endpoint reads permanently empty during a session) |

## Known gaps / gotchas

- **`source` staying `'dj'` after a client-side stop**: `handlePlayPause`'s
  DJ-stop branch (Kiosk.jsx / RemoteControl.jsx) calls `api.stopDjMode()`
  (correctly stops the real session) but then only does local
  `setSource('spotify')` — it never emits `SET_SOURCE` to the server, so
  `cachedSourceState.source` can be observed stuck at `'dj'` via
  `/api/status` even though `/api/dj/status` correctly shows
  `active:false`. Not yet fixed as of 2026-08-02 — needs a real
  `emit('SET_SOURCE', ...)` call alongside the stop.
- Orphaned clip files (`dj-line-*.wav` in the OS tmpdir) are unlinked
  explicitly on every code path that supersedes or discards a prepared
  segment; `cleanupOrphanedClips()` is a sweep run at `start()`/`stop()`
  only to catch `resonance-api` dying mid-session (crash, `systemctl
  restart`, power loss) — it's scoped tightly to this module's own filename
  prefix.
- Single active session, single Spotify device — no concurrent multi-user
  DJ sessions, by design (single-zone appliance).
