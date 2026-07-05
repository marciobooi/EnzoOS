// server/camilla-config.js
// CamillaDSP/EQ/DSP engine — DAC detection, PipeWire clock sync, ALSA loopback
// config, the CamillaDSP YAML generator (5-band EQ + auto-headroom + Pure
// Direct + saturation), and the WS calls that apply/query it. Extracted out
// of player.js (which stays focused on Express routes) since this is the one
// genuinely self-contained subsystem in that file — see CAMILLADSP_VERSION
// pin in install.sh and .claude/docs/camilladsp.md before touching the YAML
// schema this generates.
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getSetting, setSetting } from './db.js';
import { sendCamillaCommand } from './camilla-ws.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execPromise = promisify(exec);

/**
 * Set CamillaDSP master volume in dB via WebSocket.
 * Applied after ALL ALSA buffers — instant for every source.
 */
export async function setCamillaVolume(dB) {
  try {
    const msg = await sendCamillaCommand({ SetVolume: dB });
    const ok = msg.SetVolume?.result === 'Ok';
    if (ok) console.log(`[Volume] CamillaDSP volume set to ${dB.toFixed(1)} dB`);
    return ok;
  } catch (err) {
    console.warn('[Volume] CamillaDSP WS error:', err.message);
    return false;
  }
}

// Standard audiophile sample rates — only these are valid PipeWire clock candidates.
// Rates outside this set (e.g. 32000, 22050) are legacy and not used for hi-res playback.
const STANDARD_RATES = [44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000];

// --- CamillaDSP DAC & Audio Hardware Capabilities Detection ---
// Returns device, format, samplerate (default processing rate), supportedRates (all),
// and cardName (for display). supportedRates drives PipeWire clock.allowed-rates so
// PipeWire only switches to rates the DAC actually supports — no ALSA open failures.
export function detectDac() {
  let detected = {
    device: "hw:0,0",
    samplerate: 48000,
    format: "S16_LE",
    channels: 2,
    supportedRates: [44100, 48000],
    cardName: 'Built-in Audio',
  };

  try {
    const asoundDir = '/proc/asound';
    if (!fs.existsSync(asoundDir)) return detected;

    const cards = fs.readdirSync(asoundDir)
      .filter(f => f.startsWith('card') && !isNaN(f.substring(4)))
      .map(f => {
        const cardPath = path.join(asoundDir, f);
        try {
          if (!fs.statSync(cardPath).isDirectory()) return null;
        } catch { return null; }
        const index = parseInt(f.substring(4), 10);
        let id = '', longname = '';
        try { id = fs.readFileSync(path.join(cardPath, 'id'), 'utf8').trim(); } catch {}
        try { longname = fs.readFileSync(path.join(cardPath, 'longname'), 'utf8').trim(); } catch {}
        return { index, id, longname, path: cardPath };
      })
      .filter(Boolean);

    for (const card of cards) {
      if (card.id.toLowerCase() === 'loopback') continue;

      const streamFiles = (() => {
        try { return fs.readdirSync(card.path).filter(f => f.startsWith('stream')); } catch { return []; }
      })();
      if (streamFiles.length === 0) continue;

      let streamContent = '';
      try { streamContent = fs.readFileSync(path.join(card.path, streamFiles[0]), 'utf8'); } catch {}
      if (!streamContent) continue;

      // Parse all supported rates and filter to standard audiophile set
      const rateMatch = streamContent.match(/Sample rates:\s*([^\r\n]+)/i);
      const allRates = rateMatch
        ? rateMatch[1].split(',').map(r => parseInt(r.trim(), 10)).filter(r => !isNaN(r))
        : [];
      const supportedRates = STANDARD_RATES.filter(r => allRates.includes(r));
      // If nothing matches (e.g. some USB DACs list ranges), fall back to all parsed rates
      const finalRates = supportedRates.length > 0 ? supportedRates
        : allRates.filter(r => r >= 44100).sort((a, b) => a - b);

      // Parse formats — pick best available quality
      const formatMatches = streamContent.match(/Format:\s*([^\r\n]+)/ig) || [];
      const formats = formatMatches.map(f => { const m = f.match(/Format:\s*(\S+)/i); return m?.[1] || ''; }).filter(Boolean);
      let camillaFormat = 'S16_LE';
      if (formats.some(f => f.includes('S32_LE')))   camillaFormat = 'S32_LE';
      else if (formats.some(f => f.includes('S24_3LE'))) camillaFormat = 'S24_3_LE';
      else if (formats.some(f => f.includes('S24_LE')))  camillaFormat = 'S24_3_LE';
      else if (formats.some(f => f.includes('S16_LE')))  camillaFormat = 'S16_LE';

      // Default processing rate: prefer 48000 (most common), fall back to first supported
      const defaultRate = finalRates.includes(48000) ? 48000
        : finalRates.includes(44100) ? 44100
        : (finalRates[0] || 48000);

      const device = card.id ? `hw:CARD=${card.id},DEV=0` : `hw:${card.index},0`;
      const cardName = card.longname || card.id || `Card ${card.index}`;

      console.log(`[DAC] Detected: ${cardName} | ${device} | ${camillaFormat} | rates: [${finalRates.join(', ')}]`);
      return { device, samplerate: defaultRate, format: camillaFormat, channels: 2, supportedRates: finalRates, cardName };
    }

    // No stream-capable card found — use first non-Loopback card with safe defaults
    const mainCard = cards.find(c => c.id.toLowerCase() !== 'loopback');
    if (mainCard) {
      detected.device   = mainCard.id ? `hw:CARD=${mainCard.id},DEV=0` : `hw:${mainCard.index},0`;
      detected.cardName = mainCard.longname || mainCard.id || `Card ${mainCard.index}`;
    }
  } catch (err) {
    console.error('[DAC] Detection error:', err);
  }

  return detected;
}

