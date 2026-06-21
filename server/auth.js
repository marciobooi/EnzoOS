import crypto from 'crypto';
import { getSetting, setSetting } from './db.js';

// ─── Remote access authentication ─────────────────────────────────────────────
//
// The kiosk runs in a browser ON the Pi (http://localhost:5000) so every kiosk
// request and WebSocket arrives over the loopback interface. Those are trusted
// implicitly. Everything that reaches the box over the LAN (the phone remote on
// HTTP/HTTPS) must present a signed bearer token obtained from /api/auth/login.
//
// This closes the holes where any LAN device could:
//   • open /ws and immediately receive the Spotify access token, and
//   • POST to /api/player or /api/system to control / reboot / shut down the Pi.
//
// Tokens are HMAC-signed with a per-install secret kept in the DB, so they
// survive restarts and cannot be forged without the secret.

const DEFAULT_USERNAME = 'enzo';
const DEFAULT_PASSWORD = 'enzoOS';
const TOKEN_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — appliance on a home LAN

let cachedSecret = null;

async function getAuthSecret() {
  if (cachedSecret) return cachedSecret;
  let secret = await getSetting('auth_secret').catch(() => null);
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    await setSetting('auth_secret', secret);
    console.log('[Auth] Generated new remote-access signing secret.');
  }
  cachedSecret = secret;
  return secret;
}

async function getCredentials() {
  const [u, p] = await Promise.all([
    getSetting('remote_username').catch(() => null),
    getSetting('remote_password').catch(() => null),
  ]);
  return { username: u || DEFAULT_USERNAME, password: p || DEFAULT_PASSWORD };
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Validate username/password and return a signed token, or null on failure. */
export async function login(username, password) {
  const creds = await getCredentials();
  const userMatch = String(username ?? '') === creds.username;
  const passMatch = String(password ?? '') === creds.password;
  if (!userMatch || !passMatch) return null;
  return issueToken();
}

export async function issueToken() {
  const secret = await getAuthSecret();
  const payload = b64url(JSON.stringify({ exp: Date.now() + TOKEN_TTL_MS }));
  return `${payload}.${sign(payload, secret)}`;
}

export async function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return false;
  const [payloadB64, sig] = token.split('.');
  if (!payloadB64 || !sig) return false;
  const secret = await getAuthSecret();
  const expected = sign(payloadB64, secret);
  // timingSafeEqual requires equal lengths
  if (sig.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

/** True when the request originates from the loopback interface (the kiosk). */
export function isLoopback(req) {
  const addr = (req.socket?.remoteAddress || req.connection?.remoteAddress || '').replace('::ffff:', '');
  return addr === '127.0.0.1' || addr === '::1' || addr === 'localhost';
}

function extractBearer(req) {
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

/** Express middleware: allow loopback (kiosk) or a valid bearer token. */
export async function requireAuth(req, res, next) {
  try {
    if (isLoopback(req)) return next();
    const token = extractBearer(req);
    if (token && await verifyToken(token)) return next();
  } catch (err) {
    console.error('[Auth] requireAuth error:', err.message);
  }
  return res.status(401).json({ error: 'Unauthorized' });
}

/**
 * Authorize a WebSocket upgrade request. Loopback is always allowed; LAN clients
 * must pass a valid token in the query string (?token=...) since browsers cannot
 * set custom headers on the WebSocket handshake.
 */
export async function isWsAuthorized(request) {
  if (isLoopback(request)) return true;
  let token = null;
  try {
    token = new URL(request.url, 'http://localhost').searchParams.get('token');
  } catch {
    const q = (request.url || '').split('?')[1] || '';
    token = new URLSearchParams(q).get('token');
  }
  return verifyToken(token);
}
