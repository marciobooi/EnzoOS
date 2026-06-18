import { getSetting, setSetting, dbReady } from './db.js';

// ─── Cached state (single source of truth) ───────────────────────────────────
let cachedPlaybackState = null;
let cachedSourceState   = { spotify: true, source: 'spotify' };
let cachedStandbyState  = false;
let cachedVolume        = 50;
let cachedMuted         = false;
let broadcastFn         = null;
// Timestamp of last standby entry — BROADCAST_STATE auto-wake is suppressed
// for 15 s after entering standby to prevent Spotify polling from waking it
let standbyEnteredAt    = 0;
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
const PASSTHROUGH = new Set(['SET_TOKEN', 'CLEAR_TOKEN', 'REQUEST_SYNC', 'UPDATE_PROGRESS', 'AUDIO_LEVELS']);

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
    const x11Env = { ...process.env, DISPLAY: ':0', XAUTHORITY: process.env.XAUTHORITY || '/home/pi/.Xauthority' };
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
    }
  } catch (err) {
    console.error('[Standby] Power/mpc action failed:', err);
  }
}

// ─── Event handler (runs inside serial queue) ─────────────────────────────────
async function handleEvent(type, payload, excludeWs) {
  switch (type) {
    case 'BROADCAST_STATE': {
      cachedPlaybackState = payload;

      // Keep volume/muted in sync — persist to DB debounced so slider drags
      // don't cause a write on every tick
      if (payload && payload.volume !== undefined) {
        cachedVolume = payload.volume;
        cachedMuted  = payload.is_muted ?? false;
        clearTimeout(volumeSaveTimer);
        volumeSaveTimer = setTimeout(() => {
          setSetting('volume', String(cachedVolume));
          setSetting('muted',  cachedMuted ? 'true' : 'false');
        }, 1500);
      }

      // Auto-wake only if standby has been active for > 15 s to avoid the Spotify
      // polling race (kiosk sends BROADCAST_STATE right after entering standby)
      if (cachedStandbyState && payload && !payload.paused) {
        if (Date.now() - standbyEnteredAt > 15000) {
          await applyStandby(false);
        }
      }
      broadcast({ type: 'PLAYBACK_STATE', payload }, excludeWs);
      break;
    }

    case 'PLAYBACK_STATE': {
      cachedPlaybackState = payload;
      broadcast({ type: 'PLAYBACK_STATE', payload }, excludeWs);
      break;
    }

    case 'SET_SOURCE': {
      const previousSource = cachedSourceState.source;
      const newSource = payload.source || (payload.spotify ? 'spotify' : 'local');
      cachedSourceState = payload;
      await setSetting('active_source', newSource);

      if (newSource === 'spotify') {
        // Kill local/radio playback when entering Spotify
        try {
          const { exec } = await import('child_process');
          exec('mpc stop');
        } catch (err) {
          console.error('[SET_SOURCE] Failed to stop mpc:', err);
        }
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
          // MPD keeps its queue and position — just resume playback
          try {
            const { exec } = await import('child_process');
            exec('mpc play');
          } catch (err) {
            console.error('[SET_SOURCE] Failed to resume MPD:', err);
          }
          // Clear cached state — MPD client sends BROADCAST_STATE once playing
          cachedPlaybackState = null;
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
      break;
    }

    case 'SET_EQ_SETTINGS': {
      console.log('[EventService] EQ settings update:', payload);
      await setSetting('eq_settings', JSON.stringify(payload));
      try {
        const { updateCamillaConfigFromSettings } = await import('./player.js');
        await updateCamillaConfigFromSettings();
      } catch (err) {
        console.error('[EventService] CamillaDSP update failed on EQ change:', err);
      }
      broadcast({ type: 'EQ_SETTINGS', payload }, excludeWs);
      break;
    }

    case 'SET_THEME_SETTINGS': {
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

    // Restore CamillaDSP config
    try {
      const { updateCamillaConfigFromSettings } = await import('./player.js');
      await updateCamillaConfigFromSettings();
      console.log('[EventService] CamillaDSP config restored on startup.');
    } catch (err) {
      console.error('[EventService] Failed to restore CamillaDSP config:', err.message);
    }

    // Start audio level monitor
    const { startAudioLevelMonitor } = await import('./websocket.js');
    startAudioLevelMonitor();

  } catch (err) {
    console.warn('[EventService] Failed to load state from DB:', err.message);
  }
};
