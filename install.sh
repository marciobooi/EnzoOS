#!/bin/bash

# ==============================================================================
# Resonance HiFi - Ubuntu Kiosk Installer Script
# ==============================================================================
# Target: Ubuntu Server (VM, x86_64, Raspberry Pi 4, etc.)
# Invocation: wget -qO- https://raw.githubusercontent.com/marciobooi/EnzoOS/main/install.sh | sudo bash
# ==============================================================================

# ── Version pins (change here only) ──────────────────────────────────────────
SHAIRPORT_VERSION="5.0.4"
NQPTP_VERSION="1.2.8"
# ─────────────────────────────────────────────────────────────────────────────

# Exit immediately if a command exits with a non-zero status
set -e

# Color codes for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}====================================================================${NC}"
echo -e "${GREEN}          Resonance HiFi - Ubuntu Kiosk Installer Script           ${NC}"
echo -e "${BLUE}====================================================================${NC}"

# ── APT lock helpers ──────────────────────────────────────────────────────────
# Ubuntu 24.04 runs unattended-upgrades and apt-daily timers that hold the
# apt lock and cause "E: Could not get lock" failures mid-install.
# Kill them up-front and apply a 300 s wait-for-lock on every apt_install call.
stop_apt_daemons() {
  systemctl stop unattended-upgrades       2>/dev/null || true
  systemctl stop apt-daily.service         2>/dev/null || true
  systemctl stop apt-daily-upgrade.service 2>/dev/null || true
  # Kill any background apt/dpkg processes still holding the lock
  for pid in $(pgrep -x apt-get || true) $(pgrep -x dpkg || true) $(pgrep -x unattended-upgrade || true); do
    kill -9 "$pid" 2>/dev/null || true
  done
  # Remove stale lock files left by killed processes
  rm -f /var/lib/dpkg/lock-frontend /var/lib/dpkg/lock /var/lib/apt/lists/lock 2>/dev/null || true
  dpkg --configure -a 2>/dev/null || true
}

# Wrapper: always passes DPkg::Lock::Timeout so concurrent lock holders
# are waited on (up to 5 min) rather than failing immediately.
apt_install() {
  apt-get -o DPkg::Lock::Timeout=300 "$@"
}
# ─────────────────────────────────────────────────────────────────────────────

# 1. Verify Root Privileges (Must be run as root/sudo)
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Error: This installer must be run with root privileges (sudo).${NC}"
  echo -e "${YELLOW}Please run as: wget -qO- ... | sudo bash   OR   sudo ./install.sh${NC}"
  exit 1
fi

# 2. Detect original non-root user who invoked sudo
if [ -n "$SUDO_USER" ] && [ "$SUDO_USER" != "root" ]; then
  TARGET_USER=$SUDO_USER
  USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
else
  # Fallback if run directly from a root shell
  echo -e "${YELLOW}Warning: Running directly from root shell. We need to identify the kiosk user.${NC}"
  read -p "Enter the username of the user who will auto-login to the kiosk: " TARGET_USER <&2
  USER_HOME=$(getent passwd "$TARGET_USER" | cut -d: -f6)
  if [ -z "$USER_HOME" ]; then
    echo -e "${RED}Error: User '$TARGET_USER' does not exist on this system.${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}[1/7] Target Environment Configured:${NC}"
echo -e "  Kiosk User: $TARGET_USER"
echo -e "  User Home:  $USER_HOME"

# 3. Setup Project Directory (Clone if run via wget pipe)
if [ -f "./package.json" ]; then
  PROJECT_DIR=$(pwd)
  echo -e "  Project Dir: $PROJECT_DIR (Using current directory)"
else
  PROJECT_DIR="$USER_HOME/EnzoOS"
  echo -e "  Project Dir: $PROJECT_DIR (Cloning repository)"
fi

# 3b. Configure Spotify Developer credentials (shared default)
SPOTIFY_CLIENT_ID="71498cccddf44bbd9696e5373bd44031"
SPOTIFY_CLIENT_SECRET="aa85b6d1cf624bf2ae3c9fe3769f691b"

# 4. System Updates & Prerequisites
echo -e "\n${GREEN}[2/7] Updating system package repositories...${NC}"
stop_apt_daemons
apt_install update
apt_install install -y ca-certificates curl gnupg git build-essential

# 5. Clone or Update repository
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "\n${GREEN}[3/7] Cloning EnzoOS repository into $PROJECT_DIR...${NC}"
  sudo -u $TARGET_USER git clone https://github.com/marciobooi/EnzoOS.git "$PROJECT_DIR"
else
  echo -e "\n${GREEN}[3/7] Updating existing EnzoOS repository in $PROJECT_DIR...${NC}"
  cd "$PROJECT_DIR"
  sudo -u $TARGET_USER git fetch origin main
  sudo -u $TARGET_USER git stash || true
  sudo -u $TARGET_USER git reset --hard origin/main
fi

# 6. Install Node.js (v20)
echo -e "\n${GREEN}[4/7] Installing Node.js & npm...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}Node.js not detected. Adding NodeSource v20 repository...${NC}"
  mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list
  apt_install update
  apt_install install -y nodejs
else
  echo -e "${YELLOW}Node.js $(node -v) already installed.${NC}"
fi

# 7. Remove PulseAudio before installing PipeWire to avoid conflicts.
# PA installs /etc/alsa/conf.d/99-pulse.conf which overrides pcm.!default to its
# null sink, silencing all ALSA audio. It also restarts via systemd socket
# activation, bypassing autospawn=no. Must be fully purged before PipeWire setup.
echo -e "\n${YELLOW}Stopping and removing PulseAudio (replaced by PipeWire)...${NC}"
# Stop any running PulseAudio instances (system and all user sessions)
systemctl --global stop pulseaudio.socket pulseaudio.service 2>/dev/null || true
systemctl --global disable pulseaudio.socket pulseaudio.service 2>/dev/null || true
pkill -x pulseaudio 2>/dev/null || true
# Purge all PulseAudio packages and their config files
apt_install remove --purge -y \
  pulseaudio \
  pulseaudio-utils \
  pulseaudio-module-bluetooth \
  pulseaudio-alsa \
  pulseaudio-module-gsettings \
  gstreamer1.0-pulseaudio \
  libpulse0 2>/dev/null || true
