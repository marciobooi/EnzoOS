#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# Resonance HiFi — RAM preloading execution engine (memory locking)
# ─────────────────────────────────────────────────────────────────────────────
# Idempotent. Safe to re-run on every install and OTA update. Requires root.
#
# Locks the core audio daemons into physical RAM so the kernel can never page
# the decoding/DSP execution engine — or the audio chunks it is processing —
# out to disk during playback. Four cooperating mechanisms:
#
#   1. limits baseline   — /etc/security/limits.d grants the `audio` group
#                          `memlock unlimited` (+ rtprio), the standard
#                          pro-audio allowance for login-session clients.
#
#   2. LimitMEMLOCK      — systemd drop-ins raise RLIMIT_MEMLOCK to infinity for
#                          camilladsp, mpd, raspotify, shairport-sync and the
#                          PipeWire user service, so each daemon is *permitted*
#                          to lock its pages.
#
#   3. mlockall shim     — CamillaDSP (the DSP execution engine) has no native
#                          lock option, so an LD_PRELOAD constructor
#                          (resonance-mlockall.so) calls mlockall(MCL_CURRENT |
#                          MCL_FUTURE) at process start, pinning all current and
#                          future pages into RAM.
#
#   4. PipeWire mlock    — PipeWire's native mem.allow-mlock / mem.mlock-all
#                          context properties lock its real-time graph memory.
#
# Note: the forced mlockall shim is applied only to CamillaDSP (bounded, RT
# memory). MPD, raspotify and shairport-sync receive the LimitMEMLOCK raise so
# their own RT threads can lock, but are not blanket-locked — this avoids
# pinning a large MPD music database into RAM on low-memory Pis.
#
# Best-effort throughout: a missing compiler, service or PipeWire simply skips
# that step and never aborts the install.
# ─────────────────────────────────────────────────────────────────────────────
set -u

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
  echo -e "${YELLOW}[ram-lock] Not running as root — skipping memory-lock tuning.${NC}"
  exit 0
fi

TARGET_USER="${RT_TARGET_USER:-$(stat -c '%U' "$PROJECT_DIR" 2>/dev/null || echo root)}"
[ "$TARGET_USER" = "root" ] && TARGET_USER="${SUDO_USER:-root}"

MLOCK_SO="/usr/local/lib/resonance-mlockall.so"

echo -e "${GREEN}[ram-lock] Configuring RAM preloading / memory locking (user: $TARGET_USER)...${NC}"

# Write a systemd drop-in raising RLIMIT_MEMLOCK for a system service, and
# optionally injecting the mlockall LD_PRELOAD shim.
memlock_dropin() {
  local unit="$1" preload="$2"
  local dir="/etc/systemd/system/${unit}.d"
  mkdir -p "$dir"
  {
    echo "[Service]"
    echo "# Resonance HiFi — keep audio engine resident in RAM"
    echo "LimitMEMLOCK=infinity"
    [ "$preload" = "yes" ] && echo "Environment=LD_PRELOAD=${MLOCK_SO}"
  } > "$dir/20-resonance-mlock.conf"
}

# ── 1. limits.d baseline for the audio group ──────────────────────────────────
if [ -d /etc/security/limits.d ]; then
  cat > /etc/security/limits.d/95-resonance-audio.conf <<'LIMEOF'
# Resonance HiFi — pro-audio resource limits for the `audio` group.
# Allows audio-group login-session processes to lock memory and run real-time.
@audio   -   memlock   unlimited
@audio   -   rtprio    95
@audio   -   nice      -19
LIMEOF
  echo -e "  ${GREEN}Wrote /etc/security/limits.d/95-resonance-audio.conf.${NC}"
fi

# ── 1b. Real-time CPU scheduling for CamillaDSP ───────────────────────────────
# AUDIT-2026-08-24: found live on a deployed box with no record of how it got
# there — this drop-in existed on the running Pi but was never written by
# anything in this repo, so a fresh install or a from-scratch reprovision
# would silently lack it. Without it, CamillaDSP runs SCHED_OTHER like any
# ordinary process: on a Pi 4 running the full stack concurrently (kiosk
# Chromium, Ollama for DJ mode, PipeWire, MPD, raspotify), sustained CPU
# contention — worsened by thermal throttling under load (measured live:
# 69.6C core temp, `vcgencmd get_throttled` showing the soft-limit flag
# already set) — can starve CamillaDSP's real-time write loop long enough to
# miss its ALSA deadline, surfacing as recurring "write underrun, Broken
# pipe" on the DAC. Reported live as "micro cuts". SCHED_FIFO priority 70
# is the exact value already proven live on that box (confirmed via
# `systemctl show camilladsp -p CPUSchedulingPolicy` before this script
# existed) — matches the `rtprio 95` ceiling already granted to the `audio`
# group above with headroom to spare. Applied by systemd itself (as root,
# before dropping to the service's own User=) via sched_setscheduler() on
# the forked child, so no capability grant is needed on CamillaDSP itself —
# the standard mechanism real-time audio daemons (JACK, PipeWire's own RT
# threads) use to stay ahead of ordinary SCHED_OTHER CPU hogs like a browser
# or an LLM inference process.
mkdir -p /etc/systemd/system/camilladsp.service.d
cat > /etc/systemd/system/camilladsp.service.d/10-resonance-rt-priority.conf <<'RTEOF'
[Service]
# Resonance HiFi — real-time scheduling priority (replaces core isolation)
CPUSchedulingPolicy=fifo
CPUSchedulingPriority=70
RTEOF
echo -e "  ${GREEN}camilladsp.service → CPUSchedulingPolicy=fifo, Priority=70.${NC}"

