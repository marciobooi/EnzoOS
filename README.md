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

## 📁 Repository Structure

* `/server` - Node.js Express server handling web services, Spotify authentication, local playback daemons, and WebSocket DB broadcasting.
* `/src` - React frontend compiled with Vite.
  * `/src/components/PlayerDisplay.jsx` - Core rendering component for visualizers, playback state, and dials.
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
