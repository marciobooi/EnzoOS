import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import fs from 'fs';
import updateRouter from './update.js';
import systemRouter from './system.js';
import spotifyAuthRouter from './spotify-auth.js';
import playerRouter, { startMpdRateWatcher } from './player.js';
import spotifyDaemonRouter from './spotify-daemon.js';
import statusRouter from './status.js';
import metadataRouter from './metadata.js';
import authRouter from './auth-routes.js';
import { setupWebSocket, stopAudioLevelMonitor } from './websocket.js';
import { loadStateFromDB } from './event-service.js';
import { closeDB } from './db.js';
import { stopTokenRefresh } from './spotify-auth.js';
import { requireAuth, isWsAuthorized } from './auth.js';
import { rateLimit } from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.SPOTIFY_CLIENT_ID) {
  console.warn('[Resonance Backend] SPOTIFY_CLIENT_ID not set — Spotify auth will be unavailable. (PKCE flow needs no client secret.)');
}

const app = express();
const PORT = process.env.PORT || 5000;
const HTTPS_PORT = process.env.HTTPS_PORT || 5001;

app.use(cors());
app.use(express.json());

// Serve static assets from Vite's production build folder
app.use(express.static(path.join(__dirname, '../dist')));

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Generous DoS guard across the whole API — set high enough not to interfere
// with the kiosk/remote polling (signal-path every 5 s, status, VU, …).
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 3000, standardHeaders: true, legacyHeaders: false });
app.use('/api', apiLimiter);
// Stricter cap on token issuance/redemption to slow brute-force attempts.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 40, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth', authLimiter);

// Remote-access auth (login / check). Unauthenticated by design — this is how
// LAN clients obtain a token. Loopback (kiosk) is always trusted.
app.use('/api/auth', authRouter);

// Everything below controls the device or exposes sensitive state, so it requires
// either a loopback origin (the kiosk) or a valid bearer token (the phone remote).
// System OTA Update Router API Integration
app.use('/api/system/update', requireAuth, updateRouter);

// System control routes (services, reboot, shutdown)
app.use('/api/system', requireAuth, systemRouter);

// Spotify OAuth routes
app.use('/auth/spotify', spotifyAuthRouter);

// Local player control routes
app.use('/api/player', requireAuth, playerRouter);

// Spotify Connect daemon configuration routes
app.use('/api/spotify', requireAuth, spotifyDaemonRouter);

// Global system status — single-fetch snapshot for client connect/reconnect
app.use('/api/status', requireAuth, statusRouter);

// Premium album/artist metadata aggregator (on-demand, cached)
app.use('/api/metadata', requireAuth, metadataRouter);

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

// Load persisted state before accepting connections — prevents race where
// clients reconnect after OTA restart and get stale default source/playback state
await loadStateFromDB();

// Setup WebSocket server
const { wss } = setupWebSocket(server);

server.listen(PORT, () => {
  console.log(`[Resonance Backend] Server listening on http://localhost:${PORT}`);
  // Start the persistent MPD idle watcher: follows per-track sample-rate changes
  // (bit-perfect capture) and flips the DSD Direct bypass on .dsf/.dff playback.
  startMpdRateWatcher();
});

const shutdown = async () => {
  console.log('[Resonance Backend] Shutting down gracefully...');
  stopAudioLevelMonitor();
  stopTokenRefresh();
  await closeDB();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// HTTPS server for remote devices (phones on LAN).
// Both HTTP and HTTPS share the same wss instance so broadcast reaches all clients.
const certPath = path.join(__dirname, '../certs/cert.pem');
const keyPath  = path.join(__dirname, '../certs/key.pem');

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  const httpsServer = https.createServer({
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
  }, app);

  // Reuse the same wss so kiosk (WS) and remote (WSS) share one client list + broadcast
  httpsServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(request.url, 'http://localhost').pathname; }
    catch { pathname = request.url?.split('?')[0] || ''; }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }
    // Remote (LAN) sockets must present a valid token; loopback is trusted.
    isWsAuthorized(request).then((ok) => {
      if (!ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }).catch(() => socket.destroy());
  });

  httpsServer.listen(HTTPS_PORT, () => {
    console.log(`[Resonance Backend] HTTPS server on https://0.0.0.0:${HTTPS_PORT} (remote access)`);
  });
} else {
  console.warn('[Resonance Backend] No TLS certs found — HTTPS disabled. Run install.sh to generate certs.');
}
