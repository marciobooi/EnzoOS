#!/bin/bash

# ==============================================================================
# Resonance HiFi - Ubuntu Kiosk Installer Script
# ==============================================================================
# Target: Ubuntu Server (VM, x86_64, Raspberry Pi 4, etc.)
# Description: Automates package installation, kiosk display stack setup,
#              sound configurations, systemd auto-login, and PM2 backend daemon.
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

# 1. Check Root Privileges
if [ "$EUID" -eq 0 ]; then
  echo -e "${RED}Error: Do not run this script as root directly using sudo.${NC}"
  echo -e "${YELLOW}Please run as a normal user with sudo privileges: ./install.sh${NC}"
  exit 1
fi

TARGET_USER=$USER
USER_HOME=$HOME
PROJECT_DIR=$(pwd)

echo -e "${GREEN}[1/8] Verifying environment and user privileges...${NC}"
echo -e "Target User: $TARGET_USER"
echo -e "Home Directory: $USER_HOME"
echo -e "Project Directory: $PROJECT_DIR"

# Ensure we are inside the project root directory
if [ ! -f "$PROJECT_DIR/package.json" ]; then
  echo -e "${RED}Error: package.json not found in current directory.${NC}"
  echo -e "${YELLOW}Please run this script from the root of the resonance directory.${NC}"
  exit 1
fi

# 2. Collect Spotify Credentials
echo -e "\n${GREEN}[2/8] Configuring Spotify Credentials...${NC}"
if [ -f "$PROJECT_DIR/.env" ]; then
  echo -e "${YELLOW}An existing .env file was found.${NC}"
  read -p "Do you want to overwrite it with new credentials? (y/N): " OVERWRITE_ENV
  OVERWRITE_ENV=${OVERWRITE_ENV:-n}
else
  OVERWRITE_ENV="y"
fi

