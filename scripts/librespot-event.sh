#!/bin/bash
# Resonance HiFi — librespot --onevent hook (LIBRESPOT_ONEVENT in
# /etc/raspotify/conf, written by server/spotify-daemon.js).
#
# librespot runs this script as a subprocess on every player event, passing
# event data via environment variables (PLAYER_EVENT, VOLUME, TRACK_ID, ...).
# librespot itself is pinned to a fixed 100% output
# (LIBRESPOT_VOLUME_CTRL=fixed) so CamillaDSP stays the single master gain
# stage for every source — this hook forwards the Spotify app's intended
# volume to CamillaDSP instead of letting librespot apply it directly. See
# POST /api/player/spotify-volume in server/player.js for the receiving end.
set -eu

if [ "${PLAYER_EVENT:-}" != "volume_set" ]; then
  exit 0
fi

# librespot reports VOLUME on a 0-65535 (u16) scale; the API expects 0-100.
VOLUME="${VOLUME:-0}"
VOL100=$(( (VOLUME * 100 + 32767) / 65535 ))

# Backgrounded with a short timeout so a slow/unreachable API can never
# stall librespot's own event loop.
curl -s -m 3 -X POST "http://127.0.0.1:5000/api/player/spotify-volume" \
  -H "Content-Type: application/json" \
  -d "{\"volume\": ${VOL100}}" >/dev/null 2>&1 &

exit 0
