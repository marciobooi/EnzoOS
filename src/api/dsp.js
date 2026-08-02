// DSP / CamillaDSP & MPD audio settings: calibration, ReplayGain, crossfade,
// balance, phase, bit-perfect, DSD bypass, auto-headroom.
import { handleJson } from './_client';

export const dspApi = {
  /** Save CamillaDSP calibration settings. */
  async saveDspCalibration(answers) {
    const response = await fetch('/api/player/dsp-calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    return handleJson(response);
  },

  /** Fetch CamillaDSP calibration settings. */
  async getDspCalibration() {
    const response = await fetch('/api/player/dsp-calibration');
    return handleJson(response);
  },

  /** Toggle Pure Direct (flat, EQ/DSP-bypassed pipeline). */
  async setPureDirect(enabled) {
    const r = await fetch('/api/player/pure-direct', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleJson(r);
  },

  // ── ReplayGain ──────────────────────────────────────────────────────────────
  async getReplayGain() {
    const r = await fetch('/api/player/replaygain');
    return handleJson(r);
  },
  async setReplayGain(mode) {
    const r = await fetch('/api/player/replaygain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    return handleJson(r);
  },

  // ── Crossfade ───────────────────────────────────────────────────────────────
  async getCrossfade() {
    const r = await fetch('/api/player/crossfade');
    return handleJson(r);
  },
  async setCrossfade(seconds) {
    const r = await fetch('/api/player/crossfade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    });
    return handleJson(r);
  },

  // ── Gapless Playback ─────────────────────────────────────────────────────────
  async getGapless() {
    const r = await fetch('/api/player/gapless');
    return handleJson(r);
  },
  async setGapless(enabled) {
    const r = await fetch('/api/player/gapless', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleJson(r);
  },

  // ── Balance ─────────────────────────────────────────────────────────────────
  async getBalance() {
    const r = await fetch('/api/player/balance');
    return handleJson(r);
  },
  async setBalance(balance) {
    const r = await fetch('/api/player/balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance }),
    });
    return handleJson(r);
  },

  // ── Phase ────────────────────────────────────────────────────────────────────
  async getPhase() {
    const r = await fetch('/api/player/phase');
    return handleJson(r);
  },
  async setPhase(left, right) {
    const r = await fetch('/api/player/phase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left, right }),
    });
    return handleJson(r);
  },

  // ── Bit-perfect ───────────────────────────────────────────────────────────────
  async getBitPerfect() {
    const r = await fetch('/api/player/bitperfect');
    return handleJson(r);
  },
  async setBitPerfect(enabled) {
    const r = await fetch('/api/player/bitperfect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleJson(r);
  },

  // ── DSD bypass ────────────────────────────────────────────────────────────────
  async getDsdBypass() {
    const r = await fetch('/api/player/dsd-bypass');
    return handleJson(r);
  },
  async setDsdBypass(enabled) {
    const r = await fetch('/api/player/dsd-bypass', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleJson(r);
  },

  // ── Auto-headroom ─────────────────────────────────────────────────────────────
  async getAutoHeadroom() {
    const r = await fetch('/api/player/auto-headroom');
    return handleJson(r);
  },
  async setAutoHeadroom(enabled) {
    const r = await fetch('/api/player/auto-headroom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleJson(r);
  },

  // ── Spotify Level Trim (cross-source loudness) ────────────────────────────────
  async getSpotifyTrim() {
    const r = await fetch('/api/player/spotify-trim');
    return handleJson(r);
  },
  async setSpotifyTrim(trimDb) {
    const r = await fetch('/api/player/spotify-trim', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trimDb }),
    });
    return handleJson(r);
  },

  // ── FIR/convolution filter import ─────────────────────────────────────────────
  async getFirFilter() {
    const r = await fetch('/api/player/dsp/fir-filter');
    return handleJson(r);
  },
  /** file: a browser File object (WAV). name: display name shown in Settings. */
  async uploadFirFilter(file, name) {
    const r = await fetch('/api/player/dsp/fir-filter', {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav', 'X-Filter-Name': encodeURIComponent(name || file.name || 'Custom Filter') },
      body: file,
    });
    return handleJson(r);
  },
  async setFirEnabled(enabled) {
    const r = await fetch('/api/player/dsp/fir-filter/toggle', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return handleJson(r);
  },
  async deleteFirFilter() {
    const r = await fetch('/api/player/dsp/fir-filter', { method: 'DELETE' });
    return handleJson(r);
  },

  // ── Digital Transport ──────────────────────────────────────────────────────────
  async getAudioCards() {
    const r = await fetch('/api/player/audio-cards');
    return handleJson(r);
  },
  async getDigitalTransport() {
    const r = await fetch('/api/player/digital-transport');
    return handleJson(r);
  },
  /** Pass `device` to (re)point the transport at a card, `enabled` to toggle it — either or both. */
  async setDigitalTransport({ enabled, device } = {}) {
    const r = await fetch('/api/player/digital-transport', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled, device }),
    });
    return handleJson(r);
  },
};
