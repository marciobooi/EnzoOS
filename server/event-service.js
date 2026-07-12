import os from 'os';
import { getSetting, setSetting, dbReady } from './db.js';
import { fireWebhook, fireOnPlaybackChange } from './webhooks.js';
import { scrobbleOnPlaybackChange } from './scrobbler.js';

// ─── Minimal payload shape validation ─────────────────────────────────────────
// These events cache + persist + rebroadcast whatever a client sends verbatim.
// Any authenticated LAN client (kiosk, phone remotes) can reach them, so a
// buggy client — not just a malicious one — could otherwise corrupt shared
// state for the whole household. This is intentionally shallow (type/range
// checks, not a full schema) so legitimate payloads from older/newer clients
// still pass; it only rejects garbage that can't possibly be valid.
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

function isValidBroadcastState(payload) {
  // BROADCAST_STATE may legitimately be null (source cleared its state).
  return payload === null || isPlainObject(payload);
}

function isValidEqSettings(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.preset !== undefined && (typeof payload.preset !== 'string' || payload.preset.length > 100)) return false;
  if (payload.bands !== undefined) {
    if (!Array.isArray(payload.bands) || payload.bands.length > 10) return false;
    if (!payload.bands.every((b) => isFiniteNum(Number(b)))) return false;
  }
  for (const key of ['preAmp', 'noiseFloor', 'saturation']) {
    if (payload[key] !== undefined && !isFiniteNum(Number(payload[key]))) return false;
  }
  return true;
}

function isValidThemeSettings(payload) {
  if (!isPlainObject(payload)) return false;
  if (payload.brightness !== undefined) {
    const b = Number(payload.brightness);
    if (!isFiniteNum(b) || b < 0 || b > 100) return false;
  }
  return true;
}

// ─── Cached state (single source of truth) ───────────────────────────────────
let cachedPlaybackState = null;
let cachedSourceState   = { spotify: true, source: 'spotify' };
let cachedStandbyState  = false;
let cachedVolume        = 50;
let cachedMuted         = false;
let cachedPureDirect    = false;
let broadcastFn         = null;
// Timestamp of last standby entry — BROADCAST_STATE auto-wake is suppressed
// for 15 s after entering standby to prevent Spotify polling from waking it
let standbyEnteredAt    = 0;

// Passthrough source → systemd unit that provides it. Shared by SET_SOURCE
// (starts the daemon on selection) and applyStandby (restarts it on wake —
// entering standby unconditionally stops all three, so whichever one was
// actually serving the active source needs to come back up on its own).
// Bluetooth has no daemon of its own — PipeWire/WirePlumber handle A2DP
// natively — so it's handled separately (adapter power/discoverable/pairable)
// wherever this map is consulted, rather than listed here.
const SOURCE_DAEMON = { airplay: 'shairport-sync', upnp: 'upmpdcli' };
// Debounce timer for volume persistence — avoid a DB write on every slider tick
let volumeSaveTimer     = null;

// ─── Serial queue: all state-mutating events run one at a time ───────────────
let stateQueue = Promise.resolve();

