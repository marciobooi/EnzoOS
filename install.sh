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
  read -p "Enter the username of the user who will auto-login to the kiosk: " TARGET_USER
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

# 4. System Updates & Prerequisites
echo -e "\n${GREEN}[2/7] Updating system package repositories...${NC}"
apt-get update
apt-get install -y ca-certificates curl gnupg git build-essential

# 5. Clone repository if needed
if [ ! -d "$PROJECT_DIR" ]; then
  echo -e "\n${GREEN}[3/7] Cloning EnzoOS repository into $PROJECT_DIR...${NC}"
  sudo -u $TARGET_USER git clone https://github.com/marciobooi/EnzoOS.git "$PROJECT_DIR"
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

# 7. Install GUI, Kiosk Display Stack, Audio, SSH, and Librespot
echo -e "\n${GREEN}[5/7] Installing display server, window manager, browser, audio, SSH, and dependencies...${NC}"
apt-get install -y \
  xserver-xorg \
  xinit \
  x11-xserver-utils \
  openbox \
  chromium-browser \
  alsa-utils \
  pulseaudio \
  openssh-server \
  unclutter

echo -e "${YELLOW}Installing Raspotify repository and precompiled Librespot daemon...${NC}"
# Install Raspotify repository and package (contains the precompiled /usr/bin/librespot binary)
curl -sL https://dtcooper.github.io/raspotify/install.sh | sh

# Disable default Raspotify daemon to avoid service name or port conflicts
echo -e "${YELLOW}Disabling default Raspotify service (will use custom systemd daemon)...${NC}"
systemctl stop raspotify || true
systemctl disable raspotify || true

# Assign hardware permissions to the target user
echo -e "${YELLOW}Adding user '$TARGET_USER' to audio/video groups...${NC}"
usermod -aG audio,video,dialout $TARGET_USER

# Enable and start SSH service
echo -e "${YELLOW}Configuring SSH daemon...${NC}"
systemctl enable ssh
systemctl start ssh

# Configure and start Librespot Spotify Connect background daemon
echo -e "${YELLOW}Creating Librespot systemd service...${NC}"
cat <<EOF > /etc/systemd/system/librespot.service
[Unit]
Description=Librespot Spotify Connect Daemon
After=network.target sound.target

[Service]
Type=simple
User=$TARGET_USER
ExecStart=/usr/bin/librespot --name "Resonance Connect" --bitrate 320 --backend alsa --initial-volume 50 --enable-volume-normalisation
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable librespot
systemctl restart librespot
echo -e "${GREEN}Librespot Spotify Connect service configured and started.${NC}"

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

# 8. Configure Kiosk startup scripts
echo -e "\n${GREEN}[6/7] Configuring kiosk startup files...${NC}"

# Create .xinitrc in the target user home directory
cat <<EOF > "$USER_HOME/.xinitrc"
#!/bin/bash

# Disable screen saver, screen blanking, and power management
xset s off
xset s noblank
xset -dpms

# Hide mouse cursor for cleaner touchscreen kiosk experience
unclutter -idle 0.1 -root &

# Dynamically detect the primary connected display output
OUTPUT=\$(xrandr | grep " connected " | awk '{print \$1}' | head -n 1)

if [ -n "\$OUTPUT" ]; then
  # Generate CVT modeline for custom widescreen 1420x320 resolution @ 60Hz
  MODELINE=\$(cvt 1420 320 60 | grep "Modeline" | cut -d' ' -f2-)
  MODE_NAME=\$(echo "\$MODELINE" | cut -d' ' -f1 | tr -d '"')
  
  # Register and apply the custom resolution mode
  xrandr --newmode \$MODELINE 2>/dev/null || true
  xrandr --addmode "\$OUTPUT" "\$MODE_NAME" 2>/dev/null || true
  xrandr --output "\$OUTPUT" --mode "\$MODE_NAME" 2>/dev/null || true
fi

# Start Openbox window manager in background
openbox-session &

# Wait for local Node server on port 5000 to spin up before opening Chromium.
# This prevents "This site can't be reached" error screens on boot.
while ! curl -s http://localhost:5000 >/dev/null; do
  sleep 1
done

# Launch Chromium browser in fullscreen kiosk mode pointing to local port 5000
# --autoplay-policy=no-user-gesture-required guarantees audio starts automatically
# --noerrdialogs & --disable-infobars prevent crash bubbles or update prompts
chromium-browser \\
  --kiosk \\
  --autoplay-policy=no-user-gesture-required \\
  --noerrdialogs \\
  --disable-infobars \\
  --disable-session-crashed-bubble \\
  --disable-features=Translate \\
  --check-for-update-interval=31536000 \\
  http://localhost:5000
EOF

chmod +x "$USER_HOME/.xinitrc"
chown $TARGET_USER:$TARGET_USER "$USER_HOME/.xinitrc"

# Automatically trigger X server when logging in on TTY1 console
AUTOSTART_X_BLOCK=$(cat <<'EOF'

# Resonance HiFi - Autostart X Server on TTY1 Boot
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  exec startx
fi
EOF
)

if [ -f "$USER_HOME/.bash_profile" ]; then
  PROFILE_FILE="$USER_HOME/.bash_profile"
elif [ -f "$USER_HOME/.profile" ]; then
  PROFILE_FILE="$USER_HOME/.profile"
else
  PROFILE_FILE="$USER_HOME/.bashrc"
fi

if ! grep -q "Autostart X Server on TTY1 Boot" "$PROFILE_FILE"; then
  echo "$AUTOSTART_X_BLOCK" >> "$PROFILE_FILE"
  chown $TARGET_USER:$TARGET_USER "$PROFILE_FILE"
fi

# 9. Install Node modules, build code and startup PM2
echo -e "\n${GREEN}[7/7] Building application & setting up PM2 server daemon...${NC}"

# Build app under target user context (prevents folder permission bugs)
cd "$PROJECT_DIR"
echo -e "${YELLOW}Installing npm dependencies (running as $TARGET_USER)...${NC}"
sudo -u $TARGET_USER npm install

echo -e "${YELLOW}Compiling production assets (running as $TARGET_USER)...${NC}"
sudo -u $TARGET_USER npm run build

# Install PM2 globally
echo -e "${YELLOW}Installing PM2 process manager...${NC}"
npm install -g pm2

# Clear existing instances & start the backend as the target user
sudo -u $TARGET_USER pm2 delete resonance-api &>/dev/null || true
sudo -u $TARGET_USER pm2 start "$PROJECT_DIR/server/index.js" --name "resonance-api" --watch --env PORT=5000
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
