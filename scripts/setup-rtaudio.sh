#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — Real-time audio tuning (interrupts + CPU topology)
# ─────────────────────────────────────────────────────────────────────────────
# Idempotent. Safe to re-run on every install and OTA update. Requires root.
#
#   1. threadirqs   — kernel boot parameter forcing ALL hardware interrupts to
#                     run as schedulable kernel threads (prerequisite for giving
#                     them individual real-time priorities).
#
#   2. rtirq-init   — daemon that identifies the audio device's hardware IRQ
#                     (USB host controller for USB DACs, or the I²S bus for I²S
#                     DACs) and pins its IRQ thread to a real-time priority
#                     HIGHER than the network (Wi-Fi/Ethernet) and storage
#                     (SD/USB) drivers, which keep default non-RT scheduling.
#
#   3. isolcpus     — kernel boot parameter removing cores 2 & 3 from the Linux
#                     load balancer so the scheduler never migrates processes
#                     onto them. Prevents L1/L2 cache invalidation on the audio
#                     pipeline from core hopping. Companion rcu_nocbs offloads
#                     RCU callbacks off the isolated cores.
#
#   4. CPU affinity — asymmetric workload split across the 4 Pi cores:
#                       Cores 0 & 1 → OS, Node API, database, Chromium kiosk
#                                     (default — everything non-isolated lands
#                                      here automatically thanks to isolcpus)
#                       Core 2      → PipeWire + CamillaDSP audio pipeline
#                       Core 3      → source streaming daemons
#                                     (raspotify/librespot, shairport-sync)
#
# Boot-parameter changes (1 & 3) take effect after a reboot. Service affinity
# and rtirq apply immediately. On non-Pi / QEMU hosts (no cmdline.txt, or fewer
# than 4 cores) the relevant steps are skipped gracefully.
#
# The kiosk/app user for the PipeWire user-service drop-in is taken from
# $RT_TARGET_USER, falling back to the owner of the repository directory.
# ─────────────────────────────────────────────────────────────────────────────
set -u

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Editing /boot and /etc and managing services requires root.
if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo -e "${YELLOW}[rt-audio] Not running as root — skipping real-time tuning.${NC}"
  exit 0
fi

# Resolve the kiosk/app user (owns PipeWire) for user-service affinity.
TARGET_USER="${RT_TARGET_USER:-$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || echo root)}"
[ "$TARGET_USER" = "root" ] && TARGET_USER="${SUDO_USER:-root}"

CORES="$(nproc 2>/dev/null || echo 1)"

echo -e "${GREEN}[rt-audio] Configuring real-time audio tuning (user: $TARGET_USER, cores: $CORES)...${NC}"

# Locate the boot cmdline (Pi firmware layout, with older fallback).
CMDLINE_TXT="/boot/firmware/cmdline.txt"
[ -f "$CMDLINE_TXT" ] || CMDLINE_TXT="/boot/cmdline.txt"

# Append a single token to the kernel cmdline (line 1 only — cmdline.txt must
# stay a single space-separated line). Idempotent via word-boundary match.
add_cmdline_token() {
  local token="$1" key="${1%%=*}"
  # Replace any existing occurrence of the same key (e.g. isolcpus=...) then add.
  if grep -qw -- "$token" "$CMDLINE_TXT"; then
    echo -e "  '$token' already present in $CMDLINE_TXT"
    return
  fi
  # Drop a stale value for this key if one exists with a different value.
  sed -i -E "1 s/[[:space:]]*${key}=[^[:space:]]*//g" "$CMDLINE_TXT"
  sed -i '1 s/[[:space:]]*$//' "$CMDLINE_TXT"
  sed -i "1 s/\$/ ${token}/" "$CMDLINE_TXT"
  echo -e "  ${GREEN}Added '$token' to $CMDLINE_TXT (reboot to apply).${NC}"
}

# Write a systemd drop-in pinning a system service to specific CPU core(s).
pin_service() {
  local unit="$1" cpus="$2"
  local dir="/etc/systemd/system/${unit}.d"
  mkdir -p "$dir"
  cat > "$dir/10-resonance-cpu-affinity.conf" <<PINEOF
[Service]
# Resonance HiFi — pin audio workload to isolated core(s)
CPUAffinity=${cpus}
PINEOF
  echo -e "  ${GREEN}Pinned ${unit} → CPU ${cpus}.${NC}"
}

# ── 1 & 3. Kernel boot parameters ─────────────────────────────────────────────
if [ -f "$CMDLINE_TXT" ]; then
  cp "$CMDLINE_TXT" "${CMDLINE_TXT}.resonance.bak" 2>/dev/null || true
  add_cmdline_token "threadirqs"
  if [ "$CORES" -ge 4 ]; then
    add_cmdline_token "isolcpus=2,3"
    add_cmdline_token "rcu_nocbs=2,3"
  else
    echo -e "  ${YELLOW}Fewer than 4 cores — skipping isolcpus (needs a quad-core Pi).${NC}"
  fi
else
  echo -e "  ${YELLOW}cmdline.txt not found (QEMU/non-Pi) — skipping kernel boot params.${NC}"
fi

