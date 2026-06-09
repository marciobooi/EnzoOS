#!/bin/bash

# This script is called by Librespot (Spotify Connect) on events like "playing", "paused", "changed", etc.
# Librespot passes environment variables like $PLAYER_EVENT, $TRACK_ID, $TRACK_NAME, $ARTIST_NAME, $ALBUM_NAME

WEBHOOK_URL="http://127.0.0.1:3001/api/metadata/webhook"

if [ "$PLAYER_EVENT" = "playing" ]; then
    STATUS="playing"
elif [ "$PLAYER_EVENT" = "paused" ] || [ "$PLAYER_EVENT" = "stopped" ]; then
    STATUS="paused"
fi

# Spotify tracks use base62 identifiers, but for Album Art we usually have to query the Web API.
# Since we don't have OAuth setup here, we pass the local variables to the React UI.
# In a full implementation, the backend could use the Spotify Client Credentials flow to resolve $TRACK_ID to an image URL.

# Use jq to construct JSON safely, escaping quotes and special characters
PAYLOAD=$(jq -n \
  --arg source "spotify" \
  --arg status "${STATUS:-playing}" \
  --arg title "$TRACK_NAME" \
  --arg artist "$ARTIST_NAME" \
  --arg album "$ALBUM_NAME" \
  '{ source: $source, status: $status, title: $title, artist: $artist, album: $album }')

curl -s -X POST -H "Content-Type: application/json" -d "$PAYLOAD" $WEBHOOK_URL
