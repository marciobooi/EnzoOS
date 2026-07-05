// Local player transport, queue, and lyrics.
import { handleResponse, handleJson } from './_client';

export const playerApi = {
  /** Play local media. */
  async localPlay() {
    const response = await fetch('/api/player/play', { method: 'POST' });
    return handleJson(response);
  },

  /** Pause local media. */
  async localPause() {
    const response = await fetch('/api/player/pause', { method: 'POST' });
    return handleJson(response);
  },

  /** Skip next local media. */
  async localNext() {
    const response = await fetch('/api/player/next', { method: 'POST' });
    return handleJson(response);
  },

  /** Skip previous local media. */
  async localPrevious() {
    const response = await fetch('/api/player/previous', { method: 'POST' });
    return handleJson(response);
  },

  /** Set volume of local media. */
  async localSetVolume(volume) {
    const response = await fetch('/api/player/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume })
    });
    return handleJson(response);
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
    return handleJson(response);
  },

  async getQueue() {
    const r = await fetch('/api/player/queue');
    return handleJson(r);
  },

  async clearQueue() {
    const r = await fetch('/api/player/queue/clear', { method: 'POST' });
    return handleJson(r);
  },

  async addToQueue(filePath, play = false) {
    const r = await fetch('/api/player/queue/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath, play }),
    });
    return handleJson(r);
  },

  async addManyToQueue(paths, play = false) {
    const r = await fetch('/api/player/queue/add-many', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, play }),
    });
    return handleJson(r);
  },

  // ── Queue editing ────────────────────────────────────────────────────────────
  async getDetailedQueue() {
    const r = await fetch('/api/player/queue/detailed');
    return handleJson(r);
  },
  async removeFromQueue(id) {
    const r = await fetch(`/api/player/queue/${id}`, { method: 'DELETE' });
    return handleJson(r);
  },
  async moveInQueue(from, to) {
    const r = await fetch('/api/player/queue/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to }),
    });
    return handleJson(r);
  },

  // ── Lyrics ───────────────────────────────────────────────────────────────────
  async getLyrics(title, artist, album, duration) {
    const params = new URLSearchParams({ title, artist });
    if (album) params.set('album', album);
    if (duration) params.set('duration', duration);
    const r = await fetch(`/api/player/lyrics?${params}`);
    return handleJson(r);
  },

  // ── USB drive (auto-mounted by udev, see scripts/usb-automount.sh) ──────────
  async getUsbStatus() {
    const r = await fetch('/api/player/usb/status');
    return handleJson(r);
  },
  async ejectUsb() {
    const r = await fetch('/api/player/usb/eject', { method: 'POST' });
    return handleJson(r);
  },

  // ── NAS shares (SMB/NFS) ──────────────────────────────────────────────────────
  async getNasShares() {
    const r = await fetch('/api/player/nas-shares');
    return handleJson(r);
  },
  async addNasShare({ name, type, host, share, username, password }) {
    const r = await fetch('/api/player/nas-shares', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type, host, share, username, password }),
    });
    return handleJson(r);
  },
  async removeNasShare(id) {
    const r = await fetch(`/api/player/nas-shares/${id}`, { method: 'DELETE' });
    return handleJson(r);
  },

  // ── Bluetooth output (headphones/speakers) ───────────────────────────────────
  async bluetoothOutScan() {
    const r = await fetch('/api/player/bluetooth-out/scan');
    return handleJson(r);
  },
  async bluetoothOutPaired() {
    const r = await fetch('/api/player/bluetooth-out/paired');
    return handleJson(r);
  },
  async bluetoothOutPair(mac) {
    const r = await fetch('/api/player/bluetooth-out/pair', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mac }),
    });
    return handleJson(r);
  },
  async bluetoothOutDisconnect(mac) {
    const r = await fetch('/api/player/bluetooth-out/disconnect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mac }),
    });
    return handleJson(r);
  },
  async bluetoothOutSelect(mac, name, enabled) {
    const r = await fetch('/api/player/bluetooth-out/select', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mac, name, enabled }),
    });
    return handleJson(r);
  },
  async bluetoothOutStatus() {
    const r = await fetch('/api/player/bluetooth-out/status');
    return handleJson(r);
  },
};