/**
 * Write PipeWire clock.allowed-rates from the detected DAC's supported rates.
 * This ensures PipeWire only switches to rates the DAC can actually handle —
 * prevents CamillaDSP ALSA open failures on rate-switch events.
 * Written via sudo tee; PipeWire is restarted only if the config changed.
 */
export async function updatePipeWireClock(dacInfo, bitPerfect = true) {
  // Bit-perfect mode publishes clock.allowed-rates = exactly the DAC's supported
  // rates, so PipeWire switches its graph clock to each source's native rate
  // (44.1 / 48 / 88.2 / 96 / 176.4 / 192 kHz) instead of resampling everything
  // to 48 kHz. The ALSA loopback then runs rate-agnostic (see ensureAsoundConf)
  // and CamillaDSP follows via the MPD rate watcher (SetConfig).
  //
  // Fallback mode (bitPerfect=false) keeps the proven FIXED 48000 Hz clock: the
  // loopback bridge then never sees a rate switch (which historically left
  // PCM Slave Active = off → silence on some hardware).
  //
  // Either way we do NOT restart PipeWire here — that would drop MPD's audio
  // connection. The new clock config applies on the next PipeWire session start.
  const confPath = '/etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf';
  const rates = Array.isArray(dacInfo?.supportedRates) && dacInfo.supportedRates.length
    ? dacInfo.supportedRates
    : [44100, 48000, 88200, 96000];

  const content = bitPerfect
    ? `# Resonance HiFi — PipeWire bit-perfect clock (rate-following)
# Generated from detected DAC: ${dacInfo?.cardName || 'unknown'} (${dacInfo?.device || 'unknown'})
# clock.allowed-rates = the DAC's native rates → PipeWire matches the source
# rate with no resampling. The loopback runs rate-agnostic and CamillaDSP
# follows via the MPD rate watcher.
context.properties = {
    default.clock.rate          = 48000
    default.clock.allowed-rates = [ ${rates.join(' ')} ]
    default.clock.quantum       = 1024
    default.clock.min-quantum   = 32
    default.clock.max-quantum   = 8192
}
`
    : `# Resonance HiFi — PipeWire fixed clock at 48000 Hz (stable fallback)
# Generated from detected DAC: ${dacInfo?.cardName || 'unknown'} (${dacInfo?.device || 'unknown'})
# clock.allowed-rates intentionally absent: fixed shared rate avoids loopback
# rate-switch silence on hardware where rate-following is unreliable.
context.properties = {
    default.clock.rate          = 48000
    default.clock.quantum       = 1024
    default.clock.min-quantum   = 32
    default.clock.max-quantum   = 8192
}
`;

  let current = '';
  try { current = fs.readFileSync(confPath, 'utf8'); } catch {}
  if (current.trim() === content.trim()) {
    console.log(`[PipeWire] Clock config unchanged (${bitPerfect ? 'bit-perfect rate-following' : '48000 Hz fixed'}) — skipping update.`);
    return;
  }

  const tempPath = path.join(__dirname, '../pipewire-clock.conf.tmp');
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    await execPromise(`sudo /usr/bin/tee ${confPath} < ${tempPath} > /dev/null`);
    console.log(`[PipeWire] Updated clock config (${bitPerfect ? 'bit-perfect rate-following: ' + rates.join('/') + ' Hz' : '48000 Hz fixed'}).`);
    // NOTE: NOT restarting PipeWire — doing so drops MPD's audio connection.
    // The new config takes effect on the next PipeWire session start (reboot).
  } catch (err) {
    console.warn('[PipeWire] Failed to write clock config (check sudoers):', err.message);
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
}

