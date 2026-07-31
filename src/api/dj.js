// DJ mode — starts/stops the server-side local-library voice-announcer
// session (server/dj.js). Deliberately tiny and isolated: deleting this
// file + its two lines in src/api.js removes the client-side API surface
// completely.
import { handleJson } from './_client';

export const djApi = {
  async startDjMode() {
    const response = await fetch('/api/dj/start', { method: 'POST' });
    return handleJson(response);
  },

  async stopDjMode() {
    const response = await fetch('/api/dj/stop', { method: 'POST' });
    return handleJson(response);
  },

  // mood: one of server/dj.js's MOOD_IDS, or null to clear it (back to a
  // random energy per line). While DJ mode is running this also pivots the
  // lineup immediately.
  async setDjMood(mood) {
    const response = await fetch('/api/dj/mood', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mood }),
    });
    return handleJson(response);
  },
};
