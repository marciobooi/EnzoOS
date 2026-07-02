// Play history + unified cross-source favorites.
import { handleJson } from './_client';

export const historyApi = {
  // ── History ──────────────────────────────────────────────────────────────────
  async getHistory(limit = 50) {
    const r = await fetch(`/api/player/history?limit=${limit}`);
    return handleJson(r);
  },
  async addToHistory(entry) {
    const r = await fetch('/api/player/history', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return handleJson(r);
  },
  async clearHistory() {
    const r = await fetch('/api/player/history', { method: 'DELETE' });
    return handleJson(r);
  },

  // ── Favorites ────────────────────────────────────────────────────────────────
  async getFavorites() {
    const r = await fetch('/api/player/favorites');
    return handleJson(r);
  },
  async addFavorite(entry) {
    const r = await fetch('/api/player/favorites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    return handleJson(r);
  },
  async removeFavorite(id) {
    const r = await fetch(`/api/player/favorites/${id}`, { method: 'DELETE' });
    return handleJson(r);
  },
  async removeFavoriteByUri(source, uri) {
    const r = await fetch('/api/player/favorites', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, uri }),
    });
    return handleJson(r);
  },
  async checkFavorite(source, uri) {
    const r = await fetch(`/api/player/favorites/check?source=${encodeURIComponent(source)}&uri=${encodeURIComponent(uri)}`);
    return handleJson(r);
  },
};
