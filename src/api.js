const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

/**
 * Helper to process Spotify Web API responses.
 * Note: Spotify endpoints can return empty 204 responses on actions (play, pause, next).
 */
async function handleResponse(response) {
  if (response.status === 204) {
    return { success: true };
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error('Could not parse response from Spotify API.');
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Spotify API failed with status ${response.status}`);
  }
  return data;
}

export const api = {
  /**
   * Refreshes the Spotify access token via the local Express proxy.
   * @param {string} refreshToken 
   */
  async refreshToken(refreshToken) {
    const response = await fetch('/api/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || 'Failed to refresh token');
    }

    return response.json();
  },

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
   * Pause active playback.
   */
  async pause(token) {
    const response = await fetch(`${SPOTIFY_API_URL}/me/player/pause`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
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
   * Searches for track items on Spotify matching a query.
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
  }
};
