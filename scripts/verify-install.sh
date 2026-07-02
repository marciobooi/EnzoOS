#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — post-install verification & optimization report
# ─────────────────────────────────────────────────────────────────────────────
# Validates the FINAL state of every install step and premium optimization, so a
# helper that "continued past" a failure doesn't hide a missing feature. Run by
# install.sh at the end, and re-runnable any time to audit a live system:
#
#     bash scripts/verify-install.sh
#
# Exit code: non-zero only if a CRITICAL component (CamillaDSP binary, backend
# service) is missing — optimizations are reported but never fail the script,
# since some legitimately don't apply on every host (non-Pi, sub-quad-core).
# ─────────────────────────────────────────────────────────────────────────────
set -u

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
PASS=0; WARN=0; FAIL=0; CRIT=0

ok()   { printf "  ${GREEN}✓${NC}  %s\n" "$1"; PASS=$((PASS+1)); }
skip() { printf "  ${YELLOW}–${NC}  %s ${YELLOW}(%s)${NC}\n" "$1" "$2"; WARN=$((WARN+1)); }
bad()  { printf "  ${RED}✗${NC}  %s ${RED}(%s)${NC}\n" "$1" "$2"; FAIL=$((FAIL+1)); }
crit() { printf "  ${RED}✗${NC}  %s ${RED}(%s)${NC}\n" "$1" "$2"; FAIL=$((FAIL+1)); CRIT=$((CRIT+1)); }

# Is a kernel boot token active (/proc/cmdline) or merely configured (cmdline.txt)?
CMDLINE_FILE="/boot/firmware/cmdline.txt"; [ -f "$CMDLINE_FILE" ] || CMDLINE_FILE="/boot/cmdline.txt"
cmdline_state() {  # $1 = token (word)
  if grep -qw -- "$1" /proc/cmdline 2>/dev/null; then echo active;
  elif [ -f "$CMDLINE_FILE" ] && grep -qw -- "$1" "$CMDLINE_FILE"; then echo pending;
  else echo absent; fi
}
svc_active()  { systemctl is-active  --quiet "$1" 2>/dev/null; }
svc_enabled() { systemctl is-enabled --quiet "$1" 2>/dev/null; }

CORES="$(nproc 2>/dev/null || echo 1)"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_USER="$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || echo "$USER")"

echo -e "\n${BLUE}════════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}            Resonance HiFi — Install Verification Report             ${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}"

echo -e "\n${BLUE}Core services${NC}"
if command -v camilladsp >/dev/null 2>&1; then ok "CamillaDSP binary ($(camilladsp --version 2>/dev/null | head -n1))"; else crit "CamillaDSP binary" "not installed"; fi
svc_active camilladsp && ok "camilladsp.service running" || bad "camilladsp.service" "not active"
svc_active mpd        && ok "mpd.service running"        || bad "mpd.service" "not active"
if svc_active resonance-api; then ok "resonance-api.service (systemd) running"
elif command -v pm2 >/dev/null 2>&1 && pm2 pid resonance-api >/dev/null 2>&1; then ok "resonance-api (PM2, legacy — re-run install.sh to migrate)"
elif pgrep -f "resonance" >/dev/null 2>&1; then ok "resonance backend process found"
else crit "resonance-api backend" "not running"; fi

echo -e "\n${BLUE}Real-time audio (setup-rtaudio.sh)${NC}"
case "$(cmdline_state threadirqs)" in
  active)  ok "threadirqs (threaded IRQs)";;
  pending) skip "threadirqs" "configured — active after reboot";;
  absent)  skip "threadirqs" "not set (non-Pi?)";;
esac
if [ "$CORES" -ge 4 ]; then
  case "$(cmdline_state isolcpus=2,3)" in
    active)  ok "isolcpus=2,3 (core isolation)";;
    pending) skip "isolcpus=2,3" "configured — active after reboot";;
    absent)  skip "isolcpus=2,3" "not set";;
  esac
  [ -f /etc/systemd/system/camilladsp.service.d/10-resonance-cpu-affinity.conf ] \
    && ok "CPU affinity drop-ins (cores 2/3)" || skip "CPU affinity drop-ins" "absent"
