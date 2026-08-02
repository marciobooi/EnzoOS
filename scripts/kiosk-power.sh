#!/bin/bash
export DISPLAY=:0

# Shared with kiosk-wake-monitor.sh, which needs to know whether the display
# is currently supposed to be off but can't rely on `xset q` (goes silent on
# monitor state the instant DPMS is re-disabled below) or vcgencmd (dead, see
# AUDIT-2026-08-02b). Deliberately NOT in /tmp: both pi (disable_auto_blank)
# and root (standby/wake, via sudo) write this file, and the kernel's
# fs.protected_regular hardening (default-on) blocks a non-owner — including
# root — from opening a file it doesn't own inside a sticky world-writable
# directory like /tmp, chmod 666 or not (confirmed live: root got "Permission
# denied" writing a pi-owned file there). pi's home dir isn't sticky or
# world-writable, so root's normal write-anywhere privilege applies cleanly.
STATE_FILE="/home/pi/.resonance-display-state"

# AUDIT-2026-08-02b: vcgencmd display_power is DEAD on this hardware.
# Confirmed live: `vcgencmd display_power 0` immediately reports back
# `display_power=1` — it fails outright, not just with a delay. This is a
# known, documented Raspberry Pi firmware limitation, not a regression: the
# vc4-kms-v3d "full KMS" overlay this project has always used (required for
# GPU-accelerated rendering — see install.sh) intentionally dropped
# vcgencmd's display-power support in favor of standard DRM/Linux tooling.
# It only *works* under the legacy vc4-fkms-v3d overlay, which we don't use.
#
# This bug pre-dates tonight but was masked until now: before the
# disable_auto_blank() fix below existed, X11's own independent 5-minute
# DPMS idle timer eventually blanked the screen on its own, so standby()
# *looked* like it worked (just later than the app's own 10-minute timer
# intended). With that independent timer gone, standby()'s vcgencmd call
# had no fallback left, and the screen stopped turning off at all.
#
# Fix: use `xset dpms force off/on` unconditionally — confirmed live to
# actually change monitor power state under vc4-kms-v3d. Its one side
# effect is re-enabling the DPMS *extension* it just used (confirmed live:
# `xset -dpms` → Disabled, then `xset dpms force on` → Enabled again), which
# would re-arm X11's own automatic idle-blank timer that disable_auto_blank()
# turned off — so every standby()/wake() call re-disables it immediately
# after forcing the state, to keep the app the sole authority over display
# power.

# AUDIT-2026-08-02: this used to ENABLE X11's own idle-based screensaver/DPMS
# timeout (5 min) here, running completely independent of and unsynchronized
# with the app's own standby/dim logic (Kiosk.jsx) — which is itself
# context-aware (never blanks while music is playing, dims instead). The two
# timers racing against each other meant the physical display could go fully
# dark mid-playback purely because nobody had touched the screen in 5
# minutes, with the app never told and still rendering/playing normally
# underneath — reported live as "if music is playing we will never enter
# standby... after a while it goes off but music keeps playing, is just the
# screen." The app should be the SOLE authority over display power ("we
# should prevail regarding this") — this now explicitly DISABLES X11's own
# automatic blanking instead of arming it. standby()/wake() below are
# unaffected: they're the explicit, app-commanded actions (still invoked by
# Kiosk.jsx's own timers via POST /api/player/standby → kiosk-power.sh
# standby|wake), not X11's automatic idle countdown.
disable_auto_blank() {
  xset s off
  xset -dpms
  echo "on" > "$STATE_FILE" 2>/dev/null
  chmod 666 "$STATE_FILE" 2>/dev/null
  echo "X11 automatic screen blanking disabled — display power is app-controlled only."
}

standby() {
  echo "Forcing standby"
  xset dpms force off
  xset -dpms
  echo "off" > "$STATE_FILE" 2>/dev/null
  chmod 666 "$STATE_FILE" 2>/dev/null
}

wake() {
  echo "Waking display"
  xset dpms force on
  xset -dpms
  echo "on" > "$STATE_FILE" 2>/dev/null
  chmod 666 "$STATE_FILE" 2>/dev/null
}

case "$1" in
  standby) standby ;;
  wake) wake ;;
  *) disable_auto_blank ;;
esac
