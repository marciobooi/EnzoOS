#!/bin/bash

# ==============================================================================
# Resonance HiFi - Ubuntu Kiosk Installer Script
# ==============================================================================
# Target: Ubuntu Server (VM, x86_64, Raspberry Pi 4, etc.)
# Invocation: wget -qO- https://raw.githubusercontent.com/marciobooi/EnzoOS/main/install.sh | sudo bash
# ==============================================================================

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
apt-get update
apt-get install -y ca-certificates curl gnupg git build-essential

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
  apt-get update
  apt-get install -y nodejs
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
apt-get remove --purge -y \
  pulseaudio \
  pulseaudio-utils \
  pulseaudio-module-bluetooth \
  pulseaudio-alsa \
  pulseaudio-module-gsettings \
  gstreamer1.0-pulseaudio \
  libpulse0 2>/dev/null || true
apt-get autoremove -y 2>/dev/null || true
# Remove the ALSA override file PulseAudio leaves behind even after purge
rm -f /etc/alsa/conf.d/99-pulse.conf
rm -f /usr/share/alsa/alsa.conf.d/99-pulse.conf
echo -e "${GREEN}PulseAudio removed.${NC}"

# Install GUI, Kiosk Display Stack, Audio, SSH, Librespot, and MPD
echo -e "\n${GREEN}[5/7] Installing display server, window manager, browser, audio, SSH, MPD, and dependencies...${NC}"
apt-get install -y \
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

# Enable ALSA Loopback kernel module immediately and on boot
echo -e "${YELLOW}Enabling ALSA Loopback device module (snd-aloop)...${NC}"
modprobe snd-aloop || true
if ! grep -q "snd-aloop" /etc/modules; then
  echo "snd-aloop" >> /etc/modules
fi

# Configure ALSA Default Device to route to Loopback using dmix (shared write access)
echo -e "${YELLOW}Creating default ALSA configuration (/etc/asound.conf) routing to Loopback...${NC}"
cat <<EOF > /etc/asound.conf
# Resonance HiFi - Default ALSA Route to Loopback
# dmix on camilla_input lets raspotify and MPD share the loopback write side.
pcm.!default {
    type plug
    slave.pcm "camilla_input"
}

ctl.!default {
    type hw
    card Loopback
}

# dmix allows multiple writers (raspotify + MPD) to share the loopback simultaneously
pcm.camilla_input {
    type dmix
    ipc_key 1024
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,0,0"
        channels 2
        rate 44100
        format S16_LE
        period_size 8192
        buffer_size 32768
    }
}

# Share loopback capture side so CamillaDSP can read without exclusive locks
pcm.loop_dsnoop {
    type dsnoop
    ipc_key 2048
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,1,0"
        channels 2
        rate 44100
        format S16_LE
        period_size 8192
    }
}
EOF

# Configure PipeWire to route all audio through the ALSA loopback → CamillaDSP chain.
# PipeWire replaces PulseAudio as the sound server. Chromium/Spotify Web SDK uses
# PipeWire natively. MPD and Raspotify use ALSA dmix directly. All paths meet at
# the camilla_input dmix which feeds hw:Loopback,0,0 → CamillaDSP → DAC.
echo -e "${YELLOW}Configuring PipeWire to route audio through ALSA loopback → CamillaDSP...${NC}"

# PipeWire sink that writes to our dmix loopback device (shared with MPD/Raspotify)
mkdir -p /etc/pipewire/pipewire.conf.d
cat <<'PWEOF' > /etc/pipewire/pipewire.conf.d/50-resonance-sink.conf
# Resonance HiFi: PipeWire output sink → ALSA loopback dmix → CamillaDSP
context.objects = [
  {   factory = adapter
      args = {
        factory.name      = api.alsa.pcm.sink
        node.name         = "alsa_output.resonance_loopback"
        node.description  = "Resonance HiFi (via CamillaDSP)"
        media.class       = "Audio/Sink"
        api.alsa.path     = "camilla_input"
        audio.format      = "S16LE"
        audio.rate        = 44100
        audio.channels    = 2
        audio.allowed-rates = [ 44100 ]
        node.pause-on-idle = false
        priority.session  = 2000
      }
  }
]
PWEOF