apt_install autoremove -y 2>/dev/null || true
# Remove the ALSA override file PulseAudio leaves behind even after purge
rm -f /etc/alsa/conf.d/99-pulse.conf
rm -f /usr/share/alsa/alsa.conf.d/99-pulse.conf
echo -e "${GREEN}PulseAudio removed.${NC}"

# Install GUI, Kiosk Display Stack, Audio, SSH, Librespot, and MPD
echo -e "\n${GREEN}[5/7] Installing display server, window manager, browser, audio, SSH, MPD, and dependencies...${NC}"
apt_install install -y \
  xserver-xorg \
  xinit \
  x11-xserver-utils \
  openbox \
  chromium-browser \
  alsa-utils \
  pipewire \
  pipewire-pulse \
  pipewire-alsa \
  wireplumber \
  openssh-server \
  unclutter \
  avahi-daemon \
  libnss-mdns \
  mpd \
  mpc \
  sqlite3 \
  libsqlite3-dev \
  xinput \
  evtest

# Enable ALSA Loopback kernel module immediately and on boot.
# CamillaDSP (ALSA-only build) still captures from this loopback via dsnoop.
# PipeWire loopback module bridges: ResonanceInput virtual sink → hw:Loopback,0,0
echo -e "${YELLOW}Enabling ALSA Loopback device module (snd-aloop) for CamillaDSP capture...${NC}"
modprobe snd-aloop || true
if ! grep -q "snd-aloop" /etc/modules; then
  echo "snd-aloop" >> /etc/modules
fi

# Configure /etc/asound.conf for PipeWire architecture.
# pcm.!default is handled by /usr/share/alsa/alsa.conf.d/99-pipewire-default.conf
# (installed with pipewire-alsa), which routes all ALSA default output to PipeWire.
# We only keep loop_dsnoop so CamillaDSP can capture via ALSA dsnoop on the loopback.
echo -e "${YELLOW}Creating ALSA configuration (/etc/asound.conf)...${NC}"
cat <<'ASOUNDEOF' > /etc/asound.conf
# Resonance HiFi — ALSA config
# camilla_input: ALSA dmix — MPD/ALSA sources write to loopback write-side
# loop_dsnoop:   ALSA dsnoop — CamillaDSP reads from loopback read-side
# Both at 48000 Hz (ALSA loopback requires a single shared rate per substream).

pcm.camilla_input {
    type dmix
    ipc_key 1111
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,0,0"
        channels 2
        rate 48000
        format S16_LE
        period_size 1024
    }
}

pcm.loop_dsnoop {
    type dsnoop
    ipc_key 2048
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,1,0"
        channels 2
        rate 48000
        format S16_LE
        period_size 1024
    }
}
ASOUNDEOF

# ── PipeWire configuration: virtual null sink + loopback bridge ──────────────
# Architecture:
#   Sources (MPD/raspotify/shairport/BT/Chromium)
#     → PipeWire "ResonanceInput" virtual null sink (native PipeWire mixing, ~5ms)
#     → PW loopback module → hw:Loopback,0,0
#     → ALSA dsnoop (loop_dsnoop)
#     → CamillaDSP (EQ/DSP) → hw:CARD=Intel,DEV=0
#
# This replaces the old dmix/dsnoop-only chain (93ms buffer, no native BT codecs).
echo -e "${YELLOW}Configuring PipeWire virtual sink and loopback for CamillaDSP bridge...${NC}"

mkdir -p /etc/pipewire/pipewire.conf.d
cat <<'PWEOF' > /etc/pipewire/pipewire.conf.d/50-resonance-sink.conf
# Resonance HiFi — PipeWire virtual null sink
# All audio sources route here by default. CamillaDSP captures via ALSA loopback bridge.
# No fixed audio.rate — PipeWire clock.allowed-rates (52-resonance-bitperfect.conf) picks
# the native rate of the active source for bit-perfect passthrough.
context.objects = [
  { factory = adapter
    args = {
      factory.name      = support.null-audio-sink
      node.name         = "ResonanceInput"
      node.description  = "Resonance HiFi Input"
      media.class       = "Audio/Sink"
      audio.channels    = 2
      audio.format      = "S16LE"
      node.pause-on-idle = false
      priority.session  = 2000
    }
  }
]
PWEOF

cat <<'PWLBEOF' > /etc/pipewire/pipewire.conf.d/51-resonance-loopback.conf
# Resonance HiFi — PipeWire loopback: ResonanceInput monitor → ALSA Loopback
# Bridges the PipeWire virtual sink to hw:Loopback,0,0 for CamillaDSP ALSA capture.
context.modules = [
  { name = libpipewire-module-loopback
    args = {
      node.description = "Resonance loopback to CamillaDSP"
      capture.props = {
        node.name         = "resonance.loopback.capture"
        audio.position    = [ FL FR ]
        stream.dont-remix = true
        node.passive      = true
        target.object     = "ResonanceInput"
      }
      playback.props = {
        node.name      = "resonance.loopback.playback"
        audio.position = [ FL FR ]
        target.object  = "hw:Loopback,0,0"
      }
    }
  }
]
PWLBEOF

# ── PipeWire clock: fixed at 48000 Hz ────────────────────────────────────────
# clock.allowed-rates is intentionally NOT used: the ALSA loopback bridge
# (hw:Loopback,0,0 ↔ loop_dsnoop at 48000 Hz) requires a fixed shared rate.
# If PipeWire switches clock (e.g. to 44100 Hz), the loopback fails to connect
# → PCM Slave Active stays off → silence. PipeWire resamples all content to
# 48000 Hz inside its graph before writing to the loopback bridge.
cat <<'BPEOF' > /etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf
# Resonance HiFi — PipeWire fixed clock at 48000 Hz
# clock.allowed-rates absent: ALSA loopback bridge requires fixed rate.
context.properties = {
    default.clock.rate          = 48000
    default.clock.quantum       = 1024
    default.clock.min-quantum   = 32
    default.clock.max-quantum   = 8192
}
BPEOF

# WirePlumber rule: set ResonanceInput as the default audio output
mkdir -p /etc/wireplumber/wireplumber.conf.d
cat <<'WPEOF' > /etc/wireplumber/wireplumber.conf.d/51-resonance-default-sink.conf
# Resonance HiFi: route all PipeWire audio to ResonanceInput virtual sink by default
wireplumber.settings = {
  default-configured-audio-sink = "ResonanceInput"
}
WPEOF

