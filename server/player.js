import express from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';
import {
  getFavoriteRadios, addFavoriteRadio, deleteFavoriteRadioByUrl, setSetting, getSetting,
  addPlayHistory, getPlayHistory, clearPlayHistory, getMostPlayedTracks,
  getFavorites, addFavorite, removeFavorite, removeFavoriteByUri, isFavorite,
} from './db.js';
import { emit, getStandbyState, getCachedVolumeDb, setVolumeState } from './event-service.js';
import {
  qobuzLogin, qobuzSearch, qobuzTrackUrl, qobuzConnected, clearQobuz,
  tidalDeviceAuth, tidalPollToken, tidalSearch, tidalTrackUrl, tidalConnected, clearTidal,
} from './streaming.js';
import { sendError, badRequest, badGateway, unauthorized } from './lib/errors.js';
import { sendCamillaCommand } from './camilla-ws.js';

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

// MixRamp defaults used by the Gapless Playback toggle (see the /gapless
// routes below) — sane, widely-used values that only affect tracks carrying
// embedded MixRamp volume-ramp tags.
// mixrampdelay "0" is NOT a valid "enabled, zero delay" value — confirmed
// live against this project's MPD build: `mpc mixrampdelay 0` silently
// reads back as -1 (disabled), same as never setting it. Any positive value
// sticks correctly, so 0.1s (imperceptible) is used as the minimal "on" value.
const MIXRAMP_DB_ENABLED = '-17';
const MIXRAMP_DELAY_ENABLED = '0.1';

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
    return sendError(res, badRequest('Invalid volume: must be 0–100'));
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
    const msg = await sendCamillaCommand({ SetVolume: dB });
    const ok = msg.SetVolume?.result === 'Ok';
    if (ok) console.log(`[Volume] CamillaDSP volume set to ${dB.toFixed(1)} dB`);
    return ok;
  } catch (err) {
    console.warn('[Volume] CamillaDSP WS error:', err.message);
    return false;
  }
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
      return sendError(res, badRequest('Invalid percentage: must be 0–100'));
    }
    arg = `${pct}%`;
  } else {
    const secs = parseInt(raw, 10);
    if (!Number.isFinite(secs) || secs < 0) {
      return sendError(res, badRequest('Invalid position: percentage like "50%" or non-negative seconds'));
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
    sendError(res, err);
  }
});

// POST /api/player/radios -> Add favorite radio
router.post('/radios', async (req, res) => {
  const { name, url, favicon, country, tags } = req.body;
  if (!name || !url) {
    return sendError(res, badRequest('Name and URL are required'));
  }
  try {
    const saved = await addFavoriteRadio(name, url, favicon, country, tags);
    res.json(saved);
  } catch (err) {
    sendError(res, err);
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
    sendError(res, err);
  }
});

// DELETE /api/player/radios -> Delete favorite radio
router.delete('/radios', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return sendError(res, badRequest('URL is required'));
  }
  try {
    await deleteFavoriteRadioByUrl(url);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
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
      bluetooth: 'Bluetooth → PipeWire (A2DP) → CamillaDSP → DAC',
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
        maxRate:        dac.supportedRates.length ? Math.max(...dac.supportedRates) : null,
      },
    });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/player/pure-direct → toggle DSP-bypass (flat pipeline, no EQ)
