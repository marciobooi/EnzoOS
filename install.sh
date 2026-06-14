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
  # sudo -u $TARGET_USER git fetch origin main
  # sudo -u $TARGET_USER git reset --hard origin/main
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

# 7. Install GUI, Kiosk Display Stack, Audio, SSH, Librespot, and MPD
echo -e "\n${GREEN}[5/7] Installing display server, window manager, browser, audio, SSH, MPD, and dependencies...${NC}"
apt-get install -y \
  xserver-xorg \
  xinit \
  x11-xserver-utils \
  openbox \
  chromium-browser \
  alsa-utils \
  pulseaudio \
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

# Configure ALSA Default Device to route to Loopback using type plug (handles format/rate conversions automatically)
echo -e "${YELLOW}Creating default ALSA configuration (/etc/asound.conf) routing to Loopback...${NC}"
cat <<EOF > /etc/asound.conf
# Resonance HiFi - Default ALSA Route to Loopback
# This forces Volumio, Spotify, AirPlay, etc., to send audio to the virtual pipe instead of a physical card.
pcm.!default {
    type plug
    slave.pcm "camilla_input"
}

ctl.!default {
    type hw
    card Loopback
}

# Define the entry point to the Loopback pipe
pcm.camilla_input {
    type hw
    card Loopback
    device 0
    subdevice 0
}

# Fix for duplex output (duplex safety PCM configurations)
pcm.loop_monitor {
    type hw
    card Loopback
    device 1
    subdevice 0
}
EOF

# Configure MPD software volume control targeting Loopback device
if ! grep -q "ALSA Software Volume" /etc/mpd.conf; then
  echo -e "${YELLOW}Configuring software volume mixer for MPD...${NC}"
  cat <<EOF >> /etc/mpd.conf

audio_output {
    type            "alsa"
    name            "ALSA Software Volume"
    device          "hw:Loopback,0,0"
    mixer_type      "software"
}
EOF
fi

# Enable and start MPD service
echo -e "${YELLOW}Enabling and starting Media Player Daemon (MPD)...${NC}"
systemctl enable mpd
systemctl restart mpd

echo -e "\n${GREEN}Installing CamillaDSP...${NC}"
if ! command -v camilladsp &> /dev/null; then
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
  
  echo -e "${YELLOW}Downloading CamillaDSP v2.0.3 for ${CAMILLA_ARCH}...${NC}"
  wget -q "https://github.com/HEnquist/camilladsp/releases/download/v2.0.3/camilladsp-linux-${CAMILLA_ARCH}.tar.gz" -O /tmp/camilladsp.tar.gz
  tar -xzf /tmp/camilladsp.tar.gz -C /tmp/
  mv /tmp/camilladsp /usr/bin/camilladsp
  chmod +x /usr/bin/camilladsp
  rm -f /tmp/camilladsp.tar.gz
  echo -e "${GREEN}CamillaDSP v2.0.3 installed successfully in /usr/bin/camilladsp.${NC}"
else
  echo -e "${YELLOW}CamillaDSP already installed: $(camilladsp --version || true)${NC}"
fi

# Create default flat CamillaDSP configuration to prevent crash on initial run
echo -e "${YELLOW}Creating initial flat CamillaDSP configuration...${NC}"
cat <<EOF > "$PROJECT_DIR/camilladsp.yml"
devices:
  samplerate: 44100
  chunksize: 1024
  queuelimit: 4
  capture:
    type: Alsa
    channels: 2
    device: hw:Loopback,1,0
    format: S16LE
  playback:
    type: Alsa
    channels: 2
    device: hw:0,0
    format: S16LE
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
    mapping: speaker_map
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
ExecStart=/usr/bin/camilladsp -c $PROJECT_DIR/camilladsp.yml -p 1234
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
# Route Spotify connect to ALSA Loopback
if grep -q "LIBRESPOT_DEVICE=" /etc/raspotify/conf; then
  sed -i 's/.*LIBRESPOT_DEVICE=.*/LIBRESPOT_DEVICE="hw:Loopback,0,0"/g' /etc/raspotify/conf
else
  echo 'LIBRESPOT_DEVICE="hw:Loopback,0,0"' >> /etc/raspotify/conf
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
$TARGET_USER ALL=(ALL) NOPASSWD: /usr/bin/tee /etc/raspotify/conf, /bin/tee /etc/raspotify/conf, /usr/bin/tee /etc/asound.conf, /bin/tee /etc/asound.conf, /usr/bin/systemctl restart raspotify, /bin/systemctl restart raspotify, /usr/bin/systemctl restart camilladsp, /bin/systemctl restart camilladsp, /usr/bin/systemctl reload camilladsp, /bin/systemctl reload camilladsp, /usr/local/bin/kiosk-power.sh, /usr/local/bin/kiosk-brightness.sh
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

# Ensure Chromium profile and cache directories exist with correct user permissions
echo -e "${YELLOW}Creating Chromium kiosk profile data directories...${NC}"
mkdir -p "$USER_HOME/.config/spotify-kiosk"
mkdir -p "$USER_HOME/.cache/spotify-kiosk"

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

# 9. Install Node modules, build code and startup PM2
echo -e "\n${GREEN}[7/7] Building application & setting up PM2 server daemon...${NC}"

# Write .env with collected Spotify credentials
echo -e "${YELLOW}Writing environment configuration (.env)...${NC}"
cat > "$PROJECT_DIR/.env" <<ENVEOF
# Resonance HiFi — Auto-generated by install.sh on $(date)
SPOTIFY_CLIENT_ID=${SPOTIFY_CLIENT_ID}
SPOTIFY_CLIENT_SECRET=${SPOTIFY_CLIENT_SECRET}
SPOTIFY_REDIRECT_URI=http://127.0.0.1:5000/auth/spotify/callback
PORT=5000
ENVEOF
chown $TARGET_USER:$TARGET_USER "$PROJECT_DIR/.env"
chmod 600 "$PROJECT_DIR/.env"
echo -e "${GREEN}.env written.${NC}"

# Build app under target user context (prevents folder permission bugs)
cd "$PROJECT_DIR"
echo -e "${YELLOW}Installing npm dependencies (running as $TARGET_USER)...${NC}"
sudo -u $TARGET_USER npm install
sudo -u $TARGET_USER npm install yaml

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
