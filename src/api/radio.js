// Web radio playback + favorite stations.
export const radioApi = {
  /** Play web radio stream. */
  async localPlayRadio(url, name, favicon) {
    const response = await fetch('/api/player/play-radio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name, favicon })
    });
    return response.json();
  },

  /** Fetch saved favorite radio stations. */
  async getFavoriteRadios() {
    const response = await fetch('/api/player/radios');
    return response.json();
  },

  /** Save a station to favorites. */
  async addFavoriteRadio(station) {
    const response = await fetch('/api/player/radios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(station)
    });
    return response.json();
  },

  /** Remove a station from favorites. */
  async deleteFavoriteRadio(url) {
    const response = await fetch('/api/player/radios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return response.json();
  },
};
