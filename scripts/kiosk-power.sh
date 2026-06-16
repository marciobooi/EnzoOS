#!/bin/bash
export DISPLAY=:0
IDLE_TIME=300 # 5 minutes

# Prefer vcgencmd (Raspberry Pi) — cuts backlight without dropping HDMI signal,
# so the monitor never shows "No signal / display output not active".
# Falls back to xset DPMS on non-Pi hardware (QEMU, x86, etc.)
HAS_VCGENCMD=$(command -v vcgencmd &>/dev/null && echo yes || echo no)

enable_dpms() {
  if [ "$HAS_VCGENCMD" = "yes" ]; then
    # On real Pi: use xscreensaver-style blanking; vcgencmd handles actual power
    xset s on
    xset s $IDLE_TIME $IDLE_TIME
    xset dpms $IDLE_TIME $IDLE_TIME $IDLE_TIME
  else
    xset +dpms
    xset s on
    xset s $IDLE_TIME $IDLE_TIME
    xset dpms $IDLE_TIME $IDLE_TIME $IDLE_TIME
  fi
  echo "Display power management enabled (idle ${IDLE_TIME}s)"
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
  *) enable_dpms ;;
esac
