import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { exec } from 'child_process';
import { promisify } from 'util';
import updateRouter from './update.js';
import spotifyAuthRouter, { getValidAccessToken } from './spotify-auth.js';

const execPromise = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve static assets from Vite's production build folder
app.use(express.static(path.join(__dirname, '../dist')));

// System OTA Update Router API Integration
app.use('/api/system/update', updateRouter);

// Spotify OAuth routes
app.use('/auth/spotify', spotifyAuthRouter);

// Helper to detect if an IP address belongs to the same local area network (LAN)
const isLocalIP = (ip) => {
  if (!ip) return false;
  
  let normalizedIp = ip;
  // Normalize IPv6 mapped IPv4 addresses
  if (ip.startsWith('::ffff:')) {
    normalizedIp = ip.substring(7);
  }
  
  // Localhost / Loopback
  if (normalizedIp === '127.0.0.1' || normalizedIp === '::1' || normalizedIp === 'localhost') {
    return true;
  }
  
  // Private IPv4 Address ranges:
  // Class A: 10.0.0.0 - 10.255.255.255
  if (normalizedIp.startsWith('10.')) {
    return true;
  }
  // Class B: 172.16.0.0 - 172.31.255.255
  if (normalizedIp.startsWith('172.')) {
    const parts = normalizedIp.split('.');
    if (parts.length >= 2) {
      const secondPart = parseInt(parts[1], 10);
      if (secondPart >= 16 && secondPart <= 31) {
        return true;
      }
    }
  }
  // Class C: 192.168.0.0 - 192.168.255.255
  if (normalizedIp.startsWith('192.168.')) {
    return true;
  }
  
  // Private IPv6 Address ranges: link-local (fe80::/10), unique local (fc00::/7)
  const lowerIp = normalizedIp.toLowerCase();
  if (
    lowerIp.startsWith('fe8') || 
    lowerIp.startsWith('fe9') || 
    lowerIp.startsWith('fea') || 
    lowerIp.startsWith('feb') || 
    lowerIp.startsWith('fc') || 
    lowerIp.startsWith('fd')
  ) {
    return true;
  }
  
  return false;
};

// Helper to extract client IP address
const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip;
};

// Restrict /remote route to devices on the same local network
app.get('/remote', (req, res, next) => {
  const clientIp = getClientIP(req);
  if (!isLocalIP(clientIp)) {
    console.warn(`[Resonance Access Denied] Blocked request to /remote from external IP: ${clientIp}`);
    return res.status(403).send(`
      <html>
        <head>
          <title>403 Forbidden</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="background-color: #090b0e; color: #f1f3f6; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 24px; text-align: center; box-sizing: border-box;">
          <div style="max-width: 400px; background-color: #13161c; border: 1px solid rgba(255, 255, 255, 0.05); padding: 32px; border-radius: 16px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);">
            <h1 style="color: #ff3366; font-size: 1.5rem; margin-top: 0; margin-bottom: 8px; letter-spacing: 0.1em; font-weight: bold; text-transform: uppercase;">Access Denied</h1>
            <p style="color: #8695a7; font-size: 0.85rem; line-height: 1.6; margin-bottom: 24px;">Resonance Remote Control is restricted. You must be connected to the same local area network (LAN) as the server.</p>
            <div style="font-size: 0.75rem; color: #303643; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px; font-family: monospace;">Client IP: ${clientIp}</div>
          </div>
        </body>
      </html>
    `);
  }
  next();
});

// Local Player control endpoints (using mpc)
app.post('/api/player/play', async (req, res) => {
  try {
    await execPromise('mpc play');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Play failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/pause', async (req, res) => {
  try {
    await execPromise('mpc pause');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Pause failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/next', async (req, res) => {
  try {
    await execPromise('mpc next');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Next failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/previous', async (req, res) => {
  try {
    await execPromise('mpc prev');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Previous failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/volume', async (req, res) => {
  const { volume } = req.body;
  try {
    await execPromise(`mpc volume ${volume}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Volume failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/player/seek', async (req, res) => {
  const { position } = req.body;
  try {
    await execPromise(`mpc seek ${position}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Seek failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Spotify Daemon Credentials Configuration (write to /etc/default/raspotify)
app.post('/api/spotify/credentials', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }
  try {
    const configContent = `# Resonance HiFi - Raspotify Configuration
DEVICE_NAME="Resonance Connect"
BITRATE="320"
OPTIONS="--backend alsa --initial-volume 50 --enable-volume-normalisation --username ${username} --password ${password}"
`;
    const escapedContent = configContent.replace(/'/g, "'\\''");
    await execPromise(`echo '${escapedContent}' | sudo tee /etc/default/raspotify`);
    await execPromise('sudo systemctl restart raspotify');
    console.log(`[Resonance Server] Spotify daemon credentials updated for: ${username}`);
    res.json({ success: true, message: 'Spotify daemon credentials updated and service restarted' });
  } catch (err) {
    console.error('[Resonance Server] Failed to update daemon credentials:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fallback all non-API requests to index.html for Single Page App client routing
app.use((req, res, next) => {
  if (req.method === 'GET') {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    next();
  }
});

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ noServer: true });

let cachedPlaybackState = null;
let cachedSourceState = { spotify: true };

// Helper to broadcast messages to all connected WS clients
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
        // Broadcast new state to all OTHER clients
        broadcast({ type: 'PLAYBACK_STATE', payload }, ws);
      }

      if (type === 'REQUEST_SYNC') {
        // Broadcast sync request to OTHER clients (typically the main player)
        broadcast({ type: 'REQUEST_SYNC' }, ws);
      }

      if (type === 'SET_SOURCE') {
        cachedSourceState = payload;
        broadcast({ type: 'SET_SOURCE', payload }, ws);
      }

      if (type === 'SET_TOKEN') {
        // Clients can still push tokens for cross-client sync (legacy path)
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

// Upgrade HTTP connection to WebSocket on /ws path
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

server.listen(PORT, () => {
  console.log(`[Resonance Backend] Server listening on http://localhost:${PORT}`);
});