else
  skip "isolcpus / CPU affinity" "needs a quad-core Pi (have ${CORES})"
fi
svc_active rtirq && ok "rtirq IRQ priority service" || { [ -x /etc/init.d/rtirq ] && ok "rtirq (SysV) installed" || skip "rtirq service" "not installed"; }

echo -e "\n${BLUE}Storage silence (setup-storage-silence.sh)${NC}"
if [ -f /etc/fstab ] && grep -qE '^[^#].*\bnoatime\b' /etc/fstab; then ok "noatime,nodiratime in /etc/fstab"; else skip "noatime fstab mounts" "not applied"; fi
if svc_enabled log2ram || svc_active log2ram; then ok "log2ram (/var/log in RAM)"; else skip "log2ram" "not installed"; fi

echo -e "\n${BLUE}RAM preloading (setup-ram-preload.sh)${NC}"
[ -s /usr/local/lib/resonance-mlockall.so ] && ok "mlockall shim compiled" || skip "mlockall shim" "not built"
[ -f /etc/systemd/system/camilladsp.service.d/20-resonance-mlock.conf ] && ok "LimitMEMLOCK drop-ins" || skip "LimitMEMLOCK drop-ins" "absent"
[ -f /etc/pipewire/pipewire.conf.d/53-resonance-mlock.conf ] && ok "PipeWire mem.mlock-all" || skip "PipeWire mlock config" "absent"

echo -e "\n${BLUE}Connectivity${NC}"
command -v nmcli >/dev/null 2>&1 && ok "network-manager (Wi-Fi UI)" || skip "network-manager" "nmcli missing"

echo -e "\n${BLUE}Streaming credentials${NC}"
if [ -f "$PROJECT_DIR/.env" ] && grep -q "^TIDAL_CLIENT_ID=" "$PROJECT_DIR/.env"; then
  ok "Tidal credentials present in .env"
else
  bad "Tidal credentials in .env" "TIDAL_CLIENT_ID missing — device-flow login will fail"
fi

echo -e "\n${BLUE}Kiosk input / display-wake${NC}"
if id -nG "$TARGET_USER" 2>/dev/null | grep -qw input; then
  ok "$TARGET_USER is in the 'input' group"
else
  bad "$TARGET_USER in 'input' group" "missing — touch/keyboard display-wake needs it"
fi
if pgrep -f "kiosk-wake-monitor.sh" >/dev/null 2>&1; then
  ok "kiosk-wake-monitor.sh running"
else
  skip "kiosk-wake-monitor.sh" "not running yet (expected before first reboot / outside the kiosk X session)"
fi

echo -e "\n${BLUE}Bluetooth (PipeWire-native, NOT bluealsa)${NC}"
if systemctl list-unit-files bluealsa.service >/dev/null 2>&1; then
  bad "bluealsa" "installed — conflicts with PipeWire's native A2DP handling"
else
  ok "bluealsa not installed (PipeWire handles A2DP natively)"
fi
command -v bluetoothctl >/dev/null 2>&1 && ok "bluetoothctl available" || bad "bluetoothctl" "not installed"
svc_active bluetooth && ok "bluetooth.service running" || bad "bluetooth.service" "not active"

echo -e "\n${BLUE}════════════════════════════════════════════════════════════════════${NC}"
printf "  ${GREEN}%d active${NC}   ${YELLOW}%d skipped${NC}   ${RED}%d failed${NC}\n" "$PASS" "$WARN" "$FAIL"
if [ "$CRIT" -gt 0 ]; then
  echo -e "  ${RED}CRITICAL: one or more core components are missing — audio may not work.${NC}"
  echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}\n"
  exit 1
fi
[ "$FAIL" -gt 0 ] && echo -e "  ${YELLOW}Some services aren't active yet — a reboot may be pending.${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════════${NC}\n"
exit 0
