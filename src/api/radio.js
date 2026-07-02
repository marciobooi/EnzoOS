// Web radio playback + favorite stations.
import { handleJson } from './_client';

export const radioApi = {
  /** Play web radio stream. */
  async localPlayRadio(url, name, favicon) {
    const response = await fetch('/api/player/play-radio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, name, favicon })
    });
    return handleJson(response);
  },

  /** Fetch saved favorite radio stations. */
  async getFavoriteRadios() {
    const response = await fetch('/api/player/radios');
    return handleJson(response);
  },

  /** Save a station to favorites. */
  async addFavoriteRadio(station) {
    const response = await fetch('/api/player/radios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(station)
    });
    return handleJson(response);
  },

  /** Remove a station from favorites. */
  async deleteFavoriteRadio(url) {
    const response = await fetch('/api/player/radios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    return handleJson(response);
  },
};