# WirePlumber rule: set the loopback sink as the default audio output
mkdir -p /etc/wireplumber/wireplumber.conf.d
cat <<'WPEOF' > /etc/wireplumber/wireplumber.conf.d/51-resonance-default-sink.conf
# Resonance HiFi: route all PipeWire audio to loopback → CamillaDSP by default
wireplumber.settings = {
  default-configured-audio-sink = "alsa_output.resonance_loopback"
}
WPEOF

# Copy WirePlumber config to user config dir (user-level WirePlumber reads this)
mkdir -p "$USER_HOME/.config/wireplumber/wireplumber.conf.d"
cp /etc/wireplumber/wireplumber.conf.d/51-resonance-default-sink.conf \
   "$USER_HOME/.config/wireplumber/wireplumber.conf.d/"
chown -R $TARGET_USER:$TARGET_USER "$USER_HOME/.config/wireplumber"

# Enable lingering so PipeWire user services survive before X session starts
loginctl enable-linger $TARGET_USER 2>/dev/null || true

# Enable and start PipeWire user services for the kiosk user
sudo -u $TARGET_USER XDG_RUNTIME_DIR=/run/user/$(id -u $TARGET_USER) \
  systemctl --user enable pipewire pipewire-pulse wireplumber 2>/dev/null || true

echo -e "${GREEN}PipeWire configured: Chromium/Spotify → PipeWire → loopback → CamillaDSP.${NC}"

# Write complete MPD configuration (always overwrite to prevent partial configs)
echo -e "${YELLOW}Writing complete MPD configuration (/etc/mpd.conf)...${NC}"
cat <<EOF > /etc/mpd.conf
music_directory         "/var/lib/mpd/music"
playlist_directory      "/var/lib/mpd/playlists"
db_file                 "/var/lib/mpd/tag_cache"
state_file              "/var/lib/mpd/state"
sticker_file            "/var/lib/mpd/sticker.sql"

user                    "mpd"
bind_to_address         "any"
port                    "6600"

audio_output {
    type            "alsa"
    name            "ALSA Software Volume"
    device          "camilla_input"
    mixer_type      "software"
}
EOF

# Enable and start MPD service
echo -e "${YELLOW}Enabling and starting Media Player Daemon (MPD)...${NC}"
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

# Create default flat CamillaDSP v4 configuration to prevent crash on initial run
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
# Route Spotify Connect to the dmix loopback (shared with PipeWire and MPD)
if grep -q "LIBRESPOT_DEVICE=" /etc/raspotify/conf; then
  sed -i 's/.*LIBRESPOT_DEVICE=.*/LIBRESPOT_DEVICE="camilla_input"/g' /etc/raspotify/conf
else
  echo 'LIBRESPOT_DEVICE="camilla_input"' >> /etc/raspotify/conf
fi

# Enable and start native Raspotify systemd daemon
echo -e "${YELLOW}Enabling and starting Raspotify service...${NC}"
systemctl daemon-reload
systemctl enable raspotify
systemctl restart raspotify
echo -e "${GREEN}Raspotify Spotify Connect service configured and started.${NC}"

# Configure passwordless sudo for Spotify and CamillaDSP daemon management
echo -e "${YELLOW}Configuring sudo permissions for Spotify and CamillaDSP daemon management...${NC}"
cat <<EOF > /etc/sudoers.d/resonance
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/raspotify/conf, /bin/tee /etc/raspotify/conf, /usr/bin/tee /etc/asound.conf, /bin/tee /etc/asound.conf, /usr/bin/systemctl restart raspotify, /bin/systemctl restart raspotify, /usr/bin/systemctl restart camilladsp, /bin/systemctl restart camilladsp, /usr/bin/systemctl reload camilladsp, /bin/systemctl reload camilladsp, /usr/local/bin/kiosk-power.sh, /usr/local/bin/kiosk-brightness.sh, /usr/bin/systemctl start shairport-sync, /bin/systemctl start shairport-sync, /usr/bin/systemctl stop shairport-sync, /bin/systemctl stop shairport-sync, /usr/bin/systemctl start upmpdcli, /bin/systemctl start upmpdcli, /usr/bin/systemctl stop upmpdcli, /bin/systemctl stop upmpdcli, /usr/bin/systemctl start bluealsa, /bin/systemctl start bluealsa, /usr/bin/systemctl stop bluealsa, /bin/systemctl stop bluealsa
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

