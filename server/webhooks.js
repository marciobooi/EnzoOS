// Outbound webhooks — fire-and-forget POSTs to one user-configured URL so
// automations (Home Assistant, Node-RED, generic relays) can react to player
// events without polling. Configure via GET/POST /api/system/webhook; empty
// URL disables. Payload shape: { event, ts, ...data }.
// Events: playing | paused | track-change | source | standby
import { getSetting } from './db.js';

let cachedUrl = null;
let cachedAt = 0;
const URL_TTL = 30_000; // one settings read per 30s, not per event

async function webhookUrl() {
  if (Date.now() - cachedAt < URL_TTL) return cachedUrl;
  try { cachedUrl = (await getSetting('webhook_url')) || null; } catch { cachedUrl = null; }
  cachedAt = Date.now();
  return cachedUrl;
}

export function invalidateWebhookUrl() { cachedAt = 0; }

export async function fireWebhook(event, data = {}) {
  const url = await webhookUrl();
  if (!url) return;
  try {
    const fetch = (await import('node-fetch')).default;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'ResonanceHiFi/1.0' },
      body: JSON.stringify({ event, ts: new Date().toISOString(), ...data }),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (e) {
    // an unreachable automation endpoint must never affect playback
    console.warn('[Webhook] delivery failed:', e.message);
  }
}

// BROADCAST_STATE arrives every few seconds from polling clients — only real
// transitions become webhooks. Track change beats play/pause when both flip.
let prevTrackSig = null;
let prevPaused = null;

export function fireOnPlaybackChange(state) {
  const track = state?.track_window?.current_track;
  const trackSig = `${track?.name || ''}|${track?.artists?.[0]?.name || ''}`;
  const paused = !!state?.paused;
  const first = prevTrackSig === null;
  const trackChanged = trackSig !== prevTrackSig;
  const pausedChanged = paused !== prevPaused;
  prevTrackSig = trackSig;
  prevPaused = paused;
  if (first || (!trackChanged && !pausedChanged)) return;
  const data = {
    title: track?.name || null,
    artist: track?.artists?.[0]?.name || null,
    album: track?.album?.name || null,
    playing: !paused,
  };
  fireWebhook(trackChanged && track?.name ? 'track-change' : (paused ? 'paused' : 'playing'), data);
}
