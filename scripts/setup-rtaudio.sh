#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — Real-time audio tuning (interrupts + scheduling priority)
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
#   3. rtkit + SCHED_FIFO — instead of statically walling off 2 of the Pi 4's
#                     4 cores for audio (the previous isolcpus=2,3 approach),
#                     audio gets real-time *scheduling priority* so the kernel
#                     preempts whatever else is running the instant CamillaDSP
#                     or PipeWire need CPU, without permanently reserving cores
#                     that sit >90% idle in practice. This is the same
#                     mechanism desktop pro-audio stacks use (rtkit is what
#                     PipeWire/JACK/PulseAudio call into on every normal Linux
#                     desktop). Measured live: with isolcpus, CamillaDSP+
#                     PipeWire used under 10% of their two dedicated cores
#                     combined while Chromium+X were squeezed onto the
#                     remaining two and stayed near saturated — a bad trade
#                     for touch/UI responsiveness. All 4 cores are now
#                     available to everything; audio just always wins the
#                     scheduler when it actually needs to run.
#
# Boot-parameter changes (1) take effect after a reboot. rtirq, rtkit, and the
# CamillaDSP priority drop-in apply immediately. On non-Pi hosts (no
# cmdline.txt) the boot-param step is skipped gracefully.
#
# Idempotent migration: earlier installs used isolcpus=2,3 + rcu_nocbs=2,3 and
# static per-service CPUAffinity= pins. Both are actively removed here so
# upgrading in place doesn't leave stale cores/pins fighting the new setup.
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

# Resolve the kiosk/app user (owns PipeWire) for cleaning up old user drop-ins.
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
  if grep -qw -- "$token" "$CMDLINE_TXT"; then
    echo -e "  '$token' already present in $CMDLINE_TXT"
    return
  fi
  sed -i -E "1 s/[[:space:]]*${key}=[^[:space:]]*//g" "$CMDLINE_TXT"
  sed -i '1 s/[[:space:]]*$//' "$CMDLINE_TXT"
  sed -i "1 s/\$/ ${token}/" "$CMDLINE_TXT"
  echo -e "  ${GREEN}Added '$token' to $CMDLINE_TXT (reboot to apply).${NC}"
}

# Remove a key=value token (any value) from the boot cmdline — migration path
# for the isolcpus/rcu_nocbs approach this script used to write.
remove_cmdline_token() {
  local key="$1"
  if grep -qw -E "${key}=[^[:space:]]*" "$CMDLINE_TXT"; then
    sed -i -E "1 s/[[:space:]]*${key}=[^[:space:]]*//g" "$CMDLINE_TXT"
    sed -i '1 s/[[:space:]]*$//' "$CMDLINE_TXT"
    echo -e "  ${GREEN}Removed stale '${key}=...' from $CMDLINE_TXT (reboot to apply).${NC}"
  fi
}

# ── 1. Kernel boot parameters ─────────────────────────────────────────────────
if [ -f "$CMDLINE_TXT" ]; then
  cp "$CMDLINE_TXT" "${CMDLINE_TXT}.resonance.bak" 2>/dev/null || true
  add_cmdline_token "threadirqs"
  remove_cmdline_token "isolcpus"
  remove_cmdline_token "rcu_nocbs"
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
#
# Order = priority (first is highest). Audio comes BEFORE the USB host
# controllers so the right thread wins on both DAC topologies:
#   • USB DACs → the interrupt is on xhci_hcd/dwc_otg, fed by snd_usb_audio.
#   • I²S DACs → the interrupt is the SoC I²S/DMA block, NOT the USB bus, so the
#     BCM2835 I²S drivers (snd_soc_bcm2835_i2s / bcm2835_i2s / snd_bcm2835) are
#     listed explicitly and ABOVE usb/xhci — otherwise raising the USB bus does
#     nothing for I²S and can cause clock contention with other USB peripherals.
RTIRQ_NAME_LIST="snd_usb_audio snd_soc_bcm2835_i2s bcm2835_i2s snd_soc snd_bcm2835 snd i2s usb xhci_hcd dwc_otg"
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