# ── AirPlay: shairport-sync ──────────────────────────────────────────────────
echo -e "${YELLOW}Installing shairport-sync (AirPlay receiver)...${NC}"
apt-get install -y \
  shairport-sync \
  libavahi-client3 \
  libavahi-common3 2>/dev/null || true

# Write shairport-sync config: output to ALSA camilla_input dmix
cat <<'SSEOF' > /etc/shairport-sync.conf
// Resonance HiFi — shairport-sync configuration
// Routes AirPlay audio to the ALSA dmix loopback shared with CamillaDSP.
general = {
  name = "Resonance HiFi";
  drift_tolerance_in_seconds = 0.002;
  ignore_volume_control = "no";
  volume_range_db = 60;
};

alsa = {
  output_device = "camilla_input";
  mixer_control_name = "PCM";
};

sessioncontrol = {
  run_this_before_play_begins = "";
  run_this_after_play_ends = "";
  wait_for_completion = "no";
  allow_session_interruption = "yes";
  session_timeout = 120;
};
SSEOF

# Do NOT enable shairport-sync at boot — the kiosk activates it on demand
systemctl disable shairport-sync 2>/dev/null || true
systemctl stop shairport-sync 2>/dev/null || true
echo -e "${GREEN}shairport-sync installed and configured (demand-activated).${NC}"

# ── UPnP / DLNA: upmpdcli ───────────────────────────────────────────────────
echo -e "${YELLOW}Installing upmpdcli (UPnP/DLNA renderer)...${NC}"
apt-get install -y upmpdcli 2>/dev/null || true

# Write upmpdcli config: connect to MPD on localhost:6600
cat <<'UPEOF' > /etc/upmpdcli.conf
# Resonance HiFi — upmpdcli configuration
# Connects as UPnP renderer, delegates to MPD for local audio.
friendlyname = Resonance HiFi
mpdhost = localhost
mpdport = 6600
ownqueue = 1
checkcontentformat = 1
UPEOF

systemctl disable upmpdcli 2>/dev/null || true
systemctl stop upmpdcli 2>/dev/null || true
echo -e "${GREEN}upmpdcli installed and configured (demand-activated).${NC}"

# ── Bluetooth A2DP: bluez + bluealsa ────────────────────────────────────────
echo -e "${YELLOW}Installing Bluetooth A2DP packages (bluez + bluealsa)...${NC}"
apt-get install -y \
  bluez \
  bluez-tools \
  bluealsa-utils 2>/dev/null || \
apt-get install -y \
  bluez \
  bluez-tools 2>/dev/null || true

# Enable Bluetooth controller
systemctl enable bluetooth 2>/dev/null || true
systemctl start bluetooth 2>/dev/null || true

# Configure bluealsa to route A2DP sink to ALSA camilla_input
# bluealsa-aplay bridges the A2DP PCM to ALSA on demand; write a systemd override.
if command -v bluealsa &> /dev/null; then
  mkdir -p /etc/systemd/system/bluealsa.service.d
  cat <<'BSEOF' > /etc/systemd/system/bluealsa.service.d/resonance.conf
[Service]
ExecStart=
ExecStart=/usr/bin/bluealsa --profile=a2dp-sink --profile=hfp-ag
BSEOF

  # Systemd unit for bluealsa-aplay — routes A2DP audio to our ALSA loopback
  cat <<'BAEOF' > /etc/systemd/system/bluealsa-aplay.service
[Unit]
Description=BlueALSA ALSA Player (Resonance HiFi)
After=bluealsa.service
Requires=bluealsa.service

[Service]
Type=simple
User=root
ExecStart=/usr/bin/bluealsa-aplay --pcm=camilla_input 00:00:00:00:00:00
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
BAEOF

  systemctl daemon-reload
  systemctl disable bluealsa 2>/dev/null || true
  systemctl disable bluealsa-aplay 2>/dev/null || true
  systemctl stop bluealsa 2>/dev/null || true
  systemctl stop bluealsa-aplay 2>/dev/null || true
fi

# Make Pi Bluetooth agent auto-accept pairing (simple pairing, no PIN)
cat <<'BTEOF' > /etc/systemd/system/bt-agent.service
[Unit]
Description=Bluetooth Auto-Pair Agent (Resonance HiFi)
After=bluetooth.service
Requires=bluetooth.service

[Service]
Type=simple
ExecStart=/usr/bin/bt-agent -c NoInputNoOutput
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
