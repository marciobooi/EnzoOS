#!/bin/bash
export DISPLAY=:0
IDLE_TIME=300 # 5 minutes

enable_dpms() {
  xset +dpms
  xset s on
  xset s $IDLE_TIME $IDLE_TIME
  xset dpms $IDLE_TIME $IDLE_TIME $IDLE_TIME
  echo "DPMS enabled (idle ${IDLE_TIME}s)"
}

standby() {
  echo "Forcing standby"
  xset dpms force off
}

wake() {
  echo "Waking display"
  xset dpms force on
}

case "$1" in
  standby) standby ;;
  wake) wake ;;
  *) enable_dpms ;;
esac
