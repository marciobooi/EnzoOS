// Last.fm scrobbling — submits the user's actual listens (the metadata module
// only READS artist/album info). Uses the desktop auth flow: the user creates
// an API account (key + shared secret) once, approves the app on last.fm, and
// the session key never expires. Scrobble rules per Last.fm docs: a track
// scrobbles when it played ≥30s AND (≥ half its duration OR ≥4 minutes);
// track changes also send updateNowPlaying.
import crypto from 'crypto';
import { getSetting, setSetting } from './db.js';

const API_ROOT = 'https://ws.audioscrobbler.com/2.0/';

let _fetch = null;
async function getFetch() {
  if (!_fetch) _fetch = (await import('node-fetch')).default;
  return _fetch;
}

async function creds() {
  const [key, secret, session, user] = await Promise.all([
    getSetting('lastfm_api_key').catch(() => null),
    getSetting('lastfm_api_secret').catch(() => null),
    getSetting('lastfm_session_key').catch(() => null),
    getSetting('lastfm_username').catch(() => null),
  ]);
  return {
    key: (key || process.env.LASTFM_API_KEY || '').trim(),
    secret: (secret || process.env.LASTFM_API_SECRET || '').trim(),
    session: (session || '').trim(),
    user: (user || '').trim(),
  };
}

// api_sig: md5 of "<name><value>" pairs sorted by name, then the secret
function sign(params, secret) {
  const base = Object.keys(params).sort().map(k => `${k}${params[k]}`).join('') + secret;
  return crypto.createHash('md5').update(base, 'utf8').digest('hex');
}

async function call(method, params, { key, secret }, httpPost = true) {
  const fetch = await getFetch();
  const p = { method, api_key: key, ...params };
  p.api_sig = sign(p, secret);
  p.format = 'json';
  const body = new URLSearchParams(p);
  const r = await fetch(httpPost ? API_ROOT : `${API_ROOT}?${body}`, httpPost
    ? { method: 'POST', body, headers: { 'User-Agent': 'ResonanceHiFi/1.0' } }
    : { headers: { 'User-Agent': 'ResonanceHiFi/1.0' } });
  const d = await r.json();
  if (d.error) throw new Error(`Last.fm ${method}: ${d.message || d.error}`);
  return d;
}

// ── auth flow ────────────────────────────────────────────────────────────────
export async function lastfmStatus() {
  const c = await creds();
  return { configured: !!(c.key && c.secret), connected: !!c.session, user: c.user || null };
}

export async function lastfmSaveKeys(key, secret) {
  await setSetting('lastfm_api_key', (key || '').trim());
  await setSetting('lastfm_api_secret', (secret || '').trim());
}

export async function lastfmGetAuthUrl() {
  const c = await creds();
  if (!c.key || !c.secret) throw new Error('Last.fm API key and secret are not configured');
  const d = await call('auth.getToken', {}, c, false);
  return { token: d.token, authUrl: `https://www.last.fm/api/auth/?api_key=${c.key}&token=${d.token}` };
}

export async function lastfmCompleteAuth(token) {
  const c = await creds();
  const d = await call('auth.getSession', { token }, c, false);
  await setSetting('lastfm_session_key', d.session.key);
  await setSetting('lastfm_username', d.session.name);
  return { connected: true, user: d.session.name };
}

export async function lastfmDisconnect() {
  await setSetting('lastfm_session_key', '');
  await setSetting('lastfm_username', '');
}

// ── scrobble engine (fed from the EventService playback stream) ─────────────
let current = null; // { sig, title, artist, album, startedAt, durationMs }

function trackOf(state) {
  const t = state?.track_window?.current_track;
  if (!t?.name) return null;
  const artist = t.artists?.[0]?.name || '';
  if (!artist || artist === 'Live Stream' || artist === 'Unknown') return null; // radio/unknown: don't scrobble
  return {
    sig: `${t.name}|${artist}`,
    title: t.name,
    artist,
    album: t.album?.name || '',
    durationMs: state?.duration || 0,
  };
}

async function submitScrobble(prev) {
  const c = await creds();
  if (!c.key || !c.secret || !c.session) return;
  const playedMs = Date.now() - prev.startedAt;
  const minMs = prev.durationMs > 0
    ? Math.min(prev.durationMs / 2, 4 * 60 * 1000)
    : 4 * 60 * 1000; // unknown duration: be conservative
  if (playedMs < 30_000 || playedMs < minMs) return;
  try {
    await call('track.scrobble', {
      sk: c.session,
      artist: prev.artist,
      track: prev.title,
      ...(prev.album ? { album: prev.album } : {}),
      timestamp: String(Math.floor(prev.startedAt / 1000)),
    }, c);
    console.log(`[Scrobbler] Scrobbled: ${prev.artist} — ${prev.title}`);
  } catch (e) {
    console.warn('[Scrobbler] scrobble failed:', e.message);
  }
}

async function submitNowPlaying(track) {
  const c = await creds();
  if (!c.key || !c.secret || !c.session) return;
  try {
    await call('track.updateNowPlaying', {
      sk: c.session,
      artist: track.artist,
      track: track.title,
      ...(track.album ? { album: track.album } : {}),
    }, c);
  } catch (e) {
    console.warn('[Scrobbler] nowPlaying failed:', e.message);
  }
}

export function scrobbleOnPlaybackChange(state) {
  const next = trackOf(state);
  const nextSig = next && !state?.paused ? next.sig : null;
  if (nextSig === (current?.sig || null)) return; // no transition
  const prev = current;
  current = nextSig ? { ...next, startedAt: Date.now() } : null;
  // finished/left a track → maybe scrobble it; started one → now playing
  if (prev) submitScrobble(prev);
  if (current) submitNowPlaying(current);
}
