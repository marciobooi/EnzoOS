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
};