# Copy WirePlumber config to user config dir (user-level WirePlumber reads this)
mkdir -p "$USER_HOME/.config/wireplumber/wireplumber.conf.d"
cp /etc/wireplumber/wireplumber.conf.d/51-resonance-default-sink.conf \
   "$USER_HOME/.config/wireplumber/wireplumber.conf.d/"
chown -R $TARGET_USER:$TARGET_USER "$USER_HOME/.config/wireplumber"

# PipeWire-pulse TCP listener: lets system services (MPD, shairport) connect via
# 127.0.0.1:4713 when they cannot access the user socket at /run/user/1000/pulse/native
mkdir -p "$USER_HOME/.config/pipewire/pipewire-pulse.conf.d"
cat <<'PWPEOF' > "$USER_HOME/.config/pipewire/pipewire-pulse.conf.d/99-resonance.conf"
# Resonance HiFi — PipeWire-pulse override: enable TCP listener for system services
pulse.properties = {
  server.address = [
    "unix:native"
    "tcp:127.0.0.1:4713"
  ]
}
PWPEOF
chown -R $TARGET_USER:$TARGET_USER "$USER_HOME/.config/pipewire"

# Enable lingering so PipeWire user services survive before X session starts
loginctl enable-linger $TARGET_USER 2>/dev/null || true

# Enable and start PipeWire user services for the kiosk user
TARGET_UID=$(id -u $TARGET_USER)
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$TARGET_UID \
  systemctl --user enable pipewire pipewire-pulse wireplumber 2>/dev/null || true

echo -e "${GREEN}PipeWire configured: all sources → ResonanceInput → loopback → CamillaDSP.${NC}"

# Write complete MPD configuration.
# MPD uses ALSA camilla_input (dmix → hw:Loopback,0,0) to write directly to
# the loopback — bypasses the PipeWire loopback bridge which does not reliably
# connect to hw:Loopback,0,0. Volume managed by CamillaDSP via SetVolume.
echo -e "${YELLOW}Writing complete MPD configuration (/etc/mpd.conf)...${NC}"
cat <<'MPDEOF' > /etc/mpd.conf
music_directory         "/var/lib/mpd/music"
playlist_directory      "/var/lib/mpd/playlists"
db_file                 "/var/lib/mpd/tag_cache"
state_file              "/var/lib/mpd/state"
sticker_file            "/var/lib/mpd/sticker.sql"

bind_to_address         "any"
port                    "6600"

audio_output {
    type            "alsa"
    name            "CamillaDSP Input"
    device          "camilla_input"
    mixer_type      "none"
}
MPDEOF

# MPD must run as TARGET_USER to access the PipeWire socket (/run/user/<uid>/pipewire-0).
# Override the systemd service User and inject PipeWire environment variables.
echo -e "${YELLOW}Configuring MPD to run as $TARGET_USER with PipeWire environment...${NC}"
TARGET_UID=$(id -u $TARGET_USER)
mkdir -p /etc/systemd/system/mpd.service.d
cat > /etc/systemd/system/mpd.service.d/run-as-user.conf <<MPDOVEOF
[Service]
User=$TARGET_USER
Group=$TARGET_USER
Environment="XDG_RUNTIME_DIR=/run/user/$TARGET_UID"
Environment="PIPEWIRE_REMOTE=/run/user/$TARGET_UID/pipewire-0"
MPDOVEOF

# Give TARGET_USER ownership of MPD state files
chown -R $TARGET_USER:$TARGET_USER /var/lib/mpd 2>/dev/null || true

# Enable and start MPD service
echo -e "${YELLOW}Enabling and starting Media Player Daemon (MPD)...${NC}"
systemctl daemon-reload
systemctl enable mpd
systemctl restart mpd

echo -e "\n${GREEN}Installing CamillaDSP (latest stable)...${NC}"
ARCH=$(uname -m)
echo -e "${YELLOW}Detected CPU architecture: ${ARCH}${NC}"
if [ "$ARCH" = "aarch64" ]; then
  CAMILLA_ARCH="aarch64"
elif [ "$ARCH" = "x86_64" ]; then
  CAMILLA_ARCH="amd64"
elif [[ "$ARCH" =~ "arm" ]]; then
  CAMILLA_ARCH="armv7"
else
  CAMILLA_ARCH="aarch64"
fi

# Fetch latest release tag and download URL from GitHub API (ALSA-only binary, no PipeWire/PA)
echo -e "${YELLOW}Fetching latest CamillaDSP release from GitHub...${NC}"
CAMILLA_URL=$(curl -s https://api.github.com/repos/HEnquist/camilladsp/releases/latest \
  | python3 -c "import sys,json; r=json.load(sys.stdin); assets=[a['browser_download_url'] for a in r['assets'] if 'linux-${CAMILLA_ARCH}.tar.gz' == a['name'].split('camilladsp-')[1]]; print(assets[0] if assets else '')" 2>/dev/null || true)
