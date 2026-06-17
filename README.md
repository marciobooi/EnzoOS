# 🎧 Resonance Connect Touchscreen Kiosk & DSP Control Center

Resonance is a premium, high-performance touchscreen music kiosk and real-time DSP management suite designed for Linux-based Hi-Fi audio systems. It integrates native Spotify playback (Librespot), global Web Radio streams, ALSA loopback capture, CamillaDSP configuration generation, and a responsive frontend with multiple high-fidelity skins.

---

## 🌟 Core System Capabilities

### 1. Audio Processing & DSP Backend
* **CamillaDSP Automation**: Dynamically generates pipeline configs based on equalizer state and active source.
* **ALSA Loopback Sharing**: Configures a virtual `pcm.loop_dsnoop` device to share capture streams between the visualizers and CamillaDSP without resource conflicts.
* **Real-time Audio Analysis**: A background server watcher uses `arecord` to capture levels and broadcast DB peaks over WebSockets at low latency.

### 2. Dynamic Codec & Audio Path Telemetry HUD
* **Dynamic Format Badging**: Dedicated format badges (`OGG VORBIS`, `AAC STREAM`, `FLAC LOSSLESS`) that light up based on the active decoded stream source.
* **Stream Telemetry**: Displays real-time bit depth, sample rates, and bitrates (e.g. `24-bit / 96.0kHz • 2822kbps`).
* **Signal Path Visualizer**: Graphically traces the audio signal journey:
  * Spotify: `Spotify → Resampler 96kHz → CamillaDSP → DAC`
  * Web Radio: `Stream → Resampler 96kHz → CamillaDSP → DAC`
  * Local Media: `Local → Direct Audio → CamillaDSP → DAC`
* **Idle State Fallbacks**: When no track is playing, the HUD shifts to a clean standby mode displaying `OFFLINE`, `--/-- • --kbps` and `DSP Pipeline Suspended` messages to maintain UI elegance.

### 3. Screen Burn-In Safety (Standby Mode)
* **Tap to Wake Screensaver**: Automatically suspends rendering and displays a completely black screensaver overlay during inactivity to prevent OLED/LCD burn-in.
* **Standby Automation**: Pauses active capture daemons and drops both left and right VU needles to `-45dB` when standby mode is active, preserving hardware longevity.

### 4. High-Fidelity Skins & Parallax Color Blur Canvas
* **Skins Settings Menu**: Swap skins instantly via the display configurations panel.
* **Available Themes**:
  * **Retro Dot-Matrix Theme**: A phosphor green LED grid matrix simulation replicating classic tube displays.
  * **Dreamplayer Theme**: A glassmorphic retrofuture console.
  * **Glassplayer Theme (Liquid Glass)**: 
    * **Dynamic Background Blur Canvas**: Extracts the artwork image at runtime to project a slowly moving, animated Gaussian blur backdrop (`blur(110px) opacity(0.35)`) behind the console.
    * **3D Parallax Screen Tilt**: Computes pointer hover coordinates to smoothly tilt the layout frame using physical inertia.
    * **Magnetic Buttons**: Applies magnetic physics to all control buttons, drawing them towards the user's touch.
* **Matrix Color Customization**: Customize emission glow colors (Amber, Green, Blue, Purple, Red) to match your listening space.

### 5. Dual VU Visualizer Modes
* **Precision Mechanical VU**: Dual channel analog needles mapped dynamically to L/R decibel peaks.
* **7-Band Digital Spectrum**: Theme-aware frequency graph that renders as dot-matrix grid stacks or smooth solid bars depending on the active theme.

### 6. Integrated Audio Sources & Web Radio
* **Web Radio Plugin**:
  * Global station directory search (by name, tags, or country).
  * Direct one-tap favorite system to index streams.
  * Web Radio playback is processed natively on the host server.
* **Spotify Connect**: Seamless control via Spotify Web API, identifying local Librespot instances and routing playback.

### 7. Over-The-Air (OTA) Updates & Self-Healing Sync
* **System Updater**: Checks for system updates and triggers automated `git pull` updates from the cloud repository directly from the touchscreen UI or remote page.
* **Auto-Check on Connect**: Tries to check update status automatically when the client WebSocket mounts. If offline, the checker gracefully defaults the card to **UP TO DATE** instead of locking up the UI on a **FAILED** error state.
* **Reboot Telemetry**: Displays installation logs and percentage progress bar in real-time, transitioning to a **REBOOTING...** label at 100% until the server comes back online.

