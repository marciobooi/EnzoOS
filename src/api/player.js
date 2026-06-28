// Local player transport, queue, and lyrics.
import { handleResponse } from './_client';

export const playerApi = {
  /** Play local media. */
  async localPlay() {
    const response = await fetch('/api/player/play', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /** Pause local media. */
  async localPause() {
    const response = await fetch('/api/player/pause', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /** Skip next local media. */
  async localNext() {
    const response = await fetch('/api/player/next', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /** Skip previous local media. */
  async localPrevious() {
    const response = await fetch('/api/player/previous', { method: 'POST' });
    if (response.status === 204) return { success: true };
    return response.json();
  },

  /** Set volume of local media. */
  async localSetVolume(volume) {
    const response = await fetch('/api/player/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume })
    });
    if (response.status === 204) return { success: true };
    return response.json();
  },

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

  async getQueue() {
    const r = await fetch('/api/player/queue');
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

  // ── Queue editing ────────────────────────────────────────────────────────────
  async getDetailedQueue() {
    const r = await fetch('/api/player/queue/detailed');
    return r.json();
  },
  async removeFromQueue(id) {
    const r = await fetch(`/api/player/queue/${id}`, { method: 'DELETE' });
    return r.json();
  },
  async moveInQueue(from, to) {
    const r = await fetch('/api/player/queue/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    return r.json();
  },

  // ── Lyrics ───────────────────────────────────────────────────────────────────
  async getLyrics(title, artist, album, duration) {
    const params = new URLSearchParams({ title, artist });
    if (album) params.set('album', album);
    if (duration) params.set('duration', duration);
    const r = await fetch(`/api/player/lyrics?${params}`);
    return r.json();
  },
};