# ── 2. Compile the mlockall LD_PRELOAD shim ───────────────────────────────────
if [ -f "$SCRIPT_DIR/resonance-mlockall.c" ]; then
  if command -v gcc >/dev/null 2>&1; then
    mkdir -p /usr/local/lib
    if gcc -shared -fPIC -O2 -o "$MLOCK_SO" "$SCRIPT_DIR/resonance-mlockall.c" 2>/dev/null \
       && [ -s "$MLOCK_SO" ]; then
      chmod 644 "$MLOCK_SO"
      echo -e "  ${GREEN}Compiled mlockall shim → ${MLOCK_SO}.${NC}"
    else
      echo -e "  ${YELLOW}Failed to compile mlockall shim — CamillaDSP will use LimitMEMLOCK only.${NC}"
    fi
  else
    echo -e "  ${YELLOW}gcc not found — skipping mlockall shim (LimitMEMLOCK still applied).${NC}"
  fi
fi

# ── 3. systemd LimitMEMLOCK drop-ins ──────────────────────────────────────────
# CamillaDSP: raise limit AND force-lock via the shim (only if it compiled).
if [ -s "$MLOCK_SO" ]; then
  memlock_dropin "camilladsp.service" "yes"
  echo -e "  ${GREEN}camilladsp.service → LimitMEMLOCK=infinity + mlockall shim.${NC}"
else
  memlock_dropin "camilladsp.service" "no"
  echo -e "  ${GREEN}camilladsp.service → LimitMEMLOCK=infinity.${NC}"
fi

# Decoders / receivers: raise the limit so their RT threads may lock. Drop-ins
# are created unconditionally so they also apply to units installed later in the
# run (e.g. shairport-sync, built from source after this step).
for unit in mpd.service raspotify.service shairport-sync.service; do
  memlock_dropin "$unit" "no"
  echo -e "  ${GREEN}${unit} → LimitMEMLOCK=infinity.${NC}"
done

systemctl daemon-reload 2>/dev/null || true
for unit in camilladsp.service mpd.service raspotify.service shairport-sync.service; do
  systemctl try-restart "$unit" >/dev/null 2>&1 || true
done

# ── 4. PipeWire native memory locking ─────────────────────────────────────────
# Config drop-in (system-wide) enabling PipeWire's own mlock of its RT graph.
if [ -d /etc/pipewire ] || command -v pipewire >/dev/null 2>&1; then
  mkdir -p /etc/pipewire/pipewire.conf.d
  cat > /etc/pipewire/pipewire.conf.d/53-resonance-mlock.conf <<'PWMLOCKEOF'
# Resonance HiFi — lock PipeWire's real-time graph memory into RAM.
context.properties = {
    mem.allow-mlock = true
    mem.mlock-all   = true
}
PWMLOCKEOF
  echo -e "  ${GREEN}Wrote PipeWire mlock config (mem.mlock-all = true).${NC}"
fi

# PipeWire runs as a per-user service — raise its RLIMIT_MEMLOCK via a user
# drop-in so the native mlock above actually succeeds.
USER_HOME="$(getent passwd "$TARGET_USER" | cut -d: -f6)"
if [ -n "$USER_HOME" ] && [ -d "$USER_HOME" ]; then
  for usvc in pipewire.service pipewire-pulse.service; do
    udir="$USER_HOME/.config/systemd/user/${usvc}.d"
    mkdir -p "$udir"
    cat > "$udir/20-resonance-mlock.conf" <<'PWUEOF'
[Service]
# Resonance HiFi — allow PipeWire to lock its graph memory into RAM
LimitMEMLOCK=infinity
PWUEOF
  done
  chown -R "$TARGET_USER":"$TARGET_USER" "$USER_HOME/.config/systemd" 2>/dev/null || true
  UID_NUM="$(id -u "$TARGET_USER" 2>/dev/null || echo "")"
  if [ -n "$UID_NUM" ] && [ -d "/run/user/$UID_NUM" ]; then
    sudo -u "$TARGET_USER" XDG_RUNTIME_DIR="/run/user/$UID_NUM" \
      systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
  echo -e "  ${GREEN}PipeWire (user: $TARGET_USER) → LimitMEMLOCK=infinity.${NC}"
else
  echo -e "  ${YELLOW}Could not resolve home for '$TARGET_USER' — PipeWire user limit skipped.${NC}"
fi

echo -e "${GREEN}[ram-lock] RAM preloading / memory locking complete.${NC}"
exit 0