router.post('/pure-direct', async (req, res) => {
  const { enabled } = req.body;
  if (enabled === undefined) return sendError(res, badRequest('enabled required'));
  try {
    await emit('SET_PURE_DIRECT', { enabled: !!enabled });
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
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
    const userPreAmp = (selectedPresetName === 'Custom') ? (Number(eqSettings?.preAmp) || 0) : 0;
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

// POST /api/player/dsp-calibration -> Save user DSP calibration answers & generate configuration
router.post('/dsp-calibration', async (req, res) => {
  const { answers } = req.body;
  if (!answers) {
    return sendError(res, badRequest('Answers are required'));
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
    sendError(res, err);
  }
});

// GET /api/player/dsp-calibration -> Retrieve calibration
router.get('/dsp-calibration', async (req, res) => {
  try {
    const data = await getSetting('dsp_calibration');
    res.json(data ? JSON.parse(data) : null);
  } catch (err) {
    sendError(res, err);
  }
});

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

// ── DSD Direct Bypass ─────────────────────────────────────────────────────────
// Purists expect their DAC's "DSD" indicator to light up on .dsf/.dff playback.
// That only happens if the DSD bitstream reaches the DAC untouched — i.e. NOT
// resampled to PCM through the PipeWire → loopback → CamillaDSP chain. So when a
// DSD file plays AND Pure Direct is active AND the bypass is enabled, we flip
// MPD's active output from "CamillaDSP Input" to the DoP "DSD Direct" output
// (straight to hw:CARD=…), and flip back for PCM. Controlled by `dsd_bypass`
// (default on). The PCM path is completely untouched when not bypassing.
const DSD_OUTPUT_NAME = 'DSD Direct';
const PCM_OUTPUT_NAME = 'CamillaDSP Input';
let _dsdActive = false;

async function getMpdOutputs() {
  try {
    const { stdout } = await execPromise('mpc outputs');
    return stdout.split('\n').map(l => {
      const m = l.match(/^Output\s+(\d+)\s+\((.+)\)\s+is\s+(enabled|disabled)/i);
      return m ? { id: parseInt(m[1], 10), name: m[2].trim(), enabled: m[3].toLowerCase() === 'enabled' } : null;
    }).filter(Boolean);
  } catch { return []; }
}

// Enable exactly one output by name, disabling the others — without stopping playback.
async function mpcEnableOnly(name) {
  const outs = await getMpdOutputs();
  const target = outs.find(o => o.name === name);
  if (!target) { console.warn(`[DSD] MPD output "${name}" not found (check /etc/mpd.conf).`); return false; }
  for (const o of outs) {
    const want = o.id === target.id;
    if (o.enabled !== want) {
      await execPromise(`mpc ${want ? 'enable' : 'disable'} ${o.id}`).catch(() => {});
    }
  }
  return true;
}

async function getCurrentMpdFile() {
  try { const { stdout } = await execPromise('mpc -f "%file%" current'); return stdout.trim(); }
  catch { return ''; }
}

// Re-evaluate routing for the current track. Safe to call on every player event.
export async function applyDsdRouting() {
  const [bypassVal, pdVal] = await Promise.all([
    getSetting('dsd_bypass').catch(() => null),
    getSetting('pure_direct').catch(() => null),
  ]);
  const bypassEnabled = !(bypassVal === 'false' || bypassVal === '0'); // default ON
  const pureDirect = pdVal === 'true';
  const file = await getCurrentMpdFile();
  const isDsd = /\.(dsf|dff)$/i.test(file);
  const wantDsd = bypassEnabled && pureDirect && isDsd;

  if (wantDsd === _dsdActive) return wantDsd; // already in the right state

  if (wantDsd) {
    const ok = await mpcEnableOnly(DSD_OUTPUT_NAME);
    if (ok) { _dsdActive = true; console.log('[DSD] Native bypass ON — MPD → DAC direct (DoP), CamillaDSP bypassed.'); }
    return ok;
  }
  await mpcEnableOnly(PCM_OUTPUT_NAME);
  if (_dsdActive) console.log('[DSD] Bypass OFF — MPD → CamillaDSP PCM chain restored.');
  _dsdActive = false;
  return false;
}

export function isDsdBypassActive() { return _dsdActive; }

// MPD does NOT persist crossfade or ReplayGain across a restart (they reset to
// 0 / off), but we save the user's choice in the DB. Re-apply both on startup so
// the settings actually survive a reboot. MPD may not be reachable the instant
// the API boots, so probe with a short retry first.
export async function applyPersistedMpdSettings() {
  let reachable = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await execFilePromise('mpc', ['version']); reachable = true; break; }
    catch { await new Promise(r => setTimeout(r, 1000)); }
  }
  if (!reachable) { console.warn('[MPD] Not reachable at startup — skipping persisted-setting restore.'); return; }

  try {
    const [xfVal, rgVal, glVal] = await Promise.all([
      getSetting('crossfade_seconds').catch(() => null),
      getSetting('replaygain_mode').catch(() => null),
      getSetting('gapless_enabled').catch(() => null),
    ]);
    const gapless = glVal === '1';
    // Gapless re-applies crossfade itself (it owns crossfade=0 while active),
    // so only apply the persisted crossfade_seconds value when gapless isn't on.
    const secs = parseInt(xfVal ?? '', 10);
    if (!gapless && Number.isFinite(secs) && secs >= 0) {
      await execFilePromise('mpc', ['crossfade', String(secs)]).catch(() => {});
    }
    if (rgVal && ['off', 'track', 'album', 'auto'].includes(rgVal)) {
      await execFilePromise('mpc', ['replaygain', rgVal]).catch(() => {});
    }
    if (gapless) {
      await execFilePromise('mpc', ['crossfade', '0']).catch(() => {});
      await execFilePromise('mpc', ['mixrampdb', MIXRAMP_DB_ENABLED]).catch(() => {});
      await execFilePromise('mpc', ['mixrampdelay', MIXRAMP_DELAY_ENABLED]).catch(() => {});
    }
    if ((Number.isFinite(secs) && secs > 0) || (rgVal && rgVal !== 'off') || gapless) {
      console.log(`[MPD] Restored persisted settings — crossfade: ${Number.isFinite(secs) ? secs + 's' : 'n/a'}, replaygain: ${rgVal || 'n/a'}, gapless: ${gapless}`);
    }
  } catch (err) {
    console.warn('[MPD] Failed to restore persisted settings:', err.message);
  }
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
          // DSD bypass first: if we're switching to/from a DSD bitstream, flip
          // the MPD output before touching the (now-bypassed) CamillaDSP rate.
          applyDsdRouting().catch(err => console.warn('[DSD] Routing update failed:', err.message));
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
  if (artist && artist.length > 500) return sendError(res, badRequest('Artist name too long'));
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
  if (artist && artist.length > 500) return sendError(res, badRequest('Artist name too long'));
  if (album && album.length > 500) return sendError(res, badRequest('Album name too long'));
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

// GET /api/player/library/search?q=<query>&limit=<n>
// Full-text search across the MPD library (title, artist, album, any).
router.get('/library/search', async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
  if (!q || q.length > 500) return res.json({ tracks: [] });
  try {
    const { stdout } = await execFilePromise('mpc', [
      '-f', '%title%||%artist%||%album%||%file%',
      'search', 'any', q,
    ]);
    const tracks = stdout.split('\n')
      .map(s => s.trim()).filter(Boolean)
      .slice(0, limit)
      .map(line => {
        const [title, artist, album, file] = line.split('||');
        return { title: title || '', artist: artist || '', album: album || '', file: file || '' };
      })
      .filter(t => t.file);
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
    sendError(res, err);
  }
});

// POST /api/player/queue/add
router.post('/queue/add', async (req, res) => {
  const { path: filePath, play = false } = req.body;
  if (!filePath) return sendError(res, badRequest('path required'));
  try {
    await execFilePromise('mpc', ['add', filePath]);
    if (play) await execPromise('mpc play');
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/player/queue/add-many — used by Smart Playlists' "play all".
// Adds one at a time (not a single `mpc add a b c`) so one stale/deleted
// path (e.g. a play_history entry for a file the user since removed) can't
// abort the whole batch via MPD command-list fail-fast semantics.
router.post('/queue/add-many', async (req, res) => {
  const { paths, play = false } = req.body || {};
  if (!Array.isArray(paths) || paths.length === 0) return sendError(res, badRequest('paths required'));
  if (paths.length > 200) return sendError(res, badRequest('too many paths (max 200)'));
  let added = 0;
  for (const p of paths) {
    if (typeof p !== 'string' || !p) continue;
    try { await execFilePromise('mpc', ['add', p]); added++; }
    catch (err) { console.warn('[queue/add-many] failed to add', p, err.message); }
  }
  if (play && added > 0) await execPromise('mpc play').catch(() => {});
  res.json({ success: true, added, requested: paths.length });
});

// POST /api/player/standby -> Set standby state (used by wake monitor scripts or external triggers)
router.post('/standby', async (req, res) => {
  const { enabled } = req.body;
  if (enabled === undefined) {
    return sendError(res, badRequest('enabled parameter is required'));
  }
  try {
    await emit('SET_STANDBY', { enabled });
    res.json({ success: true });
  } catch (err) {
    console.error('[Player API] Standby toggle failed:', err);
    sendError(res, err);
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
    sendError(res, badGateway(err.message));
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
    sendError(res, badGateway(err.message));
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

// ── Bluetooth A2DP (native PipeWire/WirePlumber — NOT bluealsa) ───────────────
// install.sh deliberately does not install bluealsa: PipeWire + WirePlumber
// handle A2DP natively (including LDAC/AAC/aptX) and bluealsa conflicts with
// that stack. There is no "bluealsa" systemd unit to start/stop — the
// adapter itself just needs to be powered + discoverable + pairable so a
// phone can connect; WirePlumber then creates the PipeWire node for the
// negotiated A2DP sink automatically (routed into ResonanceInput by the
// monitor.bluez.rules in /etc/wireplumber/wireplumber.conf.d/).

async function isBluetoothPowered() {
  try {
    const { stdout } = await execPromise('bluetoothctl show');
    return /Powered:\s*yes/i.test(stdout);
  } catch {
    return false;
  }
}

// POST /api/player/bluetooth/start
router.post('/bluetooth/start', async (req, res) => {
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await emit('SET_SOURCE', { spotify: false, source: 'bluetooth' });
    await execPromise('bluetoothctl power on');
    await execPromise('bluetoothctl discoverable on');
    await execPromise('bluetoothctl pairable on');
    res.json({ success: true });
  } catch (err) {
    console.error('[Bluetooth] Start failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/bluetooth/stop
router.post('/bluetooth/stop', async (req, res) => {
  try {
    await execPromise('bluetoothctl discoverable off');
    await execPromise('bluetoothctl pairable off');
    res.json({ success: true });
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
  const active = await isBluetoothPowered();
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
    sendError(res, badGateway(err.message));
  }
});

// POST /api/player/tidal/poll {deviceCode} — poll until the user authorises
router.post('/tidal/poll', async (req, res) => {
  const { deviceCode } = req.body || {};
  if (!deviceCode) return sendError(res, badRequest('deviceCode required'));
  try {
    const result = await tidalPollToken(deviceCode);
    if (result.connected) await emit('SET_SOURCE', { spotify: false, source: 'tidal' });
    res.json({ success: true, ...result });
  } catch (err) {
    sendError(res, unauthorized(err.message));
  }
});

// GET /api/player/tidal/search?q=
router.get('/tidal/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await tidalSearch(q, Math.min(parseInt(req.query.limit, 10) || 25, 50)));
  } catch (err) {
    sendError(res, badGateway(err.message));
  }
});

// POST /api/player/tidal/play-track {id, ...meta}
router.post('/tidal/play-track', async (req, res) => {
  const { id } = req.body || {};
  if (!id) return sendError(res, badRequest('track id required'));
  try {
    const { url } = await tidalTrackUrl(id, req.body.quality || 'LOSSLESS');
    await playStreamUrl(url, req.body, 'tidal');
    res.json({ success: true });
  } catch (err) {
    console.error('[Tidal] Play track failed:', err.message);
    sendError(res, badGateway(err.message));
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
    return sendError(res, badRequest('username and password are required'));
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
    sendError(res, unauthorized(err.message));
  }
});

// GET /api/player/qobuz/search?q=
router.get('/qobuz/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    res.json(await qobuzSearch(q, Math.min(parseInt(req.query.limit, 10) || 25, 50)));
  } catch (err) {
    sendError(res, badGateway(err.message));
  }
});

// POST /api/player/qobuz/play-track {id, ...meta}
router.post('/qobuz/play-track', async (req, res) => {
  const { id } = req.body || {};
  if (!id) return sendError(res, badRequest('track id required'));
  try {
    const { url } = await qobuzTrackUrl(id, req.body.formatId || 27);
    await playStreamUrl(url, req.body, 'qobuz');
    res.json({ success: true });
  } catch (err) {
    console.error('[Qobuz] Play track failed:', err.message);
    sendError(res, badGateway(err.message));
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

// ── ReplayGain (#2) ───────────────────────────────────────────────────────────
router.get('/replaygain', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc replaygain');
    const match = stdout.trim().match(/ReplayGain:\s*(\S+)/i);
    res.json({ mode: match ? match[1].toLowerCase() : 'off' });
  } catch { res.json({ mode: 'off' }); }
});

router.post('/replaygain', async (req, res) => {
  const mode = (req.body.mode || 'off').toLowerCase();
  if (!['off', 'track', 'album', 'auto'].includes(mode))
    return sendError(res, badRequest('mode must be off|track|album|auto'));
  try {
    await execFilePromise('mpc', ['replaygain', mode]);
    await setSetting('replaygain_mode', mode);
    res.json({ success: true, mode });
  } catch (err) { sendError(res, err); }
});

// ── Crossfade (#5) ────────────────────────────────────────────────────────────
router.get('/crossfade', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc status');
    const match = stdout.match(/crossfade:\s*(\d+)/i);
    res.json({ seconds: match ? parseInt(match[1], 10) : 0 });
  } catch { res.json({ seconds: 0 }); }
});

router.post('/crossfade', async (req, res) => {
  const secs = parseInt(req.body.seconds ?? 0, 10);
  if (!Number.isFinite(secs) || secs < 0 || secs > 60)
    return sendError(res, badRequest('seconds must be 0-60'));
  try {
    await execFilePromise('mpc', ['crossfade', String(secs)]);
    await setSetting('crossfade_seconds', secs);
    res.json({ success: true, seconds: secs });
  } catch (err) { sendError(res, err); }
});

// ── Gapless Playback (#7 — TODOS/TODO.md §7) ──────────────────────────────────
// True zero-gap gapless is its own MPD mode, NOT just "crossfade set to 0":
// crossfade 0 alone still lets any per-track MixRamp tags cause a fade, and
// gives no guarantee about silence between tracks. Enabling this toggle
// forces crossfade to 0 (verified via `mpc crossfade`) AND turns on MixRamp
// (`mpc mixrampdb`/`mixrampdelay`, verified live against this project's MPD
// 0.23 build — `mpc mixrampdb <n>`/`mixrampdelay <n>` both work as plain mpc
// subcommands here) so albums that DO carry MixRamp volume-ramp tags (rare —
// added by tools like `mixramp-tag`) get a true seamless mix instead of a
// hard cut; tracks without those tags are unaffected by mixrampdb/delay and
// simply get the zero-gap cut from crossfade 0. Disabling it turns MixRamp
// back off (`mixrampdelay -1`, which per MPD's own docs "restores the
// previous value of crossfade") without touching the user's separate
// Crossfade seconds setting.
router.get('/gapless', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc mixrampdelay');
    const match = stdout.match(/mixrampdelay:\s*(-?[\d.]+)/i);
    const delay = match ? parseFloat(match[1]) : -1;
    res.json({ enabled: delay >= 0 });
  } catch { res.json({ enabled: false }); }
});

router.post('/gapless', async (req, res) => {
  const enabled = !!req.body.enabled;
  try {
    if (enabled) {
      await execFilePromise('mpc', ['crossfade', '0']);
      await execFilePromise('mpc', ['mixrampdb', MIXRAMP_DB_ENABLED]);
      await execFilePromise('mpc', ['mixrampdelay', MIXRAMP_DELAY_ENABLED]);
      await setSetting('crossfade_seconds', 0);
    } else {
      await execFilePromise('mpc', ['mixrampdelay', '-1']);
    }
    await setSetting('gapless_enabled', enabled ? '1' : '0');
    res.json({ success: true, enabled });
  } catch (err) { sendError(res, err); }
});

// ── Balance (#3) ──────────────────────────────────────────────────────────────
router.get('/balance', async (req, res) => {
  const val = await getSetting('balance').catch(() => null);
  res.json({ balance: val ? parseFloat(val) : 0 });
});

router.post('/balance', async (req, res) => {
  const bal = parseFloat(req.body.balance ?? 0);
  if (!Number.isFinite(bal) || bal < -12 || bal > 12)
    return sendError(res, badRequest('balance must be -12..+12 dB'));
  try {
    await setSetting('balance', bal);
    await updateCamillaConfigFromSettings({ skipAlsa: true });
    res.json({ success: true, balance: bal });
  } catch (err) { sendError(res, err); }
});

// ── Phase inversion (#4) ──────────────────────────────────────────────────────
router.get('/phase', async (req, res) => {
  const val = await getSetting('phase').catch(() => null);
  res.json(val ? JSON.parse(val) : { left: false, right: false });
});

router.post('/phase', async (req, res) => {
  const left  = !!req.body.left;
  const right = !!req.body.right;
  try {
    await setSetting('phase', JSON.stringify({ left, right }));
    await updateCamillaConfigFromSettings({ skipAlsa: true });
    res.json({ success: true, left, right });
  } catch (err) { sendError(res, err); }
});

// ── Bit-perfect mode toggle ───────────────────────────────────────────────────
// ON  (default): rate-following — PipeWire clock.allowed-rates + rate-agnostic
//                32-bit loopback so each source plays at its native rate.
// OFF (fallback): fixed 48 kHz shared rate (still 32-bit), for DACs where
//                loopback rate switching is unreliable.
// Changing this rewrites /etc/asound.conf and the PipeWire clock config, which
// fully take effect after a reboot (PipeWire clock is applied on session start).
router.get('/bitperfect', async (req, res) => {
  const val = await getSetting('bitperfect').catch(() => null);
  res.json({ enabled: !(val === 'false' || val === '0') });
});

router.post('/bitperfect', async (req, res) => {
  const enabled = !(req.body.enabled === false || req.body.enabled === 'false');
  try {
    await setSetting('bitperfect', enabled ? 'true' : 'false');
    // Full reconfig: rewrites asound.conf + PipeWire clock + CamillaDSP capture.
    await updateCamillaConfigFromSettings({ skipAlsa: false });
    res.json({ success: true, enabled, rebootRequired: true });
  } catch (err) { sendError(res, err); }
});

// ── DSD Direct Bypass toggle ──────────────────────────────────────────────────
// When ON (default) a .dsf/.dff file played in Pure Direct mode streams natively
// (DoP) straight to the DAC, bypassing CamillaDSP. When OFF, DSD is decoded to
// PCM through the normal chain. Re-applies routing immediately for the current track.
router.get('/dsd-bypass', async (req, res) => {
  const val = await getSetting('dsd_bypass').catch(() => null);
  res.json({ enabled: !(val === 'false' || val === '0'), active: isDsdBypassActive() });
});

router.post('/dsd-bypass', async (req, res) => {
  const enabled = !(req.body.enabled === false || req.body.enabled === 'false');
  try {
    await setSetting('dsd_bypass', enabled ? 'true' : 'false');
    const active = await applyDsdRouting();
    res.json({ success: true, enabled, active });
  } catch (err) { sendError(res, err); }
});

// ── Dynamic peak pre-attenuation (auto-headroom) ──────────────────────────────
// ON (default): pre-amp is attenuated by the EQ's computed peak gain so peaks
// land just under 0 dBFS — maximising SNR. OFF: each preset's static manual
// headroom is used. `headroomDb` reports the last computed attenuation.
router.get('/auto-headroom', async (req, res) => {
  const val = await getSetting('auto_headroom').catch(() => null);
  res.json({ enabled: !(val === 'false' || val === '0'), headroomDb: getLastHeadroomDb() });
});

router.post('/auto-headroom', async (req, res) => {
  const enabled = !(req.body.enabled === false || req.body.enabled === 'false');
  try {
    await setSetting('auto_headroom', enabled ? 'true' : 'false');
    await updateCamillaConfigFromSettings({ skipAlsa: true });
    res.json({ success: true, enabled, headroomDb: getLastHeadroomDb() });
  } catch (err) { sendError(res, err); }
});

// ── Queue editing (#11) ───────────────────────────────────────────────────────
// GET /api/player/queue/detailed — returns id + title + artist + file
router.get('/queue/detailed', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc -f "%id%||%title%||%artist%||%file%" playlist');
    const tracks = stdout.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [id, title, artist, file] = line.split('||');
      return { id: id || '', title: title || file?.split('/').pop() || '', artist: artist || '', file: file || '' };
    });
    res.json({ tracks });
  } catch { res.json({ tracks: [] }); }
});

