# EnzoOS Hi-Fi Streamer

A complete DIY High-Fidelity Audio Streamer architecture built for the **Raspberry Pi 4**, featuring an optimized 1400x320 touch display UI, a Node.js API engine, and advanced CamillaDSP audio processing.

## 🌟 Premium Features
- **Modern Hardware UI**: React + Tailwind CSS v4 running on Vite 8, featuring Glassmorphism, 1400x320 landscape Kiosk orientation, and CSS variables for theming (Rose Gold, McIntosh Green, Dark Minimalist).
- **Dual-Mode OS**: Landscape UI for the touchscreen, and a specialized Mobile Portrait view (`/remote`) for controlling playback from a smartphone.
- **Zero-Latency Feel**: Employs Optimistic UI updates on WebSockets for instant playback control and volume adjustments.
- **Real-Time VU Meters (Canvas Physics)**: Directly connects to the CamillaDSP Engine's WebSocket to broadcast true playback RMS signals. Analog needles are drawn natively on the HTML5 Canvas using a 60 FPS requestAnimationFrame loop with full ballistic physics (damping, spring tension, and overshoot).
- **Dynamic DSP Engine**: Features an 11-step configuration wizard allowing users to generate complex audio pipelines (Highpass crossovers, Night mode, L/R Balancing, and a 10-Band Graphic EQ). The engine automatically processes Shaped Dither and Asynchronous Resampling for Bit-Perfect playback.
- **Hardware-Level Stability**: Utilizes SQLite Write-Ahead Logging (WAL) alongside an Immutable OS via **OverlayFS** and `tmpfs` RAM logs, making the Streamer 100% resilient to forced power cuts without SD Card corruption.
- **Smart Metadata**: Integrates natively with the MPD daemon and scrapes MusicBrainz for high-res album covers. Also supports webhooks for Spotify Connect to sync track events.
- **OTA Updates**: Triggers Over-The-Air system updates directly from the touchscreen to fetch the latest code from GitHub and restart the background services.
- **Clock / Screensaver**: Dimmed, burn-in protected Nixie-style clock screen that activates after 5 minutes of inactivity.

## 🛠️ Architecture

### 1. Audio Pipeline
*All audio converges onto a virtual ALSA loopback before hitting the physical DAC to allow system-wide DSP processing.*

**Sources:**
- Local Files / Radio: `MPD`
- Spotify Connect: `librespot` -> ALSA `hw:Loopback,0,0`
- AirPlay: `shairport-sync` -> ALSA `hw:Loopback,0,0`
- TIDAL / UPnP: `upmpdcli` -> MPD -> ALSA `hw:Loopback,0,0`

**Processor:**
- `CamillaDSP` -> Captures from `hw:Loopback,1,0`, applies generated YAML EQ pipeline -> Outputs to `hw:IanCanadaDAC` (32-bit).

### 2. Software Stack
- **Frontend**: React, React-Router, TailwindCSS v4, Vite 8.
- **Backend API**: Node.js, Express, WebSockets, SQLite (for presets/themes). Protected via `helmet` and `express-rate-limit`.
- **System**: Debian/Raspberry Pi OS, NGINX (Reverse proxy on port 80), Openbox (Window Manager), Chromium (Kiosk mode).

## 🚀 Installation & Setup

1. Assemble the Raspberry Pi 4 with the Ian Canada DAC and Purifi amplifier.
2. Flash a fresh Raspberry Pi OS (Debian Lite is fine, the script installs X11).
3. Clone this repository to `/home/pi/EnzoOS`.
4. Run the automated deployment script with `sudo`:

```bash
cd EnzoOS
sudo chmod +x scripts/setup_pi.sh
sudo ./scripts/setup_pi.sh
```

**What the script does:**
- Updates `apt` dependencies and installs `mpd`, `shairport-sync`, `upmpdcli`, `network-manager`, and X11 packages.
- Downloads the `aarch64` CamillaDSP binary from GitHub.
- Installs the Roon Bridge installer.
- Configures `snd-aloop` kernel module.
- Generates `/etc/xdg/openbox/autostart` to launch Chromium in `--kiosk` mode and hide the cursor with `unclutter`.
- Configures auto-login for the `pi` user on `tty1` to immediately `startx`.
- Injects `.conf` ALSA routing for services and installs `.service` background daemons.

5. **Reboot the Raspberry Pi**. It will automatically boot into the EnzoOS touch interface!

---
*(Note: To integrate Spotify Connect completely, ensure you compile or install `librespot` natively on the Pi if `apt` fails to find it).*