# ── 2. rtirq-init — real-time IRQ priority ────────────────────────────────────
if ! command -v rtirq >/dev/null 2>&1 \
   && [ ! -x /etc/init.d/rtirq ] \
   && [ ! -x /usr/sbin/rtirq ]; then
  echo -e "  Installing rtirq-init..."
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y rtirq-init \
    || echo -e "  ${YELLOW}rtirq-init unavailable via apt — relying on threadirqs only.${NC}"
else
  echo -e "  rtirq already installed."
fi

# Drivers in DESCENDING priority (first = highest). Covers USB DACs
# (snd_usb_audio + xhci_hcd/dwc_otg host controller carrying their IRQs) and
# I²S DACs (snd_soc_* / i2s / onboard snd). Network and storage drivers are
# deliberately omitted so they keep default non-RT scheduling.
if [ -d /etc/default ]; then
  cat > /etc/default/rtirq <<'RTIRQEOF'
# Resonance HiFi — rtirq real-time IRQ priority configuration.
# Audio interrupt threads are pinned to RT priorities above network
# (Wi-Fi/Ethernet) and storage (SD/USB) drivers, which are intentionally
# excluded and keep their default non-RT scheduling.
RTIRQ_NAME_LIST="snd_usb_audio snd_soc snd usb xhci_hcd dwc_otg i2s"
RTIRQ_PRIO_HIGH=90
RTIRQ_PRIO_DECR=5
RTIRQ_PRIO_LOW=51
RTIRQ_RESET_ALL=no
RTIRQ_HIGH_LIST=
RTIRQ_RESET_MASK=f8
# threadirqs already threads every IRQ, so only the real-time clock is excluded.
RTIRQ_NON_THREADED="rtc"
RTIRQEOF
  echo -e "  ${GREEN}Wrote /etc/default/rtirq (audio IRQs above network/storage).${NC}"
fi

if systemctl enable rtirq >/dev/null 2>&1; then
  systemctl restart rtirq >/dev/null 2>&1 || true
  echo -e "  ${GREEN}rtirq service enabled and restarted (systemd).${NC}"
elif [ -x /etc/init.d/rtirq ]; then
  update-rc.d rtirq defaults >/dev/null 2>&1 || true
  /etc/init.d/rtirq restart >/dev/null 2>&1 || true
  echo -e "  ${GREEN}rtirq service enabled and restarted (SysV init).${NC}"
else
  echo -e "  ${YELLOW}rtirq service not found — threadirqs still applies after reboot.${NC}"
fi

# ── 4. CPU affinity — asymmetric workload split ───────────────────────────────
# Only meaningful once cores 2 & 3 are isolated (quad-core). On non-isolated
# hosts these drop-ins would force processes onto cores that may not exist, so
# we gate the whole block on a quad-core CPU.
if [ "$CORES" -ge 4 ]; then
  # Core 2 — audio pipeline: CamillaDSP + PipeWire
  pin_service "camilladsp.service" "2"

  # Core 3 — source streaming daemons. Drop-ins are created unconditionally so
  # they also apply to units installed later in the run (e.g. shairport-sync,
  # built from source after this step) the moment those units appear.
  for unit in raspotify.service shairport-sync.service; do
    pin_service "$unit" "3"
  done

  systemctl daemon-reload 2>/dev/null || true
  systemctl try-restart camilladsp.service >/dev/null 2>&1 || true
  systemctl try-restart raspotify.service  >/dev/null 2>&1 || true
  systemctl try-restart shairport-sync.service >/dev/null 2>&1 || true

  # PipeWire runs as a per-user service — write a user drop-in for the app user
  # so its real-time graph also lands on the dedicated audio core (core 2).
  USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
  if [ -n "$USER_HOME" ] && [ -d "$USER_HOME" ]; then
    for usvc in pipewire.service pipewire-pulse.service wireplumber.service; do
      udir="$USER_HOME/.config/systemd/user/${usvc}.d"
      mkdir -p "$udir"
      cat > "$udir/10-resonance-cpu-affinity.conf" <<PWEOF
[Service]
# Resonance HiFi — pin PipeWire audio graph to the dedicated audio core
CPUAffinity=2
PWEOF
    done
    chown -R "$TARGET_USER":"$TARGET_USER" "$USER_HOME/.config/systemd" 2>/dev/null || true
    # Best-effort live reload of the user manager (applies fully on next boot).
    UID_NUM="$(id -u "$TARGET_USER" 2>/dev/null || echo "")"
    if [ -n "$UID_NUM" ] && [ -d "/run/user/$UID_NUM" ]; then
      sudo -u "$TARGET_USER" XDG_RUNTIME_DIR="/run/user/$UID_NUM" \
        systemctl --user daemon-reload >/dev/null 2>&1 || true
    fi
    echo -e "  ${GREEN}Pinned PipeWire (user: $TARGET_USER) → CPU 2.${NC}"
  else
    echo -e "  ${YELLOW}Could not resolve home for '$TARGET_USER' — PipeWire pin skipped.${NC}"
  fi
else
  echo -e "  ${YELLOW}Fewer than 4 cores — skipping CPU affinity assignment.${NC}"
fi

echo -e "${GREEN}[rt-audio] Real-time audio tuning complete.${NC}"
exit 0