### 8. System & Thermal Health Dashboard
* **Real-time Metrics**: Card built directly into the system configuration panel that displays hardware health:
  * **CPU Temperature**: Monitors temperature zones and changes color to red if exceeding 65°C.
  * **RAM Usage**: Tracks system memory allocations in real-time.
  * **Wi-Fi Signal**: Measures wireless network signal strength in dBm.

### 9. Linux Kiosk Configurations
* **Low Latency Touch**: Tailored touch-action CSS rules to eliminate click delay.
* **Chromium Touch Optimization**: Custom launch parameters (`--touch-events=enabled`) injected via the window manager startup scripts (`xinitrc`).

---

## 🏗️ Server Architecture

All server-side state and event routing flows through a central **EventService** (`server/event-service.js`). Neither REST routes nor the WebSocket handler mutate shared state directly — they call `emit(type, payload)` and the service handles everything from there.

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

**Event categories:**

| Category | Examples | Behaviour |
|---|---|---|
| State-mutating | `SET_SOURCE`, `SET_STANDBY`, `SET_EQ_SETTINGS`, `SET_THEME_SETTINGS`, `BROADCAST_STATE` | Serialised through async queue — no concurrent state races |
| Passthrough | `SET_TOKEN`, `CLEAR_TOKEN`, `REQUEST_SYNC`, `UPDATE_PROGRESS`, `AUDIO_LEVELS` | Bypass queue, broadcast directly — zero added latency |

**Key guarantees provided by EventService:**
* Concurrent `SET_SOURCE` or `BROADCAST_STATE` messages from multiple clients are processed in arrival order, not in parallel.
* `SET_EQ_SETTINGS` awaits CamillaDSP config regeneration before broadcasting `EQ_SETTINGS` to the UI, so the client reflects the actually-applied state.
* Spotify token refresh uses a promise-based mutex — concurrent callers (WS client handshake + 5-min auto-refresh interval) share one in-flight request.
* Standby check-then-act on the audio monitor is serialised through the same queue, eliminating the TOCTOU race.

**Source switching behaviour:**

| Transition | Server side | Client side |
|---|---|---|
| Any → Spotify | `mpc stop`, `cachedPlaybackState = null`, Spotify API issues `PLAYBACK_STATE` when it starts | `SET_SOURCE` handler clears `playbackState`, `trackPosition`, `trackDuration` immediately |
| Spotify → Radio | Fetches `last_radio_url` from DB, starts `mpc`, rebuilds `cachedPlaybackState` from stored station info | Cleared on `SET_SOURCE`; new `PLAYBACK_STATE` arrives with station info |
| Radio → Radio (same) | `previousSource === 'radio'` guard skips auto-resume to avoid restarting an already-playing stream | No flicker — state retained |
| Any → Local | `mpc play` resumes queue, `cachedPlaybackState = null` until MPD sends `BROADCAST_STATE` | Cleared on `SET_SOURCE` |

When a radio station is selected via the source tab the REST route broadcasts `SET_SOURCE` + `PLAYBACK_STATE` through EventService. The client sends no redundant `SET_SOURCE` over WebSocket, preventing a double-resume loop.

**Server modules:**

| File | Role |
|---|---|
| `server/event-service.js` | Central event bus — cached state, serial queue, DB persistence, broadcast dispatch |
| `server/websocket.js` | WS transport only — connection handshake, message fan-out to `emit()`, audio level monitor |
| `server/player.js` | REST routes for MPD, web radio, DSP calibration, CamillaDSP config generation |
| `server/spotify-auth.js` | Spotify OAuth flow, token refresh (with mutex), auto-refresh interval |
| `server/update.js` | OTA update trigger and log streaming |
| `server/system.js` | Service management, reboot/shutdown, LAN URL, health metrics |
| `server/db.js` | SQLite persistence (settings key-value store, favourite radios) |
| `server/index.js` | Express app bootstrap, HTTP/HTTPS servers, WS upgrade routing |

---

## 🔔 Custom Toast Notifications

Sonner has been replaced with a bespoke in-house toast system that matches the application's dark glassmorphism design language.

| File | Role |
|---|---|
| `src/lib/toast.js` | Vanilla JS singleton event emitter. No React dependency — imperative `toast.success(msg)` / `toast.error(msg)` calls work from any file including hooks. |
| `src/components/ui/ToastContainer.jsx` | React consumer that subscribes to the bus and renders the animated toast stack. Mounted once in `App.jsx`. |

