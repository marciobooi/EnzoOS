#!/bin/bash

# NOTE: No 'set -e' here — we handle errors manually so the script
# does not silently abort mid-stream and leave the UI stuck at a stale %.

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
echo "Node version: $(node -v 2>&1 || echo 'Not found')"
echo "NPM version:  $(npm -v 2>&1 || echo 'Not found')"
echo "PM2 version:  $(pm2 -v 2>&1 || echo 'Not found')"
echo "=========================="

# Find absolute path of the project directory (one level up from scripts/)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
echo -e "Project directory: $PROJECT_DIR"

# Clean any local changes to prevent conflicts
# Exclude node_modules and resonance.db so npm install stays fast
echo -e "${YELLOW}Clearing local modifications...${NC}"
echo "[PROGRESS: 15]"
git reset --hard HEAD
git clean -fd -e resonance.db -e node_modules -e certs

# Fetch changes from GitHub
echo -e "${YELLOW}Fetching latest modifications from GitHub...${NC}"
echo "[PROGRESS: 30]"
if ! git fetch origin main; then
  echo -e "${RED}ERROR: git fetch failed. Check network connectivity.${NC}"
  echo "[PROGRESS: 0]"
  exit 1
fi

# Reset local main branch to remote main branch
echo -e "${YELLOW}Syncing repository with origin/main...${NC}"
echo "[PROGRESS: 45]"
git reset --hard origin/main

# Install dependencies (incorporating package.json updates)
echo -e "${YELLOW}Installing npm dependencies...${NC}"
echo "[PROGRESS: 60]"
if ! npm install; then
  echo -e "${RED}ERROR: npm install failed.${NC}"
  echo "[PROGRESS: 0]"
  exit 1
fi

# Clean old build artifacts
echo -e "${YELLOW}Removing old build artifacts...${NC}"
if [ -d "$PROJECT_DIR/dist" ]; then
  rm -rf "$PROJECT_DIR/dist"
  echo -e "  Old dist/ removed."
fi

# Rebuild frontend bundles
echo -e "${YELLOW}Rebuilding frontend bundle...${NC}"
echo "[PROGRESS: 80]"
if ! npm run build; then
  echo -e "${RED}ERROR: npm build failed.${NC}"
  echo "[PROGRESS: 0]"
  exit 1
fi

# Sync user kiosk startup config (.xinitrc)
echo -e "${YELLOW}Syncing user kiosk startup config (.xinitrc)...${NC}"
cp "$PROJECT_DIR/scripts/xinitrc" "$HOME/.xinitrc" && chmod +x "$HOME/.xinitrc" || true

# Patch profile: upgrade legacy 'exec startx' to a restart loop so X recovers
# automatically after OTA updates kill Chromium (and therefore xinit)
for PROFILE_FILE in "$HOME/.bash_profile" "$HOME/.profile" "$HOME/.bashrc"; do
  if [ -f "$PROFILE_FILE" ] && grep -q "exec startx" "$PROFILE_FILE"; then
    echo -e "${YELLOW}Patching $PROFILE_FILE: replacing 'exec startx' with restart loop...${NC}"
    sed -i 's/exec startx/while true; do\n    startx -- -nocursor 2>\/tmp\/resonance_startx.log\n    echo "[Resonance] X exited. Restarting in 3s..."\n    sleep 3\n  done/' "$PROFILE_FILE" || true
  fi
done

# Sync Openbox configuration to ensure window decorations are disabled
echo -e "${YELLOW}Syncing Openbox config...${NC}"
mkdir -p "$HOME/.config/openbox"
cp "$PROJECT_DIR/scripts/openbox_rc.xml" "$HOME/.config/openbox/rc.xml" || true

# Sync Avahi configuration if running with root privileges
if [ "$EUID" -eq 0 ]; then
  echo -e "${YELLOW}Syncing Avahi service discovery config...${NC}"
  mkdir -p /etc/avahi/services
  cp "$PROJECT_DIR/scripts/resonance.service" /etc/avahi/services/resonance.service || true
  chmod 644 /etc/avahi/services/resonance.service
  systemctl restart avahi-daemon || true

  # Re-apply real-time audio tuning (threadirqs, rtirq, isolcpus, CPU affinity).
  # Idempotent — picks up new tuning on existing installs. Boot-param changes
  # take effect on the next reboot; service affinity applies immediately.
  echo -e "${YELLOW}Re-applying real-time audio tuning...${NC}"
  RT_TARGET_USER="$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || echo "$USER")" \
    bash "$PROJECT_DIR/scripts/setup-rtaudio.sh" || \
    echo -e "${YELLOW}Real-time audio tuning reported an issue — continuing.${NC}"
fi

echo -e "${GREEN}OTA Update completed successfully!${NC}"
echo "[PROGRESS: 100]"

# IMPORTANT: We must NOT restart PM2 immediately — the Node process broadcasting
# this output IS the resonance-api PM2 process. Killing it immediately would cut
# the WebSocket stream before the client receives the 100% signal.
# We schedule the restart 4 seconds later in a fully detached subshell.
echo -e "${YELLOW}Scheduling server restart in 4 seconds...${NC}"
(sleep 4 && pm2 restart resonance-api > /dev/null 2>&1 && pkill -f chromium-browser || true) &
disown $!

echo -e "${GREEN}Update sequence complete. Server will restart shortly.${NC}"
exit 0
