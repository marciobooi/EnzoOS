// Hi-res streaming services: Tidal (OAuth2 device flow) and Qobuz (user/pass).
export const streamingApi = {
  // ── Tidal (OAuth2 device flow) ──────────────────────────────────────────────
  async getTidalStatus() {
    const r = await fetch('/api/player/tidal/status');
    return r.json();
  },

  async tidalDeviceAuth() {
    const r = await fetch('/api/player/tidal/device-auth', { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || 'Tidal device auth failed');
    return d;
  },

  async tidalPoll(deviceCode) {
    const r = await fetch('/api/player/tidal/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceCode }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || 'Tidal poll failed');
    return d;
  },

  async tidalSearch(q) {
    const r = await fetch(`/api/player/tidal/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Search failed');
    return r.json();
  },

  async tidalPlayTrack(track) {
    const r = await fetch('/api/player/tidal/play-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || 'Playback failed');
    return d;
  },

  async tidalDisconnect() {
    const r = await fetch('/api/player/tidal/disconnect', { method: 'DELETE' });
    return r.json();
  },

  // ── Qobuz (username/password) ───────────────────────────────────────────────
  async getQobuzStatus() {
    const r = await fetch('/api/player/qobuz/status');
    return r.json();
  },

  async qobuzAuth(username, password) {
    const r = await fetch('/api/player/qobuz/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error || 'Qobuz auth failed');
    return data;
  },

  async qobuzSearch(q) {
    const r = await fetch(`/api/player/qobuz/search?q=${encodeURIComponent(q)}`);
    if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Search failed');
    return r.json();
  },

  async qobuzPlayTrack(track) {
    const r = await fetch('/api/player/qobuz/play-track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(track),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d?.error || 'Playback failed');
    return d;
  },

  async qobuzDisconnect() {
    const r = await fetch('/api/player/qobuz/disconnect', { method: 'DELETE' });
    return r.json();
  },
};
