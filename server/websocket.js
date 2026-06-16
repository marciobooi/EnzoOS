import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { getValidAccessToken } from './spotify-auth.js';
import { getSetting, setSetting, dbReady } from './db.js';

let cachedPlaybackState = null;
let cachedSourceState = { spotify: true, source: 'spotify' };
export let cachedStandbyState = false;
let wssBroadcast = null;

export const setStandbyState = async (enabled) => {
  cachedStandbyState = enabled;
  await setSetting('standby', enabled ? 'true' : 'false');
  if (wssBroadcast) {
    wssBroadcast({ type: 'SET_STANDBY', payload: { enabled } });
  }

  if (enabled) {
    stopAudioLevelMonitor();
  } else {
    startAudioLevelMonitor();
  }

  try {
    const { exec } = await import('child_process');
    if (enabled) {
      exec('mpc stop');
      exec('sudo /usr/local/bin/kiosk-power.sh standby');
    } else {
      exec('sudo /usr/local/bin/kiosk-power.sh wake');
    }
  } catch (err) {
    console.error('[Standby] Failed to execute power/mpc action:', err);
  }
};

export const setHardwareBrightness = async (brightness) => {
  if (brightness === undefined || brightness === null) return;
  try {
    const { exec } = await import('child_process');
    const sanitized = Number(brightness);
    if (!Number.isFinite(sanitized)) {
      console.warn('[Brightness] Ignoring invalid brightness value:', brightness);
      return;
    }

    const script = `/usr/local/bin/kiosk-brightness.sh ${Math.max(0, Math.min(100, Math.round(sanitized)))}`;
    const x11Env = { ...process.env, DISPLAY: ':0', XAUTHORITY: '/home/pi/.Xauthority' };

    exec(script, { env: x11Env }, (err, stdout) => {
      if (!err) {
        console.log(`[Brightness] Successfully set hardware brightness to ${brightness}%:`, stdout.trim());
        return;
      }

      console.warn('[Brightness] Non-sudo call failed, retrying with sudo:', err.message);
      exec(`sudo ${script}`, { env: x11Env }, (sudoErr, sudoStdout) => {
        if (sudoErr) {
          console.error('[Brightness] Failed to set hardware brightness:', sudoErr.message);
        } else {
          console.log(`[Brightness] Successfully set hardware brightness to ${brightness}% via sudo:`, sudoStdout.trim());
        }
      });
    });
  } catch (err) {
    console.error('[Brightness] Error executing brightness script:', err);
  }
};

/**
 * Helper to load cached state from DB on startup.
 */