**Visual design:**
- Dark glass background: `rgba(10,14,28,0.93)` + `blur(24px) saturate(180%)` backdrop filter
- Colored left border stripe: champagne `#c9a84c` for success, rose-400 for errors
- Icons: `CheckCircle2` (success) / `AlertCircle` (error) from lucide-react
- Inset top highlight + deep drop shadow — consistent with kiosk menu cards

**Animations:**
- Enter: spring slide-up from 14px below + scale from 0.93 (`cubic-bezier(0.34,1.56,0.64,1)` 320ms)
- Exit: fade + shrink back down (`ease-in` 250ms), triggered 3.5s after mount

**Positioning:** `App.jsx` passes `bottomOffset={80}` on the remote page (clears the 64px bottom nav) and `bottomOffset={24}` on the kiosk page.

---

## ✨ Premium Animations

Micro-interactions are added with short, deliberate CSS keyframe animations — no looping or distracting motion.

| Animation | Class | Used On | Easing / Duration |
|---|---|---|---|
| Tab slide-in right | `animate-tab-right` | Remote tab content (forward navigation) | `cubic-bezier(0.25,0,0.3,1)` 240ms |
| Tab slide-in left | `animate-tab-left` | Remote tab content (backward navigation) | `cubic-bezier(0.25,0,0.3,1)` 240ms |
| Volume popup spring | `animate-volume-in` | Kiosk volume slider popup | Spring `cubic-bezier(0.34,1.56,0.64,1)` 340ms |
| Station list rise | `list-item-rise` | Radio station rows with per-item stagger (0–350ms) | `ease-out` 320ms |
| Menu card enter | `menu-card-enter` | DefinitionsMenu cards with 30ms stagger per card | `cubic-bezier(0.25,0,0.3,1)` 280ms |
| Bottom-nav indicator | inline spring transition | Sliding champagne bar under active tab | Spring `cubic-bezier(0.34,1.56,0.64,1)` 380ms |

**Tab direction tracking** (`RemoteControl.jsx`): a `changeTab` callback computes whether the new tab is to the left or right of the current one (using `TAB_ORDER` index comparison via `useRef`) and sets `tabDirection` state before switching. The content pane re-mounts with `key={activeTab}` picking up the correct `animate-tab-{direction}` class.

**Menu stagger** (`SettingsMenuOverlay.jsx`): an `animKey` state counter increments every time `isMenuOpen` transitions from `false → true`. Passing `key={animKey}` to `<DefinitionsMenu>` forces a remount, retriggering the CSS `menu-card-enter` animations each time the panel opens.

---

## 🎯 High-End UX Features (Remote Control)

Matching the interaction quality of Roon, Naim, and Sonos — features added to the Remote Control UI:

| Feature | Component | Description |
|---|---|---|
| **Queue Panel** | `src/components/remote/QueuePanel.jsx` | Slide-up "Up Next" drawer with glass backdrop. Fetches Spotify queue (`/v1/me/player/queue`) on open, shows now-playing re-entry + numbered queue list (up to 20 tracks). Tap album art or outside to close. |
| **Mini-Player Strip** | `src/components/remote/MiniPlayer.jsx` | Sticky now-playing bar rendered at the bottom of every non-player tab. Shows thumbnail, track/artist, inline play/pause, and a 2px champagne progress bar. Tapping navigates to the Player tab. |
| **Skeleton Loaders** | `src/components/ui/SkeletonList.jsx` | Shimmer placeholder rows (dark/light adaptive via context colors) replace the plain spinner in LibraryTab's artist list and deep drill-down views. `@keyframes shimmer` moves a `200%`-wide gradient. |
| **Swipe to Skip** | `PlayerTab.jsx` | `onTouchStart`/`onTouchEnd` on the album art. 60px horizontal threshold, must be 1.5× more horizontal than vertical. Swipe left → next; swipe right → previous. |
| **Audio Quality Badge** | `PlayerTab.jsx` | Champagne chip below artist name showing `OGG VORBIS` (Spotify), `AAC STREAM` (radio), `FLAC LOSSLESS` / `MP3` / `PCM WAV` / `LOCAL FILE` (local, inferred from file extension). |
| **Genre Chip Empty State** | `SourceTab.jsx` | Empty favorites list shows 8 quick-genre chips (Jazz, Classical, Lo-Fi, Ambient, Electronic, Rock, News, Chill). Tapping a chip populates the search input and fires the station search immediately. |
| **Destructive Confirmation** | `SettingsTab.jsx` | Reboot, Shut Down, Disconnect Spotify, and Sign Out require a second tap within 3 seconds. Label changes to "Tap again to…" on first press; `confirmPending` resets via `setTimeout`. |
| **Playback Feedback** | `LibraryTab.jsx` | Spotify track rows show a spinner overlay on the album thumbnail while the play API call is in-flight (`pendingUri` state). |
| **Up Next Button** | `PlayerTab.jsx` | Champagne-accented "Up Next" button beneath volume controls (Spotify only) opens the QueuePanel. |

