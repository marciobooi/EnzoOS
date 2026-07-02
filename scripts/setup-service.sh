#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — register the backend as a native systemd service
# ─────────────────────────────────────────────────────────────────────────────
# Replaces PM2: unifies process management under systemctl (like every other
# audio daemon), removes a global npm dependency, and lowers RAM. Idempotent and
# safe to re-run. Requires root.
#
# Does NOT start the service — the caller starts it after PM2 has released the
# port (see install.sh), so a re-run over an existing PM2 install migrates
# cleanly without two processes fighting over :5000.
#
# Service user / project dir come from $SERVICE_USER and the repo location.
# ─────────────────────────────────────────────────────────────────────────────
set -u

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo -e "${YELLOW}[service] Not running as root — skipping systemd service setup.${NC}"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVICE_USER="${SERVICE_USER:-$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || echo root)}"
[ "$SERVICE_USER" = "root" ] && SERVICE_USER="${SUDO_USER:-root}"
NODE_BIN="$(command -v node || echo /usr/bin/node)"

echo -e "${GREEN}[service] Registering resonance-api.service (user: $SERVICE_USER)...${NC}"

cat > /etc/systemd/system/resonance-api.service <<EOF
[Unit]
Description=Resonance HiFi API (Node.js backend)
After=network-online.target sound.target mpd.service
Wants=network-online.target
# Disable systemd's default restart-rate throttle (5 restarts/10s → permanent
# "failed" state). A build that boots but immediately throws (missing env
# var, migration error) would otherwise need manual SSH recovery after a bad
# OTA. RestartSec=3 below still caps CPU use during a genuine crash loop;
# scripts/update.sh's post-restart health check independently tries to catch
# and auto-roll-back this exact failure mode before it ever gets here.
StartLimitIntervalSec=0

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${PROJECT_DIR}
ExecStart=${NODE_BIN} ${PROJECT_DIR}/server/index.js
Environment=NODE_ENV=production
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
SyslogIdentifier=resonance-api

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable resonance-api >/dev/null 2>&1 \
  && echo -e "  ${GREEN}resonance-api.service installed and enabled (starts on boot).${NC}" \
  || echo -e "  ${YELLOW}Could not enable resonance-api.service.${NC}"

# ── Migrate off PM2 if it was managing the backend ────────────────────────────
# Free :5000 and remove PM2's own boot hook so it can't re-spawn the backend.
if command -v pm2 >/dev/null 2>&1; then
  echo -e "  ${YELLOW}Migrating from PM2 → systemd...${NC}"
  sudo -u "$SERVICE_USER" pm2 delete resonance-api >/dev/null 2>&1 || true
  sudo -u "$SERVICE_USER" pm2 save --force      >/dev/null 2>&1 || true
  systemctl disable "pm2-${SERVICE_USER}" >/dev/null 2>&1 || true
  systemctl stop    "pm2-${SERVICE_USER}" >/dev/null 2>&1 || true
  echo -e "  ${GREEN}PM2 instance removed (package left installed; safe to 'npm rm -g pm2').${NC}"
fi

echo -e "${GREEN}[service] Done. Start/restart with: systemctl restart resonance-api${NC}"
exit 0
