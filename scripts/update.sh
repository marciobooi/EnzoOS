#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Logging colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}Starting Resonance HiFi OTA Update...${NC}"
echo "[PROGRESS: 5]"

# Diagnostics
echo "=== SYSTEM DIAGNOSTICS ==="
echo "Timestamp: $(date)"
echo "Executing User: $(whoami)"
echo "Shell Path: $PATH"
echo "Node version: $(node -v 2>&1 || echo 'Not found')"
echo "NPM version: $(npm -v 2>&1 || echo 'Not found')"
echo "PM2 version: $(pm2 -v 2>&1 || echo 'Not found')"
echo "=========================="

# Find absolute path of the project directory (one level up from scripts/)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo -e "Project directory: $PROJECT_DIR"

# Clean any local changes to prevent conflicts
echo -e "${YELLOW}Clearing local modifications...${NC}"
echo "[PROGRESS: 15]"
git reset --hard HEAD
git clean -fd

# Fetch changes from GitHub
echo -e "${YELLOW}Fetching latest modifications from GitHub...${NC}"
echo "[PROGRESS: 30]"
git fetch origin main

# Reset local main branch to remote main branch
echo -e "${YELLOW}Syncing repository with origin/main...${NC}"
echo "[PROGRESS: 45]"
git reset --hard origin/main

# Install dependencies (incorporating package.json updates)
echo -e "${YELLOW}Installing npm dependencies...${NC}"
echo "[PROGRESS: 60]"
npm install

# Rebuild frontend bundles
echo -e "${YELLOW}Rebuilding frontend bundle...${NC}"
echo "[PROGRESS: 80]"
npm run build

# Sync user kiosk startup config (.xinitrc)
echo -e "${YELLOW}Syncing user kiosk startup config (.xinitrc)...${NC}"
cp "$PROJECT_DIR/scripts/xinitrc" "$HOME/.xinitrc"
chmod +x "$HOME/.xinitrc"

# Sync Openbox configuration to ensure window decorations are disabled
echo -e "${YELLOW}Syncing Openbox config...${NC}"
mkdir -p "$HOME/.config/openbox"
cp "$PROJECT_DIR/scripts/openbox_rc.xml" "$HOME/.config/openbox/rc.xml"

# Sync Avahi configuration if running with root privileges
if [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}Syncing Avahi service discovery config...${NC}"
  cp "$PROJECT_DIR/scripts/resonance.service" /etc/avahi/services/resonance.service
  chmod 644 /etc/avahi/services/resonance.service
  systemctl restart avahi-daemon || true
fi

echo -e "${GREEN}OTA Update completed successfully!${NC}"
echo "[PROGRESS: 95]"
echo -e "${YELLOW}Triggering disowned PM2 daemon restart...${NC}"

# Restart the PM2 service in the background and disown it so this script can exit cleanly
nohup pm2 restart resonance-api > /dev/null 2>&1 &

# Restart the graphical kiosk session to apply any X11/Openbox window changes
echo -e "${YELLOW}Restarting kiosk display session...${NC}"
pkill -u "$USER" -f chromium-browser || true

echo -e "${GREEN}Update sequence complete. Server restarting.${NC}"
echo "[PROGRESS: 100]"
exit 0
