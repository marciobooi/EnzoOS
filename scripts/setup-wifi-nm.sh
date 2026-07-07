#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — hand Wi-Fi over to NetworkManager (netplan renderer switch)
# ─────────────────────────────────────────────────────────────────────────────
# The app's Wi-Fi panel (scan / connect / show current network) is built on
# nmcli. Stock Ubuntu Server Pi images manage networking with netplan →
# systemd-networkd + wpa_supplicant, and netplan marks those devices as
# *unmanaged* for NetworkManager — so every nmcli wifi call returns nothing.
# Observed live on a real Pi 4: `nmcli device` showed wlan0 "unmanaged", the
# kiosk network panel listed no networks and couldn't even name the current
# connection, while the box was in fact online over that same wlan0.
#
# Fix: re-render ONLY the `wifis:` section of the netplan config through the
# NetworkManager renderer (ethernet stays with networkd — no risk to a wired
# uplink). netplan itself regenerates the existing SSID/PSK as a NM connection
# profile, so the box reassociates to the same network with the same address —
# credentials preserved, nothing to re-enter. Expect a few seconds of Wi-Fi
# drop while NM takes over the interface.
#
# Idempotent: exits immediately when no Wi-Fi device is unmanaged (i.e. on
# re-runs after migration, on Ethernet-only boxes with no wifi hardware, and
# on the QEMU dev VM which has no wlan0 at all).
# ─────────────────────────────────────────────────────────────────────────────
set -u

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo -e "${YELLOW}[wifi-nm] Not running as root — skipping Wi-Fi manager migration.${NC}"
  exit 0
fi

if ! command -v nmcli >/dev/null 2>&1; then
  echo -e "${YELLOW}[wifi-nm] NetworkManager not installed — skipping.${NC}"
  exit 0
fi

NETPLAN_DIR="/etc/netplan"
TARGET="$NETPLAN_DIR/90-resonance-nm-wifi.yaml"

# Always disable NM's Wi-Fi power saving (Ubuntu ships
# default-wifi-powersave-on.conf which turns it ON). On the Pi 4's brcmfmac
# this caused multi-second latency spikes and dropped SSH/remote connections
# the moment NM took over wlan0 — observed live. 2 = disable. Written before
# any migration so the very first NM association already runs without it.
PS_CONF="/etc/NetworkManager/conf.d/91-resonance-wifi-powersave-off.conf"
if [ ! -f "$PS_CONF" ]; then
  mkdir -p /etc/NetworkManager/conf.d
  cat > "$PS_CONF" <<'PSEOF'
# Resonance HiFi — always-on appliance: Wi-Fi power saving causes latency
# spikes and dropped connections on the Pi's brcmfmac. 2 = disable.
[connection]
wifi.powersave = 2
PSEOF
  systemctl reload NetworkManager 2>/dev/null || true
  echo -e "  ${GREEN}Disabled NM Wi-Fi power saving ($PS_CONF).${NC}"
fi

# Nothing to do unless a Wi-Fi device is presently locked out of NM.
UNMANAGED_WIFI="$(nmcli -t -f DEVICE,TYPE,STATE device 2>/dev/null | awk -F: '$2=="wifi" && $3=="unmanaged"{print $1; exit}')"
if [ -z "$UNMANAGED_WIFI" ]; then
  echo -e "${GREEN}[wifi-nm] No unmanaged Wi-Fi device — nothing to migrate.${NC}"
  exit 0
fi

echo -e "${GREEN}[wifi-nm] Wi-Fi device '$UNMANAGED_WIFI' is unmanaged — migrating wifis to the NetworkManager renderer...${NC}"

# Extract the merged network.wifis mapping from every netplan file (except our
# own output) and rewrite it under the NetworkManager renderer. python3-yaml
# is guaranteed present: netplan itself is a Python/PyYAML application.
RESULT="$(python3 - "$NETPLAN_DIR" "$TARGET" <<'PYEOF'
import glob, os, sys
import yaml

npdir, target = sys.argv[1], sys.argv[2]
wifis = {}
for f in sorted(glob.glob(os.path.join(npdir, '*.yaml'))):
    if os.path.abspath(f) == os.path.abspath(target):
        continue
    try:
        with open(f) as fh:
            data = yaml.safe_load(fh) or {}
    except Exception:
        continue
    for dev, cfg in ((data.get('network') or {}).get('wifis') or {}).items():
        if dev != 'renderer':
            wifis[dev] = cfg

if not wifis:
    print('NO_WIFIS')
    sys.exit(0)

for cfg in wifis.values():
    if isinstance(cfg, dict):
        cfg['renderer'] = 'NetworkManager'

with open(target, 'w') as fh:
    yaml.safe_dump({'network': {'version': 2, 'wifis': wifis}}, fh, default_flow_style=False)
os.chmod(target, 0o600)
print('WROTE')
PYEOF
)"

if [ "$RESULT" = "WROTE" ]; then
  echo -e "  ${GREEN}Wrote $TARGET (wifis → NetworkManager renderer).${NC}"
  echo -e "  ${YELLOW}Applying netplan — Wi-Fi drops for a few seconds while NM reassociates.${NC}"
  netplan generate 2>/dev/null || true
  netplan apply 2>/dev/null || true
else
  # Wi-Fi hardware exists but netplan has no credentials for it (Ethernet-only
  # install). Persistently mark wifi devices managed so the app can at least
  # scan and connect through nmcli (which then stores its own NM profiles).
  mkdir -p /etc/NetworkManager/conf.d
  cat > /etc/NetworkManager/conf.d/90-resonance-wifi-managed.conf <<'NMEOF'
# Resonance HiFi — let NetworkManager manage Wi-Fi so the app's network panel
# (nmcli scan/connect) works even though netplan/networkd owns the ethernet.
[device-resonance-wifi]
match-device=type:wifi
managed=1
NMEOF
  echo -e "  ${GREEN}No netplan Wi-Fi config — marked wifi devices NM-managed via conf.d instead.${NC}"
  systemctl reload NetworkManager 2>/dev/null || systemctl restart NetworkManager 2>/dev/null || true
fi

echo -e "${GREEN}[wifi-nm] Done.${NC}"
exit 0