export const loadCachedStateFromDB = async () => {
  await dbReady;
  try {
    let standbyVal = await getSetting('standby');
    if (!standbyVal) {
      standbyVal = 'false';
      await setSetting('standby', 'false');
      console.log('[Resonance DB] Initialized default standby in DB.');
    }
    cachedStandbyState = standbyVal === 'true';
    console.log(`[Resonance WS] Loaded standby state from DB: ${cachedStandbyState}`);

    let themeSettingsVal = await getSetting('theme_settings');
    if (!themeSettingsVal) {
      const defaultTheme = { themeColor: 'amber', activeTheme: 'dot-matrix', brightness: 100 };
      await setSetting('theme_settings', JSON.stringify(defaultTheme));
      themeSettingsVal = JSON.stringify(defaultTheme);
      console.log('[Resonance DB] Initialized default theme_settings in DB.');
    }
    try {
      const themeSettings = JSON.parse(themeSettingsVal);
      if (themeSettings && themeSettings.brightness !== undefined) {
        console.log(`[Resonance WS] Loaded brightness from DB: ${themeSettings.brightness}`);
        await setHardwareBrightness(themeSettings.brightness);
      }
    } catch (e) {
      console.warn('[Resonance WS] Failed parsing theme_settings from DB:', e);
    }

    let eqSettingsVal = await getSetting('eq_settings');
    let needsResetOrMigrate = false;
    if (eqSettingsVal) {
      try {
        const parsed = JSON.parse(eqSettingsVal);
        if (!parsed || !Array.isArray(parsed.bands) || typeof parsed.bands[0] === 'object') {
          needsResetOrMigrate = true;
        }
      } catch (e) {
        needsResetOrMigrate = true;
      }
    } else {
      needsResetOrMigrate = true;
    }

    if (needsResetOrMigrate) {
      const defaultEq = {
        preset: 'Clinical Reference',
        bands: [0, 0, 0, 0, 0],
        saturation: 0,
        noiseFloor: 0,
        preAmp: 0.0
      };
      await setSetting('eq_settings', JSON.stringify(defaultEq));
      eqSettingsVal = JSON.stringify(defaultEq);
      console.log('[Resonance DB] Initialized/migrated default eq_settings in DB.');
    }

    let activeSource = await getSetting('active_source');
    if (!activeSource) {
      activeSource = 'spotify';
      await setSetting('active_source', 'spotify');
      console.log('[Resonance DB] Initialized default active_source in DB.');
    }
    cachedSourceState = {
      spotify: activeSource === 'spotify',
      source: activeSource
    };
    console.log(`[Resonance WS] Loaded active source from DB: ${activeSource}`);

    let remoteAccessVal = await getSetting('remote_access_enabled');
    if (!remoteAccessVal) {
      await setSetting('remote_access_enabled', 'true');
      console.log('[Resonance DB] Initialized default remote_access_enabled in DB.');
    }
      
    if (activeSource === 'radio') {
      const url = await getSetting('last_radio_url');
      const name = await getSetting('last_radio_name');
      const favicon = await getSetting('last_radio_favicon');
      if (url) {
        cachedPlaybackState = {
          paused: true, // Start paused on reboot/standby
          position: 0,
          duration: 0,
          track_window: {
            current_track: {
              name: name || 'WEB RADIO',
              artists: [{ name: 'Live Stream' }],
              album: { name: 'Web Radio Broadcast', images: favicon ? [{ url: favicon }] : [] },
              url: url
            }
          }
        };
        console.log(`[Resonance WS] Loaded last played radio from DB: ${name} (${url})`);
      }
    }

    // Restore CamillaDSP configuration on startup to persist state across reboots
    try {
      const { updateCamillaConfigFromSettings } = await import('./player.js');
      await updateCamillaConfigFromSettings();
      console.log('[Resonance WS] Successfully restored and verified CamillaDSP config on startup.');
    } catch (err) {
      console.error('[Resonance WS] Failed to restore CamillaDSP config on startup:', err.message);
    }

    // Start audio level monitoring
    startAudioLevelMonitor();
  } catch (err) {
    console.warn('[Resonance WS] Failed to load cached state from DB:', err.message);
  }
};

/**
 * Initializes and binds the WebSocket server, handling message routing and upgrades.
 */
