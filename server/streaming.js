// ─── Tidal / Qobuz hi-res streaming backend ───────────────────────────────────
//
// These services have no official Linux SDK. The established approach used by
// HiFi appliances (Volumio / moOde / Audiophonics) is to resolve a track to its
// time-limited CDN stream URL via the service API, then hand that URL to the
// existing renderer. Here we hand it to MPD (`mpc add <url>`), which already
// feeds the ALSA loopback → CamillaDSP → DAC chain that web-radio uses — so no
// new audio plumbing is required and the DSP/volume stages apply unchanged.
//
// Auth tokens are cached in memory and persisted to the settings DB so they
// survive restarts. All network calls use Node's built-in fetch + crypto — no
// third-party packages (the maintained ones are Python-only and fragile).

import crypto from 'crypto';
import { getSetting, setSetting } from './db.js';

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex');

async function jfetch(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
  if (!res.ok) {
    const msg = data?.message || data?.userMessage || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ════════════════════════════════════════════════════════════════════════════
// QOBUZ
// ════════════════════════════════════════════════════════════════════════════
const QOBUZ_API = 'https://www.qobuz.com/api.json/0.2';

let qobuzApp = null;   // { app_id, app_secret }
let qobuzToken = null; // user_auth_token

// Qobuz signs getFileUrl requests with an app_secret. Advanced users can paste
// app_id/app_secret in the UI; otherwise we scrape them from the public web
// player bundle (the well-known "spoofbuz" technique).
async function getQobuzApp() {
  if (qobuzApp) return qobuzApp;

  const storedId = await getSetting('qobuz_app_id').catch(() => null);
  const storedSecret = await getSetting('qobuz_app_secret').catch(() => null);
  if (storedId && storedSecret) {
    qobuzApp = { app_id: storedId, app_secret: storedSecret };
    return qobuzApp;
  }

  // Scrape the login page → bundle.js → app_id + secret seeds.
  const login = await fetch('https://play.qobuz.com/login').then(r => r.text());
  const bundleMatch = login.match(/<script src="(\/resources\/[^"]+\/bundle\.js)"/);
  if (!bundleMatch) throw new Error('Qobuz: could not locate web-player bundle (provide app_id/app_secret manually)');
  const bundle = await fetch(`https://play.qobuz.com${bundleMatch[1]}`).then(r => r.text());

  const idMatch = bundle.match(/production:\{api:\{appId:"(\d+)",appSecret:"(\w+)"/);
  let app_id = idMatch?.[1] || bundle.match(/appId:"(\d+)"/)?.[1];
  let app_secret = idMatch?.[2];

  if (!app_secret) {
    // Seed/timezone secret reconstruction.
    const seedRe = /([a-z]\.initialSeed\(")(\w+)("\s*,\s*window\.utimezone\.)([a-z]+)\)/g;
    const seeds = {};
    for (const m of bundle.matchAll(seedRe)) {
      seeds[m[4]] = m[2];
    }
    const infoRe = /name:"\w+\/(Login|Default)",info:"(\w+)",extras:"(\w+)"/g;
    const infos = {};
    for (const m of bundle.matchAll(infoRe)) {
      infos[m[1].toLowerCase()] = { info: m[2], extras: m[3] };
    }
    // Try each timezone seed until one base64-decodes to a usable secret.
    for (const tz of Object.keys(seeds)) {
      const pair = infos[tz] || Object.values(infos)[0];
      if (!pair) continue;
      const base = seeds[tz] + pair.info + pair.extras;
      try {
        const candidate = Buffer.from(base.slice(0, -44), 'base64').toString('utf8');
        if (candidate && candidate.length >= 20) { app_secret = candidate; break; }
      } catch { /* try next */ }
    }
  }

  if (!app_id || !app_secret) {
    throw new Error('Qobuz: failed to derive app credentials — paste app_id/app_secret in settings');
  }
  await setSetting('qobuz_app_id', app_id);
  await setSetting('qobuz_app_secret', app_secret);
  qobuzApp = { app_id, app_secret };
  return qobuzApp;
}

export async function qobuzLogin(username, password) {
  const { app_id } = await getQobuzApp();
  // Qobuz accepts the password as an md5 hex digest.
  const params = new URLSearchParams({
    username, email: username, password: md5(password), app_id,
  });
  const data = await jfetch(`${QOBUZ_API}/user/login?${params}`);
  if (!data?.user_auth_token) throw new Error('Qobuz: invalid credentials');
  qobuzToken = data.user_auth_token;
  await setSetting('qobuz_token', qobuzToken);
  return qobuzToken;
}

async function qobuzAuthToken() {
  if (qobuzToken) return qobuzToken;
  const stored = await getSetting('qobuz_token').catch(() => null);
  if (stored) { qobuzToken = stored; return qobuzToken; }
  const u = await getSetting('qobuz_username').catch(() => null);
  const p = await getSetting('qobuz_password').catch(() => null);
  if (u && p) return qobuzLogin(u, p);
  throw new Error('Qobuz: not connected');
}

export async function qobuzSearch(query, limit = 25) {
  const { app_id } = await getQobuzApp();
  const token = await qobuzAuthToken();
  const params = new URLSearchParams({ query, limit: String(limit), app_id, user_auth_token: token });
  const data = await jfetch(`${QOBUZ_API}/track/search?${params}`);
  return (data?.tracks?.items || []).map(t => ({
    id: String(t.id),
    title: t.title,
    artist: t.performer?.name || t.album?.artist?.name || '',
    album: t.album?.title || '',
    cover: t.album?.image?.small || t.album?.image?.thumbnail || '',
    duration: (t.duration || 0) * 1000,
  }));
}

// formatId 27 = 24-bit hi-res, 6 = 16/44 lossless, 5 = MP3 320.
export async function qobuzTrackUrl(trackId, formatId = 27) {
  const { app_id, app_secret } = await getQobuzApp();
  const token = await qobuzAuthToken();
  const ts = Math.floor(Date.now() / 1000);
  const sig = md5(`trackgetFileUrlformat_id${formatId}intentstreamtrack_id${trackId}${ts}${app_secret}`);
  const params = new URLSearchParams({
    request_ts: String(ts), request_sig: sig, track_id: String(trackId),
    format_id: String(formatId), intent: 'stream', app_id, user_auth_token: token,
  });
  const data = await jfetch(`${QOBUZ_API}/track/getFileUrl?${params}`);
  if (!data?.url) throw new Error('Qobuz: no stream URL (subscription/region?)');
  return { url: data.url, sampleRate: data.sampling_rate, bitDepth: data.bit_depth };
}

// ════════════════════════════════════════════════════════════════════════════
// TIDAL  (OAuth2 device-code flow)
// ════════════════════════════════════════════════════════════════════════════
const TIDAL_AUTH = 'https://auth.tidal.com/v1/oauth2';
const TIDAL_API = 'https://api.tidal.com/v1';
// Public TV client used by the community python tidalapi for the device flow.
const TIDAL_CLIENT_ID = process.env.TIDAL_CLIENT_ID || 'zU4XHVVkc2tDPo4t';
const TIDAL_CLIENT_SECRET = process.env.TIDAL_CLIENT_SECRET || 'VJKhDFqJPqvsPVNBV6ukXTJmwlvbttP7wlMlrc72se4=';

let tidalSession = null; // { accessToken, refreshToken, countryCode, expiresAt }

async function tidalLoad() {
  if (tidalSession) return tidalSession;
  const raw = await getSetting('tidal_session').catch(() => null);
  if (raw) { try { tidalSession = JSON.parse(raw); } catch { tidalSession = null; } }
  return tidalSession;
}

async function tidalSave(s) {
  tidalSession = s;
  await setSetting('tidal_session', JSON.stringify(s));
}

// Step 1: ask Tidal for a device + user code. The user authorises at the link.
export async function tidalDeviceAuth() {
  const body = new URLSearchParams({ client_id: TIDAL_CLIENT_ID, scope: 'r_usr w_usr' });
  const data = await jfetch(`${TIDAL_AUTH}/device_authorization`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  return {
    deviceCode: data.deviceCode,
    userCode: data.userCode,
    verificationUri: `https://${data.verificationUriComplete || `link.tidal.com/${data.userCode}`}`,
    interval: data.interval || 2,
    expiresIn: data.expiresIn || 300,
  };
}

// Step 2: poll until the user finishes authorising in their browser.
export async function tidalPollToken(deviceCode) {
  const basic = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    client_id: TIDAL_CLIENT_ID, device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code', scope: 'r_usr w_usr',
  });
  const res = await fetch(`${TIDAL_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 400 && data.error === 'authorization_pending') return { pending: true };
  if (!res.ok || !data.access_token) throw new Error(data.error_description || 'Tidal authorization failed');
  await tidalSave({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    countryCode: data.user?.countryCode || 'US',
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
  });
  return { pending: false, connected: true };
}

async function tidalAccessToken() {
  const s = await tidalLoad();
  if (!s?.accessToken) throw new Error('Tidal: not connected');
  if (Date.now() < s.expiresAt - 60000) return s;
  // Refresh.
  const basic = Buffer.from(`${TIDAL_CLIENT_ID}:${TIDAL_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    client_id: TIDAL_CLIENT_ID, refresh_token: s.refreshToken, grant_type: 'refresh_token', scope: 'r_usr w_usr',
  });
  const data = await jfetch(`${TIDAL_AUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body,
  });
  const next = { ...s, accessToken: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  await tidalSave(next);
  return next;
}

export async function tidalSearch(query, limit = 25) {
  const s = await tidalAccessToken();
  const params = new URLSearchParams({ query, limit: String(limit), countryCode: s.countryCode });
  const data = await jfetch(`${TIDAL_API}/search/tracks?${params}`, {
    headers: { Authorization: `Bearer ${s.accessToken}` },
  });
  return (data?.items || []).map(t => ({
    id: String(t.id),
    title: t.title,
    artist: (t.artists || []).map(a => a.name).join(', ') || t.artist?.name || '',
    album: t.album?.title || '',
    cover: t.album?.cover ? `https://resources.tidal.com/images/${t.album.cover.replace(/-/g, '/')}/320x320.jpg` : '',
    duration: (t.duration || 0) * 1000,
  }));
}

