import express from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getFavoriteRadios, addFavoriteRadio, deleteFavoriteRadioByUrl, setSetting, getSetting } from './db.js';
import { emit, getStandbyState } from './event-service.js';

// ── Streaming source helpers ──────────────────────────────────────────────────
async function systemctlAction(action, service) {
  try {
    await execPromise(`sudo systemctl ${action} ${service}`);
    return true;
  } catch (err) {
    console.warn(`[${service}] systemctl ${action} failed:`, err.message);
    return false;
  }
}

async function isServiceActive(service) {
  try {
    const { stdout } = await execPromise(`systemctl is-active ${service}`);
    return stdout.trim() === 'active';
  } catch { return false; }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = promisify(exec);
const execFilePromise = promisify(execFile);
const router = express.Router();

// POST /api/player/play -> Play local media
router.post('/play', async (req, res) => {
  try {
    if (getStandbyState()) {
      await emit('SET_STANDBY', { enabled: false });
    }
    await execPromise('mpc play');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Play failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/pause -> Pause local media
router.post('/pause', async (req, res) => {
  try {
    await execPromise('mpc pause');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Pause failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/next -> Next track on local media
router.post('/next', async (req, res) => {
  try {
    await execPromise('mpc next');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Next failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/previous -> Previous track on local media
router.post('/previous', async (req, res) => {
  try {
    await execPromise('mpc prev');
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Previous failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Map 0-100 slider → dB for CamillaDSP volume control.
// Equal dB steps = equal perceived loudness steps (linear dB range).
// 0 → mute, 50 → -30dB (medium), 75 → -15dB, 100 → 0dB (full).
function toDb(userVol) {
  if (userVol <= 0) return -100;
  return -60 * (1 - userVol / 100);
}

// POST /api/player/volume -> Set volume via CamillaDSP (instant, all sources)
// CamillaDSP applies gain after all ALSA buffers so there is zero lag.
// MPD software mixer stays at 100% — CamillaDSP owns the volume stage.
router.post('/volume', async (req, res) => {
  const vol = parseInt(req.body.volume, 10);
  if (!Number.isFinite(vol) || vol < 0 || vol > 100) {
    return res.status(400).json({ error: 'Invalid volume: must be 0–100' });
  }
  try {
    await setCamillaVolume(toDb(vol));
    res.json({ success: true });
  } catch (err) {
    console.error('[Volume] Failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Set CamillaDSP master volume in dB via WebSocket.
 * Applied after ALL ALSA buffers — instant for every source.
 */
export async function setCamillaVolume(dB) {
  try {
    const { WebSocket } = await import('ws');
    return await new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:1234');
      const timer = setTimeout(() => { ws.terminate(); resolve(false); }, 1500);
      ws.on('open', () => ws.send(JSON.stringify({ SetVolume: dB })));
      ws.on('message', (d) => {
        clearTimeout(timer); ws.close();
        try {
          const msg = JSON.parse(d.toString());
          const ok = msg.SetVolume?.result === 'Ok';
          if (ok) console.log(`[Volume] CamillaDSP volume set to ${dB.toFixed(1)} dB`);
          resolve(ok);
        } catch { resolve(false); }
      });
      ws.on('error', (err) => { clearTimeout(timer); console.warn('[Volume] WS error:', err.message); resolve(false); });
    });
  } catch { return false; }
}

// POST /api/player/seek -> Seek local track
router.post('/seek', async (req, res) => {
  const pos = parseInt(req.body.position, 10);
  if (!Number.isFinite(pos) || pos < 0) {
    return res.status(400).json({ error: 'Invalid position: must be a non-negative integer' });
  }
  try {
    await execPromise(`mpc seek ${pos}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Seek failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/play-radio -> Play web radio stream
router.post('/play-radio', async (req, res) => {
  const { url, name, favicon } = req.body;
  try {
    if (getStandbyState()) {
      await emit('SET_STANDBY', { enabled: false });
    }
    // Save radio-specific metadata (url/name/favicon not covered by events)
    await setSetting('last_radio_url', url);
    if (name) await setSetting('last_radio_name', name);
    await setSetting('last_radio_favicon', favicon || '');

    // Clear playlist, add URL, play
    await execPromise('mpc clear');
    await execFilePromise('mpc', ['add', url]);
    await execPromise('mpc play');

    const stateUpdate = {
      paused: false,
      position: 0,
      duration: 0,
      track_window: {
        current_track: {
          name: name || 'WEB RADIO',
          artists: [{ name: 'Live Stream' }],
          album: { name: 'Web Radio Broadcast', images: favicon ? [{ url: favicon }] : [] },
          url,
        },
      },
    };

    // Route through EventService: persists active_source + broadcasts to all clients.
    // skipAutoResume=true tells the handler not to restart MPC — we already did it above.
    await emit('SET_SOURCE', { spotify: false, source: 'radio', skipAutoResume: true });
    await emit('PLAYBACK_STATE', stateUpdate);

    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Play radio failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/player/radios -> Get saved favorite radios
router.get('/radios', async (req, res) => {
  try {
    const list = await getFavoriteRadios();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/radios -> Add favorite radio
router.post('/radios', async (req, res) => {
  const { name, url, favicon, country, tags } = req.body;
  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required' });
  }
  try {
    const saved = await addFavoriteRadio(name, url, favicon, country, tags);
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/status -> Current MPD playback state (for local source polling)
router.get('/status', async (req, res) => {
  try {
    const [curOut, statOut] = await Promise.all([
      execPromise('mpc -f "%title%\\n%artist%\\n%album%\\n%file%" current').catch(() => ({ stdout: '' })),
      execPromise('mpc status').catch(() => ({ stdout: '' })),
    ]);
    const lines = (curOut.stdout || '').trim().split('\n');
    const [title, artist, album, file] = lines;
    const statusText = statOut.stdout || '';
    const isPlaying = statusText.includes('[playing]');
    const timeMatch = statusText.match(/(\d+):(\d+)\/(\d+):(\d+)/);
    const toMs = (m, s) => (Number(m) * 60 + Number(s)) * 1000;
    res.json({
      paused: !isPlaying,
      position: timeMatch ? toMs(timeMatch[1], timeMatch[2]) : 0,
      duration: timeMatch ? toMs(timeMatch[3], timeMatch[4]) : 0,
      name:   title  || (file ? file.split('/').pop().replace(/\.[^.]+$/, '') : 'Unknown'),
      artist: artist || '',
      album:  album  || '',
      file:   file   || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/player/radios -> Delete favorite radio
router.delete('/radios', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }
  try {
    await deleteFavoriteRadioByUrl(url);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CamillaDSP DAC & Audio Hardware Capabilities Detection ---
function detectDac() {
  let detected = {
    device: "hw:0,0",
    samplerate: 44100,
    format: "S16LE",
    channels: 2
  };

  try {
    const asoundDir = '/proc/asound';
    if (!fs.existsSync(asoundDir)) {
      return detected;
    }

    const files = fs.readdirSync(asoundDir);
    let cards = [];

    for (const file of files) {
      if (file.startsWith('card') && !isNaN(file.substring(4))) {
        const cardPath = path.join(asoundDir, file);
        try {
          const stat = fs.statSync(cardPath);
          if (stat.isDirectory()) {
            const cardIndex = parseInt(file.substring(4), 10);
            let id = '';
            try {
              id = fs.readFileSync(path.join(cardPath, 'id'), 'utf8').trim();
            } catch (e) {}
            cards.push({ index: cardIndex, id, path: cardPath });
          }
        } catch (e) {}
      }
    }

    let usbDac = null;
    for (const card of cards) {
      if (card.id.toLowerCase() === 'loopback') continue;

      let streamFiles = [];
      try {
        streamFiles = fs.readdirSync(card.path).filter(f => f.startsWith('stream'));
      } catch (e) {}

      if (streamFiles.length > 0) {
        const streamPath = path.join(card.path, streamFiles[0]);
        let streamContent = '';
        try {
          streamContent = fs.readFileSync(streamPath, 'utf8');
        } catch (e) {}

        if (streamContent) {
          const rateMatches = streamContent.match(/Sample rates:\s*([^\r\n]+)/i);
          const formatMatches = streamContent.match(/Format:\s*([^\r\n]+)/ig);

          let rates = [];
          if (rateMatches) {
            rates = rateMatches[1].split(',').map(r => parseInt(r.trim(), 10)).filter(r => !isNaN(r));
          }

          let formats = [];
          if (formatMatches) {
            formats = formatMatches.map(f => {
              const m = f.match(/Format:\s*(\S+)/i);
              return m ? m[1] : '';
            }).filter(Boolean);
          }

          let rate = 44100;
          if (rates.includes(44100)) {
            rate = 44100;
          } else if (rates.includes(48000)) {
            rate = 48000;
          } else if (rates.length > 0) {
            rate = rates[0];
          }

          let camillaFormat = "S16LE";
          if (formats.some(f => f.includes("S32_LE"))) {
            camillaFormat = "S32LE";
          } else if (formats.some(f => f.includes("S24_LE"))) {
            camillaFormat = "S24LE";
          } else if (formats.some(f => f.includes("S24_3LE"))) {
            camillaFormat = "S24LE3";
          } else if (formats.some(f => f.includes("S16_LE"))) {
            camillaFormat = "S16LE";
          }

          usbDac = {
            device: card.id ? `hw:CARD=${card.id},DEV=0` : `hw:${card.index},0`,
            samplerate: rate,
            format: camillaFormat,
            channels: 2
          };
          break;
        }
      }
    }

    if (usbDac) {
      return usbDac;
    }

    const mainCard = cards.find(c => c.id.toLowerCase() !== 'loopback');
    if (mainCard) {
      detected.device = mainCard.id ? `hw:CARD=${mainCard.id},DEV=0` : `hw:${mainCard.index},0`;
    }
  } catch (err) {
    console.error('[CamillaDSP] DAC detection error:', err);
  }

  return detected;
}

// --- 1. ADVANCED ANALOG & DIGITAL PROFILE DATABASE (5 BANDS + GAIN + ANALOG)
const presetDatabase = {
  "Clinical Reference": {
    preampGain: 0.0,         // Pure studio transparency, no attenuation needed
    noiseFloorLevel: null,   // Dead silent digital black background
    useSaturation: false,
    bands: [
      { type: "Highpass", freq: 30, q: 0.707 },
      { type: "Lowshelf", freq: 105, gain: -1.5, q: 0.707 },
      { type: "Peaking", freq: 250, gain: -1.0, q: 0.5 },
      { type: "Peaking", freq: 3200, gain: 1.0, q: 1.0 },
      { type: "Highshelf", freq: 10000, gain: 0.0, q: 0.707 }
    ]
  },
  "Warm Valve": {
    preampGain: -2.5,        // Headroom buffer for the tube bass shelves
    noiseFloorLevel: -85.0,  // Subtle, lush organic analog tube glow hiss
    useSaturation: true,     // Excite lower-octave tube warmth
    bands: [
      { type: "Lowshelf", freq: 40, gain: 2.0, q: 0.707 },
      { type: "Peaking", freq: 120, gain: 1.5, q: 0.6 },
      { type: "Peaking", freq: 400, gain: 1.0, q: 0.8 },
      { type: "Peaking", freq: 3000, gain: -1.5, q: 1.0 },
      { type: "Highshelf", freq: 8500, gain: -2.5, q: 0.5 }
    ]
  },
  "Bass Boost": {
    preampGain: -6.0,        // Hard compression headroom safeguard against clipping
    noiseFloorLevel: -95.0,  // Low tape-saturation floor
    useSaturation: true,     // Heavy punch transformer saturation element
    bands: [
      { type: "Peaking", freq: 45, gain: 5.5, q: 1.2 },
      { type: "Lowshelf", freq: 110, gain: 3.5, q: 0.707 },
      { type: "Peaking", freq: 280, gain: -2.5, q: 1.0 },
      { type: "Peaking", freq: 2500, gain: 1.0, q: 0.7 },
      { type: "Highshelf", freq: 12000, gain: 1.5, q: 0.707 }
    ]
  },
  "Vocal Clarity": {
    preampGain: -4.0,        // Attenuation security for peak upper-mid clarity
    noiseFloorLevel: -100.0, // Pristine, deep, isolated vocal backdrop
    useSaturation: false,    // No harmonic distortion on human vocals
    bands: [
      { type: "Highpass", freq: 100, q: 0.707 },
      { type: "Peaking", freq: 160, gain: -1.5, q: 1.0 },
      { type: "Peaking", freq: 900, gain: 1.8, q: 0.8 },
      { type: "Peaking", freq: 3500, gain: 4.0, q: 1.2 },
      { type: "Peaking", freq: 7200, gain: -2.5, q: 2.0 }
    ]
  },
  "Hi-Fi Spatial": {
    preampGain: -5.0,        // Secure attenuation layout for cinema scale extensions
    noiseFloorLevel: -90.0,  // Light premium vinyl background
    useSaturation: true,     // Upper register high-frequency spatial acoustic exciter
    bands: [
      { type: "Lowshelf", freq: 50, gain: 4.5, q: 0.707 },
      { type: "Peaking", freq: 130, gain: 1.0, q: 0.8 },
      { type: "Peaking", freq: 1000, gain: -2.0, q: 0.5 },
      { type: "Peaking", freq: 6500, gain: 2.2, q: 1.2 },
      { type: "Highshelf", freq: 15000, gain: 4.0, q: 0.707 }
    ]
  }
};

// --- CamillaDSP Configuration Generator ---
function generateCamillaConfig(answers, eqSettings, dacInfo) {
  const isDspActive = answers && (answers[0] === 'dsp' || answers['0'] === 'dsp');
  const isSubwooferSetup = answers && answers.q1_setup === "2 Speakers + 1 Subwoofer";

  const selectedPresetName = eqSettings?.preset || "Clinical Reference";
  
  let profile;
  if (selectedPresetName === 'Custom' && eqSettings) {
    profile = {
      preampGain: Number(eqSettings.preAmp) || 0.0,
      noiseFloorLevel: (eqSettings.noiseFloor > 0) ? (-105.0 + (Number(eqSettings.noiseFloor) * 2.0)) : null,
      useSaturation: (eqSettings.saturation > 0),
      bands: [
        { type: "Lowshelf", freq: 60, gain: Number(eqSettings.bands[0]) || 0, q: 0.707 },
        { type: "Peaking", freq: 250, gain: Number(eqSettings.bands[1]) || 0, q: 0.707 },
        { type: "Peaking", freq: 1000, gain: Number(eqSettings.bands[2]) || 0, q: 0.707 },
        { type: "Peaking", freq: 4000, gain: Number(eqSettings.bands[3]) || 0, q: 0.707 },
        { type: "Highshelf", freq: 16000, gain: Number(eqSettings.bands[4]) || 0, q: 0.707 }
      ]
    };
  } else {
    profile = presetDatabase[selectedPresetName] || presetDatabase["Clinical Reference"];
  }

  let config = {
    devices: {
      samplerate: dacInfo.samplerate || 44100,
      chunksize: 1024,
      queuelimit: 4,
      capture: { type: "Alsa", channels: 2, device: "loop_dsnoop", format: "S16LE" },
      playback: {
        type: "Alsa",
        channels: dacInfo.channels || 2,
        device: dacInfo.device || "hw:CARD=DAC,DEV=0",
        format: dacInfo.format || "S24LE"
      }
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

  // Build Saturation filter
  if (profile.useSaturation) {
    if (selectedPresetName === "Warm Valve") {
      config.filters.analog_saturation = { type: "Biquad", parameters: { type: "Peaking", freq: 45, gain: 1.5, q: 2.0 } };
    } else if (selectedPresetName === "Bass Boost") {
      config.filters.analog_saturation = { type: "Biquad", parameters: { type: "Peaking", freq: 60, gain: 1.5, q: 1.5 } };
    } else if (selectedPresetName === "Hi-Fi Spatial") {
      config.filters.analog_saturation = { type: "Biquad", parameters: { type: "Peaking", freq: 12000, gain: 1.0, q: 2.5 } };
    } else if (selectedPresetName === "Custom" && eqSettings) {
      config.filters.analog_saturation = { type: "Biquad", parameters: { type: "Peaking", freq: 80, gain: Number(eqSettings.saturation) * 0.25, q: 1.5 } };
    }
  }

  // analog_noise_floor intentionally omitted: a series Gain filter at -95dB attenuates
  // the signal to silence rather than adding noise. Disabled until implemented correctly.

  // Setup Crossovers and Crossover Caster Filters
  if (isSubwooferSetup) {
    config.devices.playback.channels = 3;
    config.mixers.speaker_map = {
      channels: { in: 2, out: 3 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: 0 }] },
        { dest: 1, sources: [{ channel: 1, gain: 0 }] },
        { dest: 2, sources: [{ channel: 0, gain: -3.0 }, { channel: 1, gain: -3.0 }] }
      ]
    };
  } else {
    config.devices.playback.channels = 2;
    config.mixers.speaker_map = {
      channels: { in: 2, out: 2 },
      mapping: [
        { dest: 0, sources: [{ channel: 0, gain: 0 }] },
        { dest: 1, sources: [{ channel: 1, gain: 0 }] }
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

  // --- STAGE E: PREAMP GAIN ---
  const preampGainDb = Number(isDspActive ? (profile.preampGain - 6.0) : profile.preampGain) || 0;
  config.filters.preamp_gain = { type: "Gain", parameters: { gain: preampGainDb, inverted: false, mute: false } };
  leftPipeline.push("preamp_gain");
  rightPipeline.push("preamp_gain");
  if (isSubwooferSetup) subPipeline.push("preamp_gain");

  // --- STAGE F: MASTER VOLUME (required for SetVolume WS command to work) ---
  // ramp_time: 30ms — smooth enough to avoid clicks, fast enough to feel instant.
  // SetVolume sends a dB target; CamillaDSP ramps to it over ramp_time ms.
  // Without this filter in the pipeline, SetVolume is acknowledged but ignored.
  // CamillaDSP v2 requires `fader: "Main"` on Volume filters — without it the
  // config is rejected at startup. SetVolume WS command targets the Main fader.
  config.filters.master_volume = { type: "Volume", parameters: { ramp_time: 30.0, fader: "Main" } };
  leftPipeline.push("master_volume");
  rightPipeline.push("master_volume");
  if (isSubwooferSetup) subPipeline.push("master_volume");

  // --- STAGE G: COMPILE THE PIPELINE MATRIX ---
  // CamillaDSP v2: Mixer uses 'name' (not 'mapping'), Filter uses individual
  // steps with 'name' (singular string) instead of a 'names' array.
  // CamillaDSP v2: Mixer uses 'name' (not 'mapping'); Filter still uses 'names' array.
  config.pipeline.push({ type: "Mixer", name: "speaker_map" });
  config.pipeline.push({ type: "Filter", channel: 0, names: leftPipeline });
  config.pipeline.push({ type: "Filter", channel: 1, names: rightPipeline });
  if (isSubwooferSetup) {
    config.pipeline.push({ type: "Filter", channel: 2, names: subPipeline });
  }

  return config;
}

// Function to ensure /etc/asound.conf is correctly configured for ALSA Loopback
async function ensureAsoundConf() {
  const asoundConfPath = '/etc/asound.conf';
  const expectedContent = `# Resonance HiFi - Default ALSA Route to Loopback
pcm.!default {
    type plug
    slave.pcm "camilla_input"
}

ctl.!default {
    type hw
    card Loopback
}

# dmix allows MPD and raspotify to write simultaneously (no exclusive lock)
pcm.camilla_input {
    type dmix
    ipc_key 1024
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,0,0"
        channels 2
        rate 44100
        format S16_LE
        period_size 1024
        buffer_size 4096
    }
}

# dsnoop allows CamillaDSP and arecord monitor to read simultaneously
pcm.loop_dsnoop {
    type dsnoop
    ipc_key 2048
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,1,0"
        channels 2
        rate 44100
        format S16_LE
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

  // Keep MPD software mixer at 100% — CamillaDSP owns the volume stage now.
  try { const { exec } = await import('child_process'); exec('mpc volume 100'); } catch {}

  // Maximise hardware PCM output volume so only MPD software volume controls
  // loudness. Without this the hardware attenuates by up to -23.8dB, making
  // the lower half of the volume slider sound like silence.
  try {
    const { exec } = await import('child_process');
    exec("amixer -c 0 cset name='PCM Playback Volume' 255,255", (err) => {
      if (err) console.warn('[ALSA] Could not set PCM Playback Volume to max:', err.message);
      else console.log('[ALSA] PCM Playback Volume set to 255 (0dB).');
    });
  } catch {}
}

// POST /api/player/dsp-calibration -> Save user DSP calibration answers & generate configuration
router.post('/dsp-calibration', async (req, res) => {
  const { answers } = req.body;
  if (!answers) {
    return res.status(400).json({ error: 'Answers are required' });
  }
  try {
    await setSetting('dsp_calibration', JSON.stringify(answers));
    console.log('[CamillaDSP] Saved calibration profile:', answers);

    const dacInfo = await updateCamillaConfigFromSettings();

    // Broadcast DSP_CALIBRATION to all WS clients via EventService
    await emit('DSP_CALIBRATION', answers);

    res.json({ success: true, dacInfo });
  } catch (err) {
    console.error('[CamillaDSP] Error compiling tuning configuration:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/player/dsp-calibration -> Retrieve calibration
router.get('/dsp-calibration', async (req, res) => {
  try {
    const data = await getSetting('dsp_calibration');
    res.json(data ? JSON.parse(data) : null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportable helper to update configuration on any settings change
export async function updateCamillaConfigFromSettings({ skipAlsa = false } = {}) {
  const dspVal = await getSetting('dsp_calibration');
  const eqVal = await getSetting('eq_settings');

  const answers = dspVal ? JSON.parse(dspVal) : null;
  const eqSettings = eqVal ? JSON.parse(eqVal) : null;

  // Auto-configure ALSA Loopback routing — skip during EQ updates since
  // ALSA config never changes when only EQ bands/levels are adjusted
  if (!skipAlsa) await ensureAsoundConf();

  // Scan for DAC capability automatically
  const dacInfo = detectDac();
  console.log('[CamillaDSP] Detected audio device capabilities:', dacInfo);

  // Apply adjustments if sub-woofer is enabled
  if (answers && answers.q1_setup === "2 Speakers + 1 Subwoofer") {
    dacInfo.channels = 3;
  } else {
    dacInfo.channels = 2;
  }

  // Generate CamillaDSP yaml configuration
  const configObj = generateCamillaConfig(answers, eqSettings, dacInfo);
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
    } catch (err) {
      console.warn('[CamillaDSP] Failed to restart camilladsp service:', err.message);
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
    const { WebSocket } = await import('ws');
    return await new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:1234');
      const timer = setTimeout(() => { ws.terminate(); resolve(false); }, 1500);

      ws.on('open', () => {
        ws.send(JSON.stringify({ SetConfig: yamlString }));
      });

      ws.on('message', (data) => {
        clearTimeout(timer);
        ws.close();
        try {
          const msg = JSON.parse(data.toString());
          // v1: { SetConfig: 'Ok' }  v2: { SetConfig: { result: 'Ok' } }
          const ok = msg.SetConfig === 'Ok' || msg.SetConfig?.result === 'Ok';
          console.log(ok
            ? '[CamillaDSP] Hot-reload applied — no audio gap.'
            : '[CamillaDSP] Hot-reload response (unexpected):', msg);
          resolve(ok);
        } catch { resolve(false); }
      });

      ws.on('error', (err) => {
        clearTimeout(timer);
        console.warn('[CamillaDSP] Hot-reload WS error:', err.message);
        resolve(false);
      });
    });
  } catch (err) {
    console.warn('[CamillaDSP] Hot-reload unavailable:', err.message);
    return false;
  }
}

// GET /api/player/library/artists
router.get('/library/artists', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc list artist');
    const artists = stdout.split('\n').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({ artists });
  } catch {
    res.json({ artists: [] });
  }
});

// GET /api/player/library/albums?artist=X
router.get('/library/albums', async (req, res) => {
  const { artist } = req.query;
  if (artist && artist.length > 500) return res.status(400).json({ error: 'Artist name too long' });
  try {
    const args = ['list', 'album'];
    if (artist) args.push('artist', artist);
    const { stdout } = await execFilePromise('mpc', args);
    const albums = stdout.split('\n').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({ albums });
  } catch {
    res.json({ albums: [] });
  }
});

// GET /api/player/library/tracks?album=X&artist=Y
router.get('/library/tracks', async (req, res) => {
  const { album, artist } = req.query;
  if (artist && artist.length > 500) return res.status(400).json({ error: 'Artist name too long' });
  if (album && album.length > 500) return res.status(400).json({ error: 'Album name too long' });
  try {
    const args = ['find'];
    if (artist) args.push('artist', artist);
    if (album) args.push('album', album);
    const { stdout } = await execFilePromise('mpc', args);
    const tracks = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    res.json({ tracks });
  } catch {
    res.json({ tracks: [] });
  }
});

// GET /api/player/queue
router.get('/queue', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc playlist');
    const tracks = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    res.json({ tracks });
  } catch {
    res.json({ tracks: [] });
  }
});

// POST /api/player/queue/clear
router.post('/queue/clear', async (req, res) => {
  try {
    await execPromise('mpc clear');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/queue/add
router.post('/queue/add', async (req, res) => {
  const { path: filePath, play = false } = req.body;
  if (!filePath) return res.status(400).json({ error: 'path required' });
  try {
    await execFilePromise('mpc', ['add', filePath]);
    if (play) await execPromise('mpc play');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/standby -> Set standby state (used by wake monitor scripts or external triggers)
router.post('/standby', async (req, res) => {
  const { enabled } = req.body;
  if (enabled === undefined) {
    return res.status(400).json({ error: 'enabled parameter is required' });
  }
  try {
    await emit('SET_STANDBY', { enabled });
    res.json({ success: true });
  } catch (err) {
    console.error('[Player API] Standby toggle failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Radio-Browser.info proxy ─────────────────────────────────────────────────
// Proxy so browser clients (especially iOS Safari on HTTP) never have to make
// cross-origin requests to an external HTTPS host. Tries multiple mirrors in
// sequence so a single downed mirror doesn't break search.
//
// Mirror order: 'all.' is the official round-robin DNS entry recommended by the
// radio-browser.info project; individual geo mirrors are fallbacks only.

const RADIO_MIRRORS = [
  'https://all.api.radio-browser.info',
  'https://de1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
];

// Cache the import so it doesn't re-evaluate on every request
let _nodeFetch = null;
async function getNodeFetch() {
  if (!_nodeFetch) _nodeFetch = (await import('node-fetch')).default;
  return _nodeFetch;
}

async function radioFetch(path, timeoutMs = 10000) {
  const fetch = await getNodeFetch();
  let lastErr;
  for (const base of RADIO_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(`${base}${path}`, {
        headers: { 'User-Agent': 'ResonanceHiFi/1.0' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
    }
  }
  throw lastErr;
}

// GET /api/player/radio-search?q=<name>&limit=<n>
// Used by: remote control search bar
router.get('/radio-search', async (req, res) => {
  const q = (req.query.q || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
  if (!q) return res.json([]);
  try {
    const data = await radioFetch(
      `/json/stations/byname/${encodeURIComponent(q)}?limit=${limit}&hidebroken=true&order=votes`
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// GET /api/player/radio-bycountry?country=<name>&limit=<n>
// Used by: kiosk country picker
router.get('/radio-bycountry', async (req, res) => {
  const country = (req.query.country || '').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);
  if (!country) return res.json([]);
  try {
    const data = await radioFetch(
      `/json/stations/bycountry/${encodeURIComponent(country)}?limit=${limit}&hidebroken=true&order=votes`,
      12000
    );
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// ── AirPlay (shairport-sync) ─────────────────────────────────────────────────

// POST /api/player/airplay/start
router.post('/airplay/start', async (req, res) => {
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await emit('SET_SOURCE', { spotify: false, source: 'airplay' });
    const ok = await systemctlAction('start', 'shairport-sync');
    res.json({ success: ok });
  } catch (err) {
    console.error('[AirPlay] Start failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/airplay/stop
router.post('/airplay/stop', async (req, res) => {
  try {
    const ok = await systemctlAction('stop', 'shairport-sync');
    res.json({ success: ok });
  } catch (err) {
    console.error('[AirPlay] Stop failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/player/airplay/status
router.get('/airplay/status', async (req, res) => {
  const active = await isServiceActive('shairport-sync');
  res.json({ active });
});

// ── UPnP / DLNA (upmpdcli) ───────────────────────────────────────────────────

// POST /api/player/upnp/start
router.post('/upnp/start', async (req, res) => {
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await emit('SET_SOURCE', { spotify: false, source: 'upnp' });
    const ok = await systemctlAction('start', 'upmpdcli');
    res.json({ success: ok });
  } catch (err) {
    console.error('[UPnP] Start failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/upnp/stop
router.post('/upnp/stop', async (req, res) => {
  try {
    const ok = await systemctlAction('stop', 'upmpdcli');
    res.json({ success: ok });
  } catch (err) {
    console.error('[UPnP] Stop failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/player/upnp/status
router.get('/upnp/status', async (req, res) => {
  const active = await isServiceActive('upmpdcli');
  res.json({ active });
});

// ── Bluetooth A2DP (bluealsa) ─────────────────────────────────────────────────

// POST /api/player/bluetooth/start
router.post('/bluetooth/start', async (req, res) => {
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await emit('SET_SOURCE', { spotify: false, source: 'bluetooth' });
    const ok = await systemctlAction('start', 'bluealsa');
    res.json({ success: ok });
  } catch (err) {
    console.error('[Bluetooth] Start failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/bluetooth/stop
router.post('/bluetooth/stop', async (req, res) => {
  try {
    const ok = await systemctlAction('stop', 'bluealsa');
    res.json({ success: ok });
  } catch (err) {
    console.error('[Bluetooth] Stop failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/bluetooth/discoverable — make the Pi discoverable for 60 s
router.post('/bluetooth/discoverable', async (req, res) => {
  try {
    await execPromise('bluetoothctl discoverable on');
    // Auto-revert after 60 s
    setTimeout(() => execPromise('bluetoothctl discoverable off').catch(() => {}), 60000);
    res.json({ success: true, seconds: 60 });
  } catch (err) {
    console.error('[Bluetooth] Discoverable failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/player/bluetooth/status
router.get('/bluetooth/status', async (req, res) => {
  const active = await isServiceActive('bluealsa');
  res.json({ active });
});

// ── Tidal (tidal-hifi / placeholder) ─────────────────────────────────────────

// POST /api/player/tidal/connect — store credentials and activate source
router.post('/tidal/connect', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    // Persist credentials (stored in DB, never logged)
    await setSetting('tidal_username', username);
    // Store password as-is (Pi is a single-user device; add encryption if needed)
    await setSetting('tidal_password', password);
    await emit('SET_SOURCE', { spotify: false, source: 'tidal' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Tidal] Connect failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/tidal/play — activate Tidal source
router.post('/tidal/play', async (req, res) => {
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await emit('SET_SOURCE', { spotify: false, source: 'tidal' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Tidal] Play failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/player/tidal/status — check if credentials are stored
router.get('/tidal/status', async (req, res) => {
  const username = await getSetting('tidal_username').catch(() => null);
  res.json({ connected: !!username, username: username || null });
});

// DELETE /api/player/tidal/disconnect
router.delete('/tidal/disconnect', async (req, res) => {
  try {
    await setSetting('tidal_username', '');
    await setSetting('tidal_password', '');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Qobuz ─────────────────────────────────────────────────────────────────────

// POST /api/player/qobuz/auth — store Qobuz credentials
router.post('/qobuz/auth', async (req, res) => {
  const { username, password, app_id, app_secret } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    await setSetting('qobuz_username', username);
    await setSetting('qobuz_password', password);
    if (app_id)     await setSetting('qobuz_app_id', app_id);
    if (app_secret) await setSetting('qobuz_app_secret', app_secret);
    await emit('SET_SOURCE', { spotify: false, source: 'qobuz' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Qobuz] Auth failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/qobuz/play — activate Qobuz source
router.post('/qobuz/play', async (req, res) => {
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await emit('SET_SOURCE', { spotify: false, source: 'qobuz' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Qobuz] Play failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/player/qobuz/status
router.get('/qobuz/status', async (req, res) => {
  const username = await getSetting('qobuz_username').catch(() => null);
  res.json({ connected: !!username, username: username || null });
});

// DELETE /api/player/qobuz/disconnect
router.delete('/qobuz/disconnect', async (req, res) => {
  try {
    await setSetting('qobuz_username', '');
    await setSetting('qobuz_password', '');
    await setSetting('qobuz_app_id', '');
    await setSetting('qobuz_app_secret', '');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

