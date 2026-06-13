import { WebSocketServer, WebSocket } from 'ws';
import { getValidAccessToken } from './spotify-auth.js';
import { getSetting, setSetting, dbReady } from './db.js';

let cachedPlaybackState = null;
let cachedSourceState = { spotify: true, source: 'spotify' };

/**
 * Helper to load cached state from DB on startup.
 */
export const loadCachedStateFromDB = async () => {
  await dbReady;
  try {
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

  app.set('wssBroadcast', broadcast);

  wss.on('connection', async (ws) => {
    console.log('[Resonance WS] Client connected. Active clients:', wss.clients.size);
    
    // Send last cached playback state on connect
    if (cachedPlaybackState) {
      ws.send(JSON.stringify({ type: 'PLAYBACK_STATE', payload: cachedPlaybackState }));
    }

    // Send the active source state on connect
    ws.send(JSON.stringify({ type: 'SET_SOURCE', payload: cachedSourceState }));

    // Send the server-managed access token (auto-refreshed if needed)
    const serverToken = await getValidAccessToken();
    if (serverToken) {
      ws.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token: serverToken } }));
    }

    ws.on('message', (messageStr) => {
      try {
        const { type, payload } = JSON.parse(messageStr);
        
        if (type === 'BROADCAST_STATE') {
          cachedPlaybackState = payload;
          broadcast({ type: 'PLAYBACK_STATE', payload }, ws);
        }

        if (type === 'REQUEST_SYNC') {
          broadcast({ type: 'REQUEST_SYNC' }, ws);
        }

        if (type === 'SET_SOURCE') {
          cachedSourceState = payload;
          setSetting('active_source', payload.source || (payload.spotify ? 'spotify' : 'local'));
          broadcast({ type: 'SET_SOURCE', payload }, ws);
        }

        if (type === 'SET_TOKEN') {
          console.log('[Resonance WS] Token sync received from client.');
          broadcast({ type: 'SET_TOKEN', payload }, ws);
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
