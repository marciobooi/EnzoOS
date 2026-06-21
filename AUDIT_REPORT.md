# Media Controls Audit — Resonance HiFi / EnzoOS

Scope: end-to-end review of every transport/control flow — play, pause, next,
previous, seek, volume, mute, shuffle, repeat, source switching, standby, radio,
library, queue, and the "get info / status" sync paths. Both surfaces (kiosk and
phone remote), the WebSocket/event layer, and the Node backend were traced.

Legend: **[HIGH]** broken behaviour users will hit · **[MED]** real bug in an
edge/secondary path · **[LOW]** minor/cosmetic · **[SEC]** security.

---

## 1. Confirmed bugs

### 1.1 [HIGH] Local / radio **seek is broken** — percent is applied as seconds
Files: `src/pages/Kiosk.jsx:1059`, `src/pages/RemoteControl.jsx:352`,
`src/api.js:386`, `server/player.js:134`.

The client computes a **percentage** and sends it as a string with a `%`:

```js
// Kiosk.jsx
await api.localSeek(`${percent}%`);          // e.g. "50%"
// RemoteControl.jsx
await api.localSeek(`${Math.round((ms / (trackDuration||1)) * 100)}%`);
```

The server strips the `%` with `parseInt` and feeds the bare number to `mpc seek`:

```js
const pos = parseInt(req.body.position, 10); // parseInt("50%") === 50
await execPromise(`mpc seek ${pos}`);        // mpc treats "50" as 50 SECONDS
```

`mpc seek <n>` interprets a bare integer as **seconds**, not percent (percent
requires the literal `%`). Result: dragging the local/radio seek bar to 50% of a
4-minute track jumps to 0:50, and any track longer than ~100 s can never be
seeked past 1:40. Seek is effectively non-functional for the local source.

