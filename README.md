# Resonance HiFi OS

> Premium HiFi streaming system for Raspberry Pi

Resonance HiFi is an open-source, self-hosted audio streaming platform for Raspberry Pi. It turns any Pi into a high-fidelity network streamer with a built-in kiosk display, real-time DSP, live signal telemetry, and a mobile remote control — no subscription or cloud dependency required.

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Raspberry%20Pi%204%2F5-red.svg)](https://www.raspberrypi.com/)
[![OS](https://img.shields.io/badge/OS-Ubuntu%2024.04%20ARM64-orange.svg)](https://ubuntu.com/)
[![CI](https://github.com/marciobooi/EnzoOS/actions/workflows/ci.yml/badge.svg)](https://github.com/marciobooi/EnzoOS/actions/workflows/ci.yml)
[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)](CHANGELOG.md)

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
- **Bit-perfect playback** — PipeWire `clock.allowed-rates` switches the graph clock to the source's native sample rate (44.1 / 48 / 88.2 / 96 / 176.4 / 192 kHz), eliminating inter-domain resampling. Allowed rates are derived from the detected DAC's actual hardware capabilities — no rate is advertised that the DAC cannot handle. The full PipeWire → loopback → CamillaDSP bridge runs in a **32-bit** container so source bit-depth survives (no 16-bit truncation). Bit-perfect rate-following is on by default; a one-tap **Fixed 48 kHz fallback** (Settings → DSP → Bit-Perfect) covers DACs that mishandle loopback rate switching. *Rate-following behaviour is hardware-dependent — validate with your specific DAC.*
- **Automatic DAC detection** — scans `/proc/asound` at startup to detect the connected DAC's card name, supported formats (S16/S24/S32), and all supported sample rates
- **Rate-following** — persistent MPD idle connection watches for song changes; when the audio format changes, CamillaDSP capture rate is reconfigured automatically via hot-reload with no audio gap
- **Zero-lag volume** — volume applied post-buffer inside CamillaDSP via `SetVolume`, instant response on all sources regardless of buffer depth
- **Pure Direct mode** — bypass all EQ and DSP filters entirely; signal passes through flat (mixer only), with volume control preserved. Selectable from the DSP wizard alongside Manual EQ and Room Correction
- **Dynamic peak pre-attenuation (auto-headroom)** — instead of a static deduction, the server computes the active EQ's actual peak magnitude response (RBJ biquad cascade across the audible band) and attenuates the pre-amp by *exactly* that much, so peaks land just under 0 dBFS and gentle/neutral content keeps full resolution (max SNR). Applies to every preset *and* Custom EQ; correctly accounts for overlapping boosts that a single-band max would miss (e.g. Bass Boost's 45 Hz + 110 Hz layers peak at ~8.8 dB, not 5.5 dB). Saturation adds a safety margin. Deterministic (filter-derived, no level pumping). Toggle in Settings → DSP → **Auto-Headroom** (or `POST /api/player/auto-headroom`); the live computed value is reported as `headroomDb`. The global -1 dB safety margin still applies on top
- **-1 dB safety headroom** — applied at Stage E (preamp gain) across all built-in and custom pipelines as a guard against multi-stage EQ filter gains summing above 0 dBFS
- **Safe startup sequence** — CamillaDSP is pre-muted to -100 dB before config apply on startup, then volume is restored from the stored value. Prevents the 0 dB (full volume) window that occurs on every CamillaDSP process start
- **DSD native bypass** — when a DSD file (`.dsf` / `.dff`) plays while **Pure Direct** is active, MPD's output is flipped from the CamillaDSP loopback to a dedicated DoP **"DSD Direct"** output wired straight to the hardware DAC (`hw:CARD=…`). The DSD bitstream reaches the DAC untouched — no PCM conversion, no DSP — so the DAC lights its native "DSD" indicator. PCM playback is unaffected and CamillaDSP is restored automatically on the next non-DSD track. Toggle in Settings → DSP → **DSD Native Bypass** (or `POST /api/player/dsd-bypass`); the MPD output flip is driven from `server/player.js` via the rate watcher (`mpc enable/disable`). *DSD output behaviour is DAC-dependent — validate DoP/native support with your specific DAC.* The "DSD Direct" MPD output device is detected at install time using a name-based `hw:CARD=…` address (stable across card-number reordering); if you later swap to a different DAC model, re-run the installer (or edit the `DSD Direct` output in `/etc/mpd.conf`).

### Real-Time Performance
- **Threaded interrupts (`threadirqs`)** — added to the kernel boot cmdline so every hardware IRQ runs as a schedulable kernel thread, the prerequisite for assigning interrupts individual real-time priorities
- **Real-time IRQ priority (`rtirq`)** — `rtirq-init` identifies the connected audio device's hardware IRQ (the USB host controller for USB DACs, or the I²S bus for I²S DACs) and pins its IRQ thread to a real-time priority *above* the network (Wi-Fi/Ethernet) and storage (SD/USB) drivers, which are left on default scheduling — so audio servicing always wins contention
- **Hard CPU core isolation (`isolcpus=2,3`)** — cores 2 and 3 are removed from the Linux load balancer so the scheduler never migrates processes onto them, eliminating the L1/L2 cache invalidation that core-hopping inflicts on the audio pipeline. Companion `rcu_nocbs=2,3` offloads RCU callbacks off the isolated cores
- **Asymmetric workload split** — the four Pi cores are partitioned by role:
  - *Cores 0 & 1* — OS tasks, Node.js API backend, SQLite, and Chromium kiosk (everything non-isolated lands here automatically)
  - *Core 2* — PipeWire + CamillaDSP audio pipeline, pinned via systemd `CPUAffinity`
  - *Core 3* — source streaming daemons (raspotify/librespot, shairport-sync), pinned via systemd `CPUAffinity`
- **Idempotent tuning helper** — `scripts/setup-rtaudio.sh` applies all of the above; it runs at install time and is re-applied on every OTA update, gracefully skipping the kernel-param and affinity steps on non-Pi / sub-quad-core hosts

### File System & Storage Silence
- **`noatime,nodiratime` mounts** — the installer rewrites `/etc/fstab` so on-disk storage partitions (SD card, USB SSD) stop writing read-access timestamps back to flash every time a track is loaded, removing journal/atime write overhead and the electrical noise those writes inject onto the SBC power rail. Conflicting `relatime`/`strictatime` options are stripped; swap, tmpfs and pseudo-filesystems are left untouched; a pristine `/etc/fstab.resonance.bak` is kept and the new fstab is validated (root mount must survive) before it is written
- **`log2ram` — `/var/log` in RAM** — system logs are routed into a tmpfs RAM disk (128 MB) so playback never triggers flash writes for logging. The RAM copy is synced back to disk periodically and flushed on a clean shutdown via the log2ram service's `ExecStop`, so logs survive a graceful power-down but never touch flash mid-stream
- **Idempotent storage helper** — `scripts/setup-storage-silence.sh` applies both; it runs at install time and is re-applied on every OTA update. The `log2ram` step is best-effort — a package-repo failure never aborts the install (the system simply keeps logging to disk)

### RAM Preloading / Memory Locking
- **`mlockall` execution engine** — CamillaDSP (the DSP execution engine) is launched with an `LD_PRELOAD` shim (`resonance-mlockall.so`) whose constructor calls `mlockall(MCL_CURRENT | MCL_FUTURE)` before `main()`, pinning every current and future page into physical RAM so the kernel can never page the DSP engine — or the audio chunks it is processing — out to disk during playback
- **`LimitMEMLOCK=infinity` daemons** — systemd drop-ins raise `RLIMIT_MEMLOCK` to infinity for CamillaDSP, MPD, raspotify, shairport-sync and the PipeWire user service, permitting each to lock its real-time pages. (The forced `mlockall` shim is applied only to CamillaDSP — bounded RT memory; decoders get the limit raise so their own RT threads may lock without blanket-pinning a large MPD music database on low-RAM Pis)
- **PipeWire native mlock** — `mem.allow-mlock = true` + `mem.mlock-all = true` context properties (`53-resonance-mlock.conf`) lock PipeWire's real-time graph memory into RAM
- **Pro-audio limits baseline** — `/etc/security/limits.d/95-resonance-audio.conf` grants the `audio` group `memlock unlimited` and real-time priority for login-session clients
- **Idempotent memory-lock helper** — `scripts/setup-ram-preload.sh` compiles the shim and writes all drop-ins; it runs at install time and is re-applied on every OTA update, skipping any step (compiler, service, PipeWire) that isn't present

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
- **First-boot setup wizard** — a 4-step welcome overlay (`src/components/WelcomeWizard.jsx`) introduces the streamer on first launch (welcome → **connect your music** → phone control → all set). The connect step runs the real account flows inline — Spotify (OAuth), Tidal (device-code) and Qobuz (email/password) — all optional. Completion is stored in SQLite (`onboarding_complete`) so it only appears once; re-runnable any time from **Settings → Run Setup Wizard**, and it reappears automatically after a factory reset
- **Origami logo intro** — pure CSS/HTML kiosk welcome & goodbye animation (`src/components/ResonanceLogo.jsx`, `logo.html`) on the origami paper background — no video file
- **QR code access** — tap the Remote card on the kiosk to display a scannable QR code
- **Source-aware search** — search tab reflects the active source (Spotify search for Spotify, radio scanner for radio)
- **Streaming source menu behaviour** — AirPlay, UPnP, and Bluetooth cards keep the settings menu open on activation (connect-and-wait flow); Spotify, Local, and Radio close it immediately
- **ICY/XML track title sanitiser** — stations that send StreamTitle as raw XML (e.g. Dalet automation systems) are parsed to extract song name and artist before display
- **OTA updates** — `git pull` + rebuild + service restart, triggered from the kiosk settings menu. The updater records the current commit before syncing and **automatically rolls back** to it (rebuilding the last-good revision) if `npm install` or the build fails, so a bad push can't leave the streamer unbootable
- **System health monitor** — live CPU temperature, RAM, and Wi-Fi signal in the settings panel
- **mDNS discovery** — accessible at `resonance.local` on the local network via Avahi

### Library & History
- **Play history** — last 50 tracks recorded automatically on every track change, persisted in SQLite `play_history` table; viewable from the Library tab with source badges and timestamps
- **Unified favorites** — heart any track across all sources (local, Spotify, Tidal, Qobuz, radio); stored in SQLite `favorites` table; browsable from the Library tab
- **Synchronized lyrics** — tap the mic icon to open a bottom sheet with word-synced LRC lyrics fetched from [LRCLIB](https://lrclib.net); auto-scrolls to the current line based on playback position; falls back to plain text when synced lyrics are unavailable

### Playback Controls
- **Queue editing** — view the current MPD queue and delete individual tracks without stopping playback
- **Streaming quality badge** — live format label (e.g. `FLAC 24-bit / 96 kHz`, `AAC 320`, `ALAC`) derived from MPD format and CamillaDSP capture rate; shown beneath the track title in the player

### DSP & Signal Processing
- **ReplayGain** — set MPD ReplayGain mode (off / track / album / auto) from Settings; gain applied per-track to normalise loudness across sources
- **L/R channel balance** — stereo balance slider in Settings; adjusts left and right channel gain offset in real time via CamillaDSP without touching the master volume
- **Phase inversion** — per-channel phase inversion toggle in Settings; applies a `Gain` filter with `inverted: true` in CamillaDSP for correcting out-of-phase speaker wiring
- **Crossfade** — configurable crossfade duration (0–10 s) between MPD tracks, set from Settings

### System & Connectivity
- **Wi-Fi from the UI** — scan for nearby networks, connect with a password, and view signal strength; all via `nmcli` from the Settings panel (requires `network-manager`)
- **Storage stats** — live disk usage (used / total / free) for the Pi's SD card, shown in Settings
- **Settings backup / restore** — export all settings to a JSON file and restore them later; covers EQ bands, calibration profile, volume, theme, and all preferences
- **Factory reset from UI** — wipe all stored settings and favourites from the Settings panel with a single tap; server resets to defaults and broadcasts a state refresh

### Security
- **AirPlay — LAN only** — discovery via mDNS/Bonjour (multicast) does not route through NAT; external devices cannot discover or connect
- **UPnP/DLNA — LAN only** — SSDP discovery is multicast and LAN-bound by protocol; invisible outside the local subnet
- **Bluetooth — confirmation pairing** — `bt-agent` uses `DisplayYesNo` capability; connecting device shows a 6-digit code the user must confirm. Silent auto-accept (`NoInputNoOutput`) is disabled
- **On-demand activation** — AirPlay, UPnP, and Bluetooth services are stopped at boot and only started when the user explicitly activates them from the kiosk menu
- **Remote web interface** — HTTPS with QR-code token authentication (no username/password); self-signed certificate; accessible only on the local network. Each QR code is single-use and expires in 10 minutes; redeemed sessions last 30 days
- **Rate limiting** — `express-rate-limit` guards the API: a generous global cap (DoS), a strict cap on token issuance (`/api/auth`, brute-force), and a tight limiter on destructive system actions (reboot, shutdown, factory-reset, Wi-Fi connect)
- **Hardened shell calls** — all `nmcli` / `systemctl` invocations use `execFile` with an argv array (no shell), so SSID/password/service inputs can never be interpreted as commands

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

The ALSA loopback (`loop_dsnoop`/`camilla_input`) is written **rate-agnostic** (no fixed rate) and at `S32_LE`, so its slaves inherit whatever rate PipeWire opened the loopback at, and CamillaDSP's capture rate follows via the rate watcher's `SetConfig`.

> **Fallback toggle.** ALSA's `snd-aloop` loopback shares one rate per substream, so on some DACs a rate switch can momentarily drop the bridge. If you hear dropouts on rate changes, flip **Settings → DSP → Bit-Perfect** to **Fixed 48 kHz** (or `POST /api/player/bitperfect {"enabled":false}`) and reboot — that path keeps the proven single-rate clock but still runs 32-bit (no truncation). The setting is persisted (`bitperfect` in the `settings` table). PipeWire clock changes apply on the next session, so a reboot is required after toggling.

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
7. Apply real-time audio tuning — `threadirqs` + `rtirq` IRQ priority and `isolcpus=2,3` core isolation with per-service CPU affinity (`scripts/setup-rtaudio.sh`)
8. Apply storage silence — `noatime,nodiratime` fstab mounts and `log2ram` RAM-backed `/var/log` (`scripts/setup-storage-silence.sh`)
9. Apply RAM preloading — `mlockall` shim + `LimitMEMLOCK` + PipeWire mlock to keep the audio engine resident in RAM (`scripts/setup-ram-preload.sh`)
10. Generate a self-signed TLS certificate for HTTPS remote access (port 5001)
11. Build the React frontend (`npm run build`)
12. Register the backend as a native systemd service (`resonance-api`)
13. Configure autologin on TTY1 and launch Chromium in kiosk mode
14. Reboot automatically

**Typical install time:** 15–25 minutes (shairport-sync and upmpdcli builds from source add time).

After reboot the kiosk displays at `http://localhost:5000`. The remote interface is at:

```
https://[pi-ip]:5001/remote
# or
https://resonance.local:5001/remote
```

---

## Architecture

> 📐 **Flow diagrams** (audio signal path, application/software, state sync, boot & tuning) live in **[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** — rendered Mermaid.

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

**First-boot routing.** The very first boot runs whatever `camilladsp.yml` the installer wrote, *before* the backend's `detectDac()` runs. So `install.sh` performs its own lightweight detection when generating the initial config — it scans `/proc/asound/cards` and prefers a real DAC (USB / I²S) over HDMI or onboard audio, writing a name-based `hw:CARD=…,DEV=0` device. This prevents first-boot audio from being routed to the TV on Pis where card 0 is the HDMI output; the backend then re-detects and refines on startup.

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

| Table | Contents |
|-------|----------|
| `settings` | Key-value store: theme, EQ bands, volume, active source, pure direct, replaygain, crossfade, balance, phase, remote access credentials, calibration profile |
| `favorite_radios` | Radio stations saved from the radio scanner (name, URL, favicon, country, tags) |
| `metadata_cache` | Aggregated album metadata cache (album art, biography, credits) keyed by artist+title, 30-day TTL — see *Album Metadata* |
| `play_history` | Last 50 played tracks across all sources (source, title, artist, album, file path, cover URL, timestamp) |
| `favorites` | Heart-saved tracks across all sources (source, URI, title, artist, album, cover, timestamp) |

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
| `GET` | `/api/player/queue/detailed` | Current MPD queue with full track metadata |
| `DELETE` | `/api/player/queue/:pos` | Remove a single track from the queue by position |
| `POST` | `/api/player/replaygain` | Set MPD ReplayGain mode `{ mode: "off"|"track"|"album"|"auto" }` |
| `POST` | `/api/player/crossfade` | Set MPD crossfade duration `{ seconds: 0–10 }` |
| `POST` | `/api/player/balance` | Set L/R balance via CamillaDSP gain `{ balance: -1.0–1.0 }` |
| `POST` | `/api/player/phase` | Set per-channel phase inversion `{ left: bool, right: bool }` |
| `GET` | `/api/player/bitperfect` | Current bit-perfect mode `{ enabled }` |
| `POST` | `/api/player/bitperfect` | Toggle bit-perfect rate-following vs fixed 48 kHz `{ enabled: bool }` (reboot to apply) |
| `GET` | `/api/player/dsd-bypass` | DSD bypass setting + whether it is currently routing `{ enabled, active }` |
| `POST` | `/api/player/dsd-bypass` | Toggle DSD native (DoP) bypass vs PCM decode `{ enabled: bool }` |
| `GET` | `/api/player/auto-headroom` | Auto-headroom setting + last computed attenuation `{ enabled, headroomDb }` |
| `POST` | `/api/player/auto-headroom` | Toggle dynamic peak pre-attenuation vs static preset headroom `{ enabled: bool }` |
| `GET` | `/api/player/lyrics` | Fetch synced LRC lyrics from LRCLIB `?title=&artist=&album=&duration=` |

### Library & History

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/history` | Play history (last 50 entries) |
| `DELETE` | `/api/history` | Clear entire play history |
| `GET` | `/api/favorites` | All saved favorites across sources |
| `POST` | `/api/favorites` | Add a track to favorites `{ source, uri, title, artist, album, cover }` |
| `DELETE` | `/api/favorites/:id` | Remove a favorite by database ID |
| `DELETE` | `/api/favorites/uri` | Remove a favorite by source+uri `{ source, uri }` |

### System

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Full system snapshot — source, playback, EQ, theme, volume |
| `GET` | `/api/system/health` | CPU temp, RAM, Wi-Fi signal |
| `GET` | `/api/system/storage` | Disk usage stats for the SD card (used, total, free) |
| `GET` | `/api/system/wifi` | Scan nearby Wi-Fi networks (requires network-manager) |
| `POST` | `/api/system/wifi/connect` | Connect to a Wi-Fi network `{ ssid, password }` |
| `GET` | `/api/system/backup` | Download all settings as a JSON backup file |
| `POST` | `/api/system/restore` | Restore settings from a previously exported JSON backup |
| `POST` | `/api/system/factory-reset` | Wipe all settings and favourites, reset to defaults |
| `GET` | `/api/system/onboarding` | First-boot wizard state `{ complete }` |
| `POST` | `/api/system/onboarding` | Set wizard state `{ complete }` (`false` re-arms it) |
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
2. Tap the **Remote** card — a QR code is displayed with a 10-minute access token baked in
3. Point your phone camera at the QR code — it opens the remote URL automatically
4. Accept the self-signed certificate warning once (only the first time per browser)
5. You're in — no username or password needed

The QR code refreshes automatically every 9.5 minutes so it's always ready to scan. Each code is single-use; once redeemed it issues a 6-month session token stored in your browser. Use **Settings → Disconnect** on the remote to revoke your session.

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
| ReplayGain | Settings → **Playback** → ReplayGain mode |
| Crossfade | Settings → **Playback** → Crossfade duration (0–10 s) |
| L/R Balance | Settings → **DSP** → Balance slider |
| Phase Inversion | Settings → **DSP** → Phase L / Phase R toggles |
| Bit-Perfect | Settings → **DSP** → Bit-Perfect (rate-following ↔ fixed 48 kHz) |
| DSD Native Bypass | Settings → **DSP** → DSD Native Bypass (DoP direct ↔ PCM decode) |
| Auto-Headroom | Settings → **DSP** → Auto-Headroom (dynamic peak attenuation ↔ static) |
| Theme | Settings → **Theme** card |
| Remote access | Settings → **Remote** card |
| Wi-Fi | Settings → **Wi-Fi** → scan and connect |
| Storage | Settings → **Storage** → disk usage display |
| Backup / Restore | Settings → **Backup** → export or import JSON |
| Factory Reset | Settings → **Danger Zone** → Factory Reset |
| OTA update | Settings → **Update** card |

### Spotify credentials

Spotify auth uses the **Authorization Code + PKCE** flow, so **no client secret is required or stored on-device** — only the (non-confidential) Client ID. A Client ID is public by design: it appears in the browser's OAuth redirect.

1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Add redirect URIs:
   ```
   http://127.0.0.1:5000/auth/spotify/callback
   https://resonance.local:5001/auth/spotify/callback
   ```
3. Edit `/home/pi/EnzoOS/.env` (Client ID only — never add a secret):
   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   ```
4. `sudo systemctl restart resonance-api`

> **Security:** earlier builds hardcoded a Spotify Client **Secret** in `install.sh`. PKCE removes the need for it entirely, and it has been deleted from the source. If you ever deployed an affected build, **rotate that secret in the Spotify dashboard** — once committed to a public repo it is permanently exposed in git history and code changes cannot un-leak it.

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
| `resonance-api` | Node.js backend (native systemd unit) | Boot (always) |

---

## Versioning, CI & verification

- **Semantic versioning** — tracked in `package.json` and [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format). Current: **1.0.0**.
- **Continuous integration** — [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push/PR to `main`: `npm ci`, server module validation (`node --check`), shell-script validation (`bash -n`), a production frontend build, plus advisory ESLint and ShellCheck.
- **Local validation** — `npm run check:server`, `npm run check:scripts`, and `npm run build` mirror CI.
- **Post-install verification** — `npm run verify` (or `bash scripts/verify-install.sh`) reports the live state of every install step and premium optimization (active / pending-reboot / skipped / failed), so a tuning helper that "continued past" a failure can't silently hide a missing feature. The installer runs it automatically at the end.

> **Releases & rollback.** OTA updates roll back automatically on `npm install` / build / server-validation failure (the updater records the pre-update commit and rebuilds it). This is commit-level recovery, not A/B-partition imaging — a fully immutable image with automatic boot-slot fallback remains a future, OS-image-level enhancement.

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
sudo systemctl restart resonance-api
```

### SSH access

```
Host:     resonance.local   (or Pi IP)
User:     pi
Password: 1234   ← change in production
```

### Environment variables

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id   # Client ID only — PKCE needs no secret
PORT=5000
HTTPS_PORT=5001

# Album metadata (all optional — tap the now-playing cover)
LASTFM_API_KEY=            # free key → artist bios, similar artists
THEAUDIODB_KEY=2           # free dev key; set a Patreon key for production volume

# Tidal device-flow client (hi-res). PUBLIC community "TV" credentials from the
# open-source tidalapi project — not a private secret, but required by Tidal's
# device flow (no PKCE option). Shipped in .env, overridable. Kept out of the
# application source so no credential literal lives in server code.
TIDAL_CLIENT_ID=zU4XHVVkc2tDPo4t
TIDAL_CLIENT_SECRET=…       # public tidalapi TV-client secret (see .env.example)
```

### Key files

| File | Purpose |
|------|---------|
| `server/player.js` | CamillaDSP config gen, DAC detection, signal-path API, volume, MPD/radio routes |
| `server/websocket.js` | WebSocket hub, VU meter monitor, standby management |
| `server/event-service.js` | Central event bus, state cache, serial queue, safe startup sequence |
| `server/metadata.js` | Album metadata aggregator (MusicBrainz + Last.fm + TheAudioDB), SQLite-cached |
| `server/db.js` | SQLite helpers — settings, favourite radios, metadata cache, play history, unified favorites |
| `server/index.js` | Express entry point, Spotify OAuth, HTTPS setup |
| `server/status.js` | Full status snapshot endpoint |
| `src/remote.css` | Dedicated mobile-remote design system (scoped under `.remote-root`) |
| `src/components/ResonanceLogo.jsx` | Pure CSS/HTML origami logo intro + static wordmark (kiosk welcome/goodbye) |
| `scripts/setup-rtaudio.sh` | Real-time audio tuning — `threadirqs`, `rtirq` IRQ priority, `isolcpus=2,3` core isolation, per-service CPU affinity (idempotent; run by installer and OTA update) |
| `scripts/setup-storage-silence.sh` | Storage silence — `noatime,nodiratime` fstab mounts + `log2ram` RAM-backed `/var/log` (idempotent; run by installer and OTA update) |
| `scripts/setup-ram-preload.sh` | RAM preloading — `mlockall` shim + `LimitMEMLOCK` drop-ins + PipeWire mlock to keep audio daemons resident in RAM (idempotent; run by installer and OTA update) |
| `scripts/setup-service.sh` | Registers the backend as a native `resonance-api` systemd unit (replaces PM2); migrates an existing PM2 install on re-run |
| `scripts/verify-install.sh` | Post-install verification — reports active/pending/skipped/failed state of every install step and optimization (`npm run verify`) |
| `.github/workflows/ci.yml` | CI — build, server `node --check`, script `bash -n`, advisory lint + shellcheck |
| `scripts/resonance-mlockall.c` | `LD_PRELOAD` shim source — `mlockall(MCL_CURRENT\|MCL_FUTURE)` constructor, compiled to `/usr/local/lib/resonance-mlockall.so` at install |
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
