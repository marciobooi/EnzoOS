import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import updateRouter from './update.js';
import spotifyAuthRouter from './spotify-auth.js';
import playerRouter from './player.js';
import spotifyDaemonRouter from './spotify-daemon.js';
import { setupWebSocket } from './websocket.js';

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

// Local player control routes
app.use('/api/player', playerRouter);

// Spotify Connect daemon configuration routes
app.use('/api/spotify', spotifyDaemonRouter);

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

// Setup WebSocket server
setupWebSocket(server, app, isLocalIP);

server.listen(PORT, () => {
  console.log(`[Resonance Backend] Server listening on http://localhost:${PORT}`);
});
