// Premium album/artist metadata aggregation + provider keys.
export const metadataApi = {
  /**
   * Premium album/artist metadata — aggregated from MusicBrainz, Last.fm and
   * TheAudioDB on the backend, cached. Called on demand when the user taps the
   * now-playing cover.
   */
  async getAlbumMetadata(artist, album, lang) {
    const langParam = lang ? `&lang=${encodeURIComponent(lang)}` : '';
    const r = await fetch(`/api/metadata/album?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}${langParam}`);
    if (!r.ok) throw new Error('Metadata unavailable');
    return r.json();
  },

  /**
   * Best-effort cover art for a live radio "now playing" track (artist +
   * title only — radio's ICY metadata never carries an album). Returns
   * { artworkUrl: string|null } — null means no match, not an error; the
   * caller falls back to the station's own icon.
   */
  async getTrackArt(artist, title) {
    const r = await fetch(`/api/metadata/track-art?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`);
    if (!r.ok) throw new Error('Track art unavailable');
    return r.json();
  },

  /** Current metadata provider keys (pre-fills the Settings form). */
  async getMetadataKeys() {
    const r = await fetch('/api/metadata/keys');
    if (!r.ok) throw new Error('Could not load keys');
    return r.json();
  },

  /** Save metadata provider keys to the DB. */
  async setMetadataKeys(keys) {
    const r = await fetch('/api/metadata/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys),
    });
    if (!r.ok) throw new Error('Could not save keys');
    return r.json();
  },
};
