import { WebSocketServer, WebSocket } from 'ws';
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
    exec(`sudo /usr/local/bin/kiosk-brightness.sh ${brightness}`, (err, stdout, stderr) => {
      if (err) {
        console.error('[Brightness] Failed to set hardware brightness:', err);
      } else {
        console.log(`[Brightness] Successfully set hardware brightness to ${brightness}%:`, stdout.trim());
      }
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
    if (!eqSettingsVal) {
      const defaultEq = {
        preset: 'Clinical Reference',
        bands: [
          { name: 'b1', freq: 30, gain: 0, q: 0.707 },
          { name: 'b2', freq: 105, gain: -1.5, q: 0.707 },
          { name: 'b3', freq: 250, gain: -1.0, q: 0.5 },
          { name: 'b4', freq: 3200, gain: 1.0, q: 1.0 },
          { name: 'b5', freq: 10000, gain: 0.0, q: 0.707 }
        ],
        saturation: false,
        noiseFloor: null,
        preAmp: 0
      };
      await setSetting('eq_settings', JSON.stringify(defaultEq));
      console.log('[Resonance DB] Initialized default eq_settings in DB.');
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