// DELETE /api/player/queue/:id — remove by MPD song id
router.delete('/queue/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return sendError(res, badRequest('invalid id'));
  try {
    await execFilePromise('mpc', ['deleteid', String(id)]);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// POST /api/player/queue/move {from, to} — reorder (0-based positions)
router.post('/queue/move', async (req, res) => {
  const from = parseInt(req.body.from, 10);
  const to   = parseInt(req.body.to,   10);
  if (!Number.isFinite(from) || !Number.isFinite(to))
    return sendError(res, badRequest('from and to required'));
  try {
    await execFilePromise('mpc', ['move', String(from + 1), String(to + 1)]);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ── Lyrics (#7) via LRCLIB ───────────────────────────────────────────────────
let _lyricsNodeFetch = null;
async function getLyricsFetch() {
  if (!_lyricsNodeFetch) _lyricsNodeFetch = (await import('node-fetch')).default;
  return _lyricsNodeFetch;
}

router.get('/lyrics', async (req, res) => {
  const title  = (req.query.title  || '').trim();
  const artist = (req.query.artist || '').trim();
  const album  = (req.query.album  || '').trim();
  const duration = parseInt(req.query.duration, 10) || 0;
  if (!title || !artist) return sendError(res, badRequest('title and artist required'));
  try {
    const fetch = await getLyricsFetch();
    const params = new URLSearchParams({ track_name: title, artist_name: artist });
    if (album) params.set('album_name', album);
    if (duration) params.set('duration', duration);
    const r = await fetch(`https://lrclib.net/api/get?${params}`, {
      headers: { 'Lrclib-Client': 'ResonanceHiFi/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return res.json({ plain: null, synced: null });
    const d = await r.json();
    res.json({ plain: d.plainLyrics || null, synced: d.syncedLyrics || null });
  } catch (err) {
    res.json({ plain: null, synced: null });
  }
});

// ── Play History (#13) ────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  res.json(await getPlayHistory(limit));
});

router.post('/history', async (req, res) => {
  const { source, title, artist, album, file, cover } = req.body || {};
  if (!source) return sendError(res, badRequest('source required'));
  await addPlayHistory({ source, title, artist, album, file, cover });
  res.json({ success: true });
});

router.delete('/history', async (req, res) => {
  await clearPlayHistory();
  res.json({ success: true });
});

// ── Unified Favorites (#25) ───────────────────────────────────────────────────
router.get('/favorites', async (req, res) => {
  res.json(await getFavorites());
});

router.post('/favorites', async (req, res) => {
  const { source, uri, title, artist, album, file, cover } = req.body || {};
  if (!source || !uri) return sendError(res, badRequest('source and uri required'));
  const result = await addFavorite({ source, uri, title, artist, album, file, cover });
  res.json(result || { success: false, message: 'already favorited' });
});

router.delete('/favorites/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return sendError(res, badRequest('invalid id'));
  await removeFavorite(id);
  res.json({ success: true });
});

router.delete('/favorites', async (req, res) => {
  const { source, uri } = req.body || {};
  if (!source || !uri) return sendError(res, badRequest('source and uri required'));
  await removeFavoriteByUri(source, uri);
  res.json({ success: true });
});

router.get('/favorites/check', async (req, res) => {
  const { source, uri } = req.query;
  if (!source || !uri) return res.json({ favorited: false });
  res.json({ favorited: await isFavorite(source, uri) });
});

// ── Library genres / years (#14) ─────────────────────────────────────────────
router.get('/library/genres', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc list genre');
    const genres = stdout.split('\n').map(s => s.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
    res.json({ genres });
  } catch { res.json({ genres: [] }); }
});

router.get('/library/by-genre', async (req, res) => {
  const genre = (req.query.genre || '').trim();
  if (!genre || genre.length > 500) return res.json({ tracks: [] });
  try {
    const { stdout } = await execFilePromise('mpc', [
      '-f', '%title%||%artist%||%album%||%file%',
      'find', 'genre', genre,
    ]);
    const tracks = stdout.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [title, artist, album, file] = line.split('||');
      return { title: title || '', artist: artist || '', album: album || '', file: file || '' };
    }).filter(t => t.file);
    res.json({ tracks });
  } catch { res.json({ tracks: [] }); }
});

// ── MPD Playlists (#12) ───────────────────────────────────────────────────────
router.get('/playlists', async (req, res) => {
  try {
    const { stdout } = await execPromise('mpc lsplaylists');
    const playlists = stdout.split('\n').map(s => s.trim()).filter(Boolean);
    res.json({ playlists });
  } catch { res.json({ playlists: [] }); }
});

router.post('/playlists/:name/save', async (req, res) => {
  const name = req.params.name.replace(/[^\w\s\-_.]/g, '').trim();
  if (!name) return sendError(res, badRequest('invalid playlist name'));
  try {
    await execFilePromise('mpc', ['save', name]);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.delete('/playlists/:name', async (req, res) => {
  const name = req.params.name.replace(/[^\w\s\-_.]/g, '').trim();
  if (!name) return sendError(res, badRequest('invalid playlist name'));
  try {
    await execFilePromise('mpc', ['rm', name]);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

router.post('/playlists/:name/play', async (req, res) => {
  const name = req.params.name.replace(/[^\w\s\-_.]/g, '').trim();
  if (!name) return sendError(res, badRequest('invalid playlist name'));
  try {
    if (getStandbyState()) await emit('SET_STANDBY', { enabled: false });
    await execPromise('mpc clear');
    await execFilePromise('mpc', ['load', name]);
    await execPromise('mpc play');
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ── Listening Stats (#26) ─────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const history = await getPlayHistory(500);
    const totalMs  = history.length * 3 * 60 * 1000; // rough 3-min avg
    const byArtist = {};
    const bySource = {};
    const byTitle  = {};
    for (const h of history) {
      if (h.artist) byArtist[h.artist] = (byArtist[h.artist] || 0) + 1;
      if (h.source) bySource[h.source] = (bySource[h.source] || 0) + 1;
      if (h.title)  byTitle[h.title]   = (byTitle[h.title]   || 0) + 1;
    }
    const topArtists = Object.entries(byArtist).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    const topTracks  = Object.entries(byTitle).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));
    const sourceBreakdown = Object.entries(bySource).map(([source, count]) => ({ source, count }));
    res.json({ totalPlays: history.length, totalMs, topArtists, topTracks, sourceBreakdown });
  } catch (err) { sendError(res, err); }
});

// ── Smart Playlists (#27) ─────────────────────────────────────────────────────
// Local-library equivalent of Spotify/Apple's auto-generated mixes, built
// entirely from data this app already has (play_history + MPD's own file
// mtimes) — no external dependency, no new SQLite table.

// GET /api/player/library/smart/most-played?limit=50
router.get('/library/smart/most-played', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  try {
    const tracks = await getMostPlayedTracks(limit);
    res.json({ tracks });
  } catch (err) { sendError(res, err); }
});

const MPD_MUSIC_DIR = '/var/lib/mpd/music';
let recentlyAddedCache = { at: 0, tracks: [] };
const RECENTLY_ADDED_CACHE_MS = 5 * 60 * 1000;

// MPD 0.23 (pinned here) has no "modified-since" search filter — confirmed
// live (`mpc find modified-since ...` rejects it as an invalid search type)
// — so "recently added" is derived from the music files' own filesystem
// mtime instead, which needs no MPD protocol support at all. Cached briefly
// since it stats every file in the library on a cache miss.
async function getRecentlyAddedTracks(limit) {
  if (Date.now() - recentlyAddedCache.at < RECENTLY_ADDED_CACHE_MS) {
    return recentlyAddedCache.tracks.slice(0, limit);
  }
  const { stdout } = await execFilePromise('mpc', [
    '-f', '%file%||%title%||%artist%||%album%',
    'listall',
  ]);
  const lines = stdout.split('\n').map(s => s.trim()).filter(Boolean);
  // Stat in bounded batches — an unbounded Promise.all would open one fd per
  // library file simultaneously (fine at appliance scale, an fd spike on a
  // large NAS-mounted library). AUDIT-2026-07-03.md §C.2.
  const STAT_BATCH = 64;
  const withMtime = [];
  for (let i = 0; i < lines.length; i += STAT_BATCH) {
    const batch = await Promise.all(lines.slice(i, i + STAT_BATCH).map(async (line) => {
      const [file, title, artist, album] = line.split('||');
      if (!file) return null;
      try {
        const st = await fs.promises.stat(path.join(MPD_MUSIC_DIR, file));
        return { file, title: title || path.basename(file), artist: artist || '', album: album || '', mtimeMs: st.mtimeMs };
      } catch {
        return null; // file listed in MPD's db but missing on disk (stale db) — skip
      }
    }));
    withMtime.push(...batch);
  }
  const tracks = withMtime.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
  recentlyAddedCache = { at: Date.now(), tracks };
  return tracks.slice(0, limit);
}

// GET /api/player/library/smart/recently-added?limit=50
router.get('/library/smart/recently-added', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  try {
    const tracks = await getRecentlyAddedTracks(limit);
    res.json({ tracks });
  } catch (err) { sendError(res, err); }
});

export default router;

