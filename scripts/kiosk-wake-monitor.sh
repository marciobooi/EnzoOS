#!/bin/bash
export DISPLAY=:0
WAKE_CMD="xset dpms force on"
LAST_WAKE=0

echo "Watching input for wake events..."

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

cleanup() { kill "${WAKE_PIDS[@]}" 2>/dev/null; exec 3>&-; }
trap cleanup EXIT

# Monitor all input events, filtering sync packets to reduce CPU load and throttling to prevent redundant updates
while read -r line <&3; do
    if [[ "$line" == *"SYN_REPORT"* ]]; then
        CURRENT_TIME=$(date +%s)

        # Throttling: only run wake routines if it's been at least 2 seconds since last wake
        if [ $((CURRENT_TIME - LAST_WAKE)) -ge 2 ]; then
            echo "Activity detected -> waking display"
            eval $WAKE_CMD
            # Trigger API software wake
            curl -s -X POST -H "Content-Type: application/json" -d '{"enabled":false}' http://localhost:5000/api/player/standby || true
            LAST_WAKE=$CURRENT_TIME
        fi
    fi
done