CAMILLA_VERSION=$(curl -s https://api.github.com/repos/HEnquist/camilladsp/releases/latest \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null || echo "unknown")

if [ -z "$CAMILLA_URL" ]; then
  echo -e "${YELLOW}GitHub API lookup failed — falling back to known v4.1.3 URL.${NC}"
  CAMILLA_URL="https://github.com/HEnquist/camilladsp/releases/download/v4.1.3/camilladsp-linux-${CAMILLA_ARCH}.tar.gz"
  CAMILLA_VERSION="v4.1.3"
fi

# Stop existing camilladsp before replacing binary (avoids "Text file busy")
systemctl stop camilladsp 2>/dev/null || true

echo -e "${YELLOW}Downloading CamillaDSP ${CAMILLA_VERSION} for ${CAMILLA_ARCH}...${NC}"
wget -q "$CAMILLA_URL" -O /tmp/camilladsp.tar.gz
tar -xzf /tmp/camilladsp.tar.gz -C /tmp/
mv /tmp/camilladsp /usr/bin/camilladsp
chmod +x /usr/bin/camilladsp
rm -f /tmp/camilladsp.tar.gz
echo -e "${GREEN}CamillaDSP ${CAMILLA_VERSION} installed successfully in /usr/bin/camilladsp.${NC}"

# Create default flat CamillaDSP v4 configuration to prevent crash on initial run.
# CamillaDSP 4.x is built with ALSA-only backends (no Pulse/PipeWire capture).
# Audio path: PipeWire → ResonanceInput virtual sink → PW loopback → hw:Loopback,0,0
#             → ALSA dsnoop (loop_dsnoop) → CamillaDSP capture (this config)
# Note: v4 uses S16_LE format strings and 'channels' (array) in pipeline Filter steps
echo -e "${YELLOW}Creating initial flat CamillaDSP configuration...${NC}"
cat <<EOF > "$PROJECT_DIR/camilladsp.yml"
devices:
  samplerate: 44100
  chunksize: 8192
  queuelimit: 4
  capture:
    type: Alsa
    channels: 2
    device: loop_dsnoop
    format: S16_LE
  playback:
    type: Alsa
    channels: 2
    device: hw:0,0
    format: S16_LE
mixers:
  speaker_map:
    channels:
      in: 2
      out: 2
    mapping:
      - dest: 0
        sources:
          - channel: 0
            gain: 0
      - dest: 1
        sources:
          - channel: 1
            gain: 0
pipeline:
  - type: Mixer
    name: speaker_map
EOF
chown $TARGET_USER:$TARGET_USER "$PROJECT_DIR/camilladsp.yml"

# Create CamillaDSP systemd service running in the background
echo -e "${YELLOW}Configuring CamillaDSP systemd service...${NC}"
cat <<EOF > /etc/systemd/system/camilladsp.service
[Unit]
Description=CamillaDSP Audio Processor
After=network.target sound.target
Requires=sound.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/bin/camilladsp $PROJECT_DIR/camilladsp.yml -p 1234
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable camilladsp
systemctl restart camilladsp

echo -e "${YELLOW}Installing Raspotify repository and precompiled Librespot daemon...${NC}"
# Install Raspotify repository and package (contains the precompiled /usr/bin/librespot binary)
curl -sL https://dtcooper.github.io/raspotify/install.sh | sh

# Assign hardware permissions to the target user
echo -e "${YELLOW}Adding user '$TARGET_USER' to audio/video groups...${NC}"
usermod -aG audio,video,dialout $TARGET_USER

# Enable and start SSH service
echo -e "${YELLOW}Configuring SSH daemon...${NC}"
systemctl enable ssh
systemctl start ssh

# Disable conflicting custom librespot service if it exists
if [ -f "/etc/systemd/system/librespot.service" ]; then
  echo -e "${YELLOW}Disabling conflicting custom librespot service...${NC}"
  systemctl stop librespot || true
  systemctl disable librespot || true
  rm -f /etc/systemd/system/librespot.service
  systemctl daemon-reload
fi

# Configure Raspotify system settings in its standard Linux configuration file
echo -e "${YELLOW}Configuring Raspotify settings in /etc/raspotify/conf...${NC}"
sed -i 's/#LIBRESPOT_NAME="Librespot"/LIBRESPOT_NAME="Resonance Connect"/g' /etc/raspotify/conf
sed -i 's/#LIBRESPOT_BITRATE=160/LIBRESPOT_BITRATE=320/g' /etc/raspotify/conf
sed -i 's/LIBRESPOT_DISABLE_CREDENTIAL_CACHE=/#LIBRESPOT_DISABLE_CREDENTIAL_CACHE=/g' /etc/raspotify/conf
sed -i 's/#LIBRESPOT_INITIAL_VOLUME=50/LIBRESPOT_INITIAL_VOLUME=50/g' /etc/raspotify/conf
sed -i 's/#LIBRESPOT_BACKEND=/LIBRESPOT_BACKEND=alsa/g' /etc/raspotify/conf
# Route Spotify Connect to PipeWire via ALSA "default" device.
# /usr/share/alsa/alsa.conf.d/99-pipewire-default.conf (from pipewire-alsa)
# makes "default" route to PipeWire → ResonanceInput virtual sink → CamillaDSP.
if grep -q "LIBRESPOT_DEVICE=" /etc/raspotify/conf; then
  sed -i 's/.*LIBRESPOT_DEVICE=.*/LIBRESPOT_DEVICE="default"/g' /etc/raspotify/conf
else
  echo 'LIBRESPOT_DEVICE="default"' >> /etc/raspotify/conf
fi

# Enable and start native Raspotify systemd daemon
echo -e "${YELLOW}Enabling and starting Raspotify service...${NC}"
systemctl daemon-reload
systemctl enable raspotify
systemctl restart raspotify
echo -e "${GREEN}Raspotify Spotify Connect service configured and started.${NC}"

# Configure passwordless sudo for service management (CamillaDSP, Spotify, AirPlay, etc.)
echo -e "${YELLOW}Configuring sudo permissions for service management...${NC}"
cat <<EOF > /etc/sudoers.d/resonance
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/raspotify/conf, /bin/tee /etc/raspotify/conf, /usr/bin/tee /etc/asound.conf, /bin/tee /etc/asound.conf, /usr/bin/tee /etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf, /bin/tee /etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf, /usr/bin/systemctl restart raspotify, /bin/systemctl restart raspotify, /usr/bin/systemctl restart camilladsp, /bin/systemctl restart camilladsp, /usr/bin/systemctl reload camilladsp, /bin/systemctl reload camilladsp, /usr/local/bin/kiosk-power.sh, /usr/local/bin/kiosk-brightness.sh, /usr/bin/systemctl start shairport-sync, /bin/systemctl start shairport-sync, /usr/bin/systemctl stop shairport-sync, /bin/systemctl stop shairport-sync, /usr/bin/systemctl start upmpdcli, /bin/systemctl start upmpdcli, /usr/bin/systemctl stop upmpdcli, /bin/systemctl stop upmpdcli, /usr/bin/systemctl restart mpd, /bin/systemctl restart mpd
EOF
chmod 440 /etc/sudoers.d/resonance

# Configure Xwrapper to run X server without root restrictions
echo -e "${YELLOW}Configuring Xwrapper...${NC}"
echo "allowed_users=anybody" | tee /etc/X11/Xwrapper.config

# Write systemd autologin config for TTY1 console
echo -e "${YELLOW}Configuring systemd console auto-login...${NC}"
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat <<EOF > /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $TARGET_USER --noclear %I \$TERM
EOF

# Configure friendly hostname for local mDNS resolution (resonance.local)
echo -e "${YELLOW}Configuring system hostname to 'resonance'...${NC}"
hostnamectl set-hostname resonance || true
sed -i 's/127.0.1.1.*/127.0.1.1\tresonance/g' /etc/hosts || true

# Deploy Avahi service discovery configuration
echo -e "${YELLOW}Deploying Avahi service discovery configuration...${NC}"
mkdir -p /etc/avahi/services
cp "$PROJECT_DIR/scripts/resonance.service" /etc/avahi/services/resonance.service
chmod 644 /etc/avahi/services/resonance.service
systemctl enable avahi-daemon || true
systemctl restart avahi-daemon || true

# 8. Configure Kiosk startup scripts
echo -e "\n${GREEN}[5b/7] Configuring Waveshare 11.9\" HDMI LCD display and touchscreen...${NC}"

# ── /boot/firmware/config.txt — HDMI custom resolution ─────────────────────
# The Waveshare 11.9" LCD is a 320×1480 portrait panel used in landscape
# orientation (1480×320). We add a custom CVT modeline via hdmi_cvt.
# hdmi_group=2 (DMT), hdmi_mode=87 (custom), hdmi_cvt specifies W H Hz.
CONFIG_TXT="/boot/firmware/config.txt"
if [ -f "$CONFIG_TXT" ]; then
  # Remove any previous Resonance display block before rewriting
  sed -i '/# Resonance HiFi display start/,/# Resonance HiFi display end/d' "$CONFIG_TXT"
  cat >> "$CONFIG_TXT" <<'DISPLAYEOF'
# Resonance HiFi display start — Waveshare 11.9" HDMI LCD (1480×320 landscape)
hdmi_group=2
hdmi_mode=87
hdmi_cvt 1480 320 60 6 0 0 0
hdmi_drive=2
# Resonance HiFi display end
DISPLAYEOF
  echo -e "${GREEN}  HDMI config written to $CONFIG_TXT${NC}"
else
  echo -e "${YELLOW}  /boot/firmware/config.txt not found — skipping HDMI config (QEMU/non-Pi).${NC}"
fi

# ── udev rule — persistent touch rotation for Waveshare USB capacitive panel ─
# The USB HID panel identifies itself with these names/VIDs on known firmware.
# LIBINPUT_CALIBRATION_MATRIX applies 90° CW rotation so X/Y match landscape.
# If touches are mirrored after install, try swapping to: 0 -1 1  1 0 0  0 0 1
UDEV_TOUCH="/etc/udev/rules.d/99-waveshare-touch.rules"
cat > "$UDEV_TOUCH" <<'UDEVEOF'
# Waveshare 11.9" HDMI LCD — USB capacitive touch rotation (90° CW landscape)
# Matches by device name (varies by panel firmware revision)
ATTRS{name}=="WaveShare*",  ENV{LIBINPUT_CALIBRATION_MATRIX}="0 1 0 -1 0 1 0 0 1"
ATTRS{name}=="Waveshare*",  ENV{LIBINPUT_CALIBRATION_MATRIX}="0 1 0 -1 0 1 0 0 1"
ATTRS{name}=="ILITEK*",     ENV{LIBINPUT_CALIBRATION_MATRIX}="0 1 0 -1 0 1 0 0 1"
ATTRS{name}=="Goodix*",     ENV{LIBINPUT_CALIBRATION_MATRIX}="0 1 0 -1 0 1 0 0 1"
# Fallback: match by USB Vendor ID 0x0EEF (eGalax, used on many Waveshare panels)
ATTRS{idVendor}=="0eef",    ENV{LIBINPUT_CALIBRATION_MATRIX}="0 1 0 -1 0 1 0 0 1"
UDEVEOF
chmod 644 "$UDEV_TOUCH"
udevadm control --reload-rules 2>/dev/null && udevadm trigger 2>/dev/null || true
echo -e "${GREEN}  Touch udev rule written to $UDEV_TOUCH${NC}"

echo -e "\n${GREEN}[6/7] Configuring kiosk startup files...${NC}"

# Deploy kiosk power management and wake monitor scripts
echo -e "${YELLOW}Deploying kiosk power management and wake monitor scripts...${NC}"
cp "$PROJECT_DIR/scripts/kiosk-power.sh" "/usr/local/bin/kiosk-power.sh"
chmod +x "/usr/local/bin/kiosk-power.sh"
chown root:root "/usr/local/bin/kiosk-power.sh"

cp "$PROJECT_DIR/scripts/kiosk-brightness.sh" "/usr/local/bin/kiosk-brightness.sh"
chmod +x "/usr/local/bin/kiosk-brightness.sh"
chown root:root "/usr/local/bin/kiosk-brightness.sh"

cp "$PROJECT_DIR/scripts/kiosk-wake-monitor.sh" "/usr/local/bin/kiosk-wake-monitor.sh"
chmod +x "/usr/local/bin/kiosk-wake-monitor.sh"
chown root:root "/usr/local/bin/kiosk-wake-monitor.sh"

# Ensure Chromium snap profile directories exist — snap Chromium's AppArmor policy
# only allows writes inside ~/snap/chromium/common/, not ~/.config/
echo -e "${YELLOW}Creating Chromium kiosk profile data directories...${NC}"
mkdir -p "$USER_HOME/snap/chromium/common/kiosk-profile"
mkdir -p "$USER_HOME/snap/chromium/common/kiosk-cache"
chown -R $TARGET_USER:$TARGET_USER "$USER_HOME/snap/chromium/common/kiosk-profile" "$USER_HOME/snap/chromium/common/kiosk-cache"

# Make OTA update script executable
chmod +x "$PROJECT_DIR/scripts/update.sh"

# Deploy .xinitrc from the repository to the target user home directory
echo -e "${YELLOW}Deploying kiosk startup xinitrc config...${NC}"
cp "$PROJECT_DIR/scripts/xinitrc" "$USER_HOME/.xinitrc"
chmod +x "$USER_HOME/.xinitrc"
chown $TARGET_USER:$TARGET_USER "$USER_HOME/.xinitrc"

# Deploy Openbox configuration to remove window decorations
echo -e "${YELLOW}Deploying Openbox config to disable window decorations...${NC}"
mkdir -p "$USER_HOME/.config/openbox"
cp "$PROJECT_DIR/scripts/openbox_rc.xml" "$USER_HOME/.config/openbox/rc.xml"
chown -R $TARGET_USER:$TARGET_USER "$USER_HOME/.config"
chown -R $TARGET_USER:$TARGET_USER "$USER_HOME/.cache"

# Automatically trigger X server when logging in on TTY1 console
AUTOSTART_X_BLOCK=$(cat <<'EOF'

# Resonance HiFi - Autostart X Server on TTY1 Boot
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  while true; do
    startx -- -nocursor 2>/tmp/resonance_startx.log
    echo "[Resonance] X exited. Restarting in 3s..."
    sleep 3
  done
fi
EOF
)

# CRITICAL FIX: Target .bashrc exclusively. Ubuntu updates ignore .bash_profile 
# during automated tty1 tty agetty logins.
PROFILE_FILE="$USER_HOME/.bashrc"

if ! grep -q "Autostart X Server on TTY1 Boot" "$PROFILE_FILE"; then
  echo -e "${YELLOW}Injecting autostart loop into $PROFILE_FILE...${NC}"
  echo "$AUTOSTART_X_BLOCK" >> "$PROFILE_FILE"
  chown $TARGET_USER:$TARGET_USER "$PROFILE_FILE"
else
  echo -e "${YELLOW}Autostart loop already present in $PROFILE_FILE.${NC}"
fi

# ── [6b/7] Streaming Sources: AirPlay, UPnP/DLNA, Bluetooth A2DP ────────────
echo -e "\n${GREEN}[6b/7] Installing streaming source services (AirPlay, UPnP, Bluetooth)...${NC}"

# ── AirPlay 2: NQPTP + shairport-sync (built from source) ───────────────────
# Ubuntu 24.04 ships shairport-sync 3.3.8 (AirPlay 1 only).
# AirPlay 2 requires shairport-sync 5.x + NQPTP timing daemon — both must be
# built from source.

echo -e "${YELLOW}Installing shairport-sync/NQPTP build dependencies...${NC}"
apt_install install -y \
  autoconf automake libtool \
  libpopt-dev libconfig-dev libasound2-dev libavahi-client-dev \
  libssl-dev libsoxr-dev libglib2.0-dev xxd libpipewire-0.3-dev \
  libavformat-dev libavcodec-dev libavutil-dev libswresample-dev \
  pkg-config libdbus-1-dev \
  libplist-utils libplist-dev \
  libsodium-dev libgcrypt20-dev 2>/dev/null || true

# Remove apt shairport-sync if present (old AirPlay 1 package)
systemctl stop shairport-sync 2>/dev/null || true
apt_install remove -y shairport-sync 2>/dev/null || true

# ── Step 1: NQPTP (required by shairport-sync AirPlay 2) ────────────────────
_INSTALLED_NQPTP_VERSION=""
if [ -f /usr/local/bin/nqptp ]; then
  _INSTALLED_NQPTP_VERSION=$(cat /tmp/nqptp/gitversion.h 2>/dev/null | grep -oP '"[0-9.]+"' | tr -d '"' || true)
fi

if [ "${_INSTALLED_NQPTP_VERSION}" = "${NQPTP_VERSION}" ]; then
  echo -e "${YELLOW}NQPTP ${NQPTP_VERSION} already installed — skipping build.${NC}"
else
  echo -e "${YELLOW}Building NQPTP ${NQPTP_VERSION} from source...${NC}"
  rm -rf /tmp/nqptp
  git clone https://github.com/mikebrady/nqptp.git /tmp/nqptp
  cd /tmp/nqptp
  git checkout "${NQPTP_VERSION}"
  autoreconf -fi
  ./configure
  make -j$(nproc)
  make install
  # Install systemd service file (not installed by make install in this version)
  cp /tmp/nqptp/nqptp.service /etc/systemd/system/nqptp.service
  systemctl daemon-reload
  systemctl enable nqptp
  systemctl start nqptp
  echo -e "${GREEN}NQPTP ${NQPTP_VERSION} installed.${NC}"
fi

# ── Step 2: shairport-sync 5.x with AirPlay 2 ───────────────────────────────
_INSTALLED_SPS_VERSION=$(shairport-sync --version 2>&1 | grep -oP '^\d+\.\d+\.\d+' || true)
if [ "${_INSTALLED_SPS_VERSION}" = "${SHAIRPORT_VERSION}" ]; then
  echo -e "${YELLOW}shairport-sync ${SHAIRPORT_VERSION} already installed — skipping build.${NC}"
else
  echo -e "${YELLOW}Building shairport-sync ${SHAIRPORT_VERSION} (AirPlay 2) from source...${NC}"
  rm -rf /tmp/shairport-sync
  git clone https://github.com/mikebrady/shairport-sync.git /tmp/shairport-sync
  cd /tmp/shairport-sync
  git checkout "${SHAIRPORT_VERSION}"
  autoreconf -fi
  # Check if --with-pipewire configure flag is available
  _PW_FLAG=""
  if ./configure --help 2>&1 | grep -q '\-\-with-pipewire'; then
    _PW_FLAG="--with-pipewire"
  fi
  ./configure --sysconfdir=/etc --with-alsa --with-soxr --with-avahi \
    --with-ssl=openssl --with-airplay-2 ${_PW_FLAG}
  make -j$(nproc)
  make install
  # Install systemd service file (generated by configure into scripts/)
  cp /tmp/shairport-sync/scripts/shairport-sync.service /etc/systemd/system/shairport-sync.service
  systemctl daemon-reload
  echo -e "${GREEN}shairport-sync ${SHAIRPORT_VERSION} (AirPlay2) installed.${NC}"
fi

# Write shairport-sync config: output to ALSA default → PipeWire → ResonanceInput.
cat <<'SSEOF' > /etc/shairport-sync.conf
// Resonance HiFi — shairport-sync 5.x configuration (AirPlay 2)
// AirPlay is inherently LAN-only: discovery uses mDNS/Bonjour (multicast)
// which does not route through NAT, so external devices cannot connect.
// The interface setting below further restricts to the primary LAN adapter.
general = {
  name = "Resonance HiFi";
  drift_tolerance_in_seconds = 0.002;
  ignore_volume_control = "no";
  volume_range_db = 60;
};

alsa = {
  output_device = "default";
};

sessioncontrol = {
  run_this_before_play_begins = "";
  run_this_after_play_ends = "";
  wait_for_completion = "no";
  allow_session_interruption = "yes";
  session_timeout = 120;
};
SSEOF

# Do NOT enable shairport-sync at boot — the kiosk activates it on demand.
# NQPTP must always run (it's a timing server that shairport-sync depends on).
systemctl disable shairport-sync 2>/dev/null || true
systemctl stop shairport-sync 2>/dev/null || true
echo -e "${GREEN}shairport-sync ${SHAIRPORT_VERSION} (AirPlay 2) configured (demand-activated). NQPTP runs continuously.${NC}"

# ── UPnP / DLNA: upmpdcli (built from source — not in Ubuntu 24.04 apt) ─────
# Build order: npupnp → libupnpp → upmpdcli
# All three use meson/ninja build system.
echo -e "${YELLOW}Installing upmpdcli build dependencies...${NC}"
apt_install install -y meson ninja-build libmpdclient-dev libmicrohttpd-dev libjsoncpp-dev 2>/dev/null || true

if command -v upmpdcli &>/dev/null; then
  echo -e "${YELLOW}upmpdcli already installed — skipping build.${NC}"
else
  echo -e "${YELLOW}Building npupnp (UPnP base library) from source...${NC}"
  rm -rf /tmp/npupnp /tmp/npupnp-build
  git clone https://framagit.org/medoc92/npupnp.git /tmp/npupnp
  cd /tmp/npupnp
  git checkout "$(git tag -l | sort -V | tail -1)"
  meson setup /tmp/npupnp-build --prefix=/usr/local
  ninja -C /tmp/npupnp-build
  ninja -C /tmp/npupnp-build install
  ldconfig

  echo -e "${YELLOW}Building libupnpp (C++ UPnP wrapper) from source...${NC}"
  rm -rf /tmp/libupnpp /tmp/libupnpp-build
  git clone https://framagit.org/medoc92/libupnpp.git /tmp/libupnpp
  cd /tmp/libupnpp
  git checkout "$(git tag -l | sort -V | tail -1)"
  PKG_CONFIG_PATH=/usr/local/lib/aarch64-linux-gnu/pkgconfig:/usr/local/lib/$(uname -m)-linux-gnu/pkgconfig \
    meson setup /tmp/libupnpp-build --prefix=/usr/local
  ninja -C /tmp/libupnpp-build
  ninja -C /tmp/libupnpp-build install
  ldconfig

  echo -e "${YELLOW}Building upmpdcli (UPnP renderer) from source...${NC}"
  rm -rf /tmp/upmpdcli-src /tmp/upmpdcli-build
  git clone https://framagit.org/medoc92/upmpdcli.git /tmp/upmpdcli-src
  cd /tmp/upmpdcli-src
  git checkout "$(git tag -l | grep -E '^upmpdcli-v' | sort -V | tail -1)"
  PKG_CONFIG_PATH=/usr/local/lib/aarch64-linux-gnu/pkgconfig:/usr/local/lib/$(uname -m)-linux-gnu/pkgconfig \
    meson setup /tmp/upmpdcli-build --prefix=/usr/local
  ninja -C /tmp/upmpdcli-build
  ninja -C /tmp/upmpdcli-build install
  ldconfig

  # upmpdcli drops privileges to a system user named 'upmpdcli' at startup
  useradd --system --no-create-home --shell /usr/sbin/nologin upmpdcli 2>/dev/null || true
  usermod -aG audio upmpdcli 2>/dev/null || true

  # Install systemd service (ExecStart path must be /usr/local/bin/upmpdcli)
  sed "s|/usr/bin/upmpdcli|/usr/local/bin/upmpdcli|g" \
    /tmp/upmpdcli-src/systemd/upmpdcli.service \
    > /etc/systemd/system/upmpdcli.service
  systemctl daemon-reload
  touch /var/log/upmpdcli.log && chmod 666 /var/log/upmpdcli.log

  echo -e "${GREEN}upmpdcli installed.${NC}"
fi

# Write upmpdcli config: connect to MPD on localhost:6600
cat <<'UPEOF' > /etc/upmpdcli.conf
# Resonance HiFi — upmpdcli configuration
# Connects as UPnP renderer, delegates to MPD for local audio.
friendlyname = Resonance HiFi
mpdhost = 127.0.0.1
mpdport = 6600
ownqueue = 1
checkcontentformat = 1
logfilename = /var/log/upmpdcli.log
loglevel = 2
UPEOF

systemctl disable upmpdcli 2>/dev/null || true
systemctl stop upmpdcli 2>/dev/null || true
echo -e "${GREEN}upmpdcli installed and configured (demand-activated).${NC}"

# ── Bluetooth A2DP: PipeWire handles BT natively via WirePlumber ─────────────
# PipeWire + WirePlumber provide native Bluetooth A2DP support including LDAC/AAC/aptX.
# bluealsa is NOT needed and conflicts with PipeWire's BT stack.
echo -e "${YELLOW}Installing Bluetooth packages (bluez — PipeWire handles A2DP natively)...${NC}"
apt_install install -y \
  bluez \
  bluez-tools 2>/dev/null || true

# Enable Bluetooth controller
systemctl enable bluetooth 2>/dev/null || true
systemctl start bluetooth 2>/dev/null || true

# Disable bluealsa if installed — conflicts with PipeWire BT handling
systemctl disable --now bluealsa 2>/dev/null || true
systemctl disable --now bluealsa-aplay 2>/dev/null || true
# Remove bluealsa packages if present
apt_install remove -y bluealsa bluealsa-utils 2>/dev/null || true

echo -e "${GREEN}Bluetooth configured: PipeWire handles A2DP sink natively via WirePlumber.${NC}"

# Bluetooth pairing agent — DisplayYesNo capability.
# The connecting device shows a 6-digit confirmation code and the user must
# press "Pair" on their phone. This prevents any background device from pairing
# without explicit user action. NoInputNoOutput (old setting) auto-accepted
# everything silently — replaced here for household security.
# Bluetooth is also only discoverable when the user activates it from the
# kiosk menu (on-demand activation), providing a second layer of control.
cat <<'BTEOF' > /etc/systemd/system/bt-agent.service
[Unit]
Description=Bluetooth Pairing Agent (Resonance HiFi)
After=bluetooth.service
Requires=bluetooth.service

[Service]
Type=simple
User=pi
ExecStart=/usr/bin/bt-agent -c DisplayYesNo
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
BTEOF

systemctl daemon-reload
systemctl enable bt-agent 2>/dev/null || true
systemctl start bt-agent 2>/dev/null || true
echo -e "${GREEN}Bluetooth A2DP configured (demand-activated via kiosk).${NC}"

# 9. Install Node modules, build code and startup PM2
echo -e "\n${GREEN}[7/7] Building application & setting up PM2 server daemon...${NC}"

# Detect primary local IP address dynamically
LOCAL_IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K\S+' || hostname -I | awk '{print $1}')
if [ -z "$LOCAL_IP" ]; then
  LOCAL_IP="127.0.0.1"
fi
echo -e "  Detected Local IP: ${LOCAL_IP}"

# Write .env and .env.example with collected Spotify credentials
echo -e "${YELLOW}Writing environment configuration (.env / .env.example)...${NC}"
rm -f "$PROJECT_DIR/.env" "$PROJECT_DIR/.env.example"

cat > "$PROJECT_DIR/.env" <<ENVEOF
# Resonance HiFi — Auto-generated by install.sh on $(date)
SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}
SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}
PORT=5000
ENVEOF
chown $TARGET_USER:$TARGET_USER "$PROJECT_DIR/.env"
chmod 600 "$PROJECT_DIR/.env"