// ── Dynamic peak pre-attenuation (auto-headroom) ──────────────────────────────
// A static -1 dB (or a conservative per-preset) deduction wastes resolution on
// gentle content while still risking clipping on aggressive EQ. Instead we
// compute the EQ's actual peak magnitude response (RBJ biquad cascade) and
// attenuate the pre-amp by *exactly* that — maximising SNR. Deterministic
// (filter-derived, not a live audio-peak loop), so there is no level pumping.
function _biquadCoeffs(band, fs) {
  const f0 = Number(band.freq) || 1000, Q = Number(band.q) || 0.707, gain = Number(band.gain) || 0;
  const w0 = 2 * Math.PI * f0 / fs, cw = Math.cos(w0), sw = Math.sin(w0);
  const alpha = sw / (2 * Q), A = Math.pow(10, gain / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (band.type) {
    case 'Peaking':
      b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A;
      a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
    case 'Lowshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) - (A - 1) * cw + s); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - s);
      a0 = (A + 1) + (A - 1) * cw + s; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - s; break; }
    case 'Highshelf': {
      const s = 2 * Math.sqrt(A) * alpha;
      b0 = A * ((A + 1) + (A - 1) * cw + s); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - s);
      a0 = (A + 1) - (A - 1) * cw + s; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - s; break; }
    case 'Highpass':
      b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    case 'Lowpass':
      b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
    default: return null; // unknown / gainless → unity
  }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a0: 1, a1: a1 / a0, a2: a2 / a0 };
}
function _biquadMagSq(c, w) {
  const phi = Math.pow(Math.sin(w / 2), 2);
  const num = Math.pow(c.b0 + c.b1 + c.b2, 2) - 4 * (c.b0 * c.b1 + 4 * c.b0 * c.b2 + c.b1 * c.b2) * phi + 16 * c.b0 * c.b2 * phi * phi;
  const den = Math.pow(c.a0 + c.a1 + c.a2, 2) - 4 * (c.a0 * c.a1 + 4 * c.a0 * c.a2 + c.a1 * c.a2) * phi + 16 * c.a0 * c.a2 * phi * phi;
  return den > 0 ? num / den : 0;
}
// Peak gain (dB, ≥ 0) of the cascaded filter chain across the audible band.
function computeEqPeakDb(bands, fs = 48000) {
  if (!Array.isArray(bands) || !bands.length) return 0;
  const coeffs = bands.map(b => _biquadCoeffs(b, fs)).filter(Boolean);
  if (!coeffs.length) return 0;
  const nyq = fs / 2;
  let maxDb = 0;
  const N = 240;
  for (let i = 0; i <= N; i++) {
    const f = 10 * Math.pow(nyq / 10, i / N); // log-spaced 10 Hz → Nyquist
    const w = 2 * Math.PI * f / fs;
    let magSq = 1;
    for (const c of coeffs) magSq *= _biquadMagSq(c, w);
    const db = 10 * Math.log10(magSq);
    if (db > maxDb) maxDb = db;
  }
  return maxDb;
}
let _lastHeadroomDb = 0;
export function getLastHeadroomDb() { return _lastHeadroomDb; }