export async function tidalTrackUrl(trackId, quality = 'LOSSLESS') {
  const s = await tidalAccessToken();
  const params = new URLSearchParams({
    audioquality: quality, playbackmode: 'STREAM', assetpresentation: 'FULL',
  });
  const data = await jfetch(`${TIDAL_API}/tracks/${trackId}/playbackinfopostpaywall?${params}`, {
    headers: { Authorization: `Bearer ${s.accessToken}` },
  });
  // Non-DASH qualities return a base64 JSON manifest containing direct URLs.
  if (data?.manifestMimeType === 'application/vnd.tidal.bts' && data.manifest) {
    const manifest = JSON.parse(Buffer.from(data.manifest, 'base64').toString('utf8'));
    const url = manifest.urls?.[0];
    if (!url) throw new Error('Tidal: empty manifest');
    return { url, codec: manifest.codecs };
  }
  throw new Error('Tidal: unsupported stream manifest (try LOSSLESS quality)');
}

// ── Status helpers ────────────────────────────────────────────────────────────
export async function qobuzConnected() {
  const u = await getSetting('qobuz_username').catch(() => null);
  const t = await getSetting('qobuz_token').catch(() => null);
  return !!(u || t);
}

export async function tidalConnected() {
  const s = await tidalLoad();
  return !!s?.accessToken;
}

export function clearQobuz() { qobuzToken = null; }
export function clearTidal() { tidalSession = null; }
