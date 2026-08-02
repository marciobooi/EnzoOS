#!/bin/bash
export DISPLAY=:0

# Prefer vcgencmd (Raspberry Pi) — cuts backlight without dropping HDMI signal,
# so the monitor never shows "No signal / display output not active".
# Falls back to xset DPMS on non-Pi hardware (QEMU, x86, etc.)
HAS_VCGENCMD=$(command -v vcgencmd &>/dev/null && echo yes || echo no)

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
  echo "X11 automatic screen blanking disabled — display power is app-controlled only."
}

standby() {
  echo "Forcing standby"
  if [ "$HAS_VCGENCMD" = "yes" ]; then
    vcgencmd display_power 0
  else
    xset dpms force off
  fi
}

wake() {
  echo "Waking display"
  if [ "$HAS_VCGENCMD" = "yes" ]; then
    vcgencmd display_power 1
  else
    xset dpms force on
  fi
}

case "$1" in
  standby) standby ;;
  wake) wake ;;
  *) disable_auto_blank ;;
esac