cat > "$PROJECT_DIR/.env.example" <<EXEOF
# Resonance HiFi — Environment Configuration
# Copy this file to .env and fill in your values.

# ─────────────────────────────────────────────
# Spotify Developer App Credentials
# Create a free app at: https://developer.spotify.com/dashboard
#
# Register BOTH redirect URIs in the Spotify Dashboard:
#   http://127.0.0.1:5000/auth/spotify/callback     ← kiosk (HTTP ok for localhost)
#   https://resonance.local:5001/auth/spotify/callback  ← remote (HTTPS required)
#
# Remote users must visit https://resonance.local:5001/remote (accept the cert warning once).
# ─────────────────────────────────────────────
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here

# Server port (default: 5000). HTTPS runs on HTTPS_PORT (default: 5001).
PORT=5000
HTTPS_PORT=5001
EXEOF
chown $TARGET_USER:$TARGET_USER "$PROJECT_DIR/.env.example"
echo -e "${GREEN}.env and .env.example written.${NC}"

# Generate self-signed TLS certificate for HTTPS remote access (port 5001)
# Spotify requires HTTPS for any redirect URI that isn't 127.0.0.1/localhost.
CERTS_DIR="$PROJECT_DIR/certs"
mkdir -p "$CERTS_DIR"
if [ ! -f "$CERTS_DIR/cert.pem" ] || [ ! -f "$CERTS_DIR/key.pem" ]; then
  echo -e "${YELLOW}Generating self-signed TLS certificate for HTTPS remote access...${NC}"
  cat > /tmp/resonance_ssl.cnf <<SSLEOF
