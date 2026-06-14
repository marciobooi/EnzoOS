import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getFavoriteRadios, addFavoriteRadio, deleteFavoriteRadioByUrl, setSetting, getSetting } from './db.js';
import { setStandbyState, cachedStandbyState } from './websocket.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = promisify(exec);
const router = express.Router();

// POST /api/player/play -> Play local media
router.post('/play', async (req, res) => {
  try {
    if (cachedStandbyState) {
      await setStandbyState(false);
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

// POST /api/player/volume -> Set local player volume
router.post('/volume', async (req, res) => {
  const { volume } = req.body;
  try {
    await execPromise(`mpc volume ${volume}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Volume failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/seek -> Seek local track
router.post('/seek', async (req, res) => {
  const { position } = req.body;
  try {
    await execPromise(`mpc seek ${position}`);
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
    if (cachedStandbyState) {
      await setStandbyState(false);
    }
    // Save last played radio info to database settings
    await setSetting('active_source', 'radio');
    await setSetting('last_radio_url', url);
    if (name) await setSetting('last_radio_name', name);
    await setSetting('last_radio_favicon', favicon || '');

    // Clear playlist, add URL, play
    await execPromise('mpc clear');
    await execPromise(`mpc add "${url}"`);
    await execPromise('mpc play');

    const broadcast = req.app.get('wssBroadcast');
    if (broadcast) {
      const stateUpdate = {
        paused: false,
        position: 0,
        duration: 0,
        track_window: {
          current_track: {
            name: name || 'WEB RADIO',
            artists: [{ name: 'Live Stream' }],
            album: { name: 'Web Radio Broadcast', images: favicon ? [{ url: favicon }] : [] },
            url: url
          }
        }
      };
      
      // Broadcast current playback state to all clients
      broadcast({ type: 'PLAYBACK_STATE', payload: stateUpdate });
      // Force source to be radio
      broadcast({ type: 'SET_SOURCE', payload: { spotify: false, source: 'radio' } });
    }

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
      { type: "LowShelf", freq: 105, gain: -1.5, q: 0.707 },
      { type: "Peaking", freq: 250, gain: -1.0, q: 0.5 },
      { type: "Peaking", freq: 3200, gain: 1.0, q: 1.0 },
      { type: "HighShelf", freq: 10000, gain: 0.0, q: 0.707 }
    ]
  },
  "Warm Valve": {
    preampGain: -2.5,        // Headroom buffer for the tube bass shelves
    noiseFloorLevel: -85.0,  // Subtle, lush organic analog tube glow hiss
    useSaturation: true,     // Excite lower-octave tube warmth
    bands: [
      { type: "LowShelf", freq: 40, gain: 2.0, q: 0.707 },
      { type: "Peaking", freq: 120, gain: 1.5, q: 0.6 },
      { type: "Peaking", freq: 400, gain: 1.0, q: 0.8 },
      { type: "Peaking", freq: 3000, gain: -1.5, q: 1.0 },
      { type: "HighShelf", freq: 8500, gain: -2.5, q: 0.5 }
    ]
  },
  "Bass Boost": {
    preampGain: -6.0,        // Hard compression headroom safeguard against clipping
    noiseFloorLevel: -95.0,  // Low tape-saturation floor
    useSaturation: true,     // Heavy punch transformer saturation element
    bands: [
      { type: "Peaking", freq: 45, gain: 5.5, q: 1.2 },
      { type: "LowShelf", freq: 110, gain: 3.5, q: 0.707 },
      { type: "Peaking", freq: 280, gain: -2.5, q: 1.0 },
      { type: "Peaking", freq: 2500, gain: 1.0, q: 0.7 },
      { type: "HighShelf", freq: 12000, gain: 1.5, q: 0.707 }
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
      { type: "LowShelf", freq: 50, gain: 4.5, q: 0.707 },
      { type: "Peaking", freq: 130, gain: 1.0, q: 0.8 },
      { type: "Peaking", freq: 1000, gain: -2.0, q: 0.5 },
      { type: "Peaking", freq: 6500, gain: 2.2, q: 1.2 },
      { type: "HighShelf", freq: 15000, gain: 4.0, q: 0.707 }
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
        { type: "LowShelf", freq: 60, gain: Number(eqSettings.bands[0]) || 0, q: 0.707 },
        { type: "Peaking", freq: 250, gain: Number(eqSettings.bands[1]) || 0, q: 0.707 },
        { type: "Peaking", freq: 1000, gain: Number(eqSettings.bands[2]) || 0, q: 0.707 },
        { type: "Peaking", freq: 4000, gain: Number(eqSettings.bands[3]) || 0, q: 0.707 },
        { type: "HighShelf", freq: 16000, gain: Number(eqSettings.bands[4]) || 0, q: 0.707 }
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
      capture: { type: "Alsa", channels: 2, device: "hw:Loopback,1,0", format: "S16LE" },
      playback: { 
        type: "Alsa", 
        channels: dacInfo.channels || 2, 
        device: dacInfo.device || "hw:CARD=DAC,DEV=0", 
        format: dacInfo.format || "S24LE",
        gain: isDspActive ? (profile.preampGain - 6.0) : profile.preampGain
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

  // Build Noise Floor filter
  if (profile.noiseFloorLevel !== null) {
    config.filters.analog_noise_floor = {
      type: "Gain",
      parameters: { gain: profile.noiseFloorLevel, inverted: false }
    };
  }

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
    config.filters.harman_bass_shelf = { type: "Biquad", parameters: { type: "LowShelf", freq: 105, gain: 5.5, q: 0.707 } };
    config.filters.vocal_clarity_dip = { type: "Biquad", parameters: { type: "Peaking", freq: 250, gain: -1.2, q: 0.6 } };
    config.filters.presence_definition = { type: "Biquad", parameters: { type: "Peaking", freq: 3000, gain: 1.0, q: 0.8 } };
    config.filters.harman_treble_tilt = { type: "Biquad", parameters: { type: "HighShelf", freq: 4500, gain: -2.0, q: 0.5 } };
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
  if (profile.noiseFloorLevel !== null) {
    leftPipeline.push("analog_noise_floor");
    rightPipeline.push("analog_noise_floor");
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
      config.filters.room_tamer = { type: "Biquad", parameters: { type: "HighShelf", freq: 4000, gain: -2.5, q: 0.7 } };
      leftPipeline.push("room_tamer");
      rightPipeline.push("room_tamer");
    }

    if (answers.q7_walls === "Pushed against a wall") {
      config.filters.wall_correction = { type: "Biquad", parameters: { type: "LowShelf", freq: 150, gain: -2.0, q: 0.7 } };
      leftPipeline.push("wall_correction");
      rightPipeline.push("wall_correction");
    } else if (answers.q7_walls === "Tucked in a corner / Shelf") {
      config.filters.wall_correction = { type: "Biquad", parameters: { type: "LowShelf", freq: 150, gain: -4.0, q: 0.7 } };
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

  // --- STAGE E: COMPILE THE PIPELINE MATRIX ---
  config.pipeline.push({ type: "Mixer", mapping: "speaker_map" });
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
# This forces Volumio, Spotify, AirPlay, etc., to send audio to the virtual pipe instead of a physical card.
pcm.!default {
    type plug
    slave.pcm "camilla_input"
}

ctl.!default {
    type hw
    card Loopback
}

# Define the entry point to the Loopback pipe
pcm.camilla_input {
    type hw
    card Loopback
    device 0
    subdevice 0
}

# Fix for duplex output (duplex safety PCM configurations)
pcm.loop_monitor {
    type hw
    card Loopback
    device 1
    subdevice 0
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
      fs.writeFileSync(tempPath, expectedContent, 'utf8');
      await execPromise(`sudo /usr/bin/tee ${asoundConfPath} < ${tempPath} > /dev/null`);
      fs.unlinkSync(tempPath);
      console.log('[ALSA] /etc/asound.conf updated successfully.');
    }
  } catch (err) {
    console.warn('[ALSA] Failed to write /etc/asound.conf (non-root context or missing sudoers permission):', err.message);
  }
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

    // Broadcast update to all WebSocket clients
    const broadcast = req.app.get('wssBroadcast');
    if (broadcast) {
      broadcast({ type: 'DSP_CALIBRATION', payload: answers });
    }

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
export async function updateCamillaConfigFromSettings() {
  const dspVal = await getSetting('dsp_calibration');
  const eqVal = await getSetting('eq_settings');

  const answers = dspVal ? JSON.parse(dspVal) : null;
  const eqSettings = eqVal ? JSON.parse(eqVal) : null;

  // Auto-configure ALSA Loopback routing
  await ensureAsoundConf();

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

  // Reload CamillaDSP service to apply the configuration profile
  try {
    await execPromise('sudo systemctl restart camilladsp');
    console.log('[CamillaDSP] Restarted camilladsp service successfully.');
  } catch (err) {
    console.warn('[CamillaDSP] Failed to restart camilladsp service (might not be installed yet):', err.message);
  }

  return dacInfo;
}

// POST /api/player/standby -> Set standby state (used by wake monitor scripts or external triggers)
router.post('/standby', async (req, res) => {
  const { enabled } = req.body;
  if (enabled === undefined) {
    return res.status(400).json({ error: 'enabled parameter is required' });
  }
  try {
    const { setStandbyState } = await import('./websocket.js');
    await setStandbyState(enabled);
    res.json({ success: true });
  } catch (err) {
    console.error('[Player API] Standby toggle failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;

