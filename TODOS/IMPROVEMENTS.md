# Feature Gap Analysis — vs. Commercial Premium HiFi Streaming Platforms

**Re-audited 2026-07-03** against the current codebase (previous analysis
deleted — several of its items have since shipped and its statuses were
stale). Comparison set: Sonos, Bluesound BluOS, Naim, Cambridge Audio
StreamMagic, Denon HEOS, Yamaha MusicCast, WiiM, Devialet.

## What Resonance already matches or beats (verified in code today)

Core audio: bit-perfect rate-following, CamillaDSP room-correction wizard,
dither/headroom control, Pure Direct, RT-kernel tuning, DSD path, per-source
routing through a single volume master. Sources: Spotify Connect, Tidal,
Qobuz, web radio (search + country browse), local MPD library, AirPlay 2
(shairport-sync 5), UPnP, Bluetooth **in**. Convenience already shipped that
the old analysis listed as missing or didn't credit: synced lyrics (LRCLIB),
listening stats (`/api/player/stats`), play history + smart playlists
(most-played / recently-added), ReplayGain / crossfade / gapless toggles,
sleep timer, DB backup & restore (`/api/system/backup`), storage stats,
factory reset, OTA updates, onboarding wizard, EN/PT i18n, installable PWA
remote with QR/6-digit pairing, HTTPS remote port, universal search across
all five sources.

**Scope decision (2026-07-03):** Resonance is a **single-zone streamer by
design** — one Pi, one room, one output. Multi-room grouping, stereo pairing,
zone UIs, and the Roon ecosystem are deliberately **out of scope** and must
not be re-proposed in future analyses; comparisons below ignore competitors'
multi-room features entirely.

What follows is **only what's still genuinely absent AND in scope**, grouped
by theme. Priority key: **P1** (high value, moderate effort) · **P2**
(nice-to-have / long tail).

---

## 1. Content sources — **P1**

- [ ] **Podcasts** — the search placeholder still promises "Artists, songs,
  podcasts…" (`src/i18n/locales/en.js`, `pt.js`) but no podcast backend
  exists. RSS directory (iTunes/PodcastIndex API) + episode list + resume
  position; MPD already streams episode MP3/AAC the same way it streams
  radio. Self-contained; doesn't touch the audio pipeline.
- [ ] **Audiobooks** — same shape as podcasts with chapter-aware resume;
  Audiobookshelf (self-hosted) is the natural first integration for this
  project's audience.
- [ ] **Deezer** — public API, similar shape to Spotify's; HEOS/BluOS/
  MusicCast all ship it. Straightforward next `server/streaming.js` source.
- [ ] **SoundCloud** — usable public API, fits the existing streaming-source
  pattern.
- [ ] **Amazon Music / YouTube Music** — no stable third-party APIs; would
  need the reverse-engineering approach used for Qobuz. Research spikes, not
  committed work.
- [x] **Radio directory browsing** — SHIPPED 2026-07-03: the remote's Search
  tab empty state shows "Radio — Trending Now" plus genre chips
  (`/api/player/radio-browse` + `/radio-tags`, proxied and cached 5 min).

## 2. Smart-home integration — **P1**

- [x] **Outbound webhooks** — SHIPPED 2026-07-03: one configurable URL
  (Settings → System → Automation Webhook, or `POST /api/system/webhook`)
  receives `{ event, ts, … }` on playing/paused/track-change/source/standby
  transitions (`server/webhooks.js`, deduped against the polling stream).
- [ ] **Home Assistant integration** — the webhook above already covers
  event-driven automations; still open is a documented REST contract + a
  thin HA custom component or MQTT bridge for state/control from HA's side.
- [ ] **Google Cast receiver** — the "Cast" strings in the UI are Spotify
  Connect device switching, not Google Cast. As a *source* into this single
  unit (like AirPlay/UPnP already are), receiver emulation
  (`node-castv2`-style) is possible but heavier and less maintained — long
  tail.
- [x] **Push-to-talk voice in the remote PWA** — SHIPPED 2026-07-03: mic
  button in the remote top bar → full-screen liquid-orb overlay (WebGL2 port
  of the requested CodePen) → Web Speech transcript parsed by
  `src/lib/voiceCommands.js` (EN+PT: transport, volume, mute, sources,
  standby, sleep timer, "play radio X", "play <query>"). Requires the HTTPS
  address (`https://<host>:5001/remote`) and, on iPhone, iOS Dictation
  enabled — the overlay explains both inline. No wake word possible on the
  web platform.

## 3. Personalization & social — **P2**

- [x] **"Like" sync back to the source service** — SHIPPED 2026-07-03 for
  Spotify: the remote's heart mirrors into the real library via
  `PUT/DELETE /me/tracks` (new `user-library-modify` scope — applies on the
  next Spotify re-login). Tidal mirroring still open.
- [x] **Last.fm scrobbling** — SHIPPED 2026-07-03: `server/scrobbler.js`
  with the desktop auth flow (Settings → Account → Last.fm: paste API
  key/secret once, approve on last.fm). Follows official scrobble rules +
  updateNowPlaying; radio/unknown-artist streams excluded.

## 4. Convenience & physical UX — **P1**

- ~~**Wake/alarm scheduling**~~ — SKIPPED by user decision (2026-07-03).
- [x] **Quick-access presets** — SHIPPED 2026-07-03: six numbered slots at
  the top of the remote's Search tab (pin a favorite radio, Spotify
  playlist, local or smart playlist; tap to play, pencil to edit). Stored
  via `GET/PUT/DELETE /api/player/presets[/:n]`.
- ~~**Guest / permission tiers**~~ — SKIPPED by user decision (2026-07-03).
- ~~**IR remote support**~~ — SKIPPED by user decision (2026-07-03).
- [ ] **Bluetooth OUT (headphones)** — WiiM and Sonos (Ace) now do private
  late-night listening to BT headphones. PipeWire can source a `bluez_output`
  sink post-CamillaDSP; needs a UI toggle + pairing flow. New since last
  analysis.
- [ ] **USB drive auto-play** — WiiM/BluOS auto-mount a USB stick and index
  it. udev automount + MPD library path + rescan trigger.
- [ ] **HDMI-ARC / TV input** — hardware-dependent stretch goal (needs a DAC
  hat with HDMI); keep parked.

## 5. Reliability & "big brand" resilience — **P2**

- [x] **Degraded-network indicator** — SHIPPED 2026-07-03: the remote's
  top-bar status pulses amber "Reconnecting…" while the WS retry loop is
  down instead of showing a static "Offline".
- [ ] **NAS share management from the app** — BluOS adds SMB/NFS shares from
  the phone with no SSH. Resonance's library path is fixed at install time
  in `/etc/mpd.conf`; a Settings "Add network share" flow (mount.cifs/autofs
  + MPD rescan) removes the SSH requirement.

---

## Suggested sequencing (updated 2026-07-03)

Shipped in the 2026-07-03 batch: push-to-talk voice with the liquid-orb
animation, radio genre/trending directory, quick-access presets, outbound
webhooks, reconnecting indicator, Spotify like-sync, Last.fm scrobbling.
Skipped by user decision: wake/alarm scheduling, guest permission tiers,
IR remote.

What remains:
1. **P1 medium** — podcasts, Bluetooth OUT (headphones), Home Assistant
   component/MQTT bridge on top of the shipped webhook.
2. **P2 / long tail** — Deezer/SoundCloud, audiobooks, USB auto-play, NAS
   share UI, Cast receiver, Tidal like-sync, HDMI-ARC.
