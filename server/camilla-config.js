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
import { getSetting } from './db.js';
import { sendCamillaCommand } from './camilla-ws.js';
import { getEffectiveVolumeDb, migrateBands } from './event-service.js';

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
# AUDIT-2026-08-24: quantum was 1024 (~21ms @ 48kHz) — measured live via
# GetCaptureSignalPeak's own processingLoad, CamillaDSP was reporting
# 1.15 (115% of its real-time budget) even in Pure Direct with no EQ/FIR
# active, on a Pi 4 running the full stack concurrently (kiosk Chromium,
# Ollama for DJ mode, PipeWire/MPD/raspotify) under measured thermal
# throttling. Reported live as "micro cuts". Doubled to 2048 (~43ms) —
# must match camilladsp.yml's chunksize exactly (kept in sync below) —
# trading ~21ms of inaudible extra latency for real headroom on a
# playback-only appliance with no live-monitoring/interactive latency
# requirement. min/max-quantum already bracket this (32/8192), so PipeWire
# was already tolerating values far outside 1024 when it needed to.
context.properties = {
    default.clock.rate          = 48000
    default.clock.allowed-rates = [ ${rates.join(' ')} ]
    default.clock.quantum       = 2048
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
    default.clock.quantum       = 2048
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

/**
 * Keep the static "resonance-aloop-sink" PipeWire node (install.sh,
 * /etc/pipewire/pipewire.conf.d/52-resonance-aloop-sink.conf) in sync with
 * ensureAsoundConf()'s bit-depth for camilla_input's dmix slave.
 *
 * AUDIT-2026-08-01: that node hardcoded audio.format = "S32LE" regardless of
 * the bitperfect setting. ensureAsoundConf() sets camilla_input's dmix slave
 * to S32_LE when bit-perfect, S16_LE in the fixed-48kHz fallback mode — so
 * flipping bitperfect off (done live as a mitigation for the rate-pinning
 * crash this same audit describes) left the two mismatched. PipeWire's ALSA
 * adapter can't reconcile a format the underlying dmix slave doesn't offer
 * at all and refuses to start ("failed to create context: Invalid
 * argument"), taking down every PipeWire-routed source (Spotify/AirPlay/
 * Bluetooth) — confirmed live: this is exactly what broke DJ mode's Spotify
 * playback shortly after switching bitperfect off. Same "don't restart
 * PipeWire here" caveat as updatePipeWireClock — the new format only takes
 * effect on the next PipeWire session start.
 */
async function updateAloopSinkFormat(bitPerfect) {
  const confPath = '/etc/pipewire/pipewire.conf.d/52-resonance-aloop-sink.conf';
  const format = bitPerfect ? 'S32LE' : 'S16LE';
  const content = `# Resonance HiFi — static PipeWire node for the ALSA loopback (bypasses the
# udev/ALSA monitor, which never auto-activates a profile for snd-aloop).
# Targets the camilla_input dmix PCM (not the raw hw device) so PipeWire
# shares hw:Loopback,0,0 with MPD/librespot via ALSA dmix instead of racing
# them for direct ownership of it.
#
# audio.format tracks ensureAsoundConf()'s camilla_input format (S32LE
# bit-perfect / S16LE fixed-48kHz fallback) — regenerated by
# updateCamillaConfigFromSettings() whenever bitperfect changes, so this
# file and asound.conf can never drift out of sync again (AUDIT-2026-08-01).
# No fixed audio.rate: lets this adapter follow the graph's clock, governed
# by clock.allowed-rates in 52-resonance-bitperfect.conf.
context.objects = [
  { factory = adapter
    args = {
      factory.name      = api.alsa.pcm.sink
      node.name         = "resonance-aloop-sink"
      node.description  = "Resonance ALSA Loopback Bridge"
      media.class       = "Audio/Sink"
      api.alsa.path     = "camilla_input"
      audio.channels    = 2
      audio.format      = "${format}"
    }
  }
]
`;

  let current = '';
  try { current = fs.readFileSync(confPath, 'utf8'); } catch {}
  if (current.trim() === content.trim()) return;

  const tempPath = path.join(__dirname, '../pipewire-aloop-sink.conf.tmp');
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    await execPromise(`sudo /usr/bin/tee ${confPath} < ${tempPath} > /dev/null`);
    console.log(`[PipeWire] Updated aloop-sink format (${format}) to match camilla_input.`);
  } catch (err) {
    console.warn('[PipeWire] Failed to write aloop-sink config (check sudoers):', err.message);
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

// Room Calibration's master curve (STAGE A below) — a fixed, Harman-target-
// style curve applied whenever Room Calibration is on, cascaded with the
// user's own 5-band EQ (STAGE B) rather than replacing it. One shared
// definition (not two copies of the same six numbers) so computeEqPeakDb()
// can measure this curve's own peak contribution too.
//
// AUDIT-2026-08-24: auto-headroom previously only ever measured
// profile.bands (the user's own EQ) — this curve's own gain (up to +5.5dB
// at the bass shelf) was invisible to the safety calculation entirely. It
// worked out fine in practice only by coincidence: a flat -6dB margin
// already applied whenever isDspActive is true (a few lines below) happened
// to be larger than this curve's single biggest boost, so nothing actually
// clipped — but that margin was never computed FROM this curve, so it would
// silently stop being enough the moment anyone tuned either number without
// realizing they were connected. Now genuinely computed instead of assumed.
const ROOM_CAL_MASTER_CURVE = [
  { key: "subsonic_cut",        type: "Highpass",  freq: 18,    q: 0.707 },
  { key: "harman_bass_shelf",   type: "Lowshelf",  freq: 105,   gain: 5.5,  q: 0.707 },
  { key: "vocal_clarity_dip",   type: "Peaking",   freq: 250,   gain: -1.2, q: 0.6 },
  { key: "presence_definition", type: "Peaking",   freq: 3000,  gain: 1.0,  q: 0.8 },
  { key: "harman_treble_tilt",  type: "Highshelf", freq: 4500,  gain: -2.0, q: 0.5 },
  { key: "spatial_air_sparkle", type: "Peaking",   freq: 14000, gain: 1.5,  q: 1.8 },
];

// AUDIT-2026-08-24: the DSP setup wizard (src/components/DspWizard.jsx,
// shared by RemoteDspWizard.jsx) stores answers keyed by numeric question id
// with short value tokens — {"0":"dsp","1":"subwoofer","2":"echoey",
// "3":"left","5":"small","7":"wall"} — but every Stage C/D check below was
// written against a DIFFERENT shape the wizard never actually produces:
// named properties (q1_setup, q2_acoustics, q3_placement, q5_size,
// q7_walls) holding full display-label strings ("2 Speakers + 1 Subwoofer",
// "Echoey", etc.). isDspActive's own check (answers['0']==='dsp') happened
// to already match by coincidence — the numeric-id form IS what it checks
// — so Room Calibration's fixed master curve always applied, but every
// per-room/speaker personalization branch (subwoofer crossover, speaker-
// size safety highpass, echoey-room treble tamer, wall/corner boundary
// correction, left/right speaker-distance delay) was silently unreachable
// no matter what the user answered, despite being fully built, wired into
// the wizard UI, and persisted to the DB. Normalizing into the shape the
// checks already expect fixes all five branches without touching their
// logic. (Wizard options with no corresponding branch below — "large"
// speakers, "open" room, room "center" placement — correctly need none.)
// AUDIT-2026-08-24: dither noise-shaping curve was hardcoded to
// "Fweighted441" (psychoacoustically tuned around a 44.1kHz Nyquist)
// regardless of what rate this bit-perfect, rate-following pipeline is
// actually running at. Per this project's own camilladsp.md doc: Fweighted441
// (or Gesemann441) for the 44.1kHz family, Gesemann48 for the 48kHz family,
// "Flat" (triangular, explicitly documented as rate-agnostic) as the safe
// default elsewhere — used here for the 88.2/96/176.4/192kHz hi-res family
// rather than guessing an exact Shibata variant name.
function ditherTypeFor(samplerate) {
  const rate = Number(samplerate) || 48000;
  if (rate % 44100 === 0) return "Fweighted441";
  if (rate % 48000 === 0) return "Gesemann48";
  return "Flat";
}

function normalizeDspAnswers(answers) {
  if (!answers) return answers;
  const setupMap     = { subwoofer: "2 Speakers + 1 Subwoofer" };
  const acousticsMap = { echoey: "Echoey" };
  const placementMap = { left: "Closer to the Left Speaker", right: "Closer to the Right Speaker" };
  const sizeMap       = { small: "Small / Desktop", medium: "Medium / Bookshelf" };
  const wallsMap      = { wall: "Pushed against a wall", corner: "Tucked in a corner / Shelf" };
  return {
    ...answers,
    q1_setup:     setupMap[answers['1']]     || answers.q1_setup,
    q2_acoustics: acousticsMap[answers['2']] || answers.q2_acoustics,
    q3_placement: placementMap[answers['3']] || answers.q3_placement,
    q5_size:      sizeMap[answers['5']]      || answers.q5_size,
    q7_walls:     wallsMap[answers['7']]     || answers.q7_walls,
  };
}

// --- CamillaDSP Configuration Generator ---
// pureDirect = true: bypass all EQ, output flat pipeline (volume control still active)
// balance: -12..+12 dB. Positive = right louder (attenuate left). Negative = left louder (attenuate right).
// phaseLeft/phaseRight: invert polarity of that channel
// autoHeadroom = true: attenuate pre-amp by the computed EQ peak instead of the static preset value
// Exported so the generated YAML can be validated offline against the real
// binary (`camilladsp --check`) without touching the live service.
export function generateCamillaConfig(rawAnswers, eqSettings, dacInfo, {
  pureDirect = false, balance = 0, phaseLeft = false, phaseRight = false, bitPerfect = true, autoHeadroom = true, btOutputActive = false,
  firEnabled = false, firFilterPath = null, firChannels = 1,
} = {}) {
  const answers = normalizeDspAnswers(rawAnswers);
  const isDspActive = answers && (answers[0] === 'dsp' || answers['0'] === 'dsp');
  const isSubwooferSetup = answers && answers.q1_setup === "2 Speakers + 1 Subwoofer";
  // 'On Stage' preset (EQ_PRESETS in src/components/EqualizerControl.jsx) keys
  // the concert-venue spatial pipeline below by NAME — the client already
  // stores the preset name in eq_settings, so no extra payload field is
  // needed, and any slider tweak renames the preset to 'Custom' which
  // switches the stage off automatically. Pure Direct early-returns before
  // any of this, so it bypasses the stage like it bypasses all EQ.
  const stageActive = (eqSettings?.preset || '') === 'On Stage';

  // Capture (loopback) sample format. In bit-perfect mode the whole bridge runs
  // at 32-bit so source bit-depth survives — no truncation to 16-bit. The
  // proven fixed-rate fallback also benefits (S32 instead of the old S16_LE).
  const captureFormat = bitPerfect ? "S32_LE" : "S16_LE";

  // Named presets and "Custom" are the same code path: the client always
  // sends bands/preAmp/noiseFloor/saturation alongside the preset name (see
  // EQ_PRESETS in src/components/EqualizerControl.jsx), so a preset IS just
  // those five band definitions. Previously a named preset used a hand-tuned,
  // totally unrelated filter curve from `presetDatabase` (different
  // frequencies, filter types, and preampGain) while only "Custom" honored
  // eqSettings — the instant you nudged one slider, the whole curve and gain
  // staging jumped from the preset's bespoke values to the slider-derived
  // ones, which is exactly the "boosts 20x" discontinuity this fixes.
  //
  // Phase 3 (real parametric EQ): bands are now {type,freq,gain,q} objects,
  // not bare gain numbers against a hardcoded 60/250/1k/4k/16kHz template —
  // freq and Q are genuinely user-adjustable per band. migrateBands() is
  // called here too (not just in event-service.js's load/save paths)
  // because this function is explicitly documented as usable standalone for
  // offline YAML validation, so it can't assume that migration already ran.
  const bands = migrateBands(eqSettings?.bands);
  const bandGains = bands.map(b => b.gain);
  // Auto-headroom: subtract the largest positive band boost from pre-amp to prevent clipping.
  const maxBoost = Math.max(0, ...bandGains);
  const profile = {
    preampGain: (Number(eqSettings?.preAmp) || 0.0) - maxBoost,
    noiseFloorLevel: (eqSettings?.noiseFloor > 0) ? (-105.0 + (Number(eqSettings.noiseFloor) * 2.0)) : null,
    useSaturation: (eqSettings?.saturation > 0),
    bands,
  };

  // Compute per-channel balance gains (applied in mixer)
  const balL = balance > 0 ? -Math.abs(balance) : 0;
  const balR = balance < 0 ? -Math.abs(balance) : 0;

  // Output routing + channel map, shared by BOTH the Pure Direct early-return
  // below and the full DSP path further down. These used to be duplicated,
  // and the Pure Direct copy silently drifted out of sync on two counts —
  // each of which killed playback the instant Pure Direct was toggled
  // (AUDIT-2026-08-01):
  //   1. It ignored btOutputActive and always wrote the physical DAC, so
  //      with Bluetooth output selected, enabling Pure Direct yanked audio
  //      off the paired speaker/headphones onto the analogue jack.
  //   2. It hardcoded a 2-out mixer while still taking playback channels
  //      from dacInfo.channels, which updateCamillaConfigFromSettings sets
  //      to 3 for a subwoofer setup — a mixer-out/playback-channel mismatch
  //      CamillaDSP rejects outright, so the config never applied.
  // Deriving both from one place makes that class of drift impossible:
  // Pure Direct now differs from the DSP path only in what it's supposed to
  // differ in (no EQ, no resampler), never in where the audio goes.
  const playbackDevice = btOutputActive
    ? { type: "Alsa", channels: 2, device: "camilla_bt_output", format: "S16_LE" }
    : {
        type: "Alsa",
        // A subwoofer setup needs the third output channel; Bluetooth A2DP is
        // strictly stereo, so the sub is not applicable on that path.
        channels: isSubwooferSetup ? 3 : 2,
        device: dacInfo.device || "hw:CARD=DAC,DEV=0",
        format: dacInfo.format || "S24_3_LE",
      };
  const speakerMap = (!btOutputActive && isSubwooferSetup)
    ? {
        channels: { in: 2, out: 3 },
        mapping: [
          { dest: 0, sources: [{ channel: 0, gain: balL }] },
          { dest: 1, sources: [{ channel: 1, gain: balR }] },
          { dest: 2, sources: [{ channel: 0, gain: -3.0 + balL }, { channel: 1, gain: -3.0 + balR }] },
        ],
      }
    : {
        channels: { in: 2, out: 2 },
        mapping: [
          { dest: 0, sources: [{ channel: 0, gain: balL }] },
          { dest: 1, sources: [{ channel: 1, gain: balR }] },
        ],
      };

  // Pure Direct: bypass all EQ — flat pipeline with unity gain only.
  // Volume control via CamillaDSP SetVolume remains active.
  if (pureDirect) {
    const pdFilters = {};
    const pdPipeLeft  = [];
    const pdPipeRight = [];
    if (phaseLeft)  { pdFilters.phase_left  = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; pdPipeLeft.push("phase_left"); }
    if (phaseRight) { pdFilters.phase_right = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; pdPipeRight.push("phase_right"); }
    // AUDIT-2026-08-24: a true-peak safety net — CamillaDSP's computed
    // headroom (biquad-cascade magnitude analysis) has no way to see
    // inter-sample overs in the SOURCE material itself, and Pure Direct
    // otherwise has zero ceiling at all beyond whatever the source and
    // volume happen to sum to. soft_clip's cubic knee only engages within a
    // fraction of a dB of clip_limit, so ordinary program material never
    // touches it — belt-and-suspenders, not a tone-shaping stage.
    pdFilters.true_peak_limiter = { type: "Limiter", parameters: { clip_limit: -0.3, soft_clip: true } };
    pdPipeLeft.push("true_peak_limiter");
    pdPipeRight.push("true_peak_limiter");
    // Dither is a fidelity improvement (replaces quantization distortion with
    // inaudible shaped noise), not tone-coloring processing, so it's applied
    // even in Pure Direct — unlike EQ/rate-adjust, which that mode deliberately
    // bypasses. Only matters when truncating to 16-bit output.
    // AUDIT-2026-08-24: gate was `dacInfo.format` (the physical DAC's own
    // capability), but the ACTUAL ALSA write target when Bluetooth output is
    // active is playbackDevice — hardcoded S16_LE regardless of the DAC — so
    // on a real hi-res DAC (e.g. S32_LE) with Bluetooth output selected, this
    // never matched, and 16-bit truncation happened at the final write with
    // no dither applied at all. Gating on playbackDevice.format (the format
    // actually being written) is correct for both the direct-DAC and
    // Bluetooth paths.
    if ((playbackDevice.format || '').startsWith('S16')) {
      pdFilters.dither_16bit = { type: "Dither", parameters: { type: ditherTypeFor(dacInfo.samplerate), bits: 16 } };
      pdPipeLeft.push("dither_16bit");
      pdPipeRight.push("dither_16bit");
    }
    const pdPipeline = [{ type: "Mixer", name: "speaker_map" }];
    if (pdPipeLeft.length)  pdPipeline.push({ type: "Filter", channels: [0], names: pdPipeLeft });
    if (pdPipeRight.length) pdPipeline.push({ type: "Filter", channels: [1], names: pdPipeRight });
    const pdConfig = {
      devices: {
        samplerate: dacInfo.samplerate || 44100,
        // AUDIT-2026-08-24: 1024 -> 2048, matching updatePipeWireClock()'s
        // quantum bump — see that function's comment for why. Measured live
        // at 1.15 processingLoad (115%) in THIS exact Pure Direct path (no
        // EQ/FIR active), so this is the more urgent of the two to fix.
        chunksize: 2048,
        queuelimit: 4,
        capture:  { type: "Alsa", channels: 2, device: "loop_dsnoop", format: captureFormat },
        playback: playbackDevice,
        silence_threshold: -90,
        silence_timeout: 60,
      },
      mixers: { speaker_map: speakerMap },
      filters: pdFilters,
      pipeline: pdPipeline,
    };
    return pdConfig;
  }

  let config = {
    devices: {
      samplerate: dacInfo.samplerate || 44100,
      // AUDIT-2026-08-24: 1024 -> 2048 — see the Pure Direct path above and
      // updatePipeWireClock()'s comment for the full rationale.
      chunksize: 2048,
      queuelimit: 4,
      // CamillaDSP 4.1.3 is built with ALSA-only backends (no Pulse/PipeWire).
      // Audio reaches here via: PipeWire → ResonanceInput virtual sink
      //   → PW loopback module → hw:Loopback,0,0 → ALSA dsnoop (loop_dsnoop)
      capture: { type: "Alsa", channels: 2, device: "loop_dsnoop", format: captureFormat },
      // Bluetooth output routes through the "camilla_bt_output" ALSA PCM
      // (pipewire-alsa plugin → the paired device's bluez_output PipeWire
      // node — see ensureAsoundConf) instead of the physical DAC. A2DP is a
      // 16-bit lossy link regardless of source bit-depth, and PipeWire itself
      // resamples for the actual Bluetooth transmission, so there's nothing
      // bit-perfect to preserve here — plain S16_LE keeps it simple.
      playback: playbackDevice,
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

  // Phase 3 (FIR import): a custom convolution filter REPLACES the 5-band
  // parametric EQ entirely rather than layering on top of it — a measured
  // impulse response already contains whatever tonal correction it needs,
  // and stacking a second, independently-tuned EQ on top risks double-
  // correcting the same frequencies. Mirrors how Room Calibration already
  // excludes manual EQ for the same reason (see the DSP Active overlay in
  // EqualizerControl.jsx). Saturation/noiseFloor/preAmp are character
  // effects, not corrective EQ, so they keep applying on top either way.
  if (firEnabled && firFilterPath) {
    if (firChannels >= 2) {
      config.filters.fir_convolution_l = { type: "Conv", parameters: { type: "Wav", filename: firFilterPath, channel: 0 } };
      config.filters.fir_convolution_r = { type: "Conv", parameters: { type: "Wav", filename: firFilterPath, channel: 1 } };
    } else {
      config.filters.fir_convolution = { type: "Conv", parameters: { type: "Wav", filename: firFilterPath } };
    }
  } else {
    // Build Profile 5-Band Filters
    profile.bands.forEach((band, index) => {
      const filterKey = `profile_band_${index + 1}`;
      if (band.type === "Highpass" || band.type === "Lowpass") {
        config.filters[filterKey] = { type: "Biquad", parameters: { type: band.type, freq: band.freq, q: band.q } };
      } else {
        config.filters[filterKey] = { type: "Biquad", parameters: { type: band.type, freq: band.freq, gain: band.gain, q: band.q } };
      }
    });
  }

  // Build Saturation filter — one formula for every preset name, same
  // reasoning as the band unification above.
  if (profile.useSaturation) {
    config.filters.analog_saturation = { type: "Biquad", parameters: { type: "Peaking", freq: 80, gain: Number(eqSettings?.saturation || 0) * 0.25, q: 1.5 } };
  }

  // analog_noise_floor intentionally omitted: a series Gain filter at -95dB attenuates
  // the signal to silence rather than adding noise. Disabled until implemented correctly.

  // Setup Crossovers and Crossover Caster Filters
  // Same routing the Pure Direct path uses (see playbackDevice/speakerMap
  // above) — kept identical on purpose so toggling Pure Direct never changes
  // where the audio goes or how many channels it carries.
  config.mixers.speaker_map = speakerMap;

  // --- STAGE S: 'ON STAGE' CONCERT-VENUE SPATIALIZATION ---
  // Runs on the raw 2ch capture BEFORE speaker_map and the tonal EQ chains.
  // Real-time stem separation ("put the bass player on the left") is not
  // feasible in a low-latency DSP pipeline, so this recreates the two things
  // the brain actually uses to feel "in the room with the band":
  //
  // 1. Early reflections — each output gets a quiet (-13 dB), delayed copy
  //    of the OPPOSITE channel, like hearing the far side of the stage off
  //    the venue walls. Delays sit in the Haas fusion zone (17/23 ms —
  //    asymmetric like a real room, long enough for spaciousness, short
  //    enough to fuse instead of echo), the copy is highpassed at 280 Hz so
  //    the low end stays punchy instead of muddy, and high-shelved -7 dB
  //    above 7.5 kHz because air absorbs treble over distance — the HF
  //    roll-off is what makes the reflections read as "far walls".
  // 2. Mid/side width — L/R is matrixed to mid/side (encode at -6.02 dB so
  //    decode at unity reconstructs exactly), the side channel gets a gentle
  //    +2.5 dB shelf above 300 Hz (bass stays mono/anchored, guitars/keys/
  //    ambience spread beyond the speaker edges), then decodes back to L/R.
  //    Vocals and drums live in the mid channel and stay locked center.
  //
  // CamillaDSP has no built-in "Crossfeed"/reverb filter type — this is the
  // supported way to build the effect from Mixer + Delay + Biquad primitives.
  if (stageActive) {
    config.mixers.stage_reflect_split = {
      channels: { in: 2, out: 4 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: 0 }] },
        { dest: 1, sources: [{ channel: 1, gain: 0 }] },
        { dest: 2, sources: [{ channel: 1, gain: -13 }] },  // L reflection ← R
        { dest: 3, sources: [{ channel: 0, gain: -13 }] },  // R reflection ← L
      ],
    };
    config.mixers.stage_reflect_merge = {
      channels: { in: 4, out: 2 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: 0 }, { channel: 2, gain: 0 }] },
        { dest: 1, sources: [{ channel: 1, gain: 0 }, { channel: 3, gain: 0 }] },
      ],
    };
    config.mixers.stage_ms_encode = {
      channels: { in: 2, out: 2 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: -6.02 }, { channel: 1, gain: -6.02 }] },                  // Mid
        { dest: 1, sources: [{ channel: 0, gain: -6.02 }, { channel: 1, gain: -6.02, inverted: true }] },  // Side
      ],
    };
    config.mixers.stage_ms_decode = {
      channels: { in: 2, out: 2 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: 0 }, { channel: 1, gain: 0 }] },                  // L = M+S
        { dest: 1, sources: [{ channel: 0, gain: 0 }, { channel: 1, gain: 0, inverted: true }] },  // R = M-S
      ],
    };
    config.filters.stage_reflect_bass_cut = { type: "Biquad", parameters: { type: "Highpass", freq: 280, q: 0.707 } };
    config.filters.stage_reflect_air_loss = { type: "Biquad", parameters: { type: "Highshelf", freq: 7500, gain: -7.0, q: 0.7 } };
    config.filters.stage_reflect_delay_left  = { type: "Delay", parameters: { delay: 17, unit: "ms" } };
    config.filters.stage_reflect_delay_right = { type: "Delay", parameters: { delay: 23, unit: "ms" } };
    config.filters.stage_side_width = { type: "Biquad", parameters: { type: "Highshelf", freq: 300, gain: 2.5, q: 0.5 } };
  }

  let leftPipeline = [];
  let rightPipeline = [];
  let subPipeline = [];

  // --- STAGE A: ROOM CALIBRATION MASTER STACK ---
  // Built from ROOM_CAL_MASTER_CURVE (above) — the single source of truth
  // also used by the auto-headroom calculation further down, so the two
  // can't drift apart the way they did before AUDIT-2026-08-24.
  if (isDspActive) {
    for (const f of ROOM_CAL_MASTER_CURVE) {
      config.filters[f.key] = {
        type: "Biquad",
        parameters: { type: f.type, freq: f.freq, ...(f.gain !== undefined ? { gain: f.gain } : {}), q: f.q },
      };
    }
    const masterCurveFilters = ROOM_CAL_MASTER_CURVE.map(f => f.key);
    leftPipeline.push(...masterCurveFilters);
    rightPipeline.push(...masterCurveFilters);
  }

  // --- STAGE B: INJECT PROFILE EQ BANDS (or the FIR convolution replacing them) ---
  if (firEnabled && firFilterPath) {
    if (firChannels >= 2) {
      leftPipeline.push("fir_convolution_l");
      rightPipeline.push("fir_convolution_r");
    } else {
      leftPipeline.push("fir_convolution");
      rightPipeline.push("fir_convolution");
    }
  } else {
    profile.bands.forEach((band, index) => {
      const filterKey = `profile_band_${index + 1}`;
      leftPipeline.push(filterKey);
      rightPipeline.push(filterKey);
      if (isSubwooferSetup && index < 2 && band.type !== "Highpass") {
        subPipeline.push(filterKey);
      }
    });
  }

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
  // AUDIT-2026-08-24: tracks whether baseGainDb already reflects Room
  // Calibration's own master-curve peak (see below) — only the autoHeadroom
  // branch actually computes that now. When it does, the flat -6dB
  // isDspActive margin further down must NOT also apply on top of it, or
  // the master curve's headroom gets double-counted (harmless — just extra
  // needless attenuation — but no longer "correct by calculation", which
  // was the whole point of this fix).
  let dspHeadroomComputed = false;
  if (firEnabled && firFilterPath) {
    // computeEqPeakDb analyzes a biquad cascade's frequency response — it
    // has no way to know a convolution kernel's actual peak (that would
    // need an FFT of the impulse itself, not implemented here). A fixed
    // -6dB trim is a conservative v1 approximation, surfaced to the user as
    // approximate rather than presenting a biquad-derived number that would
    // be meaningless for FIR.
    const userPreAmp = Number(eqSettings?.preAmp) || 0;
    baseGainDb = userPreAmp - 6.0;
    _lastHeadroomDb = 6.0;
  } else if (autoHeadroom) {
    const fs = dacInfo?.samplerate || 48000;
    // Room Calibration's master curve (STAGE A) and the saturation "warmth"
    // filter both cascade with the user's own bands in the real pipeline —
    // analyzed together here so the computed peak reflects the actual
    // combined response, not the user's bands in isolation.
    // AUDIT-2026-08-24: previously this only ever measured profile.bands,
    // missing the master curve's own gain (up to +5.5dB at
    // harman_bass_shelf — see ROOM_CAL_MASTER_CURVE's own comment above) AND
    // approximating saturation's contribution as a flat +2.0dB regardless of
    // its actual slider value — saturation's real max is +2.5dB (slider=10,
    // gain = saturation*0.25, matching the analog_saturation filter this
    // function builds a few lines below), under-reserving headroom by up to
    // 0.5dB at full saturation. Pushing saturation's own real filter
    // definition into the same cascade array replaces both approximations
    // with one exact calculation.
    const headroomBands = [
      ...(isDspActive ? ROOM_CAL_MASTER_CURVE : []),
      ...(profile.bands || []),
    ];
    if (profile.useSaturation) {
      headroomBands.push({ type: "Peaking", freq: 80, gain: Number(eqSettings?.saturation || 0) * 0.25, q: 1.5 });
    }
    const peak = computeEqPeakDb(headroomBands, fs);
    const userPreAmp = Number(eqSettings?.preAmp) || 0;
    baseGainDb = userPreAmp - peak;
    _lastHeadroomDb = Math.round(peak * 10) / 10;
    dspHeadroomComputed = isDspActive;
  } else {
    baseGainDb = Number(profile.preampGain) || 0;
    _lastHeadroomDb = Math.max(0, -baseGainDb);
  }
  let preampGainDb = Number((isDspActive && !dspHeadroomComputed) ? (baseGainDb - 6.0) : baseGainDb) || 0;
  // The 'On Stage' spatial pipeline adds energy the biquad-response headroom
  // scan can't see: worst-case correlated reflection summing (+1.8 dB at
  // -13 dB) plus the +2.5 dB side shelf on fully-side content ≈ +4.3 dB.
  if (stageActive) preampGainDb -= 4.5;
  config.filters.preamp_gain = { type: "Gain", parameters: { gain: preampGainDb - 1.0, inverted: false, mute: false } };
  leftPipeline.push("preamp_gain");
  rightPipeline.push("preamp_gain");
  if (isSubwooferSetup) subPipeline.push("preamp_gain");

  if (phaseLeft)  { config.filters.phase_left  = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; leftPipeline.push("phase_left"); }
  if (phaseRight) { config.filters.phase_right = { type: "Gain", parameters: { gain: 0, inverted: true, mute: false } }; rightPipeline.push("phase_right"); }

  // AUDIT-2026-08-24: a true-peak safety net — computeEqPeakDb() has no way
  // to see inter-sample overs in the SOURCE material itself, only the EQ's
  // OWN gain, and saturation's contribution was previously a flat guess
  // (now computed exactly, but this remains cheap, independent insurance
  // against that class of blind spot generally). soft_clip's cubic knee
  // only engages within a fraction of a dB of clip_limit — inaudible on
  // ordinary program material, not a tone-shaping stage.
  config.filters.true_peak_limiter = { type: "Limiter", parameters: { clip_limit: -0.3, soft_clip: true } };
  leftPipeline.push("true_peak_limiter");
  rightPipeline.push("true_peak_limiter");
  if (isSubwooferSetup) subPipeline.push("true_peak_limiter");

  // Dither only matters when truncating to 16-bit output (this VM's onboard
  // HDA is S16_LE; some budget DACs too) — without it, the EQ/volume/resample
  // math above (all float-precision) truncates to 16-bit undithered, adding
  // quantization distortion. Skip entirely for 24/32-bit outputs, where the
  // extra headroom makes it unnecessary. Must be the LAST filter in the
  // chain (dither after all gain/EQ stages, right before the ALSA write).
  // AUDIT-2026-08-24: gate was dacInfo.format (the physical DAC's own
  // capability) — see the matching Pure Direct comment above for why
  // playbackDevice.format (what's actually written when Bluetooth output
  // is active, hardcoded S16_LE regardless of the DAC) is the correct gate.
  if ((playbackDevice.format || '').startsWith('S16')) {
    config.filters.dither_16bit = { type: "Dither", parameters: { type: ditherTypeFor(dacInfo.samplerate), bits: 16 } };
    leftPipeline.push("dither_16bit");
    rightPipeline.push("dither_16bit");
    if (isSubwooferSetup) subPipeline.push("dither_16bit");
  }

  // --- STAGE F: COMPILE THE PIPELINE MATRIX ---
  // CamillaDSP v4: Filter steps use 'channels' (array) instead of v2's 'channel' (integer).
  // SetVolume controls the built-in main volume fader — no Volume filter needed in pipeline.
  if (stageActive) {
    config.pipeline.push(
      { type: "Mixer", name: "stage_reflect_split" },
      { type: "Filter", channels: [2], names: ["stage_reflect_bass_cut", "stage_reflect_air_loss", "stage_reflect_delay_left"] },
      { type: "Filter", channels: [3], names: ["stage_reflect_bass_cut", "stage_reflect_air_loss", "stage_reflect_delay_right"] },
      { type: "Mixer", name: "stage_reflect_merge" },
      { type: "Mixer", name: "stage_ms_encode" },
      { type: "Filter", channels: [1], names: ["stage_side_width"] },
      { type: "Mixer", name: "stage_ms_decode" },
    );
  }
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
// dacInfo is needed for the hardware-mixer step at the end (which card to
// open) — it must be the same detected DAC the generated config plays to.
async function ensureAsoundConf(bitPerfect = true, btOutputNode = null, dacInfo = null) {
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
        # buffer_size is NOT optional here (AUDIT-2026-08-01). With only
        # period_size set, ALSA sized this dmix ring at 3072 frames — ~64 ms
        # at 48 kHz — and, because dmix pins its params for whoever opens it
        # first (the permanent PipeWire aloop-sink node), every later client
        # inherited that tiny ring for the life of the session. Clients that
        # write in small period-sized chunks (aplay, MPD) coped; librespot
        # writes in larger bursts and underran on the very first write of
        # every track: "snd_pcm_writei failed with error 'Broken pipe (32)'"
        # → track aborts → spirc immediately loads the next one → Spotify
        # appeared to skip through the whole library playing nothing.
        # Reproduced live and confirmed NOT fixed by a reboot. 16384 frames
        # (~341 ms, 16 periods) gives burst-writers ample headroom while
        # staying well inside the latency this appliance already tolerates.
        buffer_size 16384
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
        # Matches camilla_input's ring above — the capture side is read by
        # CamillaDSP in 1024-frame chunks, and a ring this size absorbs the
        # scheduling jitter behind the recurring "Capture read 1022 frames
        # instead of the requested 1024" warnings.
        buffer_size 16384
    }
}
${btOutputNode ? `
# Bluetooth output — CamillaDSP writes here instead of the DAC when a paired
# device is selected as the active output. pipewire-alsa forwards straight
# into the bluez_output node WirePlumber created for that device; no extra
# loopback/dmix needed since this is a single dedicated writer.
pcm.camilla_bt_output {
    type pipewire
    playback_node "${btOutputNode}"
}
` : ''}`;

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

  // Set the DAC's hardware mixer to unity gain (0dB) so CamillaDSP owns the
  // entire gain stage via SetVolume — any analogue attenuation here is pure
  // lost output the user can never get back with the volume knob, and any
  // analogue BOOST here (some controls' 100% sits above 0dB) is uncontrolled
  // gain CamillaDSP's own fader can't account for.
  //
  // AUDIT-2026-08-01: this used a hardcoded `-c 0`, which on a Pi 4 is the
  // snd-aloop LOOPBACK (card 0), not the DAC — `cat /proc/asound/cards`:
  // 0 Loopback, 1 Headphones, 2/3 vc4hdmi. So it kept setting the loopback's
  // volume (already max, and irrelevant) while the real output sat wherever
  // it happened to be: found live at -19.88 dB / 78%, ~20 dB of silently
  // discarded headroom, which is exactly the "everything is too quiet even
  // at max" symptom. The old `255,255` literal was wrong for the same
  // reason it appeared to work — that raw range belongs to the loopback's
  // control; the bcm2835 headphone control is -10239..400 in 0.01 dB units,
  // where 255 would mean +2.55 dB, not "max". Percentages are the only
  // range-agnostic way to say "fully open" across USB DACs, HATs and the
  // built-in jack alike.
  const dacCard = /CARD=([^,]+)/.exec(dacInfo?.device || '')?.[1] || null;
  if (!dacCard) {
    console.warn('[ALSA] No DAC card name in device string — skipping hardware volume setup.');
    return;
  }
  // Control naming is not standardised: bcm2835 exposes "PCM", most USB DACs
  // "Master" or "Speaker", some DAC HATs "Digital" or "Playback". Probe what
  // this card actually has rather than guessing one name.
  let controls;
  try {
    ({ stdout: controls } = await execPromise(`amixer -c ${dacCard} scontrols`));
  } catch (err) {
    console.warn(`[ALSA] Could not enumerate mixer controls on card ${dacCard} (non-fatal):`, err.message);
    return;
  }
  const available = [...controls.matchAll(/Simple mixer control '([^']+)'/g)].map(m => m[1]);
  const target = ['PCM', 'Master', 'Digital', 'Speaker', 'Playback', 'Headphone']
    .find(name => available.includes(name));
  if (!target) {
    // A bit-perfect DAC with no hardware mixer at all is normal, not an error.
    console.log(`[ALSA] Card ${dacCard} exposes no volume control (${available.join(', ') || 'none'}) — CamillaDSP already owns the full gain stage.`);
    return;
  }
  try {
    // AUDIT-2026-08-03: was `100%` — correct on a DAC whose control tops out
    // AT 0dB, but wrong on this board's bcm2835 "Headphones" PCM control,
    // whose own raw range (-10239..400 in 0.01dB units, per the
    // AUDIT-2026-08-01 comment above) tops out at +4.00dB. "100%" landed
    // there, silently adding a real +4dB of hardware gain on top of
    // CamillaDSP's own fader on every restart — reported live as "volume is
    // up... looks like gain" right after a restart re-asserted this pin.
    // `0dB` is an explicit absolute value amixer resolves directly (not a
    // percentage of the control's own range), so it lands at true unity
    // regardless of where a given card's ceiling sits — still fully open on
    // a card whose ceiling IS 0dB, no longer an unintended boost on one
    // whose ceiling sits above it. amixer clamps out-of-range requests to
    // the nearest valid step, so this degrades safely even on a control
    // whose range doesn't actually include 0dB.
    await execPromise(`amixer -c ${dacCard} sset '${target}' 0dB unmute`);
    console.log(`[ALSA] Set hardware volume to unity gain: card ${dacCard}, control '${target}' → 0dB.`);
  } catch (err) {
    console.warn(`[ALSA] Could not set '${target}' on card ${dacCard} (non-fatal):`, err.message);
  }
}

// AUDIT-2026-08-24: lets dj.js's duckThroughCut() suppress the trailing
// "SAFETY: always restore volume" step below while a duck/announcement is
// deliberately in progress. Without this, an unrelated concurrent config
// regen (an EQ tweak from a second connected client, an MPD sample-rate
// change) firing mid-duck snapped CamillaDSP straight back to the full,
// un-ducked level — which duckThroughCut's own fade-back-up then fought,
// producing an audible volume glitch/jump mid-announcement.
let _duckInProgress = false;
export function setDuckInProgress(active) { _duckInProgress = !!active; }

// AUDIT-2026-08-24: two independent async chains (an EQ tweak and, say, an
// MPD sample-rate change) used to call the real implementation below
// concurrently with no ordering guarantee — each does its own DB reads,
// writes the same camilladsp.yml, and does a WS SetConfig round-trip, so
// whichever happened to finish last silently won regardless of which was
// actually the newer request: CamillaDSP could end up running a stale
// config while the DB/broadcast UI already showed the newest settings, or
// two overlapping SetConfig-failure fallbacks could each independently
// restart camilladsp back-to-back. Chaining every call through one shared
// promise serializes them into the order they were actually invoked — the
// exported name keeps its original signature/behavior for every caller,
// only WHEN each call's real work is allowed to start has changed.
let _configUpdateChain = Promise.resolve();
export function updateCamillaConfigFromSettings(opts) {
  const result = _configUpdateChain.then(() => _updateCamillaConfigFromSettingsImpl(opts));
  // Keep the chain moving even if this call rejected — a failed regen must
  // not permanently wedge every future call behind it — but don't let that
  // rejection propagate anywhere except to THIS call's own caller (via the
  // separate `result` promise returned above).
  _configUpdateChain = result.catch(() => {});
  return result;
}

// Real implementation — call updateCamillaConfigFromSettings() (above) in
// application code, never this directly, or the serialization above is bypassed.
async function _updateCamillaConfigFromSettingsImpl({ skipAlsa = false, samplerate = null, pureDirect = false, forceRestart = false } = {}) {
  const [dspVal, eqVal, balanceVal, phaseVal, bitPerfectVal, headroomVal, btOutVal, firEnabledVal, firPathVal, firMetaVal] = await Promise.all([
    getSetting('dsp_calibration'),
    getSetting('eq_settings'),
    getSetting('balance'),
    getSetting('phase'),
    getSetting('bitperfect'),
    getSetting('auto_headroom'),
    getSetting('bluetooth_output'),
    getSetting('fir_enabled'),
    getSetting('fir_filter_path'),
    getSetting('fir_filter_meta'),
  ]);
  const firEnabled = firEnabledVal === 'true' && !!firPathVal;
  let firChannels = 1;
  try { firChannels = firMetaVal ? (JSON.parse(firMetaVal).channels || 1) : 1; } catch { firChannels = 1; }
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

  // Bluetooth output: { enabled, mac, name } — mac uses colons (BlueZ form);
  // the bluez_output PipeWire node WirePlumber creates for it uses underscores.
  const btOut = btOutVal ? JSON.parse(btOutVal) : null;
  const btOutputActive = !!(btOut?.enabled && btOut?.mac);
  const btOutputNode = btOutputActive ? `bluez_output.${btOut.mac.replace(/:/g, '_')}.1` : null;

  // Scan for DAC capability automatically. Must happen BEFORE
  // ensureAsoundConf — that function's hardware-mixer step needs to know
  // which card the DAC actually is (see its own comment on why a hardcoded
  // card number was silently wrong).
  const dacInfo = detectDac();
  console.log('[CamillaDSP] Detected audio device capabilities:', dacInfo);

  // Auto-configure ALSA Loopback routing — skip during EQ updates since
  // ALSA config never changes when only EQ bands/levels are adjusted
  if (!skipAlsa) await ensureAsoundConf(bitPerfect, btOutputNode, dacInfo);

  // Sync PipeWire clock.allowed-rates to exactly the rates this DAC supports.
  // Fire-and-forget — never blocks the config generation path.
  if (!skipAlsa) {
    updatePipeWireClock(dacInfo, bitPerfect).catch(err =>
      console.warn('[PipeWire] Clock update failed (non-fatal):', err.message)
    );
    // Keep the static aloop-sink node's audio.format in lockstep with
    // camilla_input's dmix format — a mismatch here crashes PipeWire outright
    // (AUDIT-2026-08-01, see updateAloopSinkFormat's own comment).
    updateAloopSinkFormat(bitPerfect).catch(err =>
      console.warn('[PipeWire] Aloop-sink format update failed (non-fatal):', err.message)
    );
  }

  // Subwoofer channel count is derived inside generateCamillaConfig now (it
  // owns playbackDevice/speakerMap together so the two can't disagree) — no
  // dacInfo mutation needed here any more.

  // Rate override from MPD rate watcher — matches CamillaDSP capture to source rate
  if (samplerate && samplerate > 0) {
    dacInfo.samplerate = samplerate;
    console.log(`[CamillaDSP] Using MPD-detected sample rate: ${samplerate} Hz`);
  }

  // Generate CamillaDSP yaml configuration
  const configObj = generateCamillaConfig(answers, eqSettings, dacInfo, {
    pureDirect, balance, phaseLeft: phase.left, phaseRight: phase.right, bitPerfect, autoHeadroom, btOutputActive,
    firEnabled, firFilterPath: firPathVal, firChannels,
  });
  const yamlString = YAML.stringify(configObj, { indent: 2 });

  // Save configuration file
  const configPath = path.resolve(__dirname, '../camilladsp.yml');
  fs.writeFileSync(configPath, yamlString, 'utf8');
  console.log(`[CamillaDSP] Generated sound profile successfully: ${configPath}`);

  // Apply config via CamillaDSP WebSocket hot-reload (no audio gap).
  // Falls back to systemctl restart only when CamillaDSP WS isn't available —
  // UNLESS forceRestart is set, which skips straight to a real restart.
  //
  // forceRestart exists because hot-reload (SetConfig) never closes/reopens
  // the underlying ALSA/PipeWire device when the device NAME string in the
  // config is unchanged — it just swaps filters on the already-open stream.
  // That's normally exactly what you want (no audio gap on an EQ tweak), but
  // it's wrong for Bluetooth: `camilla_bt_output` is a stable alias in
  // /etc/asound.conf whose underlying `playback_node` target can point at a
  // different (or freshly-reconnected) bluez_output.<mac>.1 node than the one
  // that existed when CamillaDSP's PipeWire client last opened it. WirePlumber
  // only resolves that target AT OPEN TIME — if CamillaDSP has been running
  // since before this Bluetooth device connected (or across a disconnect/
  // reconnect cycle), its already-open stream stays linked to whatever it
  // fell back to (the "ResonanceInput" default sink), silently producing zero
  // audible output despite every layer below it (BlueZ, the ALSA bridge PCM,
  // the speaker itself) working fine. Confirmed live 2026-08-01: `wpctl
  // status` showed CamillaDSP's own stream linked to "Resonance HiFi Input"
  // instead of the AirPods node while capture-side RMS proved real audio was
  // flowing through — only a full `systemctl restart camilladsp` (forcing a
  // fresh PipeWire connection) made it re-link to the correct output.
  const hotReloaded = forceRestart ? false : await hotReloadCamilla(yamlString);
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
  // AUDIT-2026-08-24: skipped while dj.js's duckThroughCut() has a duck
  // deliberately in progress — see setDuckInProgress()'s own comment for
  // the audible-jump bug this closes.
  if (_duckInProgress) {
    console.log('[CamillaDSP] Skipped post-config volume restore — DJ duck in progress.');
  } else {
    try {
      const targetDb = getEffectiveVolumeDb();
      const ok = await setCamillaVolume(targetDb);
      if (ok) console.log(`[CamillaDSP] Volume restored to ${targetDb.toFixed(1)} dB after config apply.`);
    } catch (err) {
      console.warn('[CamillaDSP] Volume restore failed (non-fatal):', err.message);
    }
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
