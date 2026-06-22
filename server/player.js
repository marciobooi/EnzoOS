import express from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import { getFavoriteRadios, addFavoriteRadio, deleteFavoriteRadioByUrl, setSetting, getSetting } from './db.js';
import { emit, getStandbyState, getCachedVolumeDb, setVolumeState } from './event-service.js';
import {
  qobuzLogin, qobuzSearch, qobuzTrackUrl, qobuzConnected, clearQobuz,
  tidalDeviceAuth, tidalPollToken, tidalSearch, tidalTrackUrl, tidalConnected, clearTidal,
} from './streaming.js';

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
    setVolumeState(vol, vol <= 0);
    res.json({ success: true });
  } catch (err) {
    console.error('[Volume] Failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/spotify-volume -> Called by the librespot --onevent script
// when the Spotify app sends a volume command to librespot. librespot is fixed
// at 100% audio output so it fires the event but ignores the attenuation.
// We translate the intended Spotify volume to CamillaDSP and broadcast to all
// WS clients so every view (kiosk, remote) updates its slider in real time.
router.post('/spotify-volume', async (req, res) => {
  const vol = Math.max(0, Math.min(100, Math.round(Number(req.body.volume))));
  if (!Number.isFinite(vol)) return res.status(400).end();
  try {
    await setCamillaVolume(toDb(vol));
    setVolumeState(vol, vol <= 0);
    // Broadcast so every connected client updates its volume slider immediately.
    emit('SET_VOLUME', { volume: vol, is_muted: vol <= 0 });
    console.log(`[Spotify] Volume event: ${vol}% → CamillaDSP ${toDb(vol).toFixed(1)} dB`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Spotify Volume] Failed:', err.message);
    res.status(500).json({ success: false });
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
// Accepts either a percentage ("50%") or an absolute number of seconds (50).
// IMPORTANT: `mpc seek 50` means 50 SECONDS, while `mpc seek 50%` means halfway.
// The clients send a percentage, so a bare parseInt() silently turned "50%" into
// a 50-second seek — making it impossible to seek any track past ~1:40. We now
// detect the percentage form explicitly and pass it through to mpc verbatim.
router.post('/seek', async (req, res) => {
  const raw = req.body.position;
  let arg;

  if (typeof raw === 'string' && /^\s*\d{1,3}\s*%\s*$/.test(raw)) {
    const pct = parseInt(raw, 10);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return res.status(400).json({ error: 'Invalid percentage: must be 0–100' });
    }
    arg = `${pct}%`;
  } else {
    const secs = parseInt(raw, 10);
    if (!Number.isFinite(secs) || secs < 0) {
      return res.status(400).json({ error: 'Invalid position: percentage like "50%" or non-negative seconds' });
    }
    arg = String(secs);
  }

  try {
    // execFile with an argv array — never interpolated into a shell, so the
    // validated `arg` cannot be used for command injection.
    await execFilePromise('mpc', ['seek', arg]);
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

    // Clear playlist, add URL, play. Repeat on so HLS streams reconnect on segment-list end.
    await execPromise('mpc repeat on');
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

// Sanitise MPD ICY/stream %title% metadata before exposing it as a track name.
// Three cases seen in the wild:
//   1. The raw stream URL (HLS/AAC streams with no ICY title) -> suppress.
//   2. Dalet RadioInfo XML (Rádio Comercial and other PT/ES stations) ->
//      pull <DB_SONG_NAME> / <DB_LEAD_ARTIST_NAME> out of the blob.
//   3. Any other angle-bracket markup -> strip tags as a last resort.
// Returns { name, artist } so callers get clean, separated fields.
export function sanitizeStreamTitle(raw) {
  const name = (raw || '').trim();
  if (!name) return { name: '', artist: '' };
  if (name.startsWith('http://') || name.startsWith('https://')) return { name: '', artist: '' };
  if (!name.includes('<')) return { name, artist: '' };
  const song   = name.match(/<DB_SONG_NAME>([^<]+)<\/DB_SONG_NAME>/)?.[1]?.trim();
  const artist = name.match(/<DB_LEAD_ARTIST_NAME>([^<]+)<\/DB_LEAD_ARTIST_NAME>/)?.[1]?.trim();
  if (song) return { name: song, artist: artist || '' };
  const stripped = name.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return { name: stripped, artist: '' };
}

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
    const isUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'));
    // MPD sets %title% to the stream URL (HLS/AAC with no ICY) or to raw Dalet
    // RadioInfo XML (PT/ES automation). Sanitise so no client ever shows a URL
    // or angle-bracket soup as a track name. Returns a parsed { name, artist }.
    const clean = sanitizeStreamTitle(title);
    res.json({
      paused: !isPlaying,
      position: timeMatch ? toMs(timeMatch[1], timeMatch[2]) : 0,
      duration: timeMatch ? toMs(timeMatch[3], timeMatch[4]) : 0,
      name:   clean.name,
      artist: clean.artist || (isUrl(artist) ? '' : (artist || '')),
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

// GET /api/player/signal-path → live audio chain telemetry + DAC info
router.get('/signal-path', async (req, res) => {
  try {
    const [camillaStatus, mpdFmt, activeSource] = await Promise.all([
      getCamillaStatus(),
      getMpdAudioFormat(),
      getSetting('active_source').catch(() => 'unknown'),
    ]);
    const dac = detectDac();
    const pathMap = {
      local:     'MPD → PipeWire → CamillaDSP → DAC',
      radio:     'MPD → PipeWire → CamillaDSP → DAC',
      spotify:   'Spotify → raspotify → PipeWire → CamillaDSP → DAC',
      airplay:   'AirPlay → shairport-sync → PipeWire → CamillaDSP → DAC',
      upnp:      'UPnP → upmpdcli/MPD → PipeWire → CamillaDSP → DAC',
      bluetooth: 'Bluetooth → bluealsa → PipeWire → CamillaDSP → DAC',
      tidal:     'Tidal → PipeWire → CamillaDSP → DAC',
      qobuz:     'Qobuz → PipeWire → CamillaDSP → DAC',
    };
    res.json({
      source:  activeSource,
      camilla: camillaStatus,
      mpd:     mpdFmt,
      path:    pathMap[activeSource] || 'Source → PipeWire → CamillaDSP → DAC',
      dac: {
        name:           dac.cardName,
        device:         dac.device,
        format:         dac.format,
        supportedRates: dac.supportedRates,
        maxRate:        Math.max(...dac.supportedRates),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/player/pure-direct → toggle DSP-bypass (flat pipeline, no EQ)
router.post('/pure-direct', async (req, res) => {
  const { enabled } = req.body;
  if (enabled === undefined) return res.status(400).json({ error: 'enabled required' });
  try {
    await emit('SET_PURE_DIRECT', { enabled: !!enabled });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Standard audiophile sample rates — only these are valid PipeWire clock candidates.
// Rates outside this set (e.g. 32000, 22050) are legacy and not used for hi-res playback.
const STANDARD_RATES = [44100, 48000, 88200, 96000, 176400, 192000, 352800, 384000];

// --- CamillaDSP DAC & Audio Hardware Capabilities Detection ---
// Returns device, format, samplerate (default processing rate), supportedRates (all),
// and cardName (for display). supportedRates drives PipeWire clock.allowed-rates so
// PipeWire only switches to rates the DAC actually supports — no ALSA open failures.
function detectDac() {
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
export async function updatePipeWireClock(dacInfo) {
  // IMPORTANT: clock.allowed-rates is intentionally NOT used here.
  // The ALSA loopback bridge (hw:Loopback,0,0 ↔ loop_dsnoop) requires a
  // FIXED sample rate shared by both PipeWire and CamillaDSP. If PipeWire
  // switches clock rates (e.g. to 44100 Hz for AAC radio), hw:Loopback,0,0
  // is opened at the new rate while loop_dsnoop is configured for 48000 Hz
  // → rate mismatch → PCM Slave Active stays off → silence.
  //
  // PipeWire resamples all content to 48000 Hz before writing to the loopback.
  // True bit-perfect requires the CamillaDSP ALSA plugin (Phase 2).
  //
  // Also: restarting PipeWire drops MPD's connection ("Failed to open audio
  // output") and requires manual MPD restart. Never restart PipeWire from here.
  const confPath = '/etc/pipewire/pipewire.conf.d/52-resonance-bitperfect.conf';
  const content = `# Resonance HiFi — PipeWire fixed clock at 48000 Hz
# Generated from detected DAC: ${dacInfo?.cardName || 'unknown'} (${dacInfo?.device || 'unknown'})
# clock.allowed-rates is intentionally absent: the ALSA loopback bridge
# requires a fixed rate shared by PipeWire and CamillaDSP. Rate switching
# causes the loopback to stop delivering audio (PCM Slave Active = off).
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
    console.log('[PipeWire] Clock config unchanged (48000 Hz fixed) — skipping update.');
    return;
  }

  const tempPath = path.join(__dirname, '../pipewire-clock.conf.tmp');
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    await execPromise(`sudo /usr/bin/tee ${confPath} < ${tempPath} > /dev/null`);
    console.log('[PipeWire] Updated clock config (48000 Hz fixed, no allowed-rates).');
    // NOTE: NOT restarting PipeWire — doing so drops MPD's audio connection.
    // The new config takes effect on the next PipeWire session start (reboot).
  } catch (err) {
    console.warn('[PipeWire] Failed to write clock config (check sudoers):', err.message);
  } finally {
    try { fs.unlinkSync(tempPath); } catch {}
  }
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
// pureDirect = true: bypass all EQ, output flat pipeline (volume control still active)
function generateCamillaConfig(answers, eqSettings, dacInfo, { pureDirect = false } = {}) {
  const isDspActive = answers && (answers[0] === 'dsp' || answers['0'] === 'dsp');
  const isSubwooferSetup = answers && answers.q1_setup === "2 Speakers + 1 Subwoofer";

  const selectedPresetName = eqSettings?.preset || "Clinical Reference";
  
  let profile;
  if (selectedPresetName === 'Custom' && eqSettings) {
    const bandGains = (eqSettings.bands || [0,0,0,0,0]).map(Number);
    // Auto-headroom: subtract the largest positive band boost from pre-amp to prevent clipping.
    const maxBoost = Math.max(0, ...bandGains);
    profile = {
      preampGain: (Number(eqSettings.preAmp) || 0.0) - maxBoost,
      noiseFloorLevel: (eqSettings.noiseFloor > 0) ? (-105.0 + (Number(eqSettings.noiseFloor) * 2.0)) : null,
      useSaturation: (eqSettings.saturation > 0),
      bands: [
        { type: "Lowshelf", freq: 60,    gain: bandGains[0], q: 0.707 },
        { type: "Peaking",  freq: 250,   gain: bandGains[1], q: 0.707 },
        { type: "Peaking",  freq: 1000,  gain: bandGains[2], q: 0.707 },
        { type: "Peaking",  freq: 4000,  gain: bandGains[3], q: 0.707 },
        { type: "Highshelf",freq: 16000, gain: bandGains[4], q: 0.707 },
      ]
    };
  } else {
    profile = presetDatabase[selectedPresetName] || presetDatabase["Clinical Reference"];
  }

  // Pure Direct: bypass all EQ — flat pipeline with unity gain only.
  // Volume control via CamillaDSP SetVolume remains active.
  if (pureDirect) {
    const pdConfig = {
      devices: {
        samplerate: dacInfo.samplerate || 44100,
        chunksize: 1024,
        queuelimit: 4,
        capture:  { type: "Alsa", channels: 2, device: "loop_dsnoop", format: "S16_LE" },
        playback: { type: "Alsa", channels: dacInfo.channels || 2, device: dacInfo.device || "hw:CARD=DAC,DEV=0", format: dacInfo.format || "S24_3_LE" },
      },
      mixers: {
        speaker_map: {
          channels: { in: 2, out: 2 },
          mapping: [
            { dest: 0, sources: [{ channel: 0, gain: 0 }] },
            { dest: 1, sources: [{ channel: 1, gain: 0 }] },
          ],
        },
      },
      filters: {},
      pipeline: [
        { type: "Mixer", name: "speaker_map" },
      ],
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
      capture: { type: "Alsa", channels: 2, device: "loop_dsnoop", format: "S16_LE" },
      playback: {
        type: "Alsa",
        channels: dacInfo.channels || 2,
        device: dacInfo.device || "hw:CARD=DAC,DEV=0",
        format: dacInfo.format || "S24_3_LE"
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
  // Extra -1 dB safety headroom is applied here for all pipelines.
  // This prevents any multi-stage EQ summing from exceeding 0 dBFS,
  // which would cause hard clipping and potential speaker damage.
  const preampGainDb = Number(isDspActive ? (profile.preampGain - 6.0) : profile.preampGain) || 0;
  config.filters.preamp_gain = { type: "Gain", parameters: { gain: preampGainDb - 1.0, inverted: false, mute: false } };
  leftPipeline.push("preamp_gain");
  rightPipeline.push("preamp_gain");
  if (isSubwooferSetup) subPipeline.push("preamp_gain");

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
async function ensureAsoundConf() {
  const asoundConfPath = '/etc/asound.conf';
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
  const expectedContent = `# Resonance HiFi — ALSA config
# camilla_input: ALSA dmix — MPD/ALSA sources write directly to loopback
# loop_dsnoop:   ALSA dsnoop — CamillaDSP reads from loopback
# Both fixed at 48000 Hz (ALSA loopback module requires a single shared rate).

pcm.camilla_input {
    type dmix
    ipc_key 1111
    ipc_perm 0666
    slave {
        pcm "hw:Loopback,0,0"
        channels 2
        rate 48000
        format S16_LE
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
        rate 48000
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
export async function updateCamillaConfigFromSettings({ skipAlsa = false, samplerate = null, pureDirect = false } = {}) {
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

  // Sync PipeWire clock.allowed-rates to exactly the rates this DAC supports.
  // Fire-and-forget — never blocks the config generation path.
  if (!skipAlsa) {
    updatePipeWireClock(dacInfo).catch(err =>
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
  const configObj = generateCamillaConfig(answers, eqSettings, dacInfo, { pureDirect });
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
      // Service restart takes ~800 ms before it accepts WS commands.
      await new Promise(r => setTimeout(r, 900));
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

/**
 * Query CamillaDSP GetStatus — returns live signal metrics.
 * Used by /api/player/signal-path for clipping detection, load, and RMS levels.
 */
export async function getCamillaStatus() {
  try {
    const { WebSocket } = await import('ws');
    return await new Promise((resolve) => {
      const ws = new WebSocket('ws://localhost:1234');
      const timer = setTimeout(() => { ws.terminate(); resolve(null); }, 1500);
      ws.on('open', () => ws.send(JSON.stringify({ GetStatus: null })));
      ws.on('message', (d) => {
        clearTimeout(timer); ws.close();
        try {
          const msg = JSON.parse(d.toString());
          const v = msg.GetStatus?.value;
          if (!v) { resolve(null); return; }
          resolve({
            state:           v.state           ?? 'Unknown',
            clippedSamples:  v.clippedSamples   ?? 0,
            bufferUnderruns: v.bufferUnderruns  ?? 0,
            processingLoad:  v.processingLoad   ?? 0,
            captureRmsL:     v.captureSignalRms?.[0]  ?? -100,
            captureRmsR:     v.captureSignalRms?.[1]  ?? -100,
          });
        } catch { resolve(null); }
      });
      ws.on('error', () => { clearTimeout(timer); resolve(null); });
    });
  } catch { return null; }
}

/**
 * Read current audio format from MPD (rate:bits:channels).
 * Returns null when MPD is stopped or unreachable.
 */
async function getMpdAudioFormat() {
  const net = await import('net');
  return new Promise((resolve) => {
    const socket = net.createConnection(6600, '127.0.0.1');
    let buf = '';
    let greeted = false;
    const timer = setTimeout(() => { socket.destroy(); resolve(null); }, 1500);
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (!greeted && buf.includes('\n')) {
        greeted = true; buf = '';
        socket.write('status\n');
        return;
      }
      if (greeted && (buf.includes('\nOK\n') || buf.endsWith('\nOK'))) {
        clearTimeout(timer);
        socket.destroy();
        const m = buf.match(/^audio:\s*(\d+):(\d+):(\d+)/m);
        resolve(m ? { rate: parseInt(m[1]), bits: parseInt(m[2]), channels: parseInt(m[3]) } : null);
      }
    });
    socket.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

let _lastMpdRate = 0;
let _mpdRateWatcherActive = false;

/**
 * Start a persistent MPD idle connection that watches for player events.
 * When a song with a different sample rate starts, CamillaDSP capture rate
 * is updated automatically so no unnecessary resampling occurs inside CamillaDSP.
 * Reconnects automatically on disconnect. Call once on server startup.
 */
export function startMpdRateWatcher() {
  if (_mpdRateWatcherActive) return;
  _mpdRateWatcherActive = true;
  _connectMpdIdle();
}

function _connectMpdIdle() {
  if (!_mpdRateWatcherActive) return;
  import('net').then(({ default: net }) => {
    const socket = net.createConnection(6600, '127.0.0.1');
    let buf = '';
    let greeted = false;
    const reconnect = () => { socket.destroy(); setTimeout(_connectMpdIdle, 5000); };

    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (!greeted && buf.includes('\n')) {
        greeted = true; buf = '';
        socket.write('idle player\n');
        return;
      }
      if (greeted && (buf.includes('\nOK\n') || buf.endsWith('\nOK'))) {
        const changed = buf.includes('changed: player');
        buf = '';
        if (changed) {
          getMpdAudioFormat().then(fmt => {
            if (fmt?.rate && fmt.rate !== _lastMpdRate) {
              const prev = _lastMpdRate;
              _lastMpdRate = fmt.rate;
              console.log(`[MPD Rate] ${prev || '?'} → ${fmt.rate} Hz — updating CamillaDSP capture rate`);
              updateCamillaConfigFromSettings({ skipAlsa: true, samplerate: fmt.rate })
                .catch(err => console.warn('[MPD Rate] CamillaDSP update failed:', err.message));
            }
          });
        }
        socket.write('idle player\n');
      }
    });
    socket.on('error', (err) => { console.warn('[MPD Idle] Error:', err.message); reconnect(); });
    socket.on('close', reconnect);
  });
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

// Play a resolved hi-res stream URL through MPD — reuses the exact path web radio
// uses (MPD → ALSA loopback → CamillaDSP → DAC), so EQ/DSP/volume all apply.
async function playStreamUrl(url, meta, source) {
  if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });

  // Switch source FIRST: this stops the previous source's MPD/services (and pauses
  // Spotify). It must happen before we start our own MPD playback, otherwise the
  // SET_SOURCE teardown's `mpc stop` would kill the track we just queued.
  await emit('SET_SOURCE', { spotify: false, source });

  // Now stream the resolved hi-res URL through MPD → loopback → CamillaDSP → DAC.
  await execPromise('mpc clear');
  await execFilePromise('mpc', ['add', url]);
  await execPromise('mpc play');

  // Finally push the real now-playing card (overrides the "waiting" placeholder
  // the SET_SOURCE handler sets for passthrough sources).
  await emit('PLAYBACK_STATE', {
    paused: false,
    position: 0,
    duration: meta.duration || 0,
    track_window: {
      current_track: {
        name: meta.title || 'Unknown',
        artists: [{ name: meta.artist || '' }],
        album: { name: meta.album || '', images: meta.cover ? [{ url: meta.cover }] : [] },
      },
    },
  });
}

// ── Tidal (OAuth2 device flow → MPD playback) ─────────────────────────────────

// POST /api/player/tidal/device-auth — begin the device-code login flow
router.post('/tidal/device-auth', async (req, res) => {
  try {
    const info = await tidalDeviceAuth();
    res.json({ success: true, ...info });
  } catch (err) {
    console.error('[Tidal] Device auth failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// POST /api/player/tidal/poll {deviceCode} — poll until the user authorises
router.post('/tidal/poll', async (req, res) => {
  const { deviceCode } = req.body || {};
  if (!deviceCode) return res.status(400).json({ error: 'deviceCode required' });
  try {
    const result = await tidalPollToken(deviceCode);
    if (result.connected) await emit('SET_SOURCE', { spotify: false, source: 'tidal' });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

// GET /api/player/tidal/search?q=
router.get('/tidal/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await tidalSearch(q, Math.min(parseInt(req.query.limit, 10) || 25, 50)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/player/tidal/play-track {id, ...meta}
router.post('/tidal/play-track', async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'track id required' });
  try {
    const { url } = await tidalTrackUrl(id, req.body.quality || 'LOSSLESS');
    await playStreamUrl(url, req.body, 'tidal');
    res.json({ success: true });
  } catch (err) {
    console.error('[Tidal] Play track failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/player/tidal/status
router.get('/tidal/status', async (req, res) => {
  res.json({ connected: await tidalConnected() });
});

// DELETE /api/player/tidal/disconnect
router.delete('/tidal/disconnect', async (req, res) => {
  try {
    await setSetting('tidal_session', '');
    clearTidal();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Qobuz (username/password → MPD playback) ──────────────────────────────────

// POST /api/player/qobuz/auth — store + validate credentials
router.post('/qobuz/auth', async (req, res) => {
  const { username, password, app_id, app_secret } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  try {
    if (app_id)     await setSetting('qobuz_app_id', app_id);
    if (app_secret) await setSetting('qobuz_app_secret', app_secret);
    await setSetting('qobuz_username', username);
    await setSetting('qobuz_password', password);
    // Validate immediately so the user gets real feedback (not a dead source).
    await qobuzLogin(username, password);
    await emit('SET_SOURCE', { spotify: false, source: 'qobuz' });
    res.json({ success: true });
  } catch (err) {
    console.error('[Qobuz] Auth failed:', err.message);
    res.status(401).json({ error: err.message });
  }
});

// GET /api/player/qobuz/search?q=
router.get('/qobuz/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await qobuzSearch(q, Math.min(parseInt(req.query.limit, 10) || 25, 50)));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// POST /api/player/qobuz/play-track {id, ...meta}
router.post('/qobuz/play-track', async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'track id required' });
  try {
    const { url } = await qobuzTrackUrl(id, req.body.formatId || 27);
    await playStreamUrl(url, req.body, 'qobuz');
    res.json({ success: true });
  } catch (err) {
    console.error('[Qobuz] Play track failed:', err.message);
    res.status(502).json({ error: err.message });
  }
});

// GET /api/player/qobuz/status
router.get('/qobuz/status', async (req, res) => {
  res.json({ connected: await qobuzConnected() });
});

// DELETE /api/player/qobuz/disconnect
router.delete('/qobuz/disconnect', async (req, res) => {
  try {
    await setSetting('qobuz_username', '');
    await setSetting('qobuz_password', '');
    await setSetting('qobuz_token', '');
    clearQobuz();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

