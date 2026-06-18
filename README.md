# Resonance HiFi / EnzoOS

> Premium HiFi streaming system for Raspberry Pi

Resonance HiFi is an open-source, self-hosted audio streaming platform designed for Raspberry Pi. It turns any Pi into a high-fidelity network streamer with a built-in kiosk display, real-time DSP, and a mobile remote control — no subscription or cloud dependency required.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%204%2F5-red.svg)](https://www.raspberrypi.com/)
[![OS](https://img.shields.io/badge/OS-Ubuntu%2024.04%20ARM64-orange.svg)](https://ubuntu.com/)

---

## Features

- **Spotify Connect** — stream directly from the Spotify app via `raspotify` (librespot), 320 kbps Ogg Vorbis
- **AirPlay 2** — receive audio from any Apple device via `shairport-sync`, lossless ALAC
- **UPnP / DLNA** — network renderer via `upmpdcli + MPD`, up to 24-bit/192 kHz
- **Bluetooth A2DP** — wireless audio via PipeWire + BlueALSA, supports LDAC / AAC / aptX
- **Web Radio** — HTTP stream playback via MPD (AAC, MP3, FLAC streams)
- **Local Files** — lossless FLAC / ALAC / WAV / MP3 playback via MPD
- **Tidal** — hi-res streaming up to 24-bit/192 kHz
- **Qobuz** — lossless streaming up to 24-bit/192 kHz
- **Real-time DSP** — CamillaDSP 4.x pipeline: parametric EQ, biquad filters, volume control
- **Acoustic Room Calibration** — guided wizard measures your room and applies correction filters
- **Zero-lag volume** — volume applied post-buffer inside CamillaDSP, instant response on all sources
- **Kiosk display** — React UI optimised for 1480×320 landscape (Waveshare 11.9" HDMI LCD)
- **Mobile remote** — same React codebase, responsive layout for phones and tablets
- **QR code access** — tap the Remote card on the kiosk to display a scannable QR code
- **OTA updates** — `git pull` + PM2 restart, triggered from the kiosk settings menu
- **System health monitor** — live CPU temperature, RAM load, Wi-Fi signal in the settings panel
- **mDNS discovery** — accessible at `resonance.local` on the local network via Avahi

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

---

## Audio Chain

All audio sources converge in a shared ALSA dmix device and pass through CamillaDSP before reaching the DAC. This guarantees bit-perfect DSP and instant volume control regardless of which source is active.

```
┌─────────────────────────────────────────────────────────────────┐
│  Sources                                                        │
│                                                                 │
│  Spotify (raspotify/librespot) ──────────────────────────────┐  │
│  AirPlay (shairport-sync)      ──────────────────────────────┤  │
│  UPnP/DLNA (upmpdcli → MPD)   ──────────────────────────────┤  │
│  Web Radio / Local Files (MPD) ──────────────────────────────┤  │
│  Bluetooth A2DP (bluealsa-aplay) ────────────────────────────┤  │
│  Browser audio (PipeWire → ALSA sink) ───────────────────────┘  │
│                             │                                   │
│                             ▼                                   │
│         pcm.camilla_input (ALSA dmix, hw:Loopback,0,0)          │
│                    [kernel ALSA loopback]                        │
│         pcm.loop_dsnoop  (ALSA dsnoop, hw:Loopback,1,0)         │
│                             │                                   │
│                             ▼                                   │
│         CamillaDSP 4.x  (EQ · filters · volume)                 │
│                             │                                   │
│                             ▼                                   │
│         DAC / hw:0,0  (USB DAC, I²S DAC, or HDMI)              │
└─────────────────────────────────────────────────────────────────┘
```

Key design decisions:

- `camilla_input` uses `type dmix` so multiple sources (raspotify, MPD, PipeWire) can write simultaneously without exclusive-lock conflicts
- `loop_dsnoop` uses `type dsnoop` so CamillaDSP can read from the loopback without blocking any writers
- PulseAudio is fully purged at install time — it conflicts with this chain via its ALSA override config (`99-pulse.conf`)
- CamillaDSP owns the volume stage; MPD software mixer stays at 100%

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
2. Install Node.js 20, PipeWire, MPD, CamillaDSP, raspotify, shairport-sync, upmpdcli, bluez
3. Configure ALSA loopback routing (`/etc/asound.conf`)
4. Write MPD config, PipeWire sink, and WirePlumber default-sink rules
5. Generate a self-signed TLS certificate for HTTPS remote access (port 5001)
6. Build the React frontend (`npm run build`)
7. Register the backend as a PM2 service (`resonance-api`)
8. Configure autologin on TTY1 and launch Chromium in kiosk mode
9. Reboot automatically

**Typical install time:** 10–15 minutes depending on network speed.

After reboot the kiosk displays in Chromium at `http://localhost:5000`. The remote interface is available at:

```
https://[pi-ip]:5001/remote
# or
https://resonance.local:5001/remote
```

Accept the self-signed certificate warning on first visit.

---

## Architecture

### Frontend — React + Tailwind CSS

Two views share a single React codebase:

| View | URL | Resolution |
|------|-----|------------|
| Kiosk | `http://localhost:5000` | 1480×320 landscape |
| Remote | `https://[pi-ip]:5001/remote` | Responsive mobile |

Built with React 19, Tailwind CSS 4, and Vite 8. State synchronisation between views is handled over WebSockets. All server-side state and event routing flows through a central **EventService** (`server/event-service.js`) — REST routes and WebSocket handlers call `emit(type, payload)` rather than mutating state directly.

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
| `server/event-service.js` | Central event bus — cached state, serial queue, DB persistence, broadcast |
| `server/websocket.js` | WS transport — connection handshake, message fan-out, audio level monitor |
| `server/player.js` | REST routes for MPD, web radio, DSP calibration, CamillaDSP config generation |
| `server/spotify-auth.js` | Spotify OAuth flow, token refresh with mutex, auto-refresh interval |
| `server/update.js` | OTA update trigger and log streaming |
| `server/system.js` | Service management, reboot/shutdown, health metrics |
| `server/db.js` | SQLite persistence (settings key-value store, favourite radios) |

PM2 manages the backend process (`resonance-api`) with auto-restart on boot.

### DSP — CamillaDSP 4.x

CamillaDSP runs as a systemd service, reading from the ALSA loopback and writing to the DAC. Its YAML config (`camilladsp.yml`) is regenerated by the server on startup from stored settings. The HTTP API on port 1234 is used for real-time volume changes without reloading the pipeline.

### Database — SQLite

`server/resonance.db` persists:

- User settings (theme, EQ bands, volume, active source)
- Favourite radio stations
- Acoustic calibration profile
- Remote access credentials

---

## Remote Access

### Connecting from a phone or tablet

1. On the kiosk, tap the hamburger/settings button to open the Source Menu
2. Tap the **Remote** card (access panel) — a QR code and URL are displayed
3. Scan the QR code with your phone, or navigate manually to:

```
https://resonance.local:5001/remote
```

4. Accept the self-signed certificate warning (one-time, per browser)
5. Log in with:
   - **Username:** `enzo`
   - **Password:** `enzoOS`

The remote interface provides full playback control, source switching, volume, EQ access, and a queue panel from any device on the same network.

---

## Configuration

| Setting | How to access |
|---------|--------------|
| Source selection | Tap the hamburger icon on the kiosk → source cards |
| Volume | Drag the volume slider on the kiosk or remote |
| Parametric EQ | Tap the VU meter display on the kiosk |
| DSP / Room calibration | Settings menu → **Acoustic** card → Calibration Wizard |
| Theme | Settings menu → **Theme** card (cycles: amber → emerald → cyan → amethyst → ruby) |
| Remote access | Settings menu → **Remote** card |
| OTA update | Settings menu → **Update** card → deploy |

### Spotify credentials

The installer uses a shared Spotify developer app. To use your own credentials:

1. Create a free app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add these redirect URIs to the app settings:
   ```
   http://127.0.0.1:5000/auth/spotify/callback
   https://resonance.local:5001/auth/spotify/callback
   ```
3. Edit `/home/pi/EnzoOS/.env`:
   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   ```
4. Restart the server: `pm2 restart resonance-api`

---

## Supported Audio Sources

| Source | Protocol / Service | Max Quality |
|--------|--------------------|-------------|
| Spotify | Spotify Connect (raspotify / librespot) | 320 kbps Ogg Vorbis |
| Apple devices | AirPlay 2 (shairport-sync) | Lossless ALAC |
| DLNA apps | UPnP/DLNA (upmpdcli + MPD) | 24-bit / 192 kHz |
| Bluetooth | A2DP via PipeWire + BlueALSA | LDAC / AAC / aptX |
| Web Radio | HTTP streams (MPD) | AAC / MP3 / FLAC |
| Local files | FLAC / ALAC / WAV / MP3 (MPD) | Lossless |
| Tidal | Tidal streaming API | 24-bit / 192 kHz |
| Qobuz | Qobuz streaming API | 24-bit / 192 kHz |

Streaming sources (AirPlay, UPnP, Bluetooth) are activated on demand from the kiosk or remote — they do not run at boot unless selected.

---

## Development

### Local setup (Windows / macOS / Linux)

```bash
git clone https://github.com/marciobooi/EnzoOS.git
cd EnzoOS
npm install
```

```bash
# Terminal 1 — Vite frontend dev server (hot reload)
npm run dev

# Terminal 2 — Express backend
npm run server
```

Both together:

```bash
npm run dev:all
```

The frontend proxies API calls to the backend. ALSA/MPD/CamillaDSP calls will fail on non-Linux systems, but the UI renders fully.

### Deploying to the Pi

```bash
# On the Pi (or via SSH)
cd /home/pi/EnzoOS
git pull origin main
npm run build
pm2 restart resonance-api
```

### SSH access

```
Host:     resonance.local   (or the Pi's IP)
User:     pi
Password: 1234   ← change this in production
```

### Environment variables

Copy `.env.example` to `.env` and fill in values:

```bash
cp .env.example .env
```

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
PORT=5000
HTTPS_PORT=5001
```

### Key files

| File | Purpose |
|------|---------|
| `server/player.js` | CamillaDSP config generator, MPD/radio API routes, volume control |
| `server/websocket.js` | WebSocket hub, audio level monitor, standby management |
| `server/event-service.js` | Central event bus, state cache, serial queue |
| `server/db.js` | SQLite helpers (settings, favourites, EQ presets) |
| `server/index.js` | Express entry point, Spotify OAuth, HTTPS setup |
| `scripts/kiosk-power.sh` | Display standby: `vcgencmd` on Pi, `xset dpms` on QEMU |
| `scripts/xinitrc` | Xorg startup — launches Openbox + Chromium kiosk |
| `install.sh` | Master installer — packages, ALSA, PipeWire, CamillaDSP, PM2 |
| `camilladsp.yml` | Active CamillaDSP pipeline config (auto-generated, do not hand-edit) |
| `/etc/asound.conf` | ALSA routing (written by server on startup via `ensureAsoundConf()`) |

---

## Display Setup (Waveshare 11.9")

The installer automatically configures `/boot/firmware/config.txt` for the Waveshare 11.9" HDMI LCD (320×1480 portrait panel used in 1480×320 landscape orientation):

```ini
hdmi_group=2
hdmi_mode=87
hdmi_cvt 1480 320 60 6 0 0 0
hdmi_drive=2
```

A udev rule rotates the USB capacitive touchscreen 90° CW to match the landscape display orientation.

---

## Systemd Services

| Service | Description | Start policy |
|---------|-------------|--------------|
| `camilladsp` | CamillaDSP audio processor | Boot (always) |
| `mpd` | Music Player Daemon | Boot (always) |
| `raspotify` | Spotify Connect (librespot) | Boot (always) |
| `shairport-sync` | AirPlay 2 receiver | On demand |
| `upmpdcli` | UPnP/DLNA renderer | On demand |
| `bluealsa` / `bluealsa-aplay` | Bluetooth A2DP bridge | On demand |
| `bt-agent` | Bluetooth auto-pair agent | Boot |
| `resonance-api` (PM2) | Node.js backend | Boot (PM2 startup) |

---

## License

Apache 2.0

### Built with

- [CamillaDSP](https://github.com/HEnquist/camilladsp) — real-time audio DSP engine
- [shairport-sync](https://github.com/mikebrady/shairport-sync) — AirPlay 2 receiver
- [MPD](https://www.musicpd.org/) — Music Player Daemon
- [raspotify](https://github.com/dtcooper/raspotify) — Spotify Connect (librespot)
- [upmpdcli](https://www.lesbonscomptes.com/upmpdcli/) — UPnP/DLNA renderer
- [PipeWire](https://pipewire.org/) — modern Linux audio server
- [React](https://react.dev/) — frontend UI
- [Tailwind CSS](https://tailwindcss.com/) — utility-first styling
- [Express](https://expressjs.com/) — Node.js web framework
- [ws](https://github.com/websockets/ws) — WebSocket server
