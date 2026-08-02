#!/bin/bash
export DISPLAY=:0
LAST_WAKE=0

# Touch device names X knows the panel by (same list xinitrc's map_touch uses).
TOUCH_NAMES="WaveShare|Waveshare|waveshare|eGalaxTouch|ILITEK|Goodix"

STATE_FILE="/home/pi/.resonance-display-state"

echo "Watching input for wake events..."

# ── Wake-tap swallowing ───────────────────────────────────────────────────────
# A tap on a dark screen must ONLY wake it — it must never activate whatever
# button happens to be under the finger (observed live: pressing a black
# screen near the play button started playback). While the display is dark
# the touch device is detached from X (`xinput disable`), so Chromium never
# sees the waking tap; evtest below reads the KERNEL device directly, which
# xinput does not affect, so wake detection keeps working. On wake the touch
# is re-attached only after the display is back on and the tap has ended.
# IDs are resolved fresh on every call — they change across X restarts.
touch_ids() {
  xinput list 2>/dev/null | grep -iE "$TOUCH_NAMES" | grep -oP 'id=\K[0-9]+'
}

set_touch() { # $1 = enable | disable
  local id
  for id in $(touch_ids); do
    xinput "$1" "$id" 2>/dev/null
  done
}

display_is_off() {
  # AUDIT-2026-08-02b: neither of this function's original two checks is
  # reliable any more. `xset q`'s "Monitor is Off" line only exists while
  # DPMS is enabled — but kiosk-power.sh's standby() now re-disables DPMS
  # immediately after forcing the screen off (to stop it re-arming X11's own
  # idle timer), so the line disappears the instant standby completes.
  # vcgencmd display_power is simply dead under this project's vc4-kms-v3d
  # driver (confirmed live: commanding it off immediately reports back "1",
  # still on) — a known, documented firmware limitation, not fixable here.
  # kiosk-power.sh now writes ground truth to a shared state file instead.
  [ "$(cat "$STATE_FILE" 2>/dev/null)" = "off" ] && return 0
  return 1
}

# evtest only accepts a SINGLE device argument — `evtest /dev/input/event*`
# (the old version of this script) fails immediately because the shell
# expands the glob into multiple positional args. Spawn one evtest per input
# device instead, all writing into a shared FIFO that the throttled
# read-loop below consumes. Opening the FIFO on fd 3 for read+write keeps a
# reader attached for the life of the script, so the writer processes never
# see a broken pipe between events (a plain `while read < "$FIFO"` would
# exit after the first writer's EOF).
FIFO=$(mktemp -u /tmp/resonance-wake-XXXXXX)
mkfifo "$FIFO"
exec 3<> "$FIFO"
rm -f "$FIFO"  # unlinked immediately; fd 3 keeps the pipe alive until exit

WAKE_PIDS=()
for dev in /dev/input/event*; do
    [ -r "$dev" ] || continue
    stdbuf -oL evtest "$dev" >&3 2>/dev/null &
    WAKE_PIDS+=("$!")
done

if [ "${#WAKE_PIDS[@]}" -eq 0 ]; then
    echo "[Resonance] No readable /dev/input/event* devices — is this user in the 'input' group?"
fi

# Sleep watcher: injects a marker into the same FIFO whenever the display is
# dark, so the single read-loop below owns all state (a background subshell
# can't mutate the parent's variables directly).
( while sleep 2; do display_is_off && echo "__DISPLAY_OFF__"; done >&3 ) &
WAKE_PIDS+=("$!")

cleanup() { kill "${WAKE_PIDS[@]}" 2>/dev/null; set_touch enable; exec 3>&-; }
trap cleanup EXIT

TOUCH_BLOCKED=0

# Monitor all input events, filtering sync packets to reduce CPU load and throttling to prevent redundant updates
while read -r line <&3; do
    if [[ "$line" == "__DISPLAY_OFF__" ]]; then
        if [ "$TOUCH_BLOCKED" -eq 0 ]; then
            echo "Display dark -> detaching touch from X (wake taps will be swallowed)"
            set_touch disable
            TOUCH_BLOCKED=1
        fi
        continue
    fi

    if [[ "$line" == *"SYN_REPORT"* ]]; then
        CURRENT_TIME=$(date +%s)

        # Throttling: only run wake routines if it's been at least 2 seconds since last wake
        if [ $((CURRENT_TIME - LAST_WAKE)) -ge 2 ]; then
            echo "Activity detected -> waking display"
            # AUDIT-2026-08-02b: call kiosk-power.sh directly (not via sudo —
            # this script already runs as pi, which owns the X session and
            # needs no extra authorization) so the force-on + immediate
            # re-disable-DPMS + state-file update all happen in one place.
            # This runs ahead of the async POST below purely for latency; the
            # API call remains the source of truth for standby state in the DB.
            /usr/local/bin/kiosk-power.sh wake >/dev/null 2>&1
            # Trigger API software wake
            curl -s -X POST -H "Content-Type: application/json" -d '{"enabled":false}' http://localhost:5000/api/player/standby || true
            LAST_WAKE=$CURRENT_TIME
        fi

        # Re-attach the touch only once the display is lit and the waking tap
        # is over — it was consumed while the device was detached from X.
        if [ "$TOUCH_BLOCKED" -eq 1 ]; then
            sleep 0.5
            set_touch enable
            TOUCH_BLOCKED=0
            echo "Touch re-attached"
        fi
    fi
done