// --- CamillaDSP Configuration Generator ---
// pureDirect = true: bypass all EQ, output flat pipeline (volume control still active)
// balance: -12..+12 dB. Positive = right louder (attenuate left). Negative = left louder (attenuate right).
// phaseLeft/phaseRight: invert polarity of that channel
// autoHeadroom = true: attenuate pre-amp by the computed EQ peak instead of the static preset value
function generateCamillaConfig(answers, eqSettings, dacInfo, { pureDirect = false, balance = 0, phaseLeft = false, phaseRight = false, bitPerfect = true, autoHeadroom = true } = {}) {
  const isDspActive = answers && (answers[0] === 'dsp' || answers['0'] === 'dsp');
  const isSubwooferSetup = answers && answers.q1_setup === "2 Speakers + 1 Subwoofer";

  // Capture (loopback) sample format. In bit-perfect mode the whole bridge runs
  // at 32-bit so source bit-depth survives — no truncation to 16-bit. The
  // proven fixed-rate fallback also benefits (S32 instead of the old S16_LE).
  const captureFormat = bitPerfect ? "S32_LE" : "S16_LE";

  // Named presets and "Custom" are the same code path: the client always
  // sends bands/preAmp/noiseFloor/saturation alongside the preset name (see
  // EQ_PRESETS in src/components/EqualizerControl.jsx), so a preset IS just
  // those five numbers. Previously a named preset used a hand-tuned, totally
  // unrelated filter curve from `presetDatabase` (different frequencies,
  // filter types, and preampGain) while only "Custom" honored eqSettings —
  // the instant you nudged one slider, the whole curve and gain staging
  // jumped from the preset's bespoke values to the slider-derived ones,
  // which is exactly the "boosts 20x" discontinuity this fixes.
  const bandGains = (eqSettings?.bands || [0, 0, 0, 0, 0]).map(Number);
  // Auto-headroom: subtract the largest positive band boost from pre-amp to prevent clipping.
  const maxBoost = Math.max(0, ...bandGains);
  const profile = {
    preampGain: (Number(eqSettings?.preAmp) || 0.0) - maxBoost,
    noiseFloorLevel: (eqSettings?.noiseFloor > 0) ? (-105.0 + (Number(eqSettings.noiseFloor) * 2.0)) : null,
    useSaturation: (eqSettings?.saturation > 0),
    bands: [
      { type: "Lowshelf", freq: 60,    gain: bandGains[0], q: 0.707 },
      { type: "Peaking",  freq: 250,   gain: bandGains[1], q: 0.707 },
      { type: "Peaking",  freq: 1000,  gain: bandGains[2], q: 0.707 },
      { type: "Peaking",  freq: 4000,  gain: bandGains[3], q: 0.707 },
      { type: "Highshelf",freq: 16000, gain: bandGains[4], q: 0.707 },
    ]
  };

  // Compute per-channel balance gains (applied in mixer)
  const balL = balance > 0 ? -Math.abs(balance) : 0;
  const balR = balance < 0 ? -Math.abs(balance) : 0;

  // Pure Direct: bypass all EQ — flat pipeline with unity gain only.
  // Volume control via CamillaDSP SetVolume remains active.
  if (pureDirect) {
    const pdFilters = {};
    const pdPipeLeft  = [];
    const pdPipeRight = [];
    if (phaseLeft)  { pdFilters.phase_left  = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; pdPipeLeft.push("phase_left"); }
    if (phaseRight) { pdFilters.phase_right = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; pdPipeRight.push("phase_right"); }
    // Dither is a fidelity improvement (replaces quantization distortion with
    // inaudible shaped noise), not tone-coloring processing, so it's applied
    // even in Pure Direct — unlike EQ/rate-adjust, which that mode deliberately
    // bypasses. Only matters when truncating to 16-bit output.
    if ((dacInfo.format || '').startsWith('S16')) {
      pdFilters.dither_16bit = { type: "Dither", parameters: { type: "Fweighted441", bits: 16 } };
      pdPipeLeft.push("dither_16bit");
      pdPipeRight.push("dither_16bit");
    }
    const pdPipeline = [{ type: "Mixer", name: "speaker_map" }];
    if (pdPipeLeft.length)  pdPipeline.push({ type: "Filter", channels: [0], names: pdPipeLeft });
    if (pdPipeRight.length) pdPipeline.push({ type: "Filter", channels: [1], names: pdPipeRight });
    const pdConfig = {
      devices: {
        samplerate: dacInfo.samplerate || 44100,
        chunksize: 1024,
        queuelimit: 4,
        capture:  { type: "Alsa", channels: 2, device: "loop_dsnoop", format: captureFormat },
        playback: { type: "Alsa", channels: dacInfo.channels || 2, device: dacInfo.device || "hw:CARD=DAC,DEV=0", format: dacInfo.format || "S24_3_LE" },
        silence_threshold: -90,
        silence_timeout: 60,
      },
      mixers: {
        speaker_map: {
          channels: { in: 2, out: 2 },
          mapping: [
            { dest: 0, sources: [{ channel: 0, gain: balL }] },
            { dest: 1, sources: [{ channel: 1, gain: balR }] },
          ],
        },
      },
      filters: pdFilters,
      pipeline: pdPipeline,
    };
    return pdConfig;
  }

  let config = {
    devices: {
      samplerate: dacInfo.samplerate || 44100,
      chunksize: 1024,
      queuelimit: 4,
      // CamillaDSP 4.1.3 is built with ALSA-only backends (no Pulse/PipeWire).
      // Audio reaches here via: PipeWire → ResonanceInput virtual sink
      //   → PW loopback module → hw:Loopback,0,0 → ALSA dsnoop (loop_dsnoop)
      capture: { type: "Alsa", channels: 2, device: "loop_dsnoop", format: captureFormat },
      playback: {
        type: "Alsa",
        channels: dacInfo.channels || 2,
        device: dacInfo.device || "hw:CARD=DAC,DEV=0",
        format: dacInfo.format || "S24_3_LE"
      },
      // Absorbs clock drift between the ALSA loopback's timer and the DAC's
      // own clock (measured live ~20 ppm on the dev VM: capture settles at
      // 48001 Hz vs 48000 nominal) — without this, that drift caused
      // periodic buffer under/overruns (audible clicks). AsyncSinc/Balanced
      // is CamillaDSP's recommended default profile: sub -170 dB added
      // noise for a modest CPU cost. Not applied in Pure Direct mode (see
      // the early-return pdConfig above) — that mode intentionally accepts
      // the drift-related xrun risk in exchange for a genuinely unprocessed
      // signal path.
      enable_rate_adjust: true,
      resampler: { type: "AsyncSinc", profile: "Balanced" },
      // Let CamillaDSP pause processing during silence instead of running
      // the DSP pipeline 24/7 — measurable idle CPU/heat saving on a
      // fanless Pi. -90 dB is well below any real program material's noise
      // floor; 60s avoids pausing during normal inter-track gaps.
      silence_threshold: -90,
      silence_timeout: 60,
    },
    mixers: {},
    filters: {},
    pipeline: []
  };

  // Build Profile 5-Band Filters
  profile.bands.forEach((band, index) => {
    const filterKey = `profile_band_${index + 1}`;
    if (band.type === "Highpass" || band.type === "Lowpass") {
      config.filters[filterKey] = { type: "Biquad", parameters: { type: band.type, freq: band.freq, q: band.q } };
    } else {
      config.filters[filterKey] = { type: "Biquad", parameters: { type: band.type, freq: band.freq, gain: band.gain, q: band.q } };
    }
  });

  // Build Saturation filter — one formula for every preset name, same
  // reasoning as the band unification above.
  if (profile.useSaturation) {
    config.filters.analog_saturation = { type: "Biquad", parameters: { type: "Peaking", freq: 80, gain: Number(eqSettings?.saturation || 0) * 0.25, q: 1.5 } };
  }

  // analog_noise_floor intentionally omitted: a series Gain filter at -95dB attenuates
  // the signal to silence rather than adding noise. Disabled until implemented correctly.

  // Setup Crossovers and Crossover Caster Filters
  if (isSubwooferSetup) {
    config.devices.playback.channels = 3;
    config.mixers.speaker_map = {
      channels: { in: 2, out: 3 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: balL }] },
        { dest: 1, sources: [{ channel: 1, gain: balR }] },
        { dest: 2, sources: [{ channel: 0, gain: -3.0 + balL }, { channel: 1, gain: -3.0 + balR }] }
      ]
    };
  } else {
    config.devices.playback.channels = 2;
    config.mixers.speaker_map = {
      channels: { in: 2, out: 2 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: balL }] },
        { dest: 1, sources: [{ channel: 1, gain: balR }] }
      ]
    };
  }

  let leftPipeline = [];
  let rightPipeline = [];
  let subPipeline = [];

  // --- STAGE A: ROOM CALIBRATION MASTER STACK ---
  if (isDspActive) {
    config.filters.subsonic_cut = { type: "Biquad", parameters: { type: "Highpass", freq: 18, q: 0.707 } };
    config.filters.harman_bass_shelf = { type: "Biquad", parameters: { type: "Lowshelf", freq: 105, gain: 5.5, q: 0.707 } };
    config.filters.vocal_clarity_dip = { type: "Biquad", parameters: { type: "Peaking", freq: 250, gain: -1.2, q: 0.6 } };
    config.filters.presence_definition = { type: "Biquad", parameters: { type: "Peaking", freq: 3000, gain: 1.0, q: 0.8 } };
    config.filters.harman_treble_tilt = { type: "Biquad", parameters: { type: "Highshelf", freq: 4500, gain: -2.0, q: 0.5 } };
    config.filters.spatial_air_sparkle = { type: "Biquad", parameters: { type: "Peaking", freq: 14000, gain: 1.5, q: 1.8 } };

    const masterCurveFilters = [
      "subsonic_cut",
      "harman_bass_shelf",
      "vocal_clarity_dip",
      "presence_definition",
      "harman_treble_tilt",
      "spatial_air_sparkle"
    ];

    leftPipeline.push(...masterCurveFilters);
    rightPipeline.push(...masterCurveFilters);
  }

  // --- STAGE B: INJECT PROFILE EQ BANDS ---
  profile.bands.forEach((band, index) => {
    const filterKey = `profile_band_${index + 1}`;
    leftPipeline.push(filterKey);
    rightPipeline.push(filterKey);
    if (isSubwooferSetup && index < 2 && band.type !== "Highpass") {
      subPipeline.push(filterKey);
    }
  });

  if (profile.useSaturation) {
    leftPipeline.push("analog_saturation");
    rightPipeline.push("analog_saturation");
  }

  // --- STAGE C: DYNAMIC SURVEY ADJUSTMENTS ---
  if (isDspActive) {
    if (answers.q5_size === "Small / Desktop") {
      config.filters.speaker_safety = { type: "Biquad", parameters: { type: "Highpass", freq: 85, q: 0.707 } };
      leftPipeline.push("speaker_safety");
      rightPipeline.push("speaker_safety");
    } else if (answers.q5_size === "Medium / Bookshelf") {
      config.filters.speaker_safety = { type: "Biquad", parameters: { type: "Highpass", freq: 45, q: 0.707 } };
      leftPipeline.push("speaker_safety");
      rightPipeline.push("speaker_safety");
    }

    if (answers.q2_acoustics === "Echoey") {
      config.filters.room_tamer = { type: "Biquad", parameters: { type: "Highshelf", freq: 4000, gain: -2.5, q: 0.7 } };
      leftPipeline.push("room_tamer");
      rightPipeline.push("room_tamer");
    }

    if (answers.q7_walls === "Pushed against a wall") {
      config.filters.wall_correction = { type: "Biquad", parameters: { type: "Lowshelf", freq: 150, gain: -2.0, q: 0.7 } };
      leftPipeline.push("wall_correction");
      rightPipeline.push("wall_correction");
    } else if (answers.q7_walls === "Tucked in a corner / Shelf") {
      config.filters.wall_correction = { type: "Biquad", parameters: { type: "Lowshelf", freq: 150, gain: -4.0, q: 0.7 } };
      leftPipeline.push("wall_correction");
      rightPipeline.push("wall_correction");
    }

    if (answers.q3_placement === "Closer to the Left Speaker") {
      config.filters.left_delay = { type: "Delay", parameters: { delay: 1.5, unit: "ms" } };
      leftPipeline.push("left_delay");
    } else if (answers.q3_placement === "Closer to the Right Speaker") {
      config.filters.right_delay = { type: "Delay", parameters: { delay: 1.5, unit: "ms" } };
      rightPipeline.push("right_delay");
    }
  }

  // --- STAGE D: CROSSOVERS (ALWAYS EXECUTE FIRST IN MIX MATRIX) ---
  if (isSubwooferSetup) {
    config.filters.sub_lowpass = { type: "Biquad", parameters: { type: "Lowpass", freq: 80, q: 0.707 } };
    config.filters.crossover_mains_highpass = { type: "Biquad", parameters: { type: "Highpass", freq: 80, q: 0.707 } };
    
    leftPipeline.unshift("crossover_mains_highpass");
    rightPipeline.unshift("crossover_mains_highpass");
    subPipeline.unshift("sub_lowpass");
  }

  // --- STAGE E: PREAMP GAIN + PHASE ---
  // Base pre-amp attenuation. With auto-headroom ON, attenuate by exactly the
  // EQ's computed peak magnitude (max SNR); saturation adds an extra margin
  // because its harmonic gain isn't captured by the biquad response. With it
  // OFF, fall back to the preset's manually-tuned preampGain. A global -1 dB
  // safety margin is applied on top in every case as a guard against
  // inter-sample peaks and multi-stage summing exceeding 0 dBFS.
  let baseGainDb;
  if (autoHeadroom) {
    const fs = dacInfo?.samplerate || 48000;
    let peak = computeEqPeakDb(profile.bands || [], fs);
    if (profile.useSaturation) peak += 2.0;
    const userPreAmp = Number(eqSettings?.preAmp) || 0;
    baseGainDb = userPreAmp - peak;
    _lastHeadroomDb = Math.round(peak * 10) / 10;
  } else {
    baseGainDb = Number(profile.preampGain) || 0;
    _lastHeadroomDb = Math.max(0, -baseGainDb);
  }
  const preampGainDb = Number(isDspActive ? (baseGainDb - 6.0) : baseGainDb) || 0;
  config.filters.preamp_gain = { type: "Gain", parameters: { gain: preampGainDb - 1.0, inverted: false, mute: false } };
  leftPipeline.push("preamp_gain");
  rightPipeline.push("preamp_gain");
  if (isSubwooferSetup) subPipeline.push("preamp_gain");

  if (phaseLeft)  { config.filters.phase_left  = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; leftPipeline.push("phase_left"); }
  if (phaseRight) { config.filters.phase_right = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; rightPipeline.push("phase_right"); }

  // Dither only matters when truncating to 16-bit output (this VM's onboard
  // HDA is S16_LE; some budget DACs too) — without it, the EQ/volume/resample
  // math above (all float-precision) truncates to 16-bit undithered, adding
  // quantization distortion. Skip entirely for 24/32-bit outputs, where the
  // extra headroom makes it unnecessary. Must be the LAST filter in the
  // chain (dither after all gain/EQ stages, right before the ALSA write).
  if ((dacInfo.format || '').startsWith('S16')) {
    config.filters.dither_16bit = { type: "Dither", parameters: { type: "Fweighted441", bits: 16 } };
    leftPipeline.push("dither_16bit");
    rightPipeline.push("dither_16bit");
    if (isSubwooferSetup) subPipeline.push("dither_16bit");
  }

  // --- STAGE F: COMPILE THE PIPELINE MATRIX ---
  // CamillaDSP v4: Filter steps use 'channels' (array) instead of v2's 'channel' (integer).
  // SetVolume controls the built-in main volume fader — no Volume filter needed in pipeline.
  config.pipeline.push({ type: "Mixer", name: "speaker_map" });
  config.pipeline.push({ type: "Filter", channels: [0], names: leftPipeline });
  config.pipeline.push({ type: "Filter", channels: [1], names: rightPipeline });
  if (isSubwooferSetup) {
    config.pipeline.push({ type: "Filter", channels: [2], names: subPipeline });
  }

  return config;
}

