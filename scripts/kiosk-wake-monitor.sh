#!/bin/bash
export DISPLAY=:0
WAKE_CMD="xset dpms force on"
LAST_WAKE=0

echo "Watching input for wake events..."

# Monitor all input events, filtering sync packets to reduce CPU load and throttling to prevent redundant updates
stdbuf -oL evtest /dev/input/event* 2>/dev/null | while read line; do
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
