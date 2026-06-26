const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

async function handleResponse(response) {
  if (response.status === 204) return { success: true };

  // 401: token expired. Kick off a server-side refresh so the WS SET_TOKEN
  // broadcast delivers the new token to all clients. Throw a clean message
  // so the caller's toast doesn't show the raw Spotify error body.
  if (response.status === 401) {
    fetch('/auth/spotify/token').catch(() => {});
    throw new Error('Spotify session expired — refreshing token, please retry.');
  }

  const text = await response.text();
  if (!text) {
    if (!response.ok) throw new Error(`Spotify API error ${response.status}`);
    return { success: true };
  }

  let data;
  try { data = JSON.parse(text); } catch {
    if (!response.ok) throw new Error(`Spotify API error ${response.status}`);
    return { success: true };
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Spotify API error ${response.status}`);
  }
  return data;
}

export const api = {

  /**
   * Fetches active Spotify Connect devices.
   */
  async getDevices(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/devices`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Transfers active playback to the specified device.
   */
  async transferPlayback(token, deviceId, play = true) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        device_ids: [deviceId],
        play: play
      })
    });
    return handleResponse(response);
  },

  /**
   * Resume or start playback on a device.
   */
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
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.status === 404) return { success: true, alreadyPaused: true };
    return handleResponse(response);
  },

  /**
   * Skip to next track.
   */
  async skipNext(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/next`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Skip to previous track.
   */
  async skipPrevious(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/previous`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      }
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
      headers: {
        'Authorization': `Bearer ${token}`
      }
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
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Gets current playback state metadata (track, progress, device, volume, etc).
   */
  async getPlaybackState(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.status === 204) return null; // No active playback
    return handleResponse(response);
  },

  /**
   * Searches Spotify for tracks, albums, playlists, and artists matching a query.
   */
  async searchTracks(token, query) {
    const response = await fetch(`${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=track&limit=10`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Full search across tracks, albums, playlists, and artists.
   */
  async searchAll(token, query, types = 'track,album,playlist,artist', limit = 10) {
    const response = await fetch(`${SPOTIFY_API_URL}/search?q=${encodeURIComponent(query)}&type=${types}&limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Fetches the current user's playlists.
   */
  async getUserPlaylists(token, limit = 30) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/playlists?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Fetches tracks from a specific playlist.
   */
  async getPlaylistTracks(token, playlistId, limit = 50) {
    const response = await fetch(`${SPOTIFY_API_URL}/playlists/${playlistId}/tracks?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Fetches the user's recently played tracks.
   */
  async getRecentlyPlayed(token, limit = 20) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/recently-played?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Fetches the user's top tracks.
   */
  async getUserTopTracks(token, limit = 20, timeRange = 'short_term') {
    const response = await fetch(`${SPOTIFY_API_URL}/me/top/tracks?limit=${limit}&time_range=${timeRange}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Fetches tracks from a specific album.
   */
  async getAlbumTracks(token, albumId, limit = 50) {
    const response = await fetch(`${SPOTIFY_API_URL}/albums/${albumId}/tracks?limit=${limit}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Sets shuffle mode for the user's playback.
   */
  async setShuffle(token, state, deviceId = null) {
    const url = new URL(`${SPOTIFY_API_URL}/me/player/shuffle`);
    url.searchParams.append('state', state ? 'true' : 'false');
    if (deviceId) url.searchParams.append('device_id', deviceId);

    const response = await fetch(url.toString(), {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
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
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    return handleResponse(response);
  },

  /**
   * Fetches the system OTA update status.
   */
  async getUpdateStatus() {
    const response = await fetch('/api/system/update/status');
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Failed to parse update status.');
    }
    if (!response.ok) {
      throw new Error(data?.error || 'System update status request failed.');
    }
    return data;
  },

  /**
   * Triggers the system OTA update execution.
   */
  async triggerUpdate() {
    const response = await fetch('/api/system/update', {
      method: 'POST'
    });
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Failed to parse update command response.');
    }
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to trigger OTA update.');
    }
    return data;
  },

  /**
   * Play local media.
   */
  async localPlay() {
    const response = await fetch('/api/player/play', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /**
   * Pause local media.
   */
  async localPause() {
    const response = await fetch('/api/player/pause', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /**
   * Skip next local media.
   */
  async localNext() {
    const response = await fetch('/api/player/next', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /**
   * Skip previous local media.
   */
  async localPrevious() {
    const response = await fetch('/api/player/previous', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /**
   * Set volume of local media.
   */
  async localSetVolume(volume) {
    const response = await fetch('/api/player/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume })
    });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /**
   * Seek local media.
   */
  async localGetStatus() {
    const response = await fetch('/api/player/status');
    return handleResponse(response);
  },

  async localSeek(position) {
    const response = await fetch('/api/player/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position })
    });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /**
   * Update Spotify daemon credentials.
   */
  async setSpotifyCredentials(username, password) {
    const response = await fetch('/api/spotify/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    let data;
    try {
      data = await response.json();
    } catch (err) {
      throw new Error('Failed to parse credentials response.');
    }
    if (!response.ok) {
      throw new Error(data?.error || 'Failed to update credentials.');
    }
    return data;
  },

  /**
   * Play web radio stream.
   */
  async localPlayRadio(url, name, favicon) {
    const response = await fetch('/api/player/play-radio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name, favicon })
    });
    return response.json();
  },

  /**
   * Fetch saved favorite radio stations.
   */
  async getFavoriteRadios() {
    const response = await fetch('/api/player/radios');
    return response.json();
  },

  /**
   * Save a station to favorites.
   */
  async addFavoriteRadio(station) {
    const response = await fetch('/api/player/radios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(station)
    });
    return response.json();
  },

  /**
   * Remove a station from favorites.
   */
  async deleteFavoriteRadio(url) {
    const response = await fetch('/api/player/radios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return response.json();
  },

  /**
   * Save CamillaDSP calibration settings.
   */
  async saveDspCalibration(answers) {
    const response = await fetch('/api/player/dsp-calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    return response.json();
  },

  /**
   * Fetch CamillaDSP calibration settings.
   */
  async getDspCalibration() {
    const response = await fetch('/api/player/dsp-calibration');
    return response.json();
  },

  /**
   * Fetch local CPU, RAM and Wi-Fi system telemetry.
   */
  async getSystemHealth() {
    const response = await fetch('/api/system/update/health');
    return response.json();
  },

  async getServices() {
    const r = await fetch('/api/system/services');
    return r.json();
  },

  /**
   * Premium album/artist metadata — aggregated from MusicBrainz, Last.fm and
   * TheAudioDB on the backend, cached. Called on demand when the user taps the
   * now-playing cover.
   */
  async getAlbumMetadata(artist, album) {
    const r = await fetch(`/api/metadata/album?artist=${encodeURIComponent(artist)}&album=${encodeURIComponent(album)}`);
    if (!r.ok) throw new Error('Metadata unavailable');
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

  async restartService(name) {
    const r = await fetch(`/api/system/service/${encodeURIComponent(name)}/restart`, { method: 'POST' });
    return r.json();
  },

  async rebootSystem() {
    const r = await fetch('/api/system/reboot', { method: 'POST' });
    return r.json();
  },

  async shutdownSystem() {
    const r = await fetch('/api/system/shutdown', { method: 'POST' });
    return r.json();
  },

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

  async getQueue() {
    const r = await fetch('/api/player/queue');
    return r.json();
  },

  async getSpotifyQueue(token) {
    const r = await fetch(`${SPOTIFY_API_URL}/me/player/queue`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return r.json();
  },

  async clearQueue() {
    const r = await fetch('/api/player/queue/clear', { method: 'POST' });
    return r.json();
  },

  async addToQueue(filePath, play = false) {
    const r = await fetch('/api/player/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, play }),
    });
    return r.json();
  },

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
