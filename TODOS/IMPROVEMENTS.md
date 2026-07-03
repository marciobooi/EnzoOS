# Feature Gap Analysis — vs. Commercial Premium HiFi Streaming Platforms

**Re-audited 2026-07-03** against the current codebase (previous analysis
deleted — several of its items have since shipped and its statuses were
stale). Comparison set: Sonos, Bluesound BluOS, Naim, Cambridge Audio
StreamMagic, Denon HEOS, Yamaha MusicCast, WiiM, Devialet, Roon.

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

What follows is **only what's still genuinely absent**, grouped by theme.
Priority key: **P0** (biggest UX gap vs. competitors) · **P1** (high value,
moderate effort) · **P2** (nice-to-have / long tail).

---

## 1. Multi-room / whole-home audio — **P0**

Still the single biggest gap, unchanged. Every mainstream competitor (Sonos,
HEOS, MusicCast, BluOS, Chromecast built-in) is built around grouping units
in perfect sync. Resonance is single-zone: one Pi, one room.

- [ ] **Multi-unit grouping** — two or more Resonance units playing one
  source in sample-accurate sync. Fastest path: Snapcast
  (`snapserver`/`snapclient`) alongside the CamillaDSP output stage; the
  alternative is a custom play-timestamp sync protocol between Node
  backends. Highest effort on this list, highest value.
- [ ] **Stereo pairing** — two units as dedicated L/R of one virtual pair
  (Sonos One/Five, Bluesound Pulse). A fixed-role subset of the same
  clock-sync problem.
- [ ] **Zone-aware volume UI** — once grouping exists: per-room sliders + a
  group master fader in the remote (Sonos room list pattern).
- [ ] **AirPlay 2 multi-room membership** — shairport-sync 5 can be one leg
  of an iOS-orchestrated group *today*; needs a live verification pass and a
  line of user documentation. Cheapest partial win in this section.

## 2. Content sources — **P1**

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
- [ ] **Radio directory browsing** — search + country browse exist
  (`/api/player/radio-search`, country picker); what's missing vs. BluOS/
  WiiM is genre/tag and "trending/most-voted" directory pages —
  radio-browser.info already exposes tag/popularity endpoints, so this is
  mostly frontend.

## 3. Ecosystem & smart-home — **P1**

- [ ] **Roon Bridge endpoint** — the audiophile audience expects any serious
  streamer to appear as a Roon zone. Licensing note (keeps this compatible
  with a free project): the Roon Bridge ARM binary is a *free* download from
  Roon Labs — only the user's Roon Core subscription is paid, exactly like
  Spotify/Tidal accounts today. No "Roon Ready" certification (a paid
  manufacturer program) is needed. Do what DietPi/RoPieee do: an optional
  install.sh step that fetches the binary from Roon's servers (closed-source,
  so never vendored into the repo), output wired into the same
  PipeWire → CamillaDSP chain that AirPlay/BT already feed.
- [ ] **Home Assistant integration** — most of the API already exists
  (`/api/status`, `/api/player/*`); needs a stable documented contract plus
  a thin HA custom component or MQTT bridge. Low effort relative to value.
- [ ] **Outbound webhooks** — fire on play/pause/track-change/standby so
  users can automate without HA. Thin layer over the existing EventService
  broadcast points.
- [ ] **Google Cast receiver** — the "Cast" strings in the UI are Spotify
  Connect device switching, not Google Cast. Receiver emulation
  (`node-castv2`-style) is heavier and less maintained than AirPlay/UPnP —
  keep below Roon in priority.
- [ ] **Voice assistants** (Alexa skill / Google Assistant) — requires a
  cloud skill + account linking; only sensible after multi-room naming
  exists (voice targets zones by name).

## 4. Personalization & social — **P2**

- [ ] **"Like" sync back to the source service** — favoriting writes only to
  the local `favorites` table. Spotify (`PUT /me/tracks`) and Tidal both
  expose save-track endpoints; mirror the heart so it appears in the
  official apps too.
- [ ] **Last.fm scrobbling** — `server/metadata.js` already talks to
  audioscrobbler for metadata; submitting the user's own listens is a small
  addition on credentials already collected. `play_history` has everything a
  scrobble needs.

## 5. Convenience & physical UX — **P1**

- [ ] **Wake/alarm scheduling** — sleep timer exists; "play [station] at
  07:00" does not, and it's a headline feature on every consumer streamer.
  Cron-like scheduler persisted in SQLite calling the existing play/wake
  code paths.
- [ ] **Quick-access presets** — numbered slots (radio station, playlist,
  album) recallable in one tap, like hardware preset buttons on
  Sonos/Bluesound/WiiM. Nearly free: `favorites` table + a thin "pin to
  slot 1–6" UI + `/api/player/preset/:n`.
- [ ] **Guest / permission tiers** — every paired remote gets full control
  including DSP, reboot and factory reset. Tag tokens with a role
  (admin/guest) in `server/auth.js` and gate system/DSP routes on it;
  guests keep playback + volume.
- [ ] **IR remote support** — standard on Naim/Cambridge/Yamaha. Pi GPIO +
  `ir-keytable` decoding to the existing `/api/player/*` routes;
  self-contained daemon, no audio-pipeline changes.
- [ ] **Bluetooth OUT (headphones)** — WiiM and Sonos (Ace) now do private
  late-night listening to BT headphones. PipeWire can source a `bluez_output`
  sink post-CamillaDSP; needs a UI toggle + pairing flow. New since last
  analysis.
- [ ] **USB drive auto-play** — WiiM/BluOS auto-mount a USB stick and index
  it. udev automount + MPD library path + rescan trigger.
- [ ] **HDMI-ARC / TV input** — hardware-dependent stretch goal (needs a DAC
  hat with HDMI); keep parked.

## 6. Reliability & "big brand" resilience — **P2**

- [ ] **Degraded-network indicator** — WS auto-reconnect exists
  (`src/websocket.js`), but mid-stream Wi-Fi loss shows silence rather than
  an explicit "reconnecting…" state in kiosk/remote. Surface the existing
  reconnect state in the UI.
- [ ] **NAS share management from the app** — BluOS adds SMB/NFS shares from
  the phone with no SSH. Resonance's library path is fixed at install time
  in `/etc/mpd.conf`; a Settings "Add network share" flow (mount.cifs/autofs
  + MPD rescan) removes the SSH requirement.

---

## Suggested sequencing

1. **P0 — multi-room grouping** (Snapcast for a working v1; stereo pairing
   falls out of the same work).
2. **P1 quick wins** — quick-access presets, Last.fm scrobbling, webhooks +
   Home Assistant contract, radio genre/trending browsing, like-sync: each
   builds on data and routes that already exist.
3. **P1 medium** — podcasts, wake/alarm scheduling, Roon Bridge, guest
   permission tiers, Bluetooth OUT.
4. **P2 / long tail** — Deezer/SoundCloud, audiobooks, USB auto-play, NAS
   share UI, IR remote, Cast receiver, voice assistants, HDMI-ARC.