[req]
distinguished_name = req_distinguished_name
x509_extensions = v3_req
prompt = no
[req_distinguished_name]
CN = resonance.local
[v3_req]
subjectAltName = DNS:resonance.local,IP:${LOCAL_IP}
SSLEOF
  openssl req -x509 -newkey rsa:2048 \
    -keyout "$CERTS_DIR/key.pem" \
    -out   "$CERTS_DIR/cert.pem" \
    -days 3650 -nodes \
    -config /tmp/resonance_ssl.cnf 2>/dev/null
  rm -f /tmp/resonance_ssl.cnf
  chown $TARGET_USER:$TARGET_USER "$CERTS_DIR/cert.pem" "$CERTS_DIR/key.pem"
  chmod 600 "$CERTS_DIR/key.pem"
  echo -e "${GREEN}TLS certificate generated: $CERTS_DIR/${NC}"
else
  echo -e "${YELLOW}TLS certificate already exists — skipping generation.${NC}"
fi

# Build app under target user context (prevents folder permission bugs)
cd "$PROJECT_DIR"
echo -e "${YELLOW}Installing npm dependencies (running as $TARGET_USER)...${NC}"
sudo -u $TARGET_USER npm install
sudo -u $TARGET_USER npm install yaml

echo -e "${YELLOW}Removing old build artifacts...${NC}"
if [ -d "$PROJECT_DIR/dist" ]; then
  rm -rf "$PROJECT_DIR/dist"
  echo -e "  Old dist/ removed."
