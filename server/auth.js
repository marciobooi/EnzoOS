import crypto from 'crypto';
import { getSetting, setSetting } from './db.js';
import { sendError, unauthorized } from './lib/errors.js';

// ─── Remote access authentication ─────────────────────────────────────────────
//
// The kiosk runs in a browser ON the Pi (http://localhost:5000) so every kiosk
// request and WebSocket arrives over the loopback interface. Those are trusted
// implicitly. Everything that reaches the box over the LAN (the phone remote on
// HTTP/HTTPS) must present a signed bearer token.
//
// Authentication is QR-code-only: no username/password. The kiosk generates a
// short-lived (10 min) single-use token and bakes it into the remote URL as
// ?qr=<token>. The remote page redeems it for a long-lived (30-day) bearer
// token stored in a cookie (the cookie itself is set to expire after 365
// days, but the signed token embedded in it stops verifying after 30 — the
// remote silently drops back to the QR gate at that point, requiring
// re-pairing). Tokens are HMAC-signed with a per-install secret kept in the
// DB, so they survive restarts and cannot be forged without the secret.
//
// There is no way to revoke a single issued token short of rotating
// `auth_secret` (which invalidates every outstanding token — every paired
// device needs to re-scan the QR code). Fine for a single-household
// appliance; would need a per-token ID + revocation list for multi-tenant use.

const TOKEN_TTL_MS    = 30 * 24 * 60 * 60 * 1000;  // 30-day bearer session
const QR_TTL_MS       = 10 * 60 * 1000;             // 10 min QR token

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

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(payloadB64, secret) {
  return crypto.createHmac('sha256', secret).update(payloadB64).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  return sendError(res, unauthorized());
}

/**
 * Authorize a WebSocket upgrade request. Loopback is always allowed; LAN clients
 * must pass a valid token in the query string (?token=...) since browsers cannot
 * set custom headers on the WebSocket handshake.
 */
export async function isWsAuthorized(request) {
  if (isLoopback(request)) return true;
  let token;
  try {
    token = new URL(request.url, 'http://localhost').searchParams.get('token');
  } catch {
    const q = (request.url || '').split('?')[1] || '';
    token = new URLSearchParams(q).get('token');
  }
  return verifyToken(token);
}

// ─── QR token store ────────────────────────────────────────────────────────────
// Map: token → expiresAt (ms). Single-use; auto-pruned every minute.
//
// DB-backed (write-through cache over the settings table): these used to be
// purely in-memory, which meant every server restart — OTA update, deploy,
// crash recovery — silently invalidated whatever QR/pairing code the kiosk
// was displaying at that moment. The user then scanned a perfectly
// fresh-looking code and got "invalid or expired" (hit live on the real Pi
// after a deploy restart). Tokens are only 10-minute/single-use so the
// store stays tiny; persisting it makes pairing indifferent to restarts.

const qrTokens = new Map();
// 6-digit fallback code → full token. iOS home-screen PWAs use a data store
// isolated from regular Safari — completing the QR scan via the phone's
// camera app opens the link in *Safari*, which redeems the token into
// Safari's own cookie jar, not the already-installed standalone app's.
// The standalone app has no way to receive that redemption at all (no URL
// navigation happens inside it), so it's stuck on the gate screen forever
// even though "open the link in Safari directly" works. A short code the
// user can type by hand, read straight off the kiosk screen, sidesteps
// cross-context navigation entirely — the standalone app redeems it via a
// plain fetch() from within its own already-open page.
const qrCodes = new Map();

let qrStoreLoaded = false;

async function loadQrStore() {
  if (qrStoreLoaded) return;
  qrStoreLoaded = true;
  try {
    const raw = await getSetting('qr_token_store');
    if (!raw) return;
    const { tokens = {}, codes = {} } = JSON.parse(raw);
    const now = Date.now();
    for (const [t, exp] of Object.entries(tokens)) if (exp > now) qrTokens.set(t, exp);
    for (const [code, t] of Object.entries(codes)) if (qrTokens.has(t)) qrCodes.set(code, t);
  } catch (err) {
    console.warn('[Auth] Could not load QR token store:', err.message);
  }
}

function persistQrStore() {
  const payload = JSON.stringify({
    tokens: Object.fromEntries(qrTokens),
    codes: Object.fromEntries(qrCodes),
  });
  setSetting('qr_token_store', payload).catch(err =>
    console.warn('[Auth] Could not persist QR token store:', err.message));
}

setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [t, exp] of qrTokens) if (exp <= now) { qrTokens.delete(t); changed = true; }
  for (const [code, t] of qrCodes) if (!qrTokens.has(t)) { qrCodes.delete(code); changed = true; }
  if (changed) persistQrStore();
}, 60_000);

/**
 * Generate a short-lived single-use QR token, plus a 6-digit code that
 * redeems the same underlying token (manual-entry fallback for contexts
 * where following the QR's URL isn't possible/useful — see qrCodes above).
 * Returns { token, code, expiresAt, ttlSeconds } — caller appends token to
 * the remote URL and displays code alongside the QR image.
 */
export async function generateQrToken() {
  await loadQrStore();
  const token = crypto.randomBytes(24).toString('hex');
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + QR_TTL_MS;
  qrTokens.set(token, expiresAt);
  qrCodes.set(code, token);
  persistQrStore();
  return { token, code, expiresAt, ttlSeconds: QR_TTL_MS / 1000 };
}

/**
 * Redeem a QR token for a long-lived bearer token (one-time use).
 * Returns a signed bearer string on success, null if invalid/expired.
 */
export async function redeemQrToken(qrToken) {
  if (!qrToken || typeof qrToken !== 'string') return null;
  await loadQrStore();
  const exp = qrTokens.get(qrToken);
  if (!exp || Date.now() > exp) {
    if (qrTokens.delete(qrToken)) persistQrStore();
    return null;
  }
  qrTokens.delete(qrToken); // one-time use
  persistQrStore();
  return issueToken();
}

/**
 * Redeem a 6-digit pairing code for the same bearer token a QR scan would
 * produce. Same one-time-use / expiry semantics as redeemQrToken, since it
 * resolves to and consumes the same underlying token.
 */
export async function redeemPairCode(code) {
  if (!code || typeof code !== 'string') return null;
  await loadQrStore();
  const token = qrCodes.get(code);
  if (!token) return null;
  qrCodes.delete(code);
  return redeemQrToken(token); // persists via redeemQrToken
}