function enqueue(fn) {
  stateQueue = stateQueue
    .then(fn)
    .catch(err => console.error('[EventService] Queue error:', err));
  return stateQueue;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Called by websocket.js after the WS server is ready. */
export function setBroadcast(fn) {
  broadcastFn = fn;
}

export function getStandbyState() {
  return cachedStandbyState;
}

/**
 * Returns the current cached volume as a dB value for CamillaDSP SetVolume.
 * Used by player.js to restore volume after CamillaDSP config apply/restart.
 */
export function getCachedVolumeDb() {
  if (cachedMuted || cachedVolume <= 0) return -100;
  return -60 * (1 - cachedVolume / 100);
}

/**
 * Update + persist the master volume independent of any playback broadcast.
 * Called by the REST /api/player/volume route so the saved level is the single
 * source of truth for ALL sources, persisted even when nothing is playing (idle)
 * and restored on reboot / wake. Debounced to avoid a DB write on every tick.
 */
export function setVolumeState(vol, muted) {
  const v = Math.max(0, Math.min(100, Number(vol)));
  if (!Number.isFinite(v)) return;
  cachedVolume = v;
  if (muted !== undefined) cachedMuted = !!muted;
  clearTimeout(volumeSaveTimer);
  volumeSaveTimer = setTimeout(() => {
    setSetting('volume', String(cachedVolume));
    setSetting('muted', cachedMuted ? 'true' : 'false');
  }, 800);
}

/** Returns a snapshot of all cached state for new WS client handshake. */
export function getState() {
  return {
    playbackState: cachedPlaybackState,
    sourceState: cachedSourceState,
    standbyState: cachedStandbyState,
  };
}

/**
 * Builds the full system status object from cached state + DB.
 * Used by GET /api/status — the authoritative single-fetch snapshot
 * that clients call on connect/reconnect to hydrate all state at once.
 */
export async function getFullStatus() {
  const [eqRaw, dspRaw, themeRaw, remoteRaw] = await Promise.all([
    getSetting('eq_settings').catch(() => null),
    getSetting('dsp_calibration').catch(() => null),
    getSetting('theme_settings').catch(() => null),
    getSetting('remote_access_enabled').catch(() => 'true'),
  ]);

  let eq = { preset: 'Clinical Reference', bands: [0,0,0,0,0], saturation: 0, noiseFloor: 0, preAmp: 0 };
  try { if (eqRaw) eq = JSON.parse(eqRaw); } catch {}

  let dsp = null;
  try { if (dspRaw) dsp = JSON.parse(dspRaw); } catch {}

  let theme = { themeColor: 'amber', activeTheme: 'dot-matrix', brightness: 100, visualizerMode: 'vu' };
  try { if (themeRaw) theme = { ...theme, ...JSON.parse(themeRaw) }; } catch {}

  const t = cachedPlaybackState?.track_window?.current_track ?? null;
  const track = t ? {
    name:     t.name || '',
    artist:   t.artists?.map(a => a.name).join(', ') || '',
    album:    t.album?.name || '',
    albumArt: t.album?.images?.[0]?.url || '',
    uri:      t.uri  || '',
    radioUrl: t.url  || null,
  } : null;

  return {
    source:              cachedSourceState.source ?? 'spotify',
    standby:             cachedStandbyState,
    pureDirect:          cachedPureDirect,
    remoteAccessEnabled: remoteRaw !== 'false',
    playback: {
      paused:   cachedPlaybackState?.paused   ?? true,
      position: cachedPlaybackState?.position ?? 0,
      duration: cachedPlaybackState?.duration ?? 0,
      shuffle:  cachedPlaybackState?.shuffle_state ?? false,
      repeat:   cachedPlaybackState?.repeat_state  ?? 'off',
      volume:   cachedVolume,
      muted:    cachedMuted,
      track,
    },
    eq: {
      preset:     eq.preset,
      bands:      eq.bands,
      saturation: eq.saturation,
      noiseFloor: eq.noiseFloor,
      preAmp:     eq.preAmp,
      dspActive:  !!(dsp && (dsp[0] === 'dsp' || dsp['0'] === 'dsp')),
    },
    theme: {
      color:          theme.themeColor,
      activeTheme:    theme.activeTheme,
      brightness:     theme.brightness,
      visualizerMode: theme.visualizerMode || 'vu',
    },
  };
}

// Passthrough events — no state mutation, skip the queue entirely
// SET_VOLUME: server→clients broadcast when Spotify app changes volume via onevent hook.
const PASSTHROUGH = new Set(['SET_TOKEN', 'CLEAR_TOKEN', 'REQUEST_SYNC', 'UPDATE_PROGRESS', 'AUDIO_LEVELS', 'SET_VOLUME', 'QR_TOKEN_REDEEMED']);

/**
 * Central dispatch. All REST routes and WS handlers call this.
 * @param {string} type
 * @param {*} payload
 * @param {WebSocket|null} excludeWs  - sender socket to exclude from broadcast
 */
export function emit(type, payload, excludeWs = null) {
  if (PASSTHROUGH.has(type)) {
    broadcast({ type, payload }, excludeWs);
    return Promise.resolve();
  }
  return enqueue(() => handleEvent(type, payload, excludeWs));
}

// ─── Internal broadcast helper ───────────────────────────────────────────────
function broadcast(data, excludeWs = null) {
  if (broadcastFn) broadcastFn(data, excludeWs);
}

// ─── Hardware helpers ─────────────────────────────────────────────────────────
async function setHardwareBrightness(brightness) {
  if (brightness === undefined || brightness === null) return;
  const sanitized = Number(brightness);
  if (!Number.isFinite(sanitized)) {
    console.warn('[Brightness] Ignoring invalid value:', brightness);
    return;
  }
  try {
    const { exec } = await import('child_process');
    const pct = Math.max(0, Math.min(100, Math.round(sanitized)));
    const script = `/usr/local/bin/kiosk-brightness.sh ${pct}`;
    // os.homedir() resolves to whichever user resonance-api.service actually
    // runs as (systemd sets User=$TARGET_USER at install time) — hardcoding
    // /home/pi here silently broke brightness control on any non-"pi" install.
    const x11Env = { ...process.env, DISPLAY: ':0', XAUTHORITY: process.env.XAUTHORITY || `${os.homedir()}/.Xauthority` };
    exec(script, { env: x11Env }, (err, stdout) => {
      if (!err) { console.log(`[Brightness] Set to ${pct}%:`, stdout.trim()); return; }
      exec(`sudo ${script}`, { env: x11Env }, (sudoErr, sudoStdout) => {
        if (sudoErr) console.error('[Brightness] Failed:', sudoErr.message);
        else console.log(`[Brightness] Set to ${pct}% via sudo:`, sudoStdout.trim());
      });
    });
  } catch (err) {
    console.error('[Brightness] Error executing brightness script:', err);
  }
}

// ─── Standby side-effects (runs inside queue) ────────────────────────────────
async function applyStandby(enabled) {
  if (enabled) standbyEnteredAt = Date.now();
  cachedStandbyState = enabled;
  await setSetting('standby', enabled ? 'true' : 'false');
  broadcast({ type: 'SET_STANDBY', payload: { enabled } });

  // Control audio level monitor (imported lazily to avoid circular load-time dependency)
  const { startAudioLevelMonitor, stopAudioLevelMonitor } = await import('./websocket.js');
  if (enabled) {
    stopAudioLevelMonitor();
  } else {
    startAudioLevelMonitor();
  }

  try {
    const { exec } = await import('child_process');
    if (enabled) {
      // Stop MPD (covers local files and radio streams)
      exec('mpc stop');
      exec('sudo /usr/local/bin/kiosk-power.sh standby');

      // Stop streaming passthrough services
      exec('sudo systemctl stop shairport-sync 2>/dev/null || true');
      exec('sudo systemctl stop upmpdcli 2>/dev/null || true');
      // No bluealsa unit (PipeWire/WirePlumber handle A2DP natively) — just
      // close the Bluetooth pairing window so nothing connects mid-standby.
      exec('bluetoothctl discoverable off 2>/dev/null || true');
      exec('bluetoothctl pairable off 2>/dev/null || true');

      // Pause Spotify if a valid token is available
      try {
        const { getValidAccessToken } = await import('./spotify-auth.js');
        const token = await getValidAccessToken();
        if (token) {
          fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(err => console.warn('[Standby] Spotify pause failed (non-fatal):', err.message));
        }
      } catch (err) {
        console.warn('[Standby] Could not pause Spotify:', err.message);
      }
    } else {
      exec('sudo /usr/local/bin/kiosk-power.sh wake');
      // Re-assert the persisted master volume on wake. CamillaDSP keeps running
      // during standby so this is usually a no-op, but it guarantees the saved
      // level is restored even if CamillaDSP was restarted while asleep.
      try {
        const { setCamillaVolume } = await import('./player.js');
        await setCamillaVolume(getCachedVolumeDb());
      } catch (err) {
        console.warn('[Standby] Volume re-apply on wake failed (non-fatal):', err.message);
      }
      // Restart whichever passthrough daemon was serving the active source —
      // entering standby stopped shairport-sync/upmpdcli unconditionally, so
      // an AirPlay/UPnP session would otherwise stay dead until the user
      // manually reselects the source from the picker.
      const daemon = SOURCE_DAEMON[cachedSourceState.source];
      if (daemon) {
        exec(`sudo systemctl start ${daemon}`, (err) => {
          if (err) console.error(`[Standby] Failed to restart ${daemon} on wake:`, err.message);
          else console.log(`[Standby] Restarted ${daemon} on wake (active source: ${cachedSourceState.source})`);
        });
      } else if (cachedSourceState.source === 'bluetooth') {
        exec('bluetoothctl discoverable on; bluetoothctl pairable on', (err) => {
          if (err) console.error('[Standby] Failed to reopen Bluetooth pairing window on wake:', err.message);
          else console.log('[Standby] Reopened Bluetooth pairing window on wake');
        });
      }
    }
  } catch (err) {
    console.error('[Standby] Power/mpc action failed:', err);
  }
}

// ─── Event handler (runs inside serial queue) ─────────────────────────────────
async function handleEvent(type, payload, excludeWs) {
  switch (type) {
    case 'BROADCAST_STATE': {
      if (!isValidBroadcastState(payload)) {
        console.warn('[EventService] Rejected malformed BROADCAST_STATE payload:', payload);
        break;
      }
      cachedPlaybackState = payload;

      // Auto-wake only if standby has been active for > 15 s to avoid the Spotify
      // polling race (kiosk sends BROADCAST_STATE right after entering standby)
      if (cachedStandbyState && payload && !payload.paused) {
        if (Date.now() - standbyEnteredAt > 15000) {
          await applyStandby(false);
        }
      }
      // Relay with server-authoritative volume so stale polling from any client
      // never overwrites the volume the user actually set via /api/player/volume.
      broadcast({ type: 'PLAYBACK_STATE', payload: { ...payload, volume: cachedVolume, is_muted: cachedMuted } }, excludeWs);
      fireOnPlaybackChange(payload);
      scrobbleOnPlaybackChange(payload);
      break;
    }

    case 'PLAYBACK_STATE': {
      cachedPlaybackState = payload;
      broadcast({ type: 'PLAYBACK_STATE', payload }, excludeWs);
      fireOnPlaybackChange(payload);
      scrobbleOnPlaybackChange(payload);
      break;
    }

    case 'SET_SOURCE': {
      const previousSource = cachedSourceState.source;
      const newSource = payload.source || (payload.spotify ? 'spotify' : 'local');
      fireWebhook('source', { source: newSource, previous: previousSource });
      cachedSourceState = payload;
      await setSetting('active_source', newSource);

      // Selecting a source implies intent to play, so wake from standby first.
      // The REST /start endpoints already did this; doing it here means the phone
      // remote (which only emits SET_SOURCE) also wakes the kiosk on source change.
      if (cachedStandbyState) {
        await applyStandby(false);
      }

      // ── Stop services belonging to the PREVIOUS source ───────────────────
      try {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execP = promisify(exec);
        // Stop MPD when leaving any MPD-driven source. Tidal/Qobuz now stream
        // their resolved URL through MPD too, so they must stop it on the way out
        // to avoid audio bleeding into the next source.
        // AWAITED (not fire-and-forget): callers that start their own MPD playback
        // right after SET_SOURCE (radio, Tidal, Qobuz) rely on the stop having
        // finished first, otherwise a late `mpc stop` would kill the new track.
        if (['local', 'radio', 'spotify', 'airplay', 'upnp', 'tidal', 'qobuz'].includes(previousSource)) {
          await execP('mpc stop').catch(() => {});
        }
        // Radio enables repeat so HLS streams reconnect on segment-list end.
        // Turn it off whenever leaving radio so local playback doesn't loop.
        if (previousSource === 'radio') {
          execP('mpc repeat off').catch(() => {});
        }
        // Stop shairport-sync when leaving AirPlay
        if (previousSource === 'airplay') {
          exec('sudo systemctl stop shairport-sync');
          console.log('[SET_SOURCE] Stopped shairport-sync (was AirPlay)');
        }
        // Stop upmpdcli when leaving UPnP
        if (previousSource === 'upnp') {
          exec('sudo systemctl stop upmpdcli');
          console.log('[SET_SOURCE] Stopped upmpdcli (was UPnP)');
        }
        // Leaving Bluetooth — there's no bluealsa unit to stop (PipeWire/
        // WirePlumber handle A2DP natively); just close the pairing window.
        if (previousSource === 'bluetooth') {
          exec('bluetoothctl discoverable off');
          exec('bluetoothctl pairable off');
          console.log('[SET_SOURCE] Closed Bluetooth pairing window (was Bluetooth)');
        }
      } catch (err) {
        console.error('[SET_SOURCE] Failed to stop previous source services:', err);
      }

      // ── Stop services that conflict with the NEW source ───────────────────
      // Whenever we switch TO a passthrough source (airplay/upnp/bluetooth/tidal/qobuz)
      // make sure MPD is not running so it doesn't compete for the loopback device.
      const passthroughSources = ['airplay', 'upnp', 'bluetooth', 'tidal', 'qobuz'];

      if (newSource === 'spotify') {
        // Clear cached state — the Spotify Web Player sends its own BROADCAST_STATE
        cachedPlaybackState = null;

      } else {
        // Leaving Spotify — pause it
        if (previousSource === 'spotify') {
          try {
            const { getValidAccessToken } = await import('./spotify-auth.js');
            const token = await getValidAccessToken();
            if (token) {
              fetch('https://api.spotify.com/v1/me/player/pause', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` },
              }).catch(err => console.warn('[SET_SOURCE] Spotify pause failed (non-fatal):', err.message));
            }
          } catch (err) {
            console.error('[SET_SOURCE] Failed to pause Spotify:', err);
          }
        }

        if (newSource === 'radio') {
          const url = await getSetting('last_radio_url');
          const name = await getSetting('last_radio_name');
          const favicon = await getSetting('last_radio_favicon');

          if (url) {
            // Always build the cached state from DB so the broadcast is correct regardless
            // of whether this came from the REST play-radio route or a bare source switch.
            cachedPlaybackState = {
              paused: false,
              position: 0,
              duration: 0,
              track_window: {
                current_track: {
                  name: name || 'WEB RADIO',
                  artists: [{ name: 'Live Stream' }],
                  album: { name: 'Web Radio Broadcast', images: favicon ? [{ url: favicon }] : [] },
                  url,
                },
              },
            };

            // Only start MPC when the caller hasn't already done it (skipAutoResume).
            // The play-radio REST route sets skipAutoResume=true after calling mpc itself
            // to prevent a double-start of the stream.
            if (!payload.skipAutoResume && previousSource !== 'radio') {
              try {
                const { exec, execFile } = await import('child_process');
                const { promisify } = await import('util');
                const execP = promisify(exec);
                const execFileP = promisify(execFile);
                await execP('mpc repeat on');
                await execP('mpc clear');
                await execFileP('mpc', ['add', url]);
                await execP('mpc play');
                console.log(`[SET_SOURCE] Auto-resumed radio: ${name} (${url})`);
              } catch (err) {
                console.error('[SET_SOURCE] Failed to auto-resume radio:', err);
              }
            }
          } else {
            cachedPlaybackState = null;
          }

        } else if (newSource === 'local') {
          // If MPD's current track is a URL (radio stream from a previous session),
          // clear the queue so it doesn't bleed into local file mode.
          // Otherwise keep the queue and position and resume playback.
          try {
            const { exec } = await import('child_process');
            const { promisify } = await import('util');
            const execP = promisify(exec);
            const { stdout } = await execP('mpc -f "%file%" current').catch(() => ({ stdout: '' }));
            const currentFile = stdout.trim();
            if (currentFile.startsWith('http://') || currentFile.startsWith('https://')) {
              await execP('mpc stop');
              await execP('mpc clear');
              console.log('[SET_SOURCE] Cleared MPD radio queue on switch to local.');
            } else {
              exec('mpc play');
            }
          } catch (err) {
            console.error('[SET_SOURCE] Failed to resume MPD:', err);
          }
          // Clear cached state — MPD client sends BROADCAST_STATE once playing
          cachedPlaybackState = null;

        } else if (passthroughSources.includes(newSource)) {
          // Passthrough sources (AirPlay, UPnP, Bluetooth, Tidal, Qobuz):
          // set a waiting-for-connection playback state so the UI shows something.
          const sourceLabels = {
            airplay:   { name: 'AirPlay', status: 'Waiting for AirPlay connection…' },
            upnp:      { name: 'UPnP / DLNA', status: 'Waiting for UPnP renderer…' },
            bluetooth: { name: 'Bluetooth A2DP', status: 'Waiting for Bluetooth connection…' },
            tidal:     { name: 'Tidal', status: 'Tidal connect active' },
            qobuz:     { name: 'Qobuz', status: 'Qobuz connect active' },
          };
          const info = sourceLabels[newSource] || { name: newSource, status: 'Waiting…' };
          cachedPlaybackState = {
            paused: true,
            position: 0,
            duration: 0,
            track_window: {
              current_track: {
                name: info.name,
                artists: [{ name: info.status }],
                album: { name: 'Resonance HiFi', images: [] },
              },
            },
          };

          // Start the daemon that provides this receiver source. SET_SOURCE is the
          // single entry point used by BOTH the kiosk and the phone remote, so
          // starting the daemon here is what makes the remote able to bring up
          // AirPlay/UPnP/Bluetooth — previously only the kiosk's REST /start calls
          // did this, leaving the remote with a silenced source and no audio.
          const daemon = SOURCE_DAEMON[newSource];
          if (daemon) {
            try {
              const { exec } = await import('child_process');
              exec(`sudo systemctl start ${daemon}`, (err) => {
                if (err) console.error(`[SET_SOURCE] Failed to start ${daemon} for ${newSource}:`, err.message);
                else console.log(`[SET_SOURCE] Started ${daemon} for ${newSource}`);
              });
            } catch (err) {
              console.error(`[SET_SOURCE] Could not start daemon for ${newSource}:`, err);
            }
          } else if (newSource === 'bluetooth') {
            // No daemon — power the adapter on and open the pairing window
            // (PipeWire/WirePlumber take over automatically once a device connects).
            try {
              const { exec } = await import('child_process');
              exec('bluetoothctl power on; bluetoothctl discoverable on; bluetoothctl pairable on', (err) => {
                if (err) console.error('[SET_SOURCE] Failed to open Bluetooth pairing window:', err.message);
                else console.log('[SET_SOURCE] Bluetooth adapter powered on and discoverable');
              });
            } catch (err) {
              console.error('[SET_SOURCE] Could not start Bluetooth:', err);
            }
          }
        }
      }

      broadcast({ type: 'SET_SOURCE', payload }, excludeWs);
      // Push current playback state so all clients reflect the new source immediately.
      // null payload is safe: client guards against it in the PLAYBACK_STATE handler.
      broadcast({ type: 'PLAYBACK_STATE', payload: cachedPlaybackState });
      break;
    }

    case 'SET_STANDBY': {
      await applyStandby(payload.enabled);
      fireWebhook('standby', { enabled: !!payload.enabled });
      break;
    }

    case 'SET_EQ_SETTINGS': {
      if (!isValidEqSettings(payload)) {
        console.warn('[EventService] Rejected malformed SET_EQ_SETTINGS payload:', payload);
        break;
      }
      await setSetting('eq_settings', JSON.stringify(payload));
      broadcast({ type: 'EQ_SETTINGS', payload }, excludeWs);
      // Fire CamillaDSP hot-reload outside the serial queue so other events
      // are not blocked. skipAlsa=true avoids the sudo tee /etc/asound.conf
      // overhead — ALSA config is irrelevant to EQ band/level changes.
      import('./player.js').then(({ updateCamillaConfigFromSettings }) =>
        updateCamillaConfigFromSettings({ skipAlsa: true })
      ).catch(err => console.error('[EventService] CamillaDSP EQ update failed:', err));
      break;
    }

    case 'SET_THEME_SETTINGS': {
      if (!isValidThemeSettings(payload)) {
        console.warn('[EventService] Rejected malformed SET_THEME_SETTINGS payload:', payload);
        break;
      }
      console.log('[EventService] Theme settings update:', payload);
      await setSetting('theme_settings', JSON.stringify(payload));
      if (payload && payload.brightness !== undefined) {
        await setHardwareBrightness(payload.brightness);
      }
      broadcast({ type: 'THEME_SETTINGS', payload }, excludeWs);
      break;
    }

    case 'SET_REMOTE_ACCESS': {
      console.log('[EventService] Remote access update:', payload);
      await setSetting('remote_access_enabled', payload.enabled ? 'true' : 'false');
      broadcast({ type: 'SET_REMOTE_ACCESS', payload }, excludeWs);
      break;
    }

    case 'SET_PURE_DIRECT': {
      cachedPureDirect = !!payload.enabled;
      await setSetting('pure_direct', cachedPureDirect ? 'true' : 'false');
      broadcast({ type: 'SET_PURE_DIRECT', payload: { enabled: cachedPureDirect } }, excludeWs);
      // Hot-reload CamillaDSP with or without EQ pipeline, then re-evaluate DSD
      // routing — leaving Pure Direct must pull a DSD track back onto the PCM
      // chain immediately (the rate watcher only fires on track changes).
      import('./player.js').then(({ updateCamillaConfigFromSettings, applyDsdRouting }) => {
        updateCamillaConfigFromSettings({ skipAlsa: true, pureDirect: cachedPureDirect });
        applyDsdRouting?.().catch(() => {});
      }).catch(err => console.error('[EventService] Pure Direct config update failed:', err));
      break;
    }

    case 'DSP_CALIBRATION': {
      broadcast({ type: 'DSP_CALIBRATION', payload }, excludeWs);
      break;
    }

    default:
      console.warn('[EventService] Unknown event type:', type);
  }
}

// ─── Startup state loader (replaces loadCachedStateFromDB in websocket.js) ───
export const loadStateFromDB = async () => {
  await dbReady;
  try {
    // Standby
    let standbyVal = await getSetting('standby');
    if (!standbyVal) {
      standbyVal = 'false';
      await setSetting('standby', 'false');
      console.log('[EventService] Initialized default standby in DB.');
    }
    cachedStandbyState = standbyVal === 'true';
    console.log(`[EventService] Loaded standby: ${cachedStandbyState}`);

    // Theme / brightness
    let themeSettingsVal = await getSetting('theme_settings');
    if (!themeSettingsVal) {
      const defaultTheme = { themeColor: 'amber', activeTheme: 'dot-matrix', brightness: 100 };
      await setSetting('theme_settings', JSON.stringify(defaultTheme));
      themeSettingsVal = JSON.stringify(defaultTheme);
      console.log('[EventService] Initialized default theme_settings in DB.');
    }
    try {
      const themeSettings = JSON.parse(themeSettingsVal);
      if (themeSettings && themeSettings.brightness !== undefined) {
        console.log(`[EventService] Restoring brightness: ${themeSettings.brightness}`);
        await setHardwareBrightness(themeSettings.brightness);
      }
    } catch (e) {
      console.warn('[EventService] Failed parsing theme_settings from DB:', e);
    }

    // EQ settings — validate schema and migrate if needed
    let eqSettingsVal = await getSetting('eq_settings');
    let needsMigrate = false;
    if (eqSettingsVal) {
      try {
        const parsed = JSON.parse(eqSettingsVal);
        if (!parsed || !Array.isArray(parsed.bands) || typeof parsed.bands[0] === 'object') {
          needsMigrate = true;
        }
      } catch (e) {
        needsMigrate = true;
      }
    } else {
      needsMigrate = true;
    }
    if (needsMigrate) {
      const defaultEq = { preset: 'Clinical Reference', bands: [0, 0, 0, 0, 0], saturation: 0, noiseFloor: 0, preAmp: 0.0 };
      await setSetting('eq_settings', JSON.stringify(defaultEq));
      console.log('[EventService] Initialized/migrated default eq_settings in DB.');
    }

    // Active source
    let activeSource = await getSetting('active_source');
    if (!activeSource) {
      activeSource = 'spotify';
      await setSetting('active_source', 'spotify');
      console.log('[EventService] Initialized default active_source in DB.');
    }
    cachedSourceState = { spotify: activeSource === 'spotify', source: activeSource };
    console.log(`[EventService] Loaded active source: ${activeSource}`);

    // Volume / muted
    const volumeVal = await getSetting('volume');
    const mutedVal  = await getSetting('muted');
    cachedVolume = volumeVal ? Math.max(0, Math.min(100, Number(volumeVal))) : 50;
    cachedMuted  = mutedVal === 'true';
    if (!volumeVal) await setSetting('volume', '50');
    console.log(`[EventService] Loaded volume: ${cachedVolume}, muted: ${cachedMuted}`);

    // Remote access default
    const remoteAccessVal = await getSetting('remote_access_enabled');
    if (!remoteAccessVal) {
      await setSetting('remote_access_enabled', 'true');
      console.log('[EventService] Initialized default remote_access_enabled in DB.');
    }

    // Restore radio playback state if that was the last active source
    if (activeSource === 'radio') {
      const url = await getSetting('last_radio_url');
      const name = await getSetting('last_radio_name');
      const favicon = await getSetting('last_radio_favicon');
      if (url) {
        let isPlaying = false;
        try {
          const { exec } = await import('child_process');
          const mpcStatus = await new Promise((resolve) => {
            exec('mpc status', (err, stdout) => resolve(stdout || ''));
          });
          isPlaying = mpcStatus.includes('[playing]');
        } catch (e) {}
        cachedPlaybackState = {
          paused: !isPlaying,
          position: 0,
          duration: 0,
          track_window: {
            current_track: {
              name: name || 'WEB RADIO',
              artists: [{ name: 'Live Stream' }],
              album: { name: 'Web Radio Broadcast', images: favicon ? [{ url: favicon }] : [] },
              url,
            },
          },
        };
        console.log(`[EventService] Restored last radio: ${name} (${url}), playing=${isPlaying}`);
      }
    }

    // Restore pure direct state
    const pureDirectVal = await getSetting('pure_direct');
    cachedPureDirect = pureDirectVal === 'true';
    console.log(`[EventService] Loaded pure_direct: ${cachedPureDirect}`);

    // Ensure raspotify has the correct ALSA device (camilla_input) and device
    // name ("Resonance Connect") — but only write + restart when the managed
    // conf actually changed. Restarting raspotify drops librespot's Spotify
    // Connect session, and Spotify never re-activates a device by itself, so an
    // unconditional restart here knocked the kiosk to SYSTEM IDLE on every
    // resonance-api restart. The conf file is root-only readable, so the
    // last-applied copy is tracked in the settings DB instead. (A manual edit
    // of /etc/raspotify/conf is invisible to this check — POST /api/spotify/device
    // still force-rewrites if audio routing ever needs repairing.)
    try {
      const { buildRaspotifyConf, writeRaspotifyConf, restartRaspotify } = await import('./spotify-daemon.js');
      const desiredConf = buildRaspotifyConf();
      const appliedConf = await getSetting('raspotify_applied_conf').catch(() => null);
      if (appliedConf === desiredConf) {
        console.log('[EventService] Raspotify conf unchanged — restart skipped (Spotify Connect session preserved).');
      } else {
        await writeRaspotifyConf();
        await restartRaspotify();
        await setSetting('raspotify_applied_conf', desiredConf);
        console.log('[EventService] Raspotify device config applied on startup.');
      }
    } catch (err) {
      console.warn('[EventService] Raspotify config write failed (non-fatal):', err.message);
    }

    // Pre-mute CamillaDSP before applying config so there is no window at 0 dB
    // (CamillaDSP defaults to full volume on every start; the config apply will
    //  restore the correct level, but this closes any race with early playback).
    try {
      const { setCamillaVolume } = await import('./player.js');
      await setCamillaVolume(-100);
      console.log('[EventService] CamillaDSP pre-muted for safe startup.');
    } catch {}

    // Restore CamillaDSP config — volume is restored inside this call
    try {
      const { updateCamillaConfigFromSettings } = await import('./player.js');
      await updateCamillaConfigFromSettings({ pureDirect: cachedPureDirect });
      console.log('[EventService] CamillaDSP config restored on startup.');
    } catch (err) {
      console.error('[EventService] Failed to restore CamillaDSP config:', err.message);
    }

    // NOTE: the MPD rate watcher itself (server/index.js:startMpdRateWatcher())
    // does run — this comment previously said it was disabled, which was
    // stale/inaccurate. What actually blocked bit-perfect rate-following was
    // the old arecord-based VU meter permanently holding loop_dsnoop open at
    // a hard-coded 48000 Hz (dsnoop's slave params are fixed by whichever
    // client opens it first) — fixed by switching the VU meter to poll
    // CamillaDSP's own GetCaptureSignalPeak instead (see websocket.js).

    // Start audio level monitor
    const { startAudioLevelMonitor } = await import('./websocket.js');
    startAudioLevelMonitor();

  } catch (err) {
    console.warn('[EventService] Failed to load state from DB:', err.message);
  }
};
