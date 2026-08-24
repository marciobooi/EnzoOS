// Single source of truth for the librespot Connect device name on the
// client side (server side: server/spotify-daemon.js's own copy of this
// same constant — the two can't share a module across the client/server
// bundle boundary, so this is the client's half of one deliberately-tiny
// duplication instead of the six-way scattered-literal duplication that
// made the AUDIT-2026-08-01 rename below error-prone to apply.
//
// AUDIT-2026-08-01: Spotify's own backend permanently stuck its "currently
// playing" cache for the device name "Resonance Connect" — frozen track/
// position/paused forever regardless of what actually played, confirmed via
// raw API calls bypassing this app entirely, and unrecoverable via token
// refresh, restarting raspotify, or wiping its cached credentials.
// librespot derives its Spotify device id deterministically from this name
// (no --device-id override exists in this librespot build), so a fresh,
// never-before-used name gets a genuinely new identity with no stuck cache
// — proven live. If this exact symptom recurs (metadata frozen while audio
// keeps changing/advancing normally), change this constant AND
// server/spotify-daemon.js's LIBRESPOT_DEVICE_NAME to something never used
// before — do not reuse a name that has ever shown this symptom.
//
// AUDIT-2026-08-24: recurred on "Resonance HiFi" too — reported live as
// stale cover/track info that "doesn't correspond to reality", confirmed by
// querying Spotify's own /v1/me/player directly (bypassing this app's cache
// entirely): Spotify's backend itself returned the same frozen track AND a
// corrupted negative progress_ms, even after the user had already logged
// out/back in (already known not to fix this — see above). Burned names so
// far: "Resonance Connect", "Resonance HiFi". Do not reuse either.
export const LIBRESPOT_DEVICE_NAME = 'EnzoOS HiFi';
