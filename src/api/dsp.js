// DSP / CamillaDSP & MPD audio settings: calibration, ReplayGain, crossfade,
// balance, phase, bit-perfect, DSD bypass, auto-headroom.
export const dspApi = {
  /** Save CamillaDSP calibration settings. */
  async saveDspCalibration(answers) {
    const response = await fetch('/api/player/dsp-calibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers })
    });
    return response.json();
  },

  /** Fetch CamillaDSP calibration settings. */
  async getDspCalibration() {
    const response = await fetch('/api/player/dsp-calibration');
    return response.json();
  },

  // ── ReplayGain ──────────────────────────────────────────────────────────────
  async getReplayGain() {
    const r = await fetch('/api/player/replaygain');
    return r.json();
  },
  async setReplayGain(mode) {
    const r = await fetch('/api/player/replaygain', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    return r.json();
  },

  // ── Crossfade ───────────────────────────────────────────────────────────────
  async getCrossfade() {
    const r = await fetch('/api/player/crossfade');
    return r.json();
  },
  async setCrossfade(seconds) {
    const r = await fetch('/api/player/crossfade', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    });
    return r.json();
  },

  // ── Balance ─────────────────────────────────────────────────────────────────
  async getBalance() {
    const r = await fetch('/api/player/balance');
    return r.json();
  },
  async setBalance(balance) {
    const r = await fetch('/api/player/balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ balance }),
    });
    return r.json();
  },

  // ── Phase ────────────────────────────────────────────────────────────────────
  async getPhase() {
    const r = await fetch('/api/player/phase');
    return r.json();
  },
  async setPhase(left, right) {
    const r = await fetch('/api/player/phase', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left, right }),
    });
    return r.json();
  },

  // ── Bit-perfect ───────────────────────────────────────────────────────────────
  async getBitPerfect() {
    const r = await fetch('/api/player/bitperfect');
    return r.json();
  },
  async setBitPerfect(enabled) {
    const r = await fetch('/api/player/bitperfect', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return r.json();
  },

  // ── DSD bypass ────────────────────────────────────────────────────────────────
  async getDsdBypass() {
    const r = await fetch('/api/player/dsd-bypass');
    return r.json();
  },
  async setDsdBypass(enabled) {
    const r = await fetch('/api/player/dsd-bypass', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return r.json();
  },

  // ── Auto-headroom ─────────────────────────────────────────────────────────────
  async getAutoHeadroom() {
    const r = await fetch('/api/player/auto-headroom');
    return r.json();
  },
  async setAutoHeadroom(enabled) {
    const r = await fetch('/api/player/auto-headroom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    return r.json();
  },
};
