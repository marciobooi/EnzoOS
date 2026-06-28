// Play history + unified cross-source favorites.
export const historyApi = {
  // ── History ──────────────────────────────────────────────────────────────────
  async getHistory(limit = 50) {
    const r = await fetch(`/api/player/history?limit=${limit}`);
    return r.json();
  },
  async addToHistory(entry) {
    const r = await fetch('/api/player/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return r.json();
  },
  async clearHistory() {
    const r = await fetch('/api/player/history', { method: 'DELETE' });
    return r.json();
  },

  // ── Favorites ────────────────────────────────────────────────────────────────
  async getFavorites() {
    const r = await fetch('/api/player/favorites');
    return r.json();
  },
  async addFavorite(entry) {
    const r = await fetch('/api/player/favorites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return r.json();
  },
  async removeFavorite(id) {
    const r = await fetch(`/api/player/favorites/${id}`, { method: 'DELETE' });
    return r.json();
  },
  async removeFavoriteByUri(source, uri) {
    const r = await fetch('/api/player/favorites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, uri }),
    });
    return r.json();
  },
  async checkFavorite(source, uri) {
    const r = await fetch(`/api/player/favorites/check?source=${encodeURIComponent(source)}&uri=${encodeURIComponent(uri)}`);
    return r.json();
  },
};