Fix options: either pass the `%` through to mpc (`mpc seek ${escapedPercent}`,
validating it's `0-100%`), or have the client send absolute seconds/ms and keep
the server seeking by time. The server validation (`pos < 0`) also needs to match
whichever format is chosen.

### 1.2 [HIGH] Remote app can't actually start AirPlay / UPnP / Bluetooth
Files: `src/components/remote/SourceTab.jsx:11`, `src/pages/RemoteControl.jsx:337`
vs. `src/components/kiosk/SettingsMenuOverlay.jsx:88-106`.

On the **kiosk**, selecting a receiver source starts the backing daemon:

```js
const serviceStart = { airplay:'/api/player/airplay/start', upnp:'…', bluetooth:'…' };
handleToggleSource(src);
if (serviceStart[src]) fetch(serviceStart[src], { method:'POST' });
```

On the **remote**, `handleToggleSource` only broadcasts `SET_SOURCE` over WS:

```js
const handleToggleSource = src => { setSource(src); setPlaybackState(null);
  sendUpdate('SET_SOURCE', { spotify: src === 'spotify', source: src }); };
```

`SET_SOURCE` in `event-service.js` *stops* conflicting services but never *starts*
the chosen one. So picking AirPlay/UPnP/Bluetooth from the phone flips the UI label
and stops the previous source, but `shairport-sync` / `upmpdcli` / `bluealsa` never
start → no audio, no discoverability. The remote needs the same `serviceStart`
calls the kiosk has (or the start logic should move into the `SET_SOURCE` handler so
both surfaces behave identically).

### 1.3 [MED] Tidal / Qobuz sources are non-functional from the source picker
Files: `src/components/remote/SourceTab.jsx:23-24`, `server/player.js:1384-1482`.

Both source grids list Tidal and Qobuz. Selecting them calls `handleToggleSource`,
which sets a "Tidal/Qobuz connect active" placeholder state (`event-service.js:374`)
but there is no playback integration and no credential capture in that flow. The
working endpoints (`/tidal/connect`, `/qobuz/auth`) require username/password and
are never called by the UI. Net effect: choosing Tidal/Qobuz silences the current
source and shows a "connect active" card that never plays anything. Either wire up a
credentials dialog or hide these until implemented so users aren't dropped into a
dead source.

### 1.4 [MED] Spotify + CamillaDSP volume stages compound after a restart
Files: `server/event-service.js:42-45,223-231`, `server/player.js:94-106,934-944`,
`src/pages/Kiosk.jsx:1079-1117`.

There are two independent volume stages: CamillaDSP master (`SetVolume` in dB) and
Spotify's own device volume (raspotify). For local/radio the slider drives CamillaDSP;
for Spotify the slider drives Spotify's device volume and **leaves CamillaDSP where it
was**. Meanwhile `BROADCAST_STATE` copies whatever percentage is on screen (including
the Spotify device percent) into `cachedVolume` and persists it. On the next boot,
`updateCamillaConfigFromSettings()` restores CamillaDSP to `getCachedVolumeDb()` =
that stored percent in dB. If the last value came from Spotify, CamillaDSP now sits at,
say, −30 dB **and** Spotify attenuates on top of it → very quiet / double-attenuated
output until something resets the CamillaDSP master. The two stages are never
reconciled for the Spotify source. Recommend: keep CamillaDSP master at unity (0 dB)
whenever the source is Spotify, or route the Spotify slider through CamillaDSP too and
stop persisting Spotify's device percent as the system volume.

### 1.5 [LOW] Volume drag while idle blanks the "now playing" card
Files: `src/pages/Kiosk.jsx:1086-1095`, `src/pages/RemoteControl.jsx:356`,
`src/websocket.js:197-206`.

`handleVolumeChange` broadcasts `{ ...playbackState, volume, is_muted }`. When nothing
is playing, `playbackState` is `null`, so the payload is `{ volume, is_muted }` with no
`track_window`. Every other client's `PLAYBACK_STATE` handler does
`setPlaybackState(payload)`, dropping the track info and flickering the display to
"Nothing playing"/"SYSTEM IDLE" while the slider moves. Guard the broadcast so it only
sends a volume update when there is a current track, or merge volume into existing
state instead of replacing it.

### 1.6 [LOW] Unmuting from a slider-zeroed volume jumps to 50%
Files: `src/pages/Kiosk.jsx:1119-1123`, `src/pages/RemoteControl.jsx:360-362`.

Dragging volume to 0 sets `isMuted = true`. `handleToggleMute` then computes the
restore target as `volume || 50`; since `volume` is `0` (falsy), unmute jumps to 50%
rather than back to a remembered level. Track a "pre-mute" volume separately so
unmute restores the prior level (and so mute is distinct from "volume at zero").

---

## 2. Potential / latent issues

### 2.1 [MED] VU meter permanently disabled after 5 early failures
File: `server/websocket.js:104-184`. `arecord` retries max 5× (15 s apart) and the
counter only resets when audio data actually arrives or `stopAudioLevelMonitor()` is
called. If the ALSA loopback isn't ready during the first ~75 s after boot, the level
monitor gives up until the next process restart, leaving the visualizer dead. Consider
resetting the retry budget on standby-wake, or backing off without a hard cap.

### 2.2 [LOW] Progress timer churns every poll cycle
Files: `src/pages/Kiosk.jsx:775-791`, `src/pages/RemoteControl.jsx:258-268`. The
1-second position interval depends on `playbackState`, which is replaced by a new
object on every 3 s sync. The interval is torn down and recreated each cycle, and
`trackPosition` is overwritten by the server value, producing small visual stutter in
the seek bar. Depend on primitive values (`isPlaying`, `trackDuration`) instead of the
whole object.

### 2.3 [LOW] Remote radio play/pause has no station-picker fallback
File: `src/pages/RemoteControl.jsx:340-347`. The kiosk's `handlePlayPause`
(`Kiosk.jsx:888-904`) special-cases radio: if there's no station queued it opens the
search overlay. The remote just calls `localPlay()` on a possibly-empty MPD queue
(no-op / error toast). Minor, but the two surfaces behave differently.

### 2.4 [LOW] `detectDac` can emit `maxRate: -Infinity`
File: `server/player.js:288-290`. If `supportedRates` ends up empty,
`Math.max(...[])` is `-Infinity`, which serializes to `null` in `/signal-path`. Guard
with a default before `Math.max`.

### 2.5 [LOW] `/api/status` hydration ignores the volume-change lock
File: `src/websocket.js:45,166-172`. `applyFullStatus` calls `setVolume` directly on
reconnect, bypassing the `lastVolumeChangeTime` 2.5 s guard used elsewhere. A reconnect
that lands right after a local slider move could snap the slider back. Low likelihood
(reconnects are rare) but inconsistent with the rest of the volume handling.

### 2.6 [LOW] Wrong JSDoc on `localGetStatus`
File: `src/api.js:381` — the comment says "Seek local media." above the status getter.
Cosmetic.

---

## 3. Security observations

### 3.1 [SEC] WebSocket and player REST endpoints are unauthenticated
Files: `server/websocket.js:31-58`, `server/index.js:47`. Any device on the LAN can
open `/ws` and immediately receives `SET_TOKEN` containing the **full Spotify access
token** (`websocket.js:55-58`), and can send control events
(`SET_STANDBY`, `SET_SOURCE`, `SET_EQ_SETTINGS`, volume, etc.). It can also hit the
unprotected `/api/player/*` and `/api/system/*` routes (including `reboot` /
`shutdown`). The `remoteAccessEnabled` flag only hides the remote **UI**
(`RemoteControl.jsx:445`); it does not gate the socket or the API. Consider a shared
secret / session token on the WS upgrade and REST routes, and stop broadcasting the
Spotify token to every client.

### 3.2 [SEC] Remote login is a hardcoded client-side credential
File: `src/pages/RemoteControl.jsx:378` — `usernameInput === 'enzo' &&
passwordInput === 'enzoOS'`. The check runs in the browser and the credentials ship in
the bundle, so it's decorative. Combined with 3.1, the remote "auth" provides no real
protection.

### 3.3 [LOW] Streaming-service credentials stored in plaintext
File: `server/player.js:1393-1394,1441-1444`. Tidal/Qobuz username+password are written
to SQLite in cleartext (acknowledged in a code comment). Acceptable for a single-user
appliance, but worth noting if remote access is ever exposed beyond the LAN.

---

## 4. Flows that check out

These paths were traced and look correct:

- **Spotify play/pause/next/previous/shuffle/repeat** on both kiosk and remote —
  correct device targeting (`resonanceDeviceId` / active device), optimistic UI with
  rollback on error, and `requestWSStateSync` / `syncCurrentState` re-sync.
- **Standby** entry/exit — stops MPD + passthrough services, pauses Spotify, the 15 s
  auto-wake suppression window prevents the Spotify-poll race
  (`event-service.js:233-239`), and the REST play routes explicitly wake before playing.
- **Source switch teardown** — the kiosk fire-and-forget pause of the *current* source
  (`Kiosk.jsx:515-540`) plus the server stopping previous/conflicting services prevents
  audio bleed; sender is correctly excluded from the `SET_SOURCE` echo.
- **Radio play + auto-resume** — `play-radio` persists URL/name/favicon and uses
  `skipAutoResume` so the stream isn't double-started; last station is restored on boot.
- **State sync / "get info"** — single-fetch `/api/status` hydration on connect, the
  serial event queue in `event-service.js` (no interleaved mutations), and ICY/MPD
  polling for radio/local metadata are all coherent.
- **Token lifecycle** — refresh mutex prevents concurrent refreshes; tokens persist and
  reload across restarts.
- **Volume for local/radio** — slider → CamillaDSP `SetVolume` (instant, post-buffer),
  with the dB mapping consistent between `toDb` and `getCachedVolumeDb`.

---

## 5. Suggested fix priority

1. Local/radio seek (1.1) — core control, fully broken.
2. Remote receiver-source start (1.2) — feature silently dead from the phone.
3. WS/REST auth + token exposure (3.1/3.2) — security.
4. Spotify/CamillaDSP volume reconciliation (1.4) — audible after reboots.
5. Tidal/Qobuz dead sources (1.3) — hide or implement.
6. Remaining LOW items as cleanup.
