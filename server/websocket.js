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

  if (enabled) {
    try {
      const { exec } = await import('child_process');
      exec('mpc stop');
    } catch (err) {
      console.error('[Standby] Failed to stop mpc:', err);
    }
  }
};

/**
 * Helper to load cached state from DB on startup.
 */
export const loadCachedStateFromDB = async () => {
  await dbReady;
  try {
    const standbyVal = await getSetting('standby');
    cachedStandbyState = standbyVal === 'true';
    console.log(`[Resonance WS] Loaded standby state from DB: ${cachedStandbyState}`);

    const activeSource = await getSetting('active_source');
    if (activeSource) {
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
