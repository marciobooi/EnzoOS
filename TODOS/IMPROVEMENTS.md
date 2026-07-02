# Feature Gap Analysis — vs. Commercial HiFi Streaming Platforms

Resonance already matches or beats most premium streamers (Sonos, Bluesound
BluOS, Naim, Cambridge Audio StreamMagic, Denon HEOS, Yamaha MusicCast, WiiM,
Devialet) on core audio quality: bit-perfect rate-following, real-time DSP
with room correction, DSD native bypass, RT kernel tuning, and hi-res Tidal/
Qobuz. What's missing is mostly the **ecosystem and convenience layer** those
brands built over a decade of consumer feedback. This file lists what's
genuinely absent, grouped by theme, with the brand(s) that popularized each
feature, the user value, and a rough feasibility note against this project's
architecture (single Raspberry Pi, MPD, CamillaDSP, PipeWire, Node/Express +
WebSocket backend, SQLite).

Priority key: **P0** (biggest UX gap vs. competitors, do first) · **P1**
(high value, moderate effort) · **P2** (nice-to-have / long tail).

---

## 1. Multi-room / whole-home audio — **P0**

This is the single biggest gap. Every mainstream competitor (Sonos, HEOS,
MusicCast, BluOS, Google/Chromecast built-in) is built around grouping
multiple units and playing them in perfect sync. Resonance today is
single-zone: one Pi, one room, one output.

- [ ] **Multi-unit grouping** — let two or more Resonance units join a
  "group" and play the same source in sample-accurate sync (party mode /
  whole-home). Needs a shared clock reference between units — either a
  lightweight NTP-like sync protocol between the Node backends (broadcast a
  play-start timestamp + position over the LAN, each unit computes its own
  buffer offset) or leaning on Snapcast (`snapserver`/`snapclient`), which
  already solves multi-room sync over the network and could sit alongside
  CamillaDSP's output stage. This is the highest-effort item on this list
  but also the highest-value one.
- [ ] **Stereo pairing** — two Resonance units configured as dedicated L/R
  channels of one virtual stereo pair (Sonos One/Five, Bluesound Pulse do
  this). Simpler subset of multi-room sync — same clock-sync problem, just
  two fixed roles instead of an open group.
- [ ] **Per-zone independent volume with a group "master" fader** — once
  grouping exists, the remote app needs a zone-aware volume UI (Sonos-style
  room list with per-room sliders + a "all rooms" slider).
- [ ] **AirPlay 2 multi-room** — `shairport-sync` supports being one leg of
  an Apple-orchestrated AirPlay 2 multi-room group; today's single-instance
  setup should already work as a *member* of an iOS-driven group even
  without Resonance's own sync layer — verify this actually works and
  document it, since it's a "free" partial win.

## 2. Additional content sources — **P1**

- [ ] **Podcasts** — the search placeholder copy already says "Artists,
  songs, podcasts…" (`src/i18n/locales/en.js:282`) but there is no podcast
  backend at all. Add an RSS-based podcast directory + player (episode list,
  playback position resume, download-ahead for offline listening) — this is
  a self-contained feature that doesn't touch the audio pipeline (MPD can
  already stream episode MP3/AAC URLs the same way it streams web radio).
- [ ] **Audiobooks** — same shape as podcasts (chapter-aware resume
  position instead of episode list); Audible/Libro.fm/Storytel don't have
  open APIs, but self-hosted libraries (Audiobookshelf) do and are a natural
  fit for a self-hosted platform's audience.
- [ ] **Deezer / Amazon Music Unlimited / YouTube Music** — HEOS, BluOS and
  MusicCast all support Deezer and Amazon Music natively; Resonance
  currently covers Spotify + Tidal + Qobuz. Deezer has a public API similar
  in shape to Spotify's; Amazon Music and YouTube Music don't offer stable
  third-party streaming APIs, so those two are lower-confidence / may
  require the same reverse-engineering approach already used for Qobuz
  ("spoofbuz" technique in `server/streaming.js`) — flag as research spikes,
  not committed work.
- [ ] **SoundCloud** — has a usable public API; straightforward to add
  alongside the existing streaming-source pattern (`server/streaming.js`).
- [ ] **Curated internet-radio directory browsing** — today radio is
  search-only (radio-browser style lookup + favorites). BluOS/HEOS/WiiM ship
  a browsable directory (genre, country, "trending stations") on top of
  search. `radio-browser.info`'s API already supports tag/country/popularity
  browsing — this is mostly a frontend addition on an API that's likely
  already partially wired up.

## 3. Ecosystem & smart-home integration — **P1**

