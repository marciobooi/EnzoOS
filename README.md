# Resonance HiFi OS

> Premium HiFi streaming system for Raspberry Pi

Resonance HiFi is an open-source, self-hosted audio streaming platform for Raspberry Pi. It turns any Pi into a high-fidelity network streamer with a built-in kiosk display, real-time DSP, live signal telemetry, and a mobile remote control — no subscription or cloud dependency required.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%204%2F5-red.svg)](https://www.raspberrypi.com/)
[![OS](https://img.shields.io/badge/OS-Ubuntu%2024.04%20ARM64-orange.svg)](https://ubuntu.com/)

---

## Features

### Audio Sources
- **Spotify Connect** — stream from the Spotify app via `raspotify` (librespot), 320 kbps Ogg Vorbis
- **AirPlay 2** — receive from any Apple device via `shairport-sync` 5.0.4 with NQPTP, lossless ALAC
- **UPnP / DLNA** — network renderer via `upmpdcli + MPD`, up to 24-bit/192 kHz
- **Bluetooth A2DP** — wireless audio via PipeWire + BlueALSA, supports LDAC / AAC / aptX
- **Web Radio** — HTTP stream playback via MPD (AAC, MP3, FLAC streams)
- **Local Files** — lossless FLAC / ALAC / WAV / MP3 playback via MPD
- **Tidal** — hi-res streaming up to 24-bit/192 kHz
- **Qobuz** — lossless streaming up to 24-bit/192 kHz

### Audio Quality
- **Bit-perfect playback** — PipeWire `clock.allowed-rates` switches the graph clock to the source's native sample rate (44.1 / 48 / 88.2 / 96 / 176.4 / 192 kHz), eliminating inter-domain resampling. Allowed rates are derived from the detected DAC's actual hardware capabilities — no rate is advertised that the DAC cannot handle
- **Automatic DAC detection** — scans `/proc/asound` at startup to detect the connected DAC's card name, supported formats (S16/S24/S32), and all supported sample rates
- **Rate-following** — persistent MPD idle connection watches for song changes; when the audio format changes, CamillaDSP capture rate is reconfigured automatically via hot-reload with no audio gap
- **Zero-lag volume** — volume applied post-buffer inside CamillaDSP via `SetVolume`, instant response on all sources regardless of buffer depth
- **Pure Direct mode** — bypass all EQ and DSP filters entirely; signal passes through flat (mixer only), with volume control preserved. Selectable from the DSP wizard alongside Manual EQ and Room Correction
- **Auto-headroom** — Custom EQ preset automatically subtracts the largest positive band boost from the pre-amp gain to prevent clipping
- **-1 dB safety headroom** — applied at Stage E (preamp gain) across all built-in and custom pipelines as a guard against multi-stage EQ filter gains summing above 0 dBFS
- **Safe startup sequence** — CamillaDSP is pre-muted to -100 dB before config apply on startup, then volume is restored from the stored value. Prevents the 0 dB (full volume) window that occurs on every CamillaDSP process start

### DSP
- **CamillaDSP 4.1.3** — real-time parametric EQ, biquad filters, crossovers, room correction
- **Hot-reload** — EQ/filter changes apply via WebSocket `SetConfig` with no audio interruption
- **Three audio processing modes** — selected from a single wizard screen:
  - *Manual Equalizer* — parametric EQ with 5 bands, saturation, noise floor, and pre-amp
  - *Acoustic Room Correction* — guided 8-question wizard generates a Harman-curve corrective pipeline
  - *Pure Direct* — flat pipeline, all filters bypassed, volume control only
- **EQ guard** — opening the equalizer while Pure Direct or Room Correction is active shows a blocking overlay explaining the conflict and offering a one-tap switch
- **5 built-in valve presets** — Clinical Reference, Warm Valve, Bass Boost, Vocal Clarity, Hi-Fi Spatial

### Live Signal Telemetry (`GET /api/player/signal-path`)
- **Real-time rate display** — shows actual codec, bit depth, and sample rate from MPD and CamillaDSP
- **Signal path** — live source-to-DAC path string (e.g., `MPD → PipeWire → CamillaDSP → DAC`)
- **CLIP indicator** — pulsing red badge in the player HUD when `CamillaDSP.clippedSamples > 0`
- **dB volume display** — volume popup shows dB value alongside percentage
- **DAC info** — card name, device, format, supported rates, and max rate exposed via API
- **Processing load** — CamillaDSP CPU load percentage available in the signal-path response

### UI & UX
- **Stone warm-greige design system** — single source of truth (`src/styles/stone.js`), applied across all overlays and menus
- **Kiosk display** — React UI optimised for 1480×320 landscape (Waveshare 11.9" HDMI LCD)
- **Dedicated mobile remote** — a phone-first UI (`/remote`) with its own design system (`src/remote.css`, scoped under `.remote-root`) so the kiosk skins never leak into its modals, sliders or sheets. HIG/Material-3 tuned touch targets, safe-area handling and accessible names
- **Installable PWA** — "Add to Home Screen" turns the remote into a full-screen, app-like experience on iOS and Android (web manifest + apple-touch icons; in-app install guide in Settings)
- **Premium album info** — tap the now-playing cover (kiosk or remote) to reveal an aggregated biography, album review, credits (label, catalog, country, tracks), genres, listeners and similar artists (see *Album Metadata* below)
- **Origami logo intro** — pure CSS/HTML kiosk welcome & goodbye animation (`src/components/ResonanceLogo.jsx`, `logo.html`) on the origami paper background — no video file
- **QR code access** — tap the Remote card on the kiosk to display a scannable QR code
- **Source-aware search** — search tab reflects the active source (Spotify search for Spotify, radio scanner for radio)
- **Streaming source menu behaviour** — AirPlay, UPnP, and Bluetooth cards keep the settings menu open on activation (connect-and-wait flow); Spotify, Local, and Radio close it immediately
- **ICY/XML track title sanitiser** — stations that send StreamTitle as raw XML (e.g. Dalet automation systems) are parsed to extract song name and artist before display
- **OTA updates** — `git pull` + PM2 restart, triggered from the kiosk settings menu
- **System health monitor** — live CPU temperature, RAM, and Wi-Fi signal in the settings panel
- **mDNS discovery** — accessible at `resonance.local` on the local network via Avahi

### Security
- **AirPlay — LAN only** — discovery via mDNS/Bonjour (multicast) does not route through NAT; external devices cannot discover or connect
- **UPnP/DLNA — LAN only** — SSDP discovery is multicast and LAN-bound by protocol; invisible outside the local subnet
- **Bluetooth — confirmation pairing** — `bt-agent` uses `DisplayYesNo` capability; connecting device shows a 6-digit code the user must confirm. Silent auto-accept (`NoInputNoOutput`) is disabled
- **On-demand activation** — AirPlay, UPnP, and Bluetooth services are stopped at boot and only started when the user explicitly activates them from the kiosk menu
- **Remote web interface** — HTTPS with username/password login; self-signed certificate; accessible only on the local network

---

## Hardware Requirements

| Component | Requirement |
|-----------|-------------|
| SBC | Raspberry Pi 4 (2 GB+ RAM recommended) or Pi 5 |
| OS | Ubuntu 24.04 LTS ARM64 or Raspberry Pi OS Bookworm |
| Display | Waveshare 11.9" HDMI LCD (1480×320) or any HDMI/DSI panel |
| DAC | USB or I²S DAC (optional; onboard audio works) |
| Network | Wi-Fi or Ethernet |
| Storage | 16 GB+ microSD or USB SSD |

Resonance is also tested in QEMU (x86_64) for development. Audio routes through QEMU's Intel HDA emulated sound device.

---

## Audio Chain

All sources feed into a shared PipeWire graph via a virtual null sink (`ResonanceInput`). PipeWire bridges the output to an ALSA loopback device, where CamillaDSP picks it up for EQ/DSP processing before sending it to the DAC.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Sources                                                                    │
│                                                                             │
│  Spotify (raspotify/librespot) ────────────────────────────────────────┐   │
│  AirPlay 2 (shairport-sync 5.0.4 + NQPTP) ────────────────────────────┤   │
│  UPnP/DLNA (upmpdcli → MPD)   ────────────────────────────────────────┤   │
│  Web Radio / Local Files (MPD) ────────────────────────────────────────┤   │
│  Bluetooth A2DP (bluealsa-aplay) ──────────────────────────────────────┘   │
│                              │                                             │
│                              ▼                                             │
│         PipeWire "ResonanceInput" virtual null sink                        │
│         (clock.allowed-rates derived from detected DAC capabilities        │
│          → PipeWire switches to source native rate for bit-perfect path)   │
│                              │                                             │
│         PipeWire loopback module (51-resonance-loopback.conf)              │
│                              │                                             │
│                              ▼                                             │
│         hw:Loopback,0,0  (ALSA kernel loopback device)                     │
│         pcm.loop_dsnoop  (ALSA dsnoop, hw:Loopback,1,0)                    │
│                              │                                             │
│                              ▼                                             │
│         CamillaDSP 4.1.3   (biquad EQ · room correction · gain)           │
│         ├── Stage A: DSP room correction curve (if calibrated)             │
│         ├── Stage B: 5-band profile EQ (preset or custom)                  │
│         ├── Stage C: room acoustic adjustments                             │
│         ├── Stage D: crossover filters (if subwoofer enabled)              │
│         └── Stage E: preamp gain (with -1 dB safety headroom)             │
│                       SetVolume via WebSocket (instant, all sources)       │
│                              │                                             │
│                              ▼                                             │
│         DAC  (hw:CARD=<detected>,DEV=0 — USB, I²S, or HDMI)               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Bit-perfect path

PipeWire's `clock.allowed-rates` config (`52-resonance-bitperfect.conf`) is generated at server startup from the detected DAC's actual supported rates. When MPD plays a 44.1 kHz FLAC, PipeWire switches its graph clock to 44.1 kHz — no resampling occurs inside PipeWire. The MPD rate watcher detects the format change and hot-reloads CamillaDSP's capture rate to match. The complete chain runs at the source's native rate.

Example for a hi-res I²S DAC (e.g., Sabre ES9038Q2M):
- Detected rates: `[44100, 48000, 88200, 96000, 176400, 192000]`
- Generated: `default.clock.allowed-rates = [ 44100 48000 88200 96000 176400 192000 ]`
- Format: `S32_LE` (full 32-bit resolution)

For the QEMU dev target (Intel HDA):
- Detected rates: `[44100, 48000]`
- Generated: `default.clock.allowed-rates = [ 44100 48000 ]`

### Volume safety

CamillaDSP defaults to 0 dB (full volume) on every process start. To prevent loud transients:

1. **Pre-mute** — server pre-mutes CamillaDSP to -100 dB immediately on startup before applying the pipeline config
2. **Restore** — stored volume is re-applied after every config operation (hot-reload or service restart)
3. **Restart wait** — after `systemctl restart camilladsp`, a 900 ms wait ensures the service is ready before the volume restore WS call
4. **Stage E headroom** — all pipeline configs subtract an additional -1 dB at the final gain stage

---

## Quick Start

### One-line install (on the Pi)

```bash
wget -qO- https://raw.githubusercontent.com/marciobooi/EnzoOS/main/install.sh | sudo bash
```

### Clone and install

```bash
git clone https://github.com/marciobooi/EnzoOS.git
cd EnzoOS
sudo bash install.sh
```

The installer will:

1. Detect your system architecture (aarch64 / x86_64 / armv7)
2. Install Node.js 20, PipeWire, MPD, CamillaDSP 4.1.3, raspotify
3. Build shairport-sync 5.0.4 + NQPTP 1.2.8 from source (AirPlay 2)
4. Build upmpdcli from source via npupnp → libupnpp → upmpdcli (UPnP/DLNA)
5. Configure PipeWire virtual sink, loopback bridge, and bit-perfect clock config
6. Write `/etc/asound.conf` (rate-agnostic loop_dsnoop for bit-perfect chain)
7. Generate a self-signed TLS certificate for HTTPS remote access (port 5001)
8. Build the React frontend (`npm run build`)
9. Register the backend as a PM2 service (`resonance-api`)
10. Configure autologin on TTY1 and launch Chromium in kiosk mode
11. Reboot automatically

**Typical install time:** 15–25 minutes (shairport-sync and upmpdcli builds from source add time).

After reboot the kiosk displays at `http://localhost:5000`. The remote interface is at:

```
https://[pi-ip]:5001/remote
# or
https://resonance.local:5001/remote
```

---

## Architecture

### Frontend — React + Tailwind CSS

Two views share a single React codebase:

| View | URL | Resolution |
|------|-----|------------|
| Kiosk | `http://localhost:5000` | 1480×320 landscape |
| Remote | `https://[pi-ip]:5001/remote` | Responsive mobile |

Built with React 19, Tailwind CSS 4, and Vite 8. State synchronisation between views is handled over WebSockets. All server-side state flows through a central **EventService** (`server/event-service.js`) — REST routes and WebSocket handlers call `emit(type, payload)` rather than mutating state directly.

### Backend — Node.js + Express + WebSocket

```
REST routes          WebSocket handlers      Audio monitor
     │                      │                     │
     └──────────┬───────────┘                     │
                │ emit(type, payload)              │ emit('AUDIO_LEVELS', …)
                ▼                                 ▼
        [ EventService ]  ←────────────────────────
         ├── serial async queue (state-mutating events)
         ├── update cached state
         ├── persist to SQLite
         ├── run side-effects (CamillaDSP, standby, brightness)
         └── broadcast to all WS clients
```

| File | Role |
|------|------|
| `server/index.js` | Express app bootstrap, HTTP/HTTPS servers, WS upgrade routing |
| `server/event-service.js` | Central event bus — state cache, serial queue, DB persistence, broadcast |
| `server/websocket.js` | WS transport — connection handshake, message fan-out, VU meter monitor |
| `server/player.js` | MPD/radio routes, CamillaDSP config gen, DAC detection, signal-path API |
| `server/spotify-auth.js` | Spotify OAuth flow, token refresh with mutex, auto-refresh interval |
| `server/update.js` | OTA update trigger and log streaming |
| `server/system.js` | Service management, reboot/shutdown, health metrics |
| `server/db.js` | SQLite persistence (settings key-value store, favourite radios) |
| `server/status.js` | `GET /api/status` — authoritative full-state snapshot for client hydration |

### DSP — CamillaDSP 4.1.3

CamillaDSP runs as a systemd service, reading from the ALSA loopback (`loop_dsnoop`) and writing to the DAC. Its YAML config (`camilladsp.yml`) is regenerated at startup from stored settings.

| Operation | Mechanism |
|-----------|-----------|
| Volume change | `SetVolume` via WebSocket — instant, applied after all ALSA buffers |
| EQ / filter change | `SetConfig` via WebSocket — hot-reload, no audio gap |
| Rate change (song) | MPD rate watcher detects format → `SetConfig` with new capture rate |
| Service restart fallback | `systemctl restart camilladsp` + 900 ms wait + volume restore |
| Pure Direct mode | `SetConfig` with flat pipeline (mixer only, no filters) |

CamillaDSP WebSocket API is on `ws://localhost:1234`.

### DAC Detection

On every startup, `detectDac()` scans `/proc/asound/card*/stream*` and returns:

```js
{
  device:         "hw:CARD=IQaudIODAC,DEV=0",
  format:         "S32_LE",         // best format the hardware supports
  samplerate:     48000,            // default processing rate
  supportedRates: [44100, 48000, 88200, 96000, 176400, 192000],
  cardName:       "IQaudIO DAC+",
  channels:       2
}
```

`supportedRates` drives PipeWire `clock.allowed-rates` via `updatePipeWireClock()`. The config is written only if it changed from the current `/etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf`, and PipeWire is restarted only if the config changed (startup-time only).

### Signal Path API

`GET /api/player/signal-path` — polled every 5 seconds by the frontend:

```json
{
  "source":  "local",
  "path":    "MPD → PipeWire → CamillaDSP → DAC",
  "camilla": {
    "state":           "Running",
    "clippedSamples":  0,
    "bufferUnderruns": 0,
    "processingLoad":  3.5,
    "captureRmsL":     -14.2,
    "captureRmsR":     -14.8
  },
  "mpd": { "rate": 44100, "bits": 16, "channels": 2 },
  "dac": {
    "name":           "IQaudIO DAC+",
    "device":         "hw:CARD=IQaudIODAC,DEV=0",
    "format":         "S32_LE",
    "supportedRates": [44100, 48000, 88200, 96000, 176400, 192000],
    "maxRate":        192000
  }
}
```

### Database — SQLite

`server/resonance.db` persists:

- User settings (theme, EQ bands, volume, active source, pure direct mode)
- Favourite radio stations
- Acoustic calibration profile
- Remote access settings
- Aggregated album metadata cache (`metadata_cache`, 30-day TTL — see *Album Metadata*)

---

## API Reference

### Player

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/player/signal-path` | Live signal chain telemetry — rate, path, DAC info, CamillaDSP metrics |
| `POST` | `/api/player/volume` | Set volume (0–100) via CamillaDSP SetVolume |
| `POST` | `/api/player/pure-direct` | Toggle Pure Direct mode `{ enabled: bool }` |
| `POST` | `/api/player/play` | Start/resume MPD playback |
| `POST` | `/api/player/pause` | Pause MPD |
| `POST` | `/api/player/next` / `previous` | Skip tracks |
| `POST` | `/api/player/seek` | Seek to position |
| `POST` | `/api/player/play-radio` | Play a web radio stream `{ url, name, favicon }` |
| `GET` | `/api/player/radios` | List favourite radio stations |
| `POST` | `/api/player/dsp-calibration` | Save calibration answers and regenerate CamillaDSP config |
| `POST` | `/api/player/airplay/start` | Start shairport-sync |
| `POST` | `/api/player/upnp/start` | Start upmpdcli |
| `POST` | `/api/player/bluetooth/start` | Start BlueALSA |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Full system snapshot — source, playback, EQ, theme, volume |
| `GET` | `/api/system/health` | CPU temp, RAM, Wi-Fi signal |
| `POST` | `/api/system/reboot` | Reboot the Pi |
| `POST` | `/api/update` | Trigger OTA update |

### Metadata

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metadata/album?artist=&album=` | Aggregated album/artist metadata (bio, review, tracklist, credits, artwork, band facts). SQLite-cached 30 days; called on demand when the cover is tapped |
| `GET` | `/api/metadata/keys` | Current configured metadata keys (for the Settings form to pre-fill) |
| `POST` | `/api/metadata/keys` | Save Last.fm / TheAudioDB / Discogs keys to the database `{ lastfm, theaudiodb, discogs }` |

---

## Album Metadata

Tapping the now-playing cover (kiosk or remote) opens a deep-metadata panel. A
backend **hybrid meta-engine** (`server/metadata.js`) merges several
royalty-free, community-driven sources into one object with `Promise.allSettled`
(any source failing never breaks the response) and caches the result in SQLite
so each album hits the network only once.

### Sources

| Source | Key required | Provides |
|--------|--------------|----------|
| **MusicBrainz** | none | Label, catalog #, country, release date, original date, album type (Album / EP / Live / Compilation), media format (CD / Vinyl / Digital), disc count, track count, genres — via `musicbrainz-api` (official client, handles 429/503 retries, serialised to honour the strict 1 req/sec policy) |
| **Cover Art Archive** | none | High-res album front cover (keyed by MusicBrainz release ID) |
| **Last.fm** | `LASTFM_API_KEY` (free) | Artist biography, album summary, tags, listener count, play count, on-tour status, similar artists, full **tracklist with durations** |
| **TheAudioDB** | `THEAUDIODB_KEY` (defaults to free dev key `2`) | Artist biography & portrait, album review, album artwork, artist fanart / banner / logo, band origin, formed year, member count, official website, album score (/10), release format, style, mood |

### Fields returned (`GET /api/metadata/album`)

| Field | Type | Source |
|-------|------|--------|
| `title` | string | MusicBrainz |
| `releaseDate` | string | MusicBrainz → TheAudioDB |
| `originalDate` | string | MusicBrainz (first-ever release) |
| `albumType` | string | MusicBrainz (`Album`, `EP`, `Live`, `Compilation`, …) |
| `format` | string | MusicBrainz (`CD`, `12" Vinyl`, `Digital Media`, …) |
| `label` | string | MusicBrainz → TheAudioDB |
| `catalog` | string | MusicBrainz |
| `country` | string | MusicBrainz |
| `barcode` | string | MusicBrainz |
| `discCount` | number | MusicBrainz |
| `trackCount` | number | MusicBrainz |
| `tracks` | `{name, duration}[]` | Last.fm (duration in seconds) |
| `genres` | string[] | MusicBrainz → Last.fm tags → TheAudioDB |
| `biography` | string | TheAudioDB → Last.fm |
| `review` | string | TheAudioDB → Last.fm album summary |
| `listeners` | number | Last.fm |
| `playcount` | number | Last.fm |
| `onTour` | boolean | Last.fm |
| `similar` | string[] | Last.fm |
| `rating` | number | TheAudioDB (/10) |
| `coverArt` | URL | Cover Art Archive (high-res, 500 px) |
| `albumImage` | URL | TheAudioDB album thumbnail |
| `artistImage` | URL | TheAudioDB artist portrait |
| `artistBanner` | URL | TheAudioDB artist banner |
| `artistFanart` | URL | TheAudioDB artist fanart (hero background) |
| `artistLogo` | URL | TheAudioDB transparent artist logo |
| `origin` | string | TheAudioDB (country the band is from) |
| `formedYear` | number | TheAudioDB |
| `members` | number | TheAudioDB |
| `website` | string | TheAudioDB |
| `style` | string | TheAudioDB |
| `mood` | string | TheAudioDB |
| `mbid` | string | MusicBrainz release ID |
| `sources` | string[] | Which providers contributed data |
| `cached` | boolean | Whether the response came from SQLite cache |
| `lastfmConfigured` | boolean | Whether a Last.fm key is active |

### What each view shows

| Panel | Kiosk overlay | Remote sheet |
|-------|---------------|--------------|
| Cover art | Cover Art Archive → TheAudioDB → local thumbnail | Same, with `SmartImg` fallback chain |
| Album title, year, type | ✓ | ✓ |
| Genres | Pill chips (up to 4) | Pill chips (all) |
| Artist biography | ✓ | ✓ (with artist portrait, formed year, origin, member count, On Tour badge, website link) |
| Album review | ✓ | ✓ |
| Tracklist | ✓ (numbered, with duration) | ✓ (numbered, with duration) |
| Similar artists | Chips | Chips |
| Facts (label, country, tracks, …) | Credits column | 2-column facts grid |
| Fanart hero | — | Full-width background with gradient fade |
| Star rating | — | Inline badge |

### Keys

All keys are optional — with none set you still get MusicBrainz credits,
Cover Art Archive covers, and TheAudioDB bios/reviews (free dev key `2`).

Keys can be set in two ways:
1. **`.env` file** — `LASTFM_API_KEY`, `THEAUDIODB_KEY`, `DISCOGS_TOKEN`
2. **In-app** — remote Settings → **Album Info** → Metadata Keys (stored in SQLite, takes precedence over env; fields are masked with an eye-toggle)

Results are cached in the `metadata_cache` SQLite table for **30 days**.

> The "Powered by …" attribution in the panel is required by the Last.fm API terms.

---

## Audio Processing Modes

All three modes are selected from the first screen of the **Acoustic Calibration Wizard** (Settings → Acoustic card). Switching mode hot-reloads CamillaDSP with no audio gap.

| Mode | Pipeline | EQ controls |
|------|----------|-------------|
| Manual Equalizer | Full filter chain: profile EQ → saturation → preamp | Active |
| Acoustic Room Correction | DSP Harman curve + room filters → profile EQ → preamp | Bypassed |
| Pure Direct | Mixer only | Bypassed |

```
Pure Direct path:  Source → PipeWire → CamillaDSP (mixer + SetVolume) → DAC
```

**EQ guard:** opening the equalizer while Pure Direct or Room Correction is active shows a blocking overlay. It explains what is active and offers a one-tap switch to Manual EQ — preventing edits to settings that would have no audible effect.

---

## Remote Access

### Connecting from a phone or tablet

1. On the kiosk, tap the settings button to open the Source Menu
2. Tap the **Remote** card — a QR code and URL are displayed
3. Scan the QR code or navigate to:

```
https://resonance.local:5001/remote
```

4. Accept the self-signed certificate warning (one-time, per browser)
5. Log in with username `enzo` / password `enzoOS`

### Install as an app (PWA)

The remote can be added to the home screen for a full-screen, app-like
experience. **Settings → Remote App → Add to Home Screen** shows a
platform-aware guide:

- **iOS / iPadOS** — in **Safari**, tap *Share* → *Add to Home Screen*
- **Android / Chrome** — a one-tap **Install** button (or *⋮ menu → Install app*)

Tapping the now-playing cover inside the remote opens the [album metadata](#album-metadata) panel.

---

## Configuration

| Setting | How to access |
|---------|--------------|
| Source selection | Settings button → source cards |
| Volume | Drag slider on kiosk or remote; dB value shown in popup |
| Parametric EQ | Tap the VU meter display |
| Audio processing mode | Settings → **Acoustic** → Calibration Wizard → first screen |
| Pure Direct | Calibration Wizard → **Pure Direct** option |
| Theme | Settings → **Theme** card |
| Remote access | Settings → **Remote** card |
| OTA update | Settings → **Update** card |

### Spotify credentials

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URIs:
   ```
   http://127.0.0.1:5000/auth/spotify/callback
   https://resonance.local:5001/auth/spotify/callback
   ```
3. Edit `/home/pi/EnzoOS/.env`:
   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```
4. `pm2 restart resonance-api`

---

## Supported Audio Sources

| Source | Protocol / Service | Max Quality |
|--------|--------------------|-------------|
| Spotify | Spotify Connect (raspotify / librespot) | 320 kbps Ogg Vorbis |
| Apple devices | AirPlay 2 (shairport-sync 5.0.4 + NQPTP) | Lossless ALAC |
| DLNA apps | UPnP/DLNA (upmpdcli + MPD) | 24-bit / 192 kHz |
| Bluetooth | A2DP via PipeWire + BlueALSA | LDAC / AAC / aptX |
| Web Radio | HTTP streams (MPD) | AAC / MP3 / FLAC |
| Local files | FLAC / ALAC / WAV / MP3 (MPD) | Lossless |
| Tidal | Tidal streaming API | 24-bit / 192 kHz |
| Qobuz | Qobuz streaming API | 24-bit / 192 kHz |

Streaming sources (AirPlay, UPnP, Bluetooth) are activated on demand — they do not run at boot unless selected.

---

## Systemd Services

| Service | Description | Start policy |
|---------|-------------|--------------|
| `camilladsp` | CamillaDSP 4.1.3 audio processor | Boot (always) |
| `nqptp` | AirPlay 2 timing daemon (required by shairport-sync) | Boot (always) |
| `mpd` | Music Player Daemon | Boot (always) |
| `raspotify` | Spotify Connect (librespot) | Boot (always) |
| `shairport-sync` | AirPlay 2 receiver (5.0.4, built from source) | On demand |
| `upmpdcli` | UPnP/DLNA renderer (built from source) | On demand |
| `bluealsa` / `bluealsa-aplay` | Bluetooth A2DP bridge | On demand |
| `bt-agent` | Bluetooth auto-pair agent | Boot |
| `resonance-api` (PM2) | Node.js backend | Boot (PM2 startup) |

---

## Development

### Local setup

```bash
git clone https://github.com/marciobooi/EnzoOS.git
cd EnzoOS
npm install
```

```bash
# Terminal 1 — Vite frontend (hot reload)
npm run dev

# Terminal 2 — Express backend
npm run server
```

Or both together: `npm run dev:all`

The frontend proxies API calls to the backend. ALSA/MPD/CamillaDSP calls fail on non-Linux but the UI renders fully.

### Deploying to the Pi

```bash
cd /home/pi/EnzoOS
git pull origin main
npm run build
pm2 restart resonance-api
```

### SSH access

```
Host:     resonance.local   (or Pi IP)
User:     pi
Password: 1234   ← change in production
```

### Environment variables

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
PORT=5000
HTTPS_PORT=5001

# Album metadata (all optional — tap the now-playing cover)
LASTFM_API_KEY=            # free key → artist bios, similar artists
THEAUDIODB_KEY=2           # free dev key; set a Patreon key for production volume
```

### Key files

| File | Purpose |
|------|---------|
| `server/player.js` | CamillaDSP config gen, DAC detection, signal-path API, volume, MPD/radio routes |
| `server/websocket.js` | WebSocket hub, VU meter monitor, standby management |
| `server/event-service.js` | Central event bus, state cache, serial queue, safe startup sequence |
| `server/metadata.js` | Album metadata aggregator (MusicBrainz + Last.fm + TheAudioDB), SQLite-cached |
| `server/db.js` | SQLite helpers (settings, favourites, metadata cache) |
| `server/index.js` | Express entry point, Spotify OAuth, HTTPS setup |
| `server/status.js` | Full status snapshot endpoint |
| `src/remote.css` | Dedicated mobile-remote design system (scoped under `.remote-root`) |
| `src/components/ResonanceLogo.jsx` | Pure CSS/HTML origami logo intro + static wordmark (kiosk welcome/goodbye) |
| `scripts/kiosk-power.sh` | Display standby: `vcgencmd` on Pi, `xset dpms` on QEMU |
| `install.sh` | Master installer — packages, PipeWire, CamillaDSP, shairport-sync, upmpdcli |
| `camilladsp.yml` | Active CamillaDSP pipeline config (auto-generated on startup — do not hand-edit) |
| `/etc/asound.conf` | ALSA routing — rate-agnostic `loop_dsnoop` (written by server on startup) |
| `/etc/pipewire/pipewire.conf.d/50-resonance-sink.conf` | PipeWire virtual null sink |
| `/etc/pipewire/pipewire.conf.d/51-resonance-loopback.conf` | PipeWire → ALSA loopback bridge |
| `/etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf` | DAC-derived `clock.allowed-rates` (written by server on startup) |

---

## Display Setup (Waveshare 11.9")

The installer configures `/boot/firmware/config.txt` for the Waveshare 11.9" HDMI LCD (1480×320):

```ini
hdmi_group=2
hdmi_mode=87
hdmi_cvt 1480 320 60 6 0 0 0
hdmi_drive=2
```

A udev rule rotates the USB capacitive touchscreen 90° CW to match the landscape orientation.

---

## License

Apache 2.0

### Built with

- [CamillaDSP](https://github.com/HEnquist/camilladsp) 4.1.3 — real-time audio DSP engine
- [shairport-sync](https://github.com/mikebrady/shairport-sync) 5.0.4 — AirPlay 2 receiver
- [NQPTP](https://github.com/mikebrady/nqptp) 1.2.8 — AirPlay 2 timing daemon
- [MPD](https://www.musicpd.org/) — Music Player Daemon
- [raspotify](https://github.com/dtcooper/raspotify) — Spotify Connect (librespot)
- [upmpdcli](https://www.lesbonscomptes.com/upmpdcli/) — UPnP/DLNA renderer (built from source)
- [PipeWire](https://pipewire.org/) — modern Linux audio server with native rate switching
- [React](https://react.dev/) 19 — frontend UI
- [Tailwind CSS](https://tailwindcss.com/) 4 — utility-first styling
- [Express](https://expressjs.com/) — Node.js web framework
- [ws](https://github.com/websockets/ws) — WebSocket server
