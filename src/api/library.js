// Local library browse, genres, playlists, and listening stats.
export const libraryApi = {
  async getLibraryArtists() {
    const r = await fetch('/api/player/library/artists');
    return r.json();
  },

  async getLibraryAlbums(artist) {
    const url = artist
      ? `/api/player/library/albums?artist=${encodeURIComponent(artist)}`
      : '/api/player/library/albums';
    const r = await fetch(url);
    return r.json();
  },

  async getLibraryTracks(album, artist) {
    const params = new URLSearchParams();
    if (album) params.set('album', album);
    if (artist) params.set('artist', artist);
    const r = await fetch(`/api/player/library/tracks?${params}`);
    return r.json();
  },

  async searchLibrary(q, limit = 12) {
    const r = await fetch(`/api/player/library/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    if (!r.ok) return [];
    const d = await r.json();
    return d.tracks || [];
  },

  // ── Library genres ───────────────────────────────────────────────────────────
  async getLibraryGenres() {
    const r = await fetch('/api/player/library/genres');
    return r.json();
  },
  async getLibraryByGenre(genre) {
    const r = await fetch(`/api/player/library/by-genre?genre=${encodeURIComponent(genre)}`);
    return r.json();
  },

  // ── Playlists ────────────────────────────────────────────────────────────────
  async getPlaylists() {
    const r = await fetch('/api/player/playlists');
    return r.json();
  },
  async savePlaylist(name) {
    const r = await fetch(`/api/player/playlists/${encodeURIComponent(name)}/save`, { method: 'POST' });
    return r.json();
  },
  async deletePlaylist(name) {
    const r = await fetch(`/api/player/playlists/${encodeURIComponent(name)}`, { method: 'DELETE' });
    return r.json();
  },
  async playPlaylist(name) {
    const r = await fetch(`/api/player/playlists/${encodeURIComponent(name)}/play`, { method: 'POST' });
    return r.json();
  },

  // ── Stats ────────────────────────────────────────────────────────────────────
  async getStats() {
    const r = await fetch('/api/player/stats');
    return r.json();
  },
};
