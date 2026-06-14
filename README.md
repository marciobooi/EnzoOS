# 🎧 Resonance Connect Touchscreen Kiosk & DSP Control Center

Resonance is a premium, high-performance touchscreen music kiosk and real-time DSP management suite designed for Linux-based Hi-Fi audio systems. It integrates native Spotify playback (Librespot), global Web Radio streams, ALSA loopback capture, CamillaDSP configuration generation, and a responsive frontend with multiple high-fidelity skins.

---

## 🌟 Core System Capabilities

### 1. Audio Processing & DSP Backend
* **CamillaDSP Automation**: Dynamically generates pipeline configs based on equalizer state and active source.
* **ALSA Loopback Sharing**: Configures a virtual `pcm.loop_dsnoop` device to share capture streams between the visualizers and CamillaDSP without resource conflicts.
* **Real-time Audio Analysis**: A background server watcher uses `arecord` to capture levels and broadcast DB peaks over WebSockets at low latency.

### 2. Screen Burn-In Safety (Standby Mode)
* **Tap to Wake Screensaver**: Automatically suspends rendering and displays a completely black screensaver overlay during inactivity to prevent OLED/LCD burn-in.
* **Standby Automation**: Pauses active capture daemons and drops both left and right VU needles to `-45dB` when standby mode is active, preserving hardware longevity.

### 3. High-Fidelity Skins & Theme Customization
* **Skin Changing Settings Menu**: Swap skins instantly via the display configurations panel.
* **Available Themes**:
  * **Retro Dot-Matrix Theme**: A phosphor green LED grid matrix simulation replicating classic tube displays.
  * **Dreamplayer Theme**: A glassmorphic retrofuture console.
  * **Glassplayer Theme (Liquid Glass)**: 
    * Responsive 3D parallax screen tilt based on pointer hover coordinates.
    * Conic liquid color backdrops shifting dynamically.
    * Magnetic button physics that gravitate control buttons towards the user's touch/pointer.
* **Matrix Color Customization**: Customize emission glow colors (Amber, Green, Blue, Purple, Red) to match your listening space.

### 4. Dual VU Visualizer Modes
* **Precision Mechanical VU**: Dual channel analog needles mapped dynamically to L/R decibel peaks.
* **7-Band Digital Spectrum**: Theme-aware frequency graph that renders as dot-matrix grid stacks or smooth solid bars depending on the active theme.

### 5. Integrated Audio Sources & Web Radio
* **Web Radio Plugin**:
  * Global station directory search (by name, tags, or country).
  * Direct one-tap favorite system to index streams.
  * Web Radio playback is processed natively on the host server.
* **Spotify Connect**: Seamless control via Spotify Web API, identifying local Librespot instances and routing playback.

### 6. Over-The-Air (OTA) Updates
* **System Updater**: Checks for system updates and triggers automated `git pull` updates from the cloud repository directly from the touchscreen UI or remote page.
* **Real-Time Progress Watcher**: Displays progress status logs and progress percentages in real-time as packages compile and services hot-reload.

### 7. Linux Kiosk Configurations
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