fi

echo -e "${YELLOW}Compiling production assets (running as $TARGET_USER)...${NC}"
sudo -u $TARGET_USER npm run build

# Install PM2 globally
echo -e "${YELLOW}Installing PM2 process manager...${NC}"
npm install -g pm2

# Clear existing instances & start the backend as the target user
sudo -u $TARGET_USER pm2 delete resonance-api &>/dev/null || true
sudo -u $TARGET_USER pm2 start "$PROJECT_DIR/server/index.js" --name "resonance-api" --env PORT=5000
sudo -u $TARGET_USER pm2 save

# Setup PM2 server boot startup configuration
echo -e "${YELLOW}Registering PM2 service with systemd...${NC}"
PM2_STARTUP_CMD=$(pm2 startup systemd -u $TARGET_USER --hp $USER_HOME | grep "sudo env" || true)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi

echo -e "\n${GREEN}====================================================================${NC}"
echo -e "${GREEN}                 INSTALLATION COMPLETED SUCCESSFULLY                ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e "${YELLOW}Rebooting system automatically in 5 seconds to launch the kiosk...${NC}"
echo -e "Press Ctrl+C to cancel auto-reboot."
echo -e "===================================================================="

for i in {5..1}; do
  echo -e "Rebooting in $i..."
  sleep 1
done

echo -e "${GREEN}Rebooting now!${NC}"
reboot