// Function to ensure /etc/asound.conf is correctly configured for PipeWire architecture.
// PipeWire owns the default ALSA device (via /usr/share/alsa/alsa.conf.d/99-pipewire-default.conf).
// We only need to keep loop_dsnoop so CamillaDSP (ALSA-only build) can still capture audio.
// PipeWire's loopback module bridges ResonanceInput.monitor → hw:Loopback,0,0 for CamillaDSP.
async function ensureAsoundConf(bitPerfect = true) {
  const asoundConfPath = '/etc/asound.conf';
  // Bit-perfect: 32-bit container so source depth survives, and NO forced rate
  // on the dsnoop/dmix slaves — they inherit whatever rate PipeWire opened the
  // loopback at (rate-following). Fallback: fixed 48000 Hz, the proven-stable
  // shared rate, but still 32-bit (no 16-bit truncation).
  const loopFormat = bitPerfect ? 'S32_LE' : 'S16_LE';
  const rateLine   = bitPerfect ? '' : '        rate 48000\n';
  // No forced rate: PipeWire switches clock to match source (44100/48000/96000/etc).
  // CamillaDSP captures at whatever rate PipeWire writes, enabling native bit-perfect
  // when combined with PipeWire clock.allowed-rates configuration.
  // The ALSA loopback kernel module supports only ONE rate per substream.
  // PipeWire and CamillaDSP must agree on the same rate or the loopback
  // bridge breaks (PCM Slave Active stays off → silence).
  // Fixed at 48000 Hz — PipeWire default clock. All sources resample to
  // 48000 inside PipeWire before writing to the loopback.
  // camilla_input: ALSA dmix for MPD/ALSA sources → hw:Loopback,0,0
  // loop_dsnoop:   ALSA dsnoop for CamillaDSP capture ← hw:Loopback,1,0
  // Both at 48000 Hz to match CamillaDSP's processing rate.
  // MPD uses type "alsa" device "camilla_input" — bypasses the PipeWire
  // loopback bridge which was not reliably connecting to hw:Loopback,0,0.
  const modeComment = bitPerfect
    ? '# Bit-perfect: 32-bit, rate-following (slaves inherit PipeWire\'s loopback rate).'
    : '# Fixed 48000 Hz shared rate (proven-stable fallback), 32-bit container.';
  const expectedContent = `# Resonance HiFi — ALSA config
# camilla_input: ALSA dmix — MPD/ALSA sources write directly to loopback
# loop_dsnoop:   ALSA dsnoop — CamillaDSP reads from loopback
${modeComment}
# ipc_perm 0666 is required for dmix/dsnoop sharing (any local process that
# opens these PCMs must be able to attach to the same shared-memory ring
# buffer) — it means any local user/process can inject into or snoop the
# live audio stream via the loopback IPC segment. Accepted trade-off for a
# single-user appliance with no untrusted local accounts; would need
# per-group IPC ownership (not supported by ALSA's dmix/dsnoop) on a
# multi-user box.

pcm.camilla_input {
    type dmix
    ipc_key 1111
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,0,0"
        channels 2
${rateLine}        format ${loopFormat}
        period_size 1024
    }
}

pcm.loop_dsnoop {
    type dsnoop
    ipc_key 2048
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,1,0"
        channels 2
${rateLine}        format ${loopFormat}
        period_size 1024
    }
}
`;

  try {
    let currentContent = '';
    if (fs.existsSync(asoundConfPath)) {
      currentContent = fs.readFileSync(asoundConfPath, 'utf8');
    }

    if (currentContent.trim() !== expectedContent.trim()) {
      console.log('[ALSA] Writing correct loopback routing configuration to /etc/asound.conf...');
      const tempPath = path.join(__dirname, '../asound.conf.tmp');
      try {
        fs.writeFileSync(tempPath, expectedContent, 'utf8');
        await execPromise(`sudo /usr/bin/tee ${asoundConfPath} < ${tempPath} > /dev/null`);
        console.log('[ALSA] /etc/asound.conf updated successfully.');
      } finally {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    }
  } catch (err) {
    console.warn('[ALSA] Failed to write /etc/asound.conf (non-root context or missing sudoers permission):', err.message);
  }

  // Set hardware PCM Playback Volume to max (0 dB).
  // CamillaDSP plays directly to hw:CARD=Intel,DEV=0 via ALSA; the hardware
  // PCM volume IS in the signal path and must be at 255/255 so CamillaDSP
  // owns the entire gain stage via SetVolume.
  try {
    await execPromise("amixer -c 0 cset name='PCM Playback Volume' 255,255");
    console.log('[ALSA] Hardware PCM volume set to max (0 dB).');
  } catch (err) {
    // Non-fatal — some hardware doesn't expose this control
    console.warn('[ALSA] Could not set PCM Playback Volume (non-fatal):', err.message);
  }
}

// Exportable helper to update configuration on any settings change
export async function updateCamillaConfigFromSettings({ skipAlsa = false, samplerate = null, pureDirect = false } = {}) {
  const [dspVal, eqVal, balanceVal, phaseVal, bitPerfectVal, headroomVal] = await Promise.all([
    getSetting('dsp_calibration'),
    getSetting('eq_settings'),
    getSetting('balance'),
    getSetting('phase'),
    getSetting('bitperfect'),
    getSetting('auto_headroom'),
  ]);
  // Dynamic peak pre-attenuation is the default — set to "false"/"0" to fall back
  // to each preset's static manually-tuned headroom.
  const autoHeadroom = !(headroomVal === 'false' || headroomVal === '0');

  const answers = dspVal ? JSON.parse(dspVal) : null;
  const eqSettings = eqVal ? JSON.parse(eqVal) : null;
  const balance = balanceVal ? parseFloat(balanceVal) : 0;
  const phase = phaseVal ? JSON.parse(phaseVal) : { left: false, right: false };
  // Bit-perfect rate-following is the default (the headline feature). Set the
  // `bitperfect` setting to "false" / "0" to fall back to the proven fixed-rate
  // 48 kHz pipeline if a particular DAC mishandles loopback rate switching.
  const bitPerfect = !(bitPerfectVal === 'false' || bitPerfectVal === '0');

  // Auto-configure ALSA Loopback routing — skip during EQ updates since
  // ALSA config never changes when only EQ bands/levels are adjusted
  if (!skipAlsa) await ensureAsoundConf(bitPerfect);

  // Scan for DAC capability automatically
  const dacInfo = detectDac();
  console.log('[CamillaDSP] Detected audio device capabilities:', dacInfo);

  // Sync PipeWire clock.allowed-rates to exactly the rates this DAC supports.
  // Fire-and-forget — never blocks the config generation path.
  if (!skipAlsa) {
    updatePipeWireClock(dacInfo, bitPerfect).catch(err =>
      console.warn('[PipeWire] Clock update failed (non-fatal):', err.message)
    );
  }

  // Apply adjustments if sub-woofer is enabled
  if (answers && answers.q1_setup === "2 Speakers + 1 Subwoofer") {
    dacInfo.channels = 3;
  } else {
    dacInfo.channels = 2;
  }

  // Rate override from MPD rate watcher — matches CamillaDSP capture to source rate
  if (samplerate && samplerate > 0) {
    dacInfo.samplerate = samplerate;
    console.log(`[CamillaDSP] Using MPD-detected sample rate: ${samplerate} Hz`);
  }

  // Generate CamillaDSP yaml configuration
  const configObj = generateCamillaConfig(answers, eqSettings, dacInfo, {
    pureDirect, balance, phaseLeft: phase.left, phaseRight: phase.right, bitPerfect, autoHeadroom,
  });
  const yamlString = YAML.stringify(configObj, { indent: 2 });

  // Save configuration file
  const configPath = path.resolve(__dirname, '../camilladsp.yml');
  fs.writeFileSync(configPath, yamlString, 'utf8');
  console.log(`[CamillaDSP] Generated sound profile successfully: ${configPath}`);

  // Apply config via CamillaDSP WebSocket hot-reload (no audio gap).
  // Falls back to systemctl restart only when CamillaDSP WS isn't available.
  const hotReloaded = await hotReloadCamilla(yamlString);
  if (!hotReloaded) {
    try {
      await execPromise('sudo systemctl restart camilladsp');
      console.log('[CamillaDSP] Restarted camilladsp service (fallback).');
      // Poll the WS until it actually accepts commands (max 5 s) instead of a
      // fixed 900 ms guess — robust when the Pi is under transient CPU load.
      const deadline = Date.now() + 5000;
      let ready = false;
      while (Date.now() < deadline) {
        if (await getCamillaStatus()) { ready = true; break; }
        await new Promise(r => setTimeout(r, 100));
      }
      if (!ready) console.warn('[CamillaDSP] WS not ready 5 s after restart — proceeding anyway.');
    } catch (err) {
      console.warn('[CamillaDSP] Failed to restart camilladsp service:', err.message);
    }
  }

  // SAFETY: Always restore stored volume after any config operation.
  // CamillaDSP defaults to 0 dB (full volume) on every start; SetConfig preserves
  // whatever it currently has — on boot that is also 0 dB. Without this, the first
  // playback after startup or a service restart would be at full hardware volume.
  try {
    const targetDb = getCachedVolumeDb();
    const ok = await setCamillaVolume(targetDb);
    if (ok) console.log(`[CamillaDSP] Volume restored to ${targetDb.toFixed(1)} dB after config apply.`);
  } catch (err) {
    console.warn('[CamillaDSP] Volume restore failed (non-fatal):', err.message);
  }

  return dacInfo;
}

/**
 * Hot-reload CamillaDSP config via its WebSocket API.
 * Sends SetConfig to port 1234 — reloads filters while audio continues playing.
 * Returns true on success, false if CamillaDSP WS is unreachable.
 */
async function hotReloadCamilla(yamlString) {
  try {
    const msg = await sendCamillaCommand({ SetConfig: yamlString });
    // v1: { SetConfig: 'Ok' }  v2: { SetConfig: { result: 'Ok' } }
    const ok = msg.SetConfig === 'Ok' || msg.SetConfig?.result === 'Ok';
    console.log(ok
      ? '[CamillaDSP] Hot-reload applied — no audio gap.'
      : '[CamillaDSP] Hot-reload response (unexpected):', msg);
    return ok;
  } catch (err) {
    console.warn('[CamillaDSP] Hot-reload WS error:', err.message);
    return false;
  }
}

/**
 * Query live CamillaDSP signal metrics for /api/player/signal-path.
 * `GetStatus` is NOT a real command in CamillaDSP 4.x — the previous
 * implementation sent it and always got back an `Invalid` response, so this
 * always resolved null. Uses the actual v4 commands instead.
 */
export async function getCamillaStatus() {
  try {
    const [state, clipped, load, rms] = await Promise.all([
      sendCamillaCommand('GetState'),
      sendCamillaCommand('GetClippedSamples'),
      sendCamillaCommand('GetProcessingLoad'),
      sendCamillaCommand('GetCaptureSignalRms'),
    ]);
    const rmsValue = rms.GetCaptureSignalRms?.value;
    return {
      state:          state.GetState?.value ?? 'Unknown',
      clippedSamples: clipped.GetClippedSamples?.value ?? 0,
      processingLoad: load.GetProcessingLoad?.value ?? 0,
      captureRmsL:    Array.isArray(rmsValue) ? (rmsValue[0] ?? -100) : -100,
      captureRmsR:    Array.isArray(rmsValue) ? (rmsValue[1] ?? -100) : -100,
    };
  } catch (err) {
    console.warn('[CamillaDSP] Status query failed:', err.message);
    return null;
  }
}