export function setupWebSocket(server, app, isLocalIP) {
  const wss = new WebSocketServer({ noServer: true });

  const broadcast = (data, excludeWs = null) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
        client.send(message);
      }
    });
  };

  wssBroadcast = broadcast;
  app.set('wssBroadcast', broadcast);

  wss.on('connection', async (ws) => {
    console.log('[Resonance WS] Client connected. Active clients:', wss.clients.size);
    
    // Send last cached playback state on connect
    if (cachedPlaybackState) {
      ws.send(JSON.stringify({ type: 'PLAYBACK_STATE', payload: cachedPlaybackState }));
    }

    // Send the active source state on connect
    ws.send(JSON.stringify({ type: 'SET_SOURCE', payload: cachedSourceState }));

    // Send the active standby state on connect
    ws.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: cachedStandbyState } }));

    // Send the active EQ settings on connect
    const eqSettings = await getSetting('eq_settings');
    if (eqSettings) {
      ws.send(JSON.stringify({ type: 'EQ_SETTINGS', payload: JSON.parse(eqSettings) }));
    }

    // Send the active DSP calibration status on connect
    const dspCalibration = await getSetting('dsp_calibration');
    if (dspCalibration) {
      ws.send(JSON.stringify({ type: 'DSP_CALIBRATION', payload: JSON.parse(dspCalibration) }));
    }

    // Send the active Theme/Display settings on connect
    const themeSettings = await getSetting('theme_settings');
    if (themeSettings) {
      ws.send(JSON.stringify({ type: 'THEME_SETTINGS', payload: JSON.parse(themeSettings) }));
    }

    // Send remote access status on connect
    const remoteAccess = await getSetting('remote_access_enabled');
    ws.send(JSON.stringify({ type: 'SET_REMOTE_ACCESS', payload: { enabled: remoteAccess === 'true' } }));

    // Send the server-managed access token (auto-refreshed if needed)
    const serverToken = await getValidAccessToken();
    if (serverToken) {
      ws.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token: serverToken } }));
    }

    ws.on('message', async (messageStr) => {
      try {
        const { type, payload } = JSON.parse(messageStr);
        
        if (type === 'BROADCAST_STATE') {
          cachedPlaybackState = payload;
          if (cachedStandbyState && payload && !payload.paused) {
            // Auto-wake if playing music
            await setStandbyState(false);
          }
          broadcast({ type: 'PLAYBACK_STATE', payload }, ws);
        }

        if (type === 'REQUEST_SYNC') {
          broadcast({ type: 'REQUEST_SYNC' }, ws);
        }

        if (type === 'SET_SOURCE') {
          cachedSourceState = payload;
          setSetting('active_source', payload.source || (payload.spotify ? 'spotify' : 'local'));
          
          if (payload.spotify || payload.source === 'spotify') {
            try {
              const { exec } = await import('child_process');
              exec('mpc stop');
            } catch (err) {
              console.error('[SET_SOURCE] Failed to stop mpc:', err);
            }
          }
          
          broadcast({ type: 'SET_SOURCE', payload }, ws);
        }

        if (type === 'SET_STANDBY') {
          await setStandbyState(payload.enabled);
        }

        if (type === 'SET_TOKEN') {
          console.log('[Resonance WS] Token sync received from client.');
          broadcast({ type: 'SET_TOKEN', payload }, ws);
        }

        if (type === 'SET_EQ_SETTINGS') {
          console.log('[Resonance WS] EQ settings update received:', payload);
          await setSetting('eq_settings', JSON.stringify(payload));
          
          // Trigger rebuilding/reloading CamillaDSP config based on new EQ settings
          const { updateCamillaConfigFromSettings } = await import('./player.js');
          updateCamillaConfigFromSettings().catch(err => {
            console.error('[Resonance WS] Failed to update CamillaDSP config on EQ change:', err);
          });
          
          // Broadcast the new EQ settings to all other clients so their UI updates
          broadcast({ type: 'EQ_SETTINGS', payload }, ws);
        }

        if (type === 'SET_THEME_SETTINGS') {
          console.log('[Resonance WS] Theme settings update received:', payload);
          await setSetting('theme_settings', JSON.stringify(payload));
          if (payload && payload.brightness !== undefined) {
            await setHardwareBrightness(payload.brightness);
          }
          
          // Broadcast theme settings to all other clients
          broadcast({ type: 'THEME_SETTINGS', payload }, ws);
        }

        if (type === 'SET_REMOTE_ACCESS') {
          console.log('[Resonance WS] Remote access update received:', payload);
          await setSetting('remote_access_enabled', payload.enabled ? 'true' : 'false');
          broadcast({ type: 'SET_REMOTE_ACCESS', payload }, ws);
        }

        if (type === 'CLEAR_TOKEN') {
          console.log('[Resonance WS] Token clear received from client.');
          broadcast({ type: 'CLEAR_TOKEN' }, ws);
        }
      } catch (err) {
        console.error('[Resonance WS] Failed parsing client message:', err);
      }
    });

    ws.on('close', () => {
      console.log('[Resonance WS] Client disconnected. Active clients:', wss.clients.size);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    // Safely extract pathname using URL constructor with a fixed base (avoids IPv6 host errors)
    let pathname = '';
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (err) {
      pathname = request.url ? request.url.split('?')[0] : '';
    }

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return { wss, broadcast };
}

let arecordProcess = null;
let arecordRetryCount = 0;
const MAX_RETRY_COUNT = 5;
let arecordRetryTimeout = null;

export function startAudioLevelMonitor() {
  if (arecordProcess) return;
  if (cachedStandbyState) {
    arecordRetryCount = 0;
    return;
  }

  if (arecordRetryCount >= MAX_RETRY_COUNT) {
    console.warn('[Audio Monitor] Max retry count reached. Monitor disabled.');
    return;
  }

  console.log('[Audio Monitor] Starting arecord loopback level monitor...');
  
  try {
    arecordProcess = spawn('arecord', [
      '-D', 'loop_dsnoop',
      '-f', 'S16_LE',
      '-c', '2',
      '-r', '44100',
      '-t', 'raw',
      '-q'
    ]);
  } catch (err) {
    console.error('[Audio Monitor] Failed to spawn arecord:', err.message);
    arecordProcess = null;
    scheduleRetry();
    return;
  }

  let bufferAccumulator = Buffer.alloc(0);
  const CHUNK_SIZE = 8820; // 50ms at 44.1kHz stereo 16-bit

  arecordProcess.stdout.on('data', (chunk) => {
    // We successfully got data, reset retry count
    arecordRetryCount = 0;
    
    bufferAccumulator = Buffer.concat([bufferAccumulator, chunk]);
    
    while (bufferAccumulator.length >= CHUNK_SIZE) {
      const chunkToProcess = bufferAccumulator.subarray(0, CHUNK_SIZE);
      bufferAccumulator = bufferAccumulator.subarray(CHUNK_SIZE);
      
      let maxL = 0;
      let maxR = 0;
      
      for (let i = 0; i < chunkToProcess.length; i += 4) {
        if (i + 3 >= chunkToProcess.length) break;
        
        const sampleL = chunkToProcess.readInt16LE(i);
        const sampleR = chunkToProcess.readInt16LE(i + 2);
        
        const absL = Math.abs(sampleL);
        const absR = Math.abs(sampleR);
        
        if (absL > maxL) maxL = absL;
        if (absR > maxR) maxR = absR;
      }
      
      const calcDb = (val) => {
        if (val <= 0) return -45.0;
        const db = 20 * Math.log10(val / 32767.0);
        return Math.max(-45.0, Math.round(db * 10) / 10);
      };
      
      const dbL = calcDb(maxL);
      const dbR = calcDb(maxR);
      
      if (wssBroadcast) {
        wssBroadcast({
          type: 'AUDIO_LEVELS',
          payload: { dbL, dbR }
        });
      }
    }
  });

  arecordProcess.on('error', (err) => {
    console.error('[Audio Monitor] arecord process error:', err.message);
  });

  arecordProcess.on('exit', (code) => {
    console.log(`[Audio Monitor] arecord process exited with code ${code}`);
    arecordProcess = null;
    if (!cachedStandbyState) {
      scheduleRetry();
    }
  });
}

function scheduleRetry() {
  if (arecordRetryTimeout) clearTimeout(arecordRetryTimeout);
  arecordRetryCount++;
  console.log(`[Audio Monitor] Scheduling retry ${arecordRetryCount}/${MAX_RETRY_COUNT} in 15 seconds...`);
  arecordRetryTimeout = setTimeout(() => {
    startAudioLevelMonitor();
  }, 15000);
}

export function stopAudioLevelMonitor() {
  if (arecordRetryTimeout) {
    clearTimeout(arecordRetryTimeout);
    arecordRetryTimeout = null;
  }
  arecordRetryCount = 0;
  if (arecordProcess) {
    console.log('[Audio Monitor] Stopping arecord loopback level monitor...');
    arecordProcess.kill('SIGTERM');
    arecordProcess = null;
  }
}

