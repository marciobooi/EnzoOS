// Local library browse, genres, playlists, and listening stats.
import { handleJson } from './_client';

export const libraryApi = {
  async getLibraryArtists() {
    const r = await fetch('/api/player/library/artists');
    return handleJson(r);
  },

  async getLibraryAlbums(artist) {
    const url = artist
      ? `/api/player/library/albums?artist=${encodeURIComponent(artist)}`
      : '/api/player/library/albums';
    const r = await fetch(url);
    return handleJson(r);
  },

  async getLibraryTracks(album, artist) {
    const params = new URLSearchParams();
    if (album) params.set('album', album);
    if (artist) params.set('artist', artist);
    const r = await fetch(`/api/player/library/tracks?${params}`);
    return handleJson(r);
  },

  async searchLibrary(q, limit = 12) {
    const r = await fetch(`/api/player/library/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    // Search is used inline in multi-source Promise.allSettled combos (see
    // UniversalSearch/TrackSearch) — degrade to an empty result instead of
    // throwing so one failing source doesn't blank the whole search UI.
    if (!r.ok) return [];
    const d = await handleJson(r);
    return d.tracks || [];
  },

  // ── Library genres ───────────────────────────────────────────────────────────
  async getLibraryGenres() {
    const r = await fetch('/api/player/library/genres');
    return handleJson(r);
  },
  async getLibraryByGenre(genre) {
    const r = await fetch(`/api/player/library/by-genre?genre=${encodeURIComponent(genre)}`);
    return handleJson(r);
  },

  // ── Playlists ────────────────────────────────────────────────────────────────
  async getPlaylists() {
    const r = await fetch('/api/player/playlists');
    return handleJson(r);
  },
  async savePlaylist(name) {
    const r = await fetch(`/api/player/playlists/${encodeURIComponent(name)}/save`, { method: 'POST' });
    return handleJson(r);
  },
  async deletePlaylist(name) {
    const r = await fetch(`/api/player/playlists/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return handleJson(r);
  },
  async playPlaylist(name) {
    const r = await fetch(`/api/player/playlists/${encodeURIComponent(name)}/play`, { method: 'POST' });
    return handleJson(r);
  },

  // ── Stats ────────────────────────────────────────────────────────────────────
  async getStats() {
    const r = await fetch('/api/player/stats');
    return handleJson(r);
  },

  // ── Smart playlists ──────────────────────────────────────────────────────────
  async getMostPlayed(limit = 50) {
    const r = await fetch(`/api/player/library/smart/most-played?limit=${limit}`);
    return handleJson(r);
  },
  async getRecentlyAdded(limit = 50) {
    const r = await fetch(`/api/player/library/smart/recently-added?limit=${limit}`);
    return handleJson(r);
  },
};