if [ "$OVERWRITE_ENV" = "y" ] || [ "$OVERWRITE_ENV" = "Y" ]; then
  read -p "Enter Spotify Client ID: " SPOTIFY_CLIENT_ID
  read -p "Enter Spotify Client Secret: " SPOTIFY_CLIENT_SECRET
  read -p "Enter Spotify Redirect URI (default: http://localhost:5000/api/callback): " SPOTIFY_REDIRECT_URI
  SPOTIFY_REDIRECT_URI=${SPOTIFY_REDIRECT_URI:-http://localhost:5000/api/callback}
  PORT=5000

  # Write out .env file
  cat <<EOF > "$PROJECT_DIR/.env"
PORT=$PORT
SPOTIFY_CLIENT_ID=$SPOTIFY_CLIENT_ID
SPOTIFY_CLIENT_SECRET=$SPOTIFY_CLIENT_SECRET
SPOTIFY_REDIRECT_URI=$SPOTIFY_REDIRECT_URI
EOF
  echo -e "${GREEN}Created .env configuration file.${NC}"
else
  echo -e "${YELLOW}Skipping .env creation. Using existing credentials.${NC}"
fi

# 3. Update System Packages
echo -e "\n${GREEN}[3/8] Updating system package repositories...${NC}"
sudo apt-get update

# 4. Install Node.js (v20)
echo -e "\n${GREEN}[4/8] Installing Node.js & npm...${NC}"
if ! command -v node &> /dev/null; then
  echo -e "${YELLOW}Node.js not detected. Adding NodeSource v20 repository...${NC}"
  sudo apt-get install -y ca-certificates curl gnupg
  sudo mkdir -p /etc/apt/keyrings
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
  echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
  sudo apt-get update
  sudo apt-get install -y nodejs
else
  echo -e "${YELLOW}Node.js $(node -v) already installed.${NC}"
fi

# 5. Install GUI & Kiosk Stack (Xorg, Openbox, Chromium, Sound Utilities)
echo -e "\n${GREEN}[5/8] Installing display server, window manager, and browser...${NC}"
sudo apt-get install -y \
  xserver-xorg \
  xinit \
  x11-xserver-utils \
  openbox \
  chromium-browser \
  alsa-utils \
  pulseaudio \
  git \
  build-essential

# Add user to audio and video groups for hardware access
echo -e "${YELLOW}Adding user '$TARGET_USER' to audio/video groups...${NC}"
sudo usermod -aG audio,video,dialout $TARGET_USER

# Configure X11 Wrapper to allow non-root users to start X
echo -e "${YELLOW}Configuring Xwrapper...${NC}"
echo "allowed_users=anybody" | sudo tee /etc/X11/Xwrapper.config

# 6. Configure Autologin on TTY1 (Console boot)
echo -e "\n${GREEN}[6/8] Configuring automatic console login on boot...${NC}"
sudo mkdir -p /etc/systemd/system/getty@tty1.service.d
cat <<EOF | sudo tee /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $TARGET_USER --noclear %I \$TERM
EOF
echo -e "${GREEN}Autologin configured for user $TARGET_USER on TTY1.${NC}"

# 7. Configure X11 Startup (.xinitrc) and Auto-start
echo -e "\n${GREEN}[7/8] Configuring kiosk launch behaviors...${NC}"

# Write .xinitrc to launch browser on X11 start
cat <<EOF > "$USER_HOME/.xinitrc"
#!/bin/bash

# Disable screen saver, screen blanking, and power management
xset s off
xset s noblank
xset -dpms

# Start Openbox window manager in background
openbox-session &

# Run Chromium browser in fullscreen kiosk mode pointing to the local node server
# --autoplay-policy=no-user-gesture-required ensures audio/playback starts automatically
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
echo -e "${GREEN}Created $USER_HOME/.xinitrc${NC}"

# Configure Bash profile to automatically start X when booting into TTY1 console
AUTOSTART_X_BLOCK=$(cat <<'EOF'

# Resonance HiFi - Autostart X Server on TTY1 Boot
if [ -z "$DISPLAY" ] && [ "$(tty)" = "/dev/tty1" ]; then
  exec startx
fi
EOF
)

# Append to .bash_profile or .profile
if [ -f "$USER_HOME/.bash_profile" ]; then
  PROFILE_FILE="$USER_HOME/.bash_profile"
elif [ -f "$USER_HOME/.profile" ]; then
  PROFILE_FILE="$USER_HOME/.profile"
else
  PROFILE_FILE="$USER_HOME/.bashrc"
fi

if ! grep -q "Autostart X Server on TTY1 Boot" "$PROFILE_FILE"; then
  echo "$AUTOSTART_X_BLOCK" >> "$PROFILE_FILE"
  echo -e "${GREEN}Added auto-start block to $PROFILE_FILE.${NC}"
else
  echo -e "${YELLOW}Auto-start block already present in $PROFILE_FILE.${NC}"
fi

# 8. Setup Application Dependencies and PM2 daemon
echo -e "\n${GREEN}[8/8] Building app and configuring daemon...${NC}"

# Install project Node dependencies
echo -e "${YELLOW}Installing project dependencies...${NC}"
npm install

# Build the production frontend distribution
echo -e "${YELLOW}Building frontend assets...${NC}"
npm run build

# Install PM2 process manager globally
echo -e "${YELLOW}Installing and setting up PM2...${NC}"
sudo npm install -g pm2

# Clear existing instances and start the Resonance backend server
pm2 delete resonance-api &>/dev/null || true
pm2 start "$PROJECT_DIR/server/index.js" --name "resonance-api" --watch --env PORT=5000

# Save process list and configure startup hook
pm2 save
echo -e "${YELLOW}Generating PM2 system boot script...${NC}"
# Run PM2 startup command and execute the printed command automatically
PM2_STARTUP_CMD=$(pm2 startup systemd -u $TARGET_USER --hp $USER_HOME | grep "sudo env" || true)
if [ -n "$PM2_STARTUP_CMD" ]; then
  eval "$PM2_STARTUP_CMD"
fi

echo -e "\n${GREEN}====================================================================${NC}"
echo -e "${GREEN}                 INSTALLATION COMPLETED SUCCESSFULLY                ${NC}"
echo -e "${GREEN}====================================================================${NC}"
echo -e "${YELLOW}To complete configuration and boot into your kiosk:${NC}"
echo -e "1. Make sure your Spotify developer dashboard includes your redirect URI:"
echo -e "   ${BLUE}http://<your-device-ip>:5000/api/callback${NC}"
echo -e "2. Reboot the system: ${BLUE}sudo reboot${NC}"
echo -e "\nThe system will boot automatically into console, log in as $TARGET_USER,"
echo -e "start the graphical desktop frame, and open the fullscreen player interface."
echo -e "===================================================================="