# ── 3. rtkit — sandboxed real-time priority broker for PipeWire ─────────────
# PipeWire already requests SCHED_FIFO for its audio thread via rtkit
# automatically the moment the daemon is reachable — no PipeWire-side config
# needed. Without it (the previous state on this image: package installed but
# service never enabled), PipeWire ran plain SCHED_OTHER at priority 0, so the
# isolcpus wall was the *only* thing protecting it from scheduling jitter.
if command -v rtkit-daemon >/dev/null 2>&1 || [ -x /usr/lib/rtkit-daemon ] || dpkg -s rtkit >/dev/null 2>&1; then
  systemctl enable --now rtkit-daemon >/dev/null 2>&1 \
    && echo -e "  ${GREEN}rtkit-daemon enabled — PipeWire will get real-time priority automatically.${NC}" \
    || echo -e "  ${YELLOW}Could not start rtkit-daemon — PipeWire stays SCHED_OTHER.${NC}"
else
  echo -e "  Installing rtkit..."
  DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 install -y rtkit \
    && systemctl enable --now rtkit-daemon >/dev/null 2>&1 \
    && echo -e "  ${GREEN}rtkit installed and enabled.${NC}" \
    || echo -e "  ${YELLOW}rtkit unavailable via apt — PipeWire stays SCHED_OTHER.${NC}"
fi

# ── 4. CamillaDSP — explicit real-time scheduling priority ──────────────────
# CamillaDSP is the final DSP/mixing stage feeding the DAC — the one place an
# underrun is actually audible as a click/dropout. Priority 70 sits below the
# audio hardware IRQ threads (51-90 from rtirq above, so the interrupt that
# moves samples in/out of the ring buffer always preempts DSP compute) and
# comfortably above Chromium/Node's normal SCHED_OTHER (priority 0), so it
# always gets the CPU the instant it needs it regardless of what else is
# running on the (no longer isolated) cores.
mkdir -p /etc/systemd/system/camilladsp.service.d
cat > /etc/systemd/system/camilladsp.service.d/10-resonance-rt-priority.conf <<'RTEOF'
[Service]
# Resonance HiFi — real-time scheduling priority (replaces core isolation)
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=70
RTEOF
echo -e "  ${GREEN}CamillaDSP → SCHED_FIFO priority 70.${NC}"

# ── 5. Clean up the old core-isolation drop-ins from earlier installs ───────
for unit in camilladsp.service raspotify.service shairport-sync.service; do
  old="/etc/systemd/system/${unit}.d/10-resonance-cpu-affinity.conf"
  if [ -f "$old" ]; then
    rm -f "$old"
    echo -e "  ${GREEN}Removed stale CPU-pin drop-in for ${unit}.${NC}"
  fi
done

USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [ -n "$USER_HOME" ] && [ -d "$USER_HOME" ]; then
  for usvc in pipewire.service pipewire-pulse.service wireplumber.service; do
    old="$USER_HOME/.config/systemd/user/${usvc}.d/10-resonance-cpu-affinity.conf"
    if [ -f "$old" ]; then
      rm -f "$old"
      echo -e "  ${GREEN}Removed stale CPU-pin drop-in for ${usvc} (user: $TARGET_USER).${NC}"
    fi
  done
  UID_NUM="$(id -u "$TARGET_USER" 2>/dev/null || echo "")"
  if [ -n "$UID_NUM" ] && [ -d "/run/user/$UID_NUM" ]; then
    sudo -u "$TARGET_USER" XDG_RUNTIME_DIR="/run/user/$UID_NUM" \
      systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
fi

systemctl daemon-reload 2>/dev/null || true
systemctl try-restart camilladsp.service >/dev/null 2>&1 || true
systemctl try-restart raspotify.service  >/dev/null 2>&1 || true
systemctl try-restart shairport-sync.service >/dev/null 2>&1 || true

echo -e "${GREEN}[rt-audio] Real-time audio tuning complete.${NC}"
if [ -f "$CMDLINE_TXT" ]; then
  echo -e "${YELLOW}[rt-audio] Reboot required to release cores 2/3 from the old isolcpus setting.${NC}"
fi
exit 0
