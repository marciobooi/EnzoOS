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

## 🚀 Installation & Setup (Step-by-Step Guide)

EnzoOS is designed to be a "Plug & Play" firmware for the Raspberry Pi 4, but it can also be tested on a standard Virtual Machine running Ubuntu Server 24.04 LTS.

### 🔌 Phase 1: Hardware & Base OS Preparation

**If using a Raspberry Pi 4:**
1. Use the [Raspberry Pi Imager](https://www.raspberrypi.com/software/) tool.
2. Choose **Ubuntu Server 24.04 LTS (64-bit)** (or Debian/Raspberry Pi OS Lite 64-bit) as the Operating System.
3. Before writing to the SD card, click the **Settings (gear icon)**:
   - Enable SSH.
   - Set the default username to `pi` and pick a password.
   - Configure your local Wi-Fi settings.
4. Flash the SD Card, insert it into the Pi, connect your Ian Canada DAC and Purifi amplifier, and power it on.

**If testing on a Virtual Machine (VM):**
1. Download the [Ubuntu Server 24.04 LTS ISO](https://ubuntu.com/download/server).
2. Install it in VirtualBox / VMware / Proxmox.
3. During installation, create a user named `pi` and explicitly check the box to **"Install OpenSSH Server"**.

### 💻 Phase 2: The One-Line Installer

Once the OS has booted, connect to it from your main computer using SSH.
Open your terminal and type:
```bash
ssh pi@<IP_DO_RASPBERRY_PI_OU_VM>
```

Now, simply execute the EnzoOS One-Line Installer:
```bash
wget -qO- https://raw.githubusercontent.com/marciobooi/EnzoOS/main/install.sh | sudo bash
```

**What the installer does automatically:**
- Installs all core dependencies (Git, Node.js, NGINX, MPD, Shairport-Sync, OpenSSH).
- Downloads the `aarch64` CamillaDSP audio engine binaries.
- Sets up ALSA loopback routing (`snd-aloop`) for Bit-Perfect DSP streaming.
- Installs the X11 graphical server and configures the Pi to Auto-login and boot Chromium in Kiosk Mode on the attached touch screen.
- Configures the SQLite Database and React Frontend.
- **Enables OverlayFS**: Locks the SD card into a Read-Only state to prevent corruption on power-cuts (user presets are safely symlinked to the boot partition).

### 📱 Phase 3: Enjoy & Control

1. **Reboot the device**: `sudo reboot`
2. **Kiosk Display**: The device will immediately boot into the beautiful EnzoOS landscape touch interface.
3. **Mobile Remote**: On your smartphone, open a browser and go to `http://<IP_DO_RASPBERRY_PI>/remote`.
   - **Login**: `enzoOS`
   - **Password**: `enzoOS`

---
*Note for Spotify Connect: If `librespot` is not available via `apt` on your specific Linux distribution, you may need to compile it manually using Rust/Cargo.*
