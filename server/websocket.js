import { WebSocketServer, WebSocket } from 'ws';
import { getValidAccessToken } from './spotify-auth.js';

let cachedPlaybackState = null;
let cachedSourceState = { spotify: true };

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
    const { pathname } = new URL(request.url, `http://${request.headers.host}`);

    if (pathname === '/ws') {
      const forwarded = request.headers['x-forwarded-for'];
      const clientIp = forwarded ? forwarded.split(',')[0].trim() : request.socket.remoteAddress;

      if (!isLocalIP(clientIp)) {
        console.warn(`[Resonance WS Denied] Blocked WS upgrade from external IP: ${clientIp}`);
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return { wss, broadcast };
}
