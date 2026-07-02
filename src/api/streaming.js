// Hi-res streaming services: Tidal (OAuth2 device flow) and Qobuz (user/pass).
import { handleJson } from './_client';

export const streamingApi = {
  // ── Tidal (OAuth2 device flow) ──────────────────────────────────────────────
  async getTidalStatus() {
    const r = await fetch('/api/player/tidal/status');
    return handleJson(r);
  },

  async tidalDeviceAuth() {
    const r = await fetch('/api/player/tidal/device-auth', { method: 'POST' });
    return handleJson(r, 'Tidal device auth failed');
  },

  async tidalPoll(deviceCode) {
    const r = await fetch('/api/player/tidal/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    return handleJson(r, 'Tidal poll failed');
  },

  async tidalSearch(q) {
    const r = await fetch(`/api/player/tidal/search?q=${encodeURIComponent(q)}`);
    return handleJson(r, 'Search failed');
  },

  async tidalPlayTrack(track) {
    const r = await fetch('/api/player/tidal/play-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    });
    return handleJson(r, 'Playback failed');
  },

  async tidalDisconnect() {
    const r = await fetch('/api/player/tidal/disconnect', { method: 'DELETE' });
    return handleJson(r);
  },

  // ── Qobuz (username/password) ───────────────────────────────────────────────
  async getQobuzStatus() {
    const r = await fetch('/api/player/qobuz/status');
    return handleJson(r);
  },

  async qobuzAuth(username, password) {
    const r = await fetch('/api/player/qobuz/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return handleJson(r, 'Qobuz auth failed');
  },

  async qobuzSearch(q) {
    const r = await fetch(`/api/player/qobuz/search?q=${encodeURIComponent(q)}`);
    return handleJson(r, 'Search failed');
  },

  async qobuzPlayTrack(track) {
    const r = await fetch('/api/player/qobuz/play-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    });
    return handleJson(r, 'Playback failed');
  },

  async qobuzDisconnect() {
    const r = await fetch('/api/player/qobuz/disconnect', { method: 'DELETE' });
    return handleJson(r);
  },
};
