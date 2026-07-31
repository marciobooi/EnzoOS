// Spotify Web API (token-based) + Spotify daemon credentials.
import { SPOTIFY_API_URL, handleResponse } from './_client.js';

export const spotifyApi = {
  /**
   * Save a track to the user's Spotify library (like-sync for favorites).
   * Spotify's Feb 2026 API changes retired the track-specific /me/tracks
   * endpoint in favor of a unified /me/library one that takes full URIs
   * (not bare IDs), comma-separated in the `uris` query param — verified
   * directly against Spotify's reference docs and a live round-trip test;
   * it is NOT a JSON body despite the migration guide's prose implying one.
   * `body: ''` is required, not cosmetic: Spotify's edge rejects a
   * PUT/DELETE with no Content-Length header at all (411), which is what a
   * `fetch()` with no `body` key sends — an explicit empty-string body is
   * what actually gets a browser to attach `Content-Length: 0`.
   */
  async saveTrack(token, trackId) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` },
      body: '',
    });
    if (!response.ok) throw new Error(`Spotify save failed (${response.status})`);
    return true;
  },

  /** Remove a track from the user's Spotify library. */
  async removeSavedTrack(token, trackId) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/library?uris=${encodeURIComponent(`spotify:track:${trackId}`)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
      body: '',
    });
    if (!response.ok) throw new Error(`Spotify unsave failed (${response.status})`);
    return true;
  },

  /** Fetches active Spotify Connect devices. */
  async getDevices(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/devices`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Transfers active playback to the specified device. */
  async transferPlayback(token, deviceId, play = true) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ device_ids: [deviceId], play: play })
    });
    return handleResponse(response);
  },

  /** Resume or start playback on a device. */
  async play(token, deviceId = null, contextUri = null, uris = null) {
    const url = new URL(`${SPOTIFY_API_URL}/me/player/play`);
    if (deviceId) {
      url.searchParams.append('device_id', deviceId);
    }

    const body = {};
    if (contextUri) body.context_uri = contextUri;
    if (uris) body.uris = uris;

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
    });
    return handleResponse(response);
  },

  /**
   * Pause active playback. 404 means Spotify already considers playback stopped —
   * treat as success so the UI syncs rather than showing an error.
   */
  async pause(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/pause`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 404) return { success: true, alreadyPaused: true };
    return handleResponse(response);
  },

  /** Skip to next track. */
  async skipNext(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/next`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Skip to previous track. */
  async skipPrevious(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/previous`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /**
   * Set volume of current playback.
   * @param {string} token
   * @param {number} volumePercent (0 - 100)
   */
  async setVolume(token, volumePercent) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/volume?volume_percent=${volumePercent}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /**
   * Seek to position in currently playing track.
   * @param {string} token
   * @param {number} positionMs
   */
  async seek(token, positionMs) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/seek?position_ms=${positionMs}`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Gets current playback state metadata (track, progress, device, volume, etc). */
  async getPlaybackState(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.status === 204) return null; // No active playback
    return handleResponse(response);
  },

  /** Searches Spotify for tracks, albums, playlists, and artists matching a query. */
  async searchTracks(token, query) {
    const response = await fetch(`${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Full search across tracks, albums, playlists, and artists. */
  async searchAll(token, query, types = 'track,album,playlist,artist', limit = 10) {
    const response = await fetch(`${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=${types}&limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Fetches the current user's playlists. */
  async getUserPlaylists(token, limit = 30) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/playlists?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /**
   * Fetches the user's saved ("Liked Songs") tracks. This is a library
   * collection, not a real playlist — Spotify's /me/playlists endpoint has
   * never included it, by design, which is why it's fetched separately here.
   * Untouched by the Feb 2026 API changes (those only renamed the *mutating*
   * save/remove/contains calls to /me/library; GET /me/tracks for listing is
   * unaffected — verified live against the real API).
   */
  async getSavedTracks(token, limit = 50) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/tracks?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /**
   * Fetches tracks from a specific playlist. Spotify's Feb 2026 API changes
   * renamed this endpoint from /playlists/{id}/tracks to /playlists/{id}/items
   * — each returned entry's `track` field is now called `item` too (see
   * callers of this function).
   */
  async getPlaylistTracks(token, playlistId, limit = 50) {
    const response = await fetch(`${SPOTIFY_API_URL}/playlists/${playlistId}/items?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Fetches the user's recently played tracks. */
  async getRecentlyPlayed(token, limit = 20) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/recently-played?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Fetches the user's top tracks. */
  async getUserTopTracks(token, limit = 20, timeRange = 'short_term') {
    const response = await fetch(`${SPOTIFY_API_URL}/me/top/tracks?limit=${limit}&time_range=${timeRange}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Fetches tracks from a specific album. */
  async getAlbumTracks(token, albumId, limit = 50) {
    const response = await fetch(`${SPOTIFY_API_URL}/albums/${albumId}/tracks?limit=${limit}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /** Sets shuffle mode for the user's playback. */
  async setShuffle(token, state, deviceId = null) {
    const url = new URL(`${SPOTIFY_API_URL}/me/player/shuffle`);
    url.searchParams.append('state', state ? 'true' : 'false');
    if (deviceId) url.searchParams.append('device_id', deviceId);

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  /**
   * Sets repeat mode for the user's playback.
   * @param {string} state - 'off', 'track', or 'context'
   */
  async setRepeat(token, state, deviceId = null) {
    const url = new URL(`${SPOTIFY_API_URL}/me/player/repeat`);
    url.searchParams.append('state', state);
    if (deviceId) url.searchParams.append('device_id', deviceId);

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return handleResponse(response);
  },

  async getSpotifyQueue(token) {
    const r = await fetch(`${SPOTIFY_API_URL}/me/player/queue`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return r.json();
  },

  /** Update Spotify daemon credentials. */
  async setSpotifyCredentials(username, password) {
    const response = await fetch('/api/spotify/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error('Failed to parse credentials response.');
    }
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to update credentials.');
    }
    return data;
  },
};
