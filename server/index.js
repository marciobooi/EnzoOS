import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import https from 'https';
import fs from 'fs';
import updateRouter from './update.js';
import systemRouter from './system.js';
import spotifyAuthRouter from './spotify-auth.js';
import playerRouter, { startMpdRateWatcher, applyPersistedMpdSettings } from './player.js';
import storageRouter, { remountPersistedNasShares } from './storage.js';
import spotifyDaemonRouter from './spotify-daemon.js';
import statusRouter from './status.js';
import metadataRouter from './metadata.js';
import authRouter from './auth-routes.js';
import { setupWebSocket, stopAudioLevelMonitor } from './websocket.js';
import { loadStateFromDB } from './event-service.js';
import { closeDB } from './db.js';
import { stopTokenRefresh } from './spotify-auth.js';
import { requireAuth, isWsAuthorized, isLoopback } from './auth.js';
import { errorHandler } from './lib/errors.js';
import { rateLimit } from 'express-rate-limit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.SPOTIFY_CLIENT_ID) {
  console.warn('[Resonance Backend] SPOTIFY_CLIENT_ID not set — Spotify auth will be unavailable. (PKCE flow needs no client secret.)');
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const HTTPS_PORT = Number(process.env.HTTPS_PORT) || 5001;
const certPath = path.join(__dirname, '../certs/cert.pem');
const keyPath  = path.join(__dirname, '../certs/key.pem');
const httpsAvailable = fs.existsSync(certPath) && fs.existsSync(keyPath);

// CSP is disabled: the UI relies heavily on inline `style={{...}}` props
// throughout (Tailwind covers layout/utility classes, but per-theme colors
// are computed and applied inline) — helmet's default CSP has no
// 'unsafe-inline' for style-src and would break rendering app-wide. Every
// other protective header (X-Frame-Options/clickjacking, X-Content-Type-
// Options/MIME-sniffing, Referrer-Policy, HSTS on the HTTPS remote port,
// etc.) still applies — meaningful even on a LAN appliance, e.g. against a
// malicious page framing the remote-control UI to clickjack playback/reboot.
//
// Cross-Origin-Opener-Policy and Origin-Agent-Cluster are also disabled:
// both are meaningless without HTTPS (or localhost) — the browser just
// logs a console warning and ignores them on plain HTTP (the loopback-only
// kiosk port, 5000). Neither protects anything this app needs (no
// SharedArrayBuffer / cross-origin isolation usage) — the HTTPS remote
// port (5001) doesn't need them either, since it's single-origin.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginOpenerPolicy: false,
  originAgentCluster: false,
}));
app.use(cors());
app.use(express.json());

// A browser that reaches the plain-HTTP kiosk port (5000) over the LAN,
// without a loopback origin or a paired remote_token/Authorization header,
// is almost never the kiosk itself — it's someone who typed
// http://resonance.local:5000 instead of the paired HTTPS remote. Serving
// them the app shell anyway means every subsequent /api call 401s (this
// port's API is loopback-only by design — see auth.js) and the page looks
// entirely broken with no explanation. Bounce them to the HTTPS remote's
// pairing gate instead. Runs before express.static so it also catches the
// very first `/` request (static's own index.html lookup would otherwise
// serve the shell before this ever gets a chance to run).
app.use((req, res, next) => {
  if (!httpsAvailable || req.method !== 'GET' || req.socket.localPort !== PORT) return next();
  if (isLoopback(req) || req.path === '/ca.crt' || req.path.startsWith('/api')) return next();
  const hasCookie = /(?:^|;\s*)remote_token=/.test(req.headers.cookie || '');
  const hasBearer = /^Bearer\s+/i.test(req.headers.authorization || '');
  if (hasCookie || hasBearer) return next();
  res.redirect(`https://${req.hostname}:${HTTPS_PORT}/remote`);
});

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

// Unauthenticated by design — used by scripts/update.sh's post-restart
// health check and anything else that just needs to confirm the API layer
// (not just the TCP port) is actually serving.
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Device-local CA certificate download (public by design — a CA cert is not a
// secret; only the .key is). Users open http://<host>:5000/ca.crt on their
// phone, install + trust it once, and the HTTPS remote gets a real padlock:
// mic access without warnings, service worker, warning-free installed PWA.
// The application/x-x509-ca-cert MIME type makes iOS offer the profile
// installer instead of showing the file as text.
app.get('/ca.crt', (req, res) => {
  const caPath = path.join(__dirname, '../certs/resonance-ca.crt');
  if (!fs.existsSync(caPath)) return res.status(404).send('CA not generated yet — run scripts/generate-certs.sh');
  res.type('application/x-x509-ca-cert');
  res.setHeader('Content-Disposition', 'attachment; filename="resonance-ca.crt"');
  res.send(fs.readFileSync(caPath));
});

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
// USB auto-play status/eject + NAS (SMB/NFS) share management — same base
// path, separate router (both live under /api/player/* alongside the rest of
// the storage-and-library surface).
app.use('/api/player', requireAuth, storageRouter);

// Spotify Connect daemon configuration routes
app.use('/api/spotify', requireAuth, spotifyDaemonRouter);

// Global system status — single-fetch snapshot for client connect/reconnect
app.use('/api/status', requireAuth, statusRouter);

// Premium album/artist metadata aggregator (on-demand, cached)
app.use('/api/metadata', requireAuth, metadataRouter);

// Fallback all non-API GET requests to index.html for Single Page App client
// routing. /api/* is deliberately excluded — it used to fall through to this
// handler too, so a typo'd/removed API endpoint returned the SPA shell with
// a 200 instead of a 404, which client code checking response.ok treated as
// success.
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// Central error handler — normalises anything thrown in a route (or passed to
// next(err)) into a consistent JSON shape. Must be registered last.
app.use(errorHandler);

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
  // Re-apply crossfade / ReplayGain — MPD doesn't persist these across restarts.
  applyPersistedMpdSettings();
  // Re-mount any saved NAS shares — mount.cifs/mount.nfs don't survive a reboot.
  remountPersistedNasShares();
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

if (httpsAvailable) {
  const httpsServer = https.createServer({
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
  }, app);

  // Reuse the same wss so kiosk (WS) and remote (WSS) share one client list + broadcast
  httpsServer.on('upgrade', (request, socket, head) => {
    let pathname;
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