- [ ] **Roon Bridge / Roon Ready endpoint** — a large slice of the
  audiophile audience (this project's target user) runs Roon as their
  library/DSP manager and expects any serious streamer to appear as a Roon
  zone. `RoonBridge` is a redistributable ARM binary from Roon Labs that
  exposes a Pi as a Roon output; wiring it to output into the same
  PipeWire → CamillaDSP → DAC chain that AirPlay/Bluetooth already feed
  would slot in cleanly and is comparatively low-effort for high prestige
  value in this market segment.
- [ ] **Google Cast / Chromecast Audio** — note that the existing "Cast" UI
  strings (`AccountSettings.jsx`, `OutputPatchBay.jsx`) refer to *Spotify
  Connect* device switching, not actual Google Cast — there is no Cast
  receiver today. `mkchromecast`/`node-castv2` style Cast-receiver
  emulation exists but is a heavier, less-maintained integration than
  AirPlay/UPnP; lower priority than Roon.
- [ ] **Voice assistant control** (Alexa Multi-Room Music skill, Google
  Assistant media actions) — competitors let you say "play jazz in the
  living room." Out of reach without a cloud skill/account-linking backend;
  reasonable as a longer-term project once multi-room naming exists (voice
  targets zones by name).
- [ ] **Home Assistant integration** — publish a documented local HTTP/WS
  API (much of it already exists — `/api/status`, `/api/player/*` — it just
  needs a stable public contract + a Home Assistant custom component or
  MQTT bridge) so users can put Resonance in automations ("dim lights when
  Resonance enters standby", "resume last station at 7am"). This is
  low-effort relative to its value since the REST/WS surface already does
  most of the work — it's largely a documentation + thin adapter task.
- [ ] **IFTTT / generic webhooks** — fire an outbound webhook on
  play/pause/track-change/standby so users can wire their own automations
  without needing Home Assistant.

## 4. Personalization, discovery & social — **P2**

- [ ] **Native "like" sync back to the source service** — favoriting a
  track today writes to Resonance's own local `favorites` table
  (`server/db.js`) only. HEOS/BluOS mirror the heart back into the actual
  Spotify/Tidal library so it shows up in the official app too. Spotify and
  Tidal both expose "save track" endpoints; wiring the existing favorite
  button to also call the source API (when authenticated) would make
  favorites portable instead of siloed to this device.
- [ ] **Last.fm scrobbling** — `server/metadata.js` already talks to
  Last.fm for artist/album metadata; it doesn't scrobble the user's actual
  listening history to their Last.fm account. Straightforward addition
  using credentials already being collected for the metadata key.


## 5. Convenience & physical UX — **P1**

- [ ] **Wake/alarm scheduling** — Resonance has a sleep timer
  (`RemoteControl.jsx`) but no "play [source] at 07:00" alarm, which is a
  headline feature on nearly every consumer smart speaker and streamer
  (Sonos, HEOS, Echo). Implementation is a cron-like scheduler in the
  backend (persisted in SQLite) that calls the same play/standby-wake code
  path already used by the REST API.
- [ ] **Quick-access presets** — a small set of numbered "preset" slots
  (favorite radio station, Spotify playlist, or local folder) recallable in
  one tap, the way Sonos/Bluesound/older hardware "preset buttons" work.
  This is almost free to build: the `favorites` table already exists, this
  is a thin "pin to preset slot 1-6" UI layer plus a `/api/player/preset/:n`
  route.
- [ ] **Guest / permission tiers for remote clients** — every device that
  redeems a QR token today gets full control (playback, DSP, system,
  factory reset, reboot). HEOS/Sonos distinguish household "admin" from
  "guest" access (guests get playback + volume only). Given the existing
  bearer-token design (`server/auth.js`), this is a moderate addition: tag
  issued tokens with a role, and gate the system/DSP-changing routes behind
  an "admin" role instead of "any valid token."
- [ ] **IR remote support** — a physical remote is standard on Naim, Cambridge,
  and Yamaha streamers for volume/transport without unlocking a phone.
  Raspberry Pi's GPIO + `lirc`/`ir-keytable` can decode a cheap IR receiver
  and forward to the same `/api/player/*` routes the touchscreen uses —
  self-contained hardware + a small daemon, no changes to the core audio
  pipeline.
- [ ] **HDMI-ARC / TV audio input** — Bluesound Powernode and Sonos Arc/Beam
  double as TV sound systems. Only relevant if/when Resonance targets DACs
  with HDMI input hardware — flag as a hardware-dependent stretch goal
  rather than a near-term software task.

## 6. Reliability & resilience users expect from "big brand" gear — **P2**

- [ ] **Offline/degraded-network indicators** — when Wi-Fi drops
  mid-stream, commercial apps show a clear "reconnecting…" state rather than
  silence; worth an explicit connection-health indicator in the kiosk/remote
  UI tied to the existing WS reconnect logic.
- [ ] **Network share / NAS browsing from the app** — BluOS lets you add an
  SMB/NFS share from the phone app with no SSH required. Resonance's local
  library depends on whatever path is configured in `/etc/mpd.conf` at
  install time; a Settings-panel "Add network share" flow (mount via
  `mount.cifs`/`autofs`, trigger an MPD library rescan) would remove the
  current SSH requirement for anyone who isn't playing off the SD card
  itself.


---

## Suggested sequencing

1. **P0 — Multi-room grouping** (biggest single UX gap vs. every mainstream
   competitor; consider Snapcast as the fastest path to a working v1).
2. **P1 quick wins** — quick-access presets, Last.fm scrobbling, Home
   Assistant/webhook API, curated radio directory browsing: all build on
   data/infrastructure that already exists (`favorites`, `play_history`,
   metadata keys, REST API) and are individually small.
3. **P1 medium effort** — Roon Bridge integration, guest permission tiers,
   podcasts, wake/alarm scheduling.
4. **P2 / longer tail** — additional streaming services (Deezer/SoundCloud/
   Amazon/YouTube Music), IR remote, NAS share UI, voice assistants,
   Shazam-style radio ID, stereo pairing, HDMI-ARC.