---

## ⚡ Render Optimisations

| What | Where | Effect |
|---|---|---|
| `React.memo` on `PlayerDisplay` | `src/components/PlayerDisplay.jsx` | Skips the 1 184-line component re-render when only unrelated Kiosk state changes (e.g. overlay open/close) |
| `useMemo` on `kioskCtx` | `src/pages/Kiosk.jsx` | Context object keeps a stable reference between renders where nothing in it changed; prevents cascading re-renders in all seven overlay components |
| `useMemo` on `ctxValue` | `src/pages/RemoteControl.jsx` | Same benefit for all remote tab components |
| `useCallback` for `onToggleMenu / onToggleEqualizer / onToggleSearch` | `src/pages/Kiosk.jsx` | Stable handler references so `React.memo` on `PlayerDisplay` can bail out on overlay open/close |
| Conditional mount for `SearchOverlay` / `DspWizardOverlay` | `src/pages/Kiosk.jsx` | `TrackSearch` and `DspWizard` are only mounted (and run their effects/fetches) while the overlay is open |

---

## 🔒 Security & Reliability Hardening

### Shell injection prevention
All `mpc` calls that accept user-supplied input (URLs, file paths, artist/album names) use `execFile()` with an args array instead of `exec()` with string interpolation. No shell is spawned, so special characters in station URLs or track names cannot escape into shell commands.

### Input validation
Volume and seek-position values are parsed with `parseInt` and checked with `Number.isFinite` before being passed to `mpc`. Invalid values return HTTP 400 before any command is executed.

### Graceful shutdown
`SIGTERM` and `SIGINT` handlers in `server/index.js` stop the audio-level monitor, clear the Spotify token-refresh interval, and close the SQLite connection before exiting. No orphaned processes or locked database files on restart.

### Safe JSON parsing
`safeParse()` in `server/websocket.js` wraps all `JSON.parse` calls on values read from the database during the WebSocket handshake. Corrupted or missing DB values emit a warning and are skipped rather than crashing the handshake for the connecting client.

### OTA stream error guards
`server/update.js` attaches `error` event handlers to both `stdout` and `stderr` streams of the update child process so a premature stream close does not produce an unhandled rejection.

---

## 📁 Repository Structure

* `/server` - Node.js Express server. All real-time state flows through `event-service.js`; REST routes and WebSocket handlers are thin dispatchers.
* `/src` - React frontend compiled with Vite.
  * `/src/components/PlayerDisplay.jsx` - Core rendering component for visualizers, playback state, and dials.
  * `/src/components/kiosk/` - Kiosk overlay components (`KioskContext`, `StandbyOverlay`, `EqualizerOverlay`, `SettingsMenuOverlay`, `SearchOverlay`, `ThemeSettingsOverlay`, `RemoteAccessOverlay`, `DspWizardOverlay`). All read shared state via `useContext(Kk)`; state and handlers stay in `Kiosk.jsx`.
  * `/src/components/remote/` - Remote Control tab components sharing state via `useContext(Tk)`.
  * `/src/glassplayer.css` - Liquid glass styling definitions.
  * `/src/dot-matrix.css` - LED grid matrix styling definitions.
  * `/src/dreamplayer.css` - Neo glass styling definitions.
* `/scripts` - Linux system setup, auto-start configurations (`xinitrc`), and installers.

---

## 🚀 Getting Started

### Installation
Deploy to your target Linux device (Raspberry Pi/x86 running Debian/Arch) by running the automated installation script:
```bash
./install.sh
```

### Running Locally
To launch the development frontend:
```bash
npm install
npm run dev
```

To run the backend server:
```bash
cd server
npm install
npm start
```
