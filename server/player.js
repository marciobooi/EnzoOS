import express from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import {
  getFavoriteRadios, addFavoriteRadio, deleteFavoriteRadioByUrl, setSetting, getSetting,
  addPlayHistory, getPlayHistory, clearPlayHistory, getMostPlayedTracks,
  getFavorites, addFavorite, removeFavorite, removeFavoriteByUri, isFavorite,
} from './db.js';
import {
  emit, getStandbyState, setVolumeState, getEffectiveVolumeDb, getSpotifyTrimDb, setSpotifyTrimDb,
} from './event-service.js';
import {
  qobuzLogin, qobuzSearch, qobuzTrackUrl, qobuzConnected, clearQobuz,
  tidalDeviceAuth, tidalPollToken, tidalSearch, tidalTrackUrl, tidalConnected, clearTidal,
} from './streaming.js';
import { sendError, badRequest, badGateway, unauthorized } from './lib/errors.js';
import {
  setCamillaVolume, updateCamillaConfigFromSettings, detectDac, getCamillaStatus, getLastHeadroomDb,
} from './camilla-config.js';
import { mpdReadPicture } from './mpd-art.js';
// Re-exported so event-service.js's `import('./player.js')` (used to avoid a
// circular import at module load time) keeps working unchanged.
export { setCamillaVolume, updateCamillaConfigFromSettings };

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

// POST /api/player/volume -> Set volume via CamillaDSP (instant, all sources)
// CamillaDSP applies gain after all ALSA buffers so there is zero lag.
// MPD software mixer stays at 100% — CamillaDSP owns the volume stage.
router.post('/volume', async (req, res) => {
  const vol = parseInt(req.body.volume, 10);
  if (!Number.isFinite(vol) || vol < 0 || vol > 100) {
    return sendError(res, badRequest('Invalid volume: must be 0–100'));
  }
  try {
    // setVolumeState first, then read event-service.js's getEffectiveVolumeDb()
    // (base cubic-law dB + Spotify Level Trim while active) off the
    // now-updated cachedVolume, rather than computing dB independently here.
    setVolumeState(vol, vol <= 0);
    await setCamillaVolume(getEffectiveVolumeDb());
    // Unlike /spotify-volume (below), this route never broadcast the change —
    // the ONLY way another connected client learned about a volume set from
    // here was the sender's own client-side WS send, which is itself gated on
    // a track being loaded (so nothing propagates at all while idle) and racy
    // with the 180ms debounce every slider caller uses. Kiosk/remote volume
    // sync was reported as laggy/inconsistent; this was the actual gap — the
    // one route that unconditionally changes the volume never told anyone.
    emit('SET_VOLUME', { volume: vol, is_muted: vol <= 0 });
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
    setVolumeState(vol, vol <= 0);
    const effectiveDb = getEffectiveVolumeDb();
    await setCamillaVolume(effectiveDb);
    // Broadcast so every connected client updates its volume slider immediately.
    emit('SET_VOLUME', { volume: vol, is_muted: vol <= 0 });
    console.log(`[Spotify] Volume event: ${vol}% → CamillaDSP ${effectiveDb.toFixed(1)} dB`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Spotify Volume] Failed:', err.message);
    res.status(500).json({ success: false });
  }
});

// GET/POST /api/player/spotify-trim — the Spotify Level Trim from event-
// service.js's cross-source loudness work: a static, user-adjustable dB
// offset applied only while the active source is spotify/dj, compensating
// for the systematic gap between Spotify's own loudness normalization
// target and whatever ReplayGain reference the local library is tagged
// against (MPD's ReplayGain has zero effect on Spotify, which bypasses MPD
// entirely). See getEffectiveVolumeDb() in event-service.js.
router.get('/spotify-trim', (req, res) => {
  res.json({ trimDb: getSpotifyTrimDb() });
});

router.post('/spotify-trim', async (req, res) => {
  const trimDb = Number(req.body.trimDb);
  if (!Number.isFinite(trimDb) || trimDb < -12 || trimDb > 6) {
    return sendError(res, badRequest('trimDb must be between -12 and 6'));
  }
  setSpotifyTrimDb(trimDb);
  await setSetting('spotify_volume_trim_db', String(trimDb));
  // Re-apply immediately if it's actually audible right now, same as any
  // other live DSP-adjacent setting in this file.
  try {
    const activeSource = await getSetting('active_source');
    if (['spotify', 'dj'].includes(activeSource)) {
      await setCamillaVolume(getEffectiveVolumeDb());
    }
  } catch (err) {
    console.warn('[Spotify Trim] Live re-apply failed (non-fatal):', err.message);
  }
  emit('ADVANCED_SETTING_CHANGED', { field: 'spotifyTrim', value: trimDb });
  res.json({ trimDb: getSpotifyTrimDb() });
});

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
// Four cases seen in the wild (blobs captured live from Rádio Comercial):
//   1. The raw stream URL (HLS/AAC streams with no ICY title) -> suppress.
//   2. Dalet RadioInfo XML with a song playing ->
//      pull <DB_SONG_NAME> / <DB_LEAD_ARTIST_NAME> out of the blob.
//   3. Dalet RadioInfo XML during a live show (no song; <DB_SONG_ID>0</DB_SONG_ID>,
//      only an <AnimadorInfo> block) -> show name + station as artist. Note
//      <DB_DALET_TITLE_NAME> holds the station SLOGAN here, not a title.
//   4. Any other angle-bracket markup -> strip tags; but never emit a Dalet
//      blob as tag-stripped field soup — suppress so the UI keeps the station
//      name instead.
// Returns { name, artist } so callers get clean, separated fields.
export function sanitizeStreamTitle(raw) {
  const name = (raw || '').trim();
  if (!name) return { name: '', artist: '' };
  if (name.startsWith('http://') || name.startsWith('https://')) return { name: '', artist: '' };
  if (!name.includes('<')) return { name, artist: '' };
  const tag = (t) => name.match(new RegExp(`<${t}>([^<]+)</${t}>`))?.[1]?.trim();
  const song = tag('DB_SONG_NAME');
  if (song) return { name: song, artist: tag('DB_LEAD_ARTIST_NAME') || '' };
  const show = tag('SHOW_NAME') || tag('TITLE');
  if (show) return { name: show, artist: tag('DB_RADIO_NAME') || '' };
  if (/<(RadioInfo|DB_[A-Z_]+)>/i.test(name)) return { name: '', artist: '' };
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

/**
 * Send a single MPD protocol command over the raw TCP connection (same
 * pattern as getMpdAudioFormat above) and report whether it succeeded.
 * Needed for queue operations keyed on MPD's song id: `mpc playid`/`mpc
 * deleteid` are both "unknown command" on this build (mpc 0.35 only wraps
 * `play <position>` — the ID-based forms exist in the MPD protocol itself,
 * just not as mpc CLI subcommands), so id-based play/delete go straight to
 * the socket instead of shelling out to mpc.
 */
async function mpdCommand(cmd) {
  const net = await import('net');
  return new Promise((resolve) => {
    const socket = net.createConnection(6600, '127.0.0.1');
    let buf = '';
    let greeted = false;
    const timer = setTimeout(() => { socket.destroy(); resolve(false); }, 1500);
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (!greeted && buf.includes('\n')) {
        greeted = true; buf = '';
        socket.write(`${cmd}\n`);
        return;
      }
      if (greeted && (buf.includes('\nOK\n') || buf.endsWith('\nOK') || buf.includes('ACK ['))) {
        clearTimeout(timer);
        socket.destroy();
        resolve(!buf.includes('ACK ['));
      }
    });
    socket.on('error', () => { clearTimeout(timer); resolve(false); });
  });
}

/**
 * Send a single MPD protocol command over the raw TCP connection and return
 * its full response text (same connect/greet pattern as mpdCommand above,
 * which only reports success/failure — this is for commands like `lsinfo`
 * whose actual response body is the point). Resolves to null on ACK/timeout/
 * error rather than throwing, matching this file's existing MPD-helper style.
 */
async function mpdQuery(cmd) {
  const net = await import('net');
  return new Promise((resolve) => {
    const socket = net.createConnection(6600, '127.0.0.1');
    let buf = '';
    let greeted = false;
    const timer = setTimeout(() => { socket.destroy(); resolve(null); }, 2000);
    socket.on('data', (chunk) => {
      buf += chunk.toString();
      if (!greeted && buf.includes('\n')) {
        greeted = true; buf = '';
        socket.write(`${cmd}\n`);
        return;
      }
      if (greeted && (buf.includes('\nOK\n') || buf.endsWith('\nOK') || buf.includes('ACK ['))) {
        clearTimeout(timer);
        socket.destroy();
        resolve(buf.includes('ACK [') ? null : buf);
      }
    });
    socket.on('error', () => { clearTimeout(timer); resolve(null); });
  });
}

// MPD protocol string quoting: wrap in double quotes, backslash-escape any
// literal backslash or double quote already in the value.
function mpdQuoteArg(str) {
  return `"${String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/**
 * Folder browsing (as opposed to the artist/album/track tag-based views
 * above) — MPD's own `lsinfo` protocol command returns typed directory/file
 * entries for one level of its virtual filesystem (sandboxed to
 * music_directory) PLUS full tags per file in a single round trip. Not
 * exposed as an `mpc` CLI subcommand on this build, hence the raw socket
 * call — confirmed live against the real MPD instance that `lsinfo ""` and
 * `lsinfo "<path>"` both work (an invalid/nonexistent path comes back as an
 * ACK error, handled by mpdQuery returning null above).
 */
async function mpdLsInfo(relPath) {
  const text = await mpdQuery(`lsinfo ${mpdQuoteArg(relPath || '')}`);
  if (text == null) return null;
  const directories = [];
  const files = [];
  let current = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line === 'OK') continue;
    const dirM = line.match(/^directory:\s*(.*)$/);
    if (dirM) { current = null; directories.push(dirM[1]); continue; }
    const fileM = line.match(/^file:\s*(.*)$/);
    if (fileM) { current = { file: fileM[1], title: '', artist: '', track: null, disc: 1 }; files.push(current); continue; }
    if (!current) continue; // playlist: entries or anything before the first file/directory
    const tagM = line.match(/^(Title|Artist|Track|Disc):\s*(.*)$/);
    if (!tagM) continue;
    const [, tag, value] = tagM;
    if (tag === 'Title') current.title = value;
    else if (tag === 'Artist') current.artist = value;
    else if (tag === 'Track') current.track = parseTagNumber(value);
    else if (tag === 'Disc') current.disc = parseTagNumber(value) || 1;
  }
  directories.sort((a, b) => a.localeCompare(b));
  return { directories, files };
}

// GET /api/player/library/browse?path=<relative path, omit/empty for root>
// Path segments are user-supplied — reject traversal attempts before they
// ever reach MPD, on top of MPD's own sandboxing to music_directory.
router.get('/library/browse', async (req, res) => {
  const path = (req.query.path || '').toString();
  if (path.length > 500 || path.split('/').some(seg => seg === '..')) {
    return sendError(res, badRequest('Invalid path'));
  }
  const result = await mpdLsInfo(path);
  if (!result) return res.json({ path, directories: [], files: [] });
  res.json({ path, ...result });
});

// Small in-memory cache — a given file's embedded art never changes without a
// library rescan, so this is a plain recency-capped map with no TTL (same
// shape as metadata.js's memCache, minus the time-based expiry that makes
// sense for external API results but not for a file's own embedded bytes).
const ART_CACHE_MAX = 64;
const artCache = new Map(); // file → { data: Buffer, mimeType } | null (null = confirmed no art)
function artCacheGet(file) {
  if (!artCache.has(file)) return undefined;
  const v = artCache.get(file);
  artCache.delete(file); artCache.set(file, v); // recency bump
  return v;
}
function artCacheSet(file, value) {
  artCache.delete(file);
  artCache.set(file, value);
  if (artCache.size > ART_CACHE_MAX) artCache.delete(artCache.keys().next().value);
}

// GET /api/player/library/art?file=<relative path>
// Embedded cover art (ID3/FLAC picture tags or a folder-level cover file) via
// MPD's binary protocol — see mpd-art.js. Untagged files are the common case,
// not an error, so a genuine miss 404s quietly rather than logging a warning.
router.get('/library/art', async (req, res) => {
  const file = (req.query.file || '').toString();
  if (!file || file.length > 500) return sendError(res, badRequest('Invalid file'));
  const cached = artCacheGet(file);
  const art = cached !== undefined ? cached : await mpdReadPicture(file).catch(() => null);
  if (cached === undefined) artCacheSet(file, art);
  if (!art) return res.status(404).end();
  res.set('Content-Type', art.mimeType);
  res.set('Cache-Control', 'public, max-age=2592000');
  res.send(art.data);
});

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

export async function getMpdOutputs() {
  try {
    const { stdout } = await execPromise('mpc outputs');
    return stdout.split('\n').map(l => {
      const m = l.match(/^Output\s+(\d+)\s+\((.+)\)\s+is\s+(enabled|disabled)/i);
      return m ? { id: parseInt(m[1], 10), name: m[2].trim(), enabled: m[3].toLowerCase() === 'enabled' } : null;
    }).filter(Boolean);
  } catch { return []; }
}

// Enable exactly one output by name, disabling the others — without stopping playback.
export async function mpcEnableOnly(name) {
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
  // Digital Transport (Phase 4), when enabled, unconditionally owns MPD's
  // output selection — the automatic per-track DSD-bypass logic below must
  // never fight it. Plain getSetting check rather than importing
  // mpd-transport.js's isDigitalTransportEnabled(), which itself imports
  // from this file — would be circular.
  const transportVal = await getSetting('digital_transport_enabled').catch(() => null);
  if (transportVal === 'true') return false;

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
    // AUDIT-2026-08-24: was unguarded — 'error' fires reconnect() (which
    // itself calls socket.destroy()), and destroy() then triggers this same
    // socket's own 'close' event, which ALSO calls reconnect() a second
    // time, scheduling two overlapping 5s-later _connectMpdIdle() calls
    // instead of one. Repeated MPD instability (e.g. a restart triggered by
    // mpd-transport.js) could compound this into an exponentially growing
    // number of concurrent idle sockets. socket.destroyed is set
    // synchronously by the first destroy() call, so checking it makes a
    // second reconnect() on the same socket a no-op.
    const reconnect = () => {
      if (socket.destroyed) return;
      socket.destroy();
      setTimeout(_connectMpdIdle, 5000);
    };

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
          getMpdAudioFormat().then(async fmt => {
            if (fmt?.rate && fmt.rate !== _lastMpdRate) {
              // AUDIT-2026-08-01: this override was firing unconditionally,
              // even with bitperfect explicitly disabled — defeating the one
              // documented escape hatch for exactly the failure mode below.
              // The shared ALSA loopback (hw:Loopback,0,0/,1,0) is opened
              // persistently by the PipeWire adapter node in
              // 52-resonance-aloop-sink.conf (never disconnects, by design —
              // see that file), and ALSA's dmix/dsnoop pin their underlying
              // hardware rate to whichever client opens it FIRST — since that
              // adapter node is permanent, the pin effectively never resets
              // for the life of the PipeWire session, regardless of what any
              // later client (MPD, CamillaDSP) requests. Forcing CamillaDSP's
              // loop_dsnoop capture to a rate that pin doesn't match fails
              // outright (`snd_pcm_hw_params_set_rate: Invalid argument`) and
              // crash-loops CamillaDSP — confirmed live with a bare `mpc play`
              // on a 44.1kHz file, no other app feature involved. Until the
              // aloop-sink's permanent-open behavior (or dmix/dsnoop's
              // pin-on-first-open semantics) is addressed directly, this
              // watcher must not fight a pin it cannot actually change.
              const bitPerfectVal = await getSetting('bitperfect').catch(() => null);
              const bitPerfect = !(bitPerfectVal === 'false' || bitPerfectVal === '0');
              if (!bitPerfect) {
                console.log(`[MPD Rate] ${fmt.rate} Hz detected but bitperfect is disabled — leaving CamillaDSP's fixed-rate config alone.`);
                return;
              }
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

// GET /api/player/library/albums/all — every (artist, album) pair in the
// library, flat (not scoped to one artist) — powers the tablet's Albums
// grid. `mpc list album group artist` prefixes each line with its tag
// ("Artist: X" / "Album: Y") specifically so grouped output can be told
// apart from the listed values; ungrouped `mpc list album` (used by the
// per-artist route above) has no such prefix, which is why that route's
// parsing is a plain trim/filter and this one isn't.
router.get('/library/albums/all', async (req, res) => {
  try {
    const { stdout } = await execFilePromise('mpc', ['list', 'album', 'group', 'artist']);
    const albums = [];
    let currentArtist = '';
    for (const raw of stdout.split('\n')) {
      const line = raw.trim();
      const m = line.match(/^(Artist|Album):\s*(.*)$/);
      if (!m) continue;
      const [, tag, value] = m;
      if (tag === 'Artist') currentArtist = value;
      else if (value) albums.push({ artist: currentArtist, album: value });
    }
    albums.sort((a, b) => a.album.localeCompare(b.album));
    res.json({ albums });
  } catch {
    res.json({ albums: [] });
  }
});

// GET /api/player/library/tracks?album=X&artist=Y
// Track/disc numbers come along for free via the same `-f` custom-format
// technique used in /library/search and /library/by-genre below — this used
// to be a plain `mpc find` returning bare file paths, which is why multi-disc
// albums rendered in whatever order MPD's database happened to return them,
// with no way to group by disc at all.
//
// AUDIT-2026-08-02c: the separator between tags in a `-f` format string must
// NOT be `|` — confirmed live that mpc's format-string parser treats `|`
// specially (truncates the entire rest of the line at the first `|`, doubled
// or not: `%title%||%artist%` prints ONLY the title, nothing after it, not
// even a literal pipe). This was silently broken in every existing route
// using `||` as a separator (`/library/search`, `/library/by-genre`,
// `/queue/detailed`, the recently-added smart playlist below) — all fixed in
// the same pass this was found, using a literal tab instead (confirmed live
// to pass every field through untouched, and can never collide with a real
// tag value the way a printable character in principle could).
const MPC_FIELD_SEP = '\t';

// MPD's %track%/%disc% values are often "3/12"-style (track/total) — only the
// number before any slash is meaningful for sorting/grouping. Untagged tracks
// come back as an empty string from `-f`, not absent, so this must handle ''
// explicitly rather than relying on parseInt's NaN-on-empty-string behavior
// looking intentional.
function parseTagNumber(raw) {
  const n = parseInt(String(raw || '').split('/')[0], 10);
  return Number.isFinite(n) ? n : null;
}

router.get('/library/tracks', async (req, res) => {
  const { album, artist } = req.query;
  if (artist && artist.length > 500) return sendError(res, badRequest('Artist name too long'));
  if (album && album.length > 500) return sendError(res, badRequest('Album name too long'));
  try {
    const args = ['-f', `%track%${MPC_FIELD_SEP}%disc%${MPC_FIELD_SEP}%title%${MPC_FIELD_SEP}%artist%${MPC_FIELD_SEP}%file%`, 'find'];
    if (artist) args.push('artist', artist);
    if (album) args.push('album', album);
    const { stdout } = await execFilePromise('mpc', args);
    const tracks = stdout.split('\n')
      .map(s => s.trim()).filter(Boolean)
      .map(line => {
        const [track, disc, title, artistTag, file] = line.split(MPC_FIELD_SEP);
        return {
          file: file || '',
          title: title || '',
          artist: artistTag || '',
          track: parseTagNumber(track),
          disc: parseTagNumber(disc) || 1,
        };
      })
      .filter(t => t.file);
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
      '-f', `%title%${MPC_FIELD_SEP}%artist%${MPC_FIELD_SEP}%album%${MPC_FIELD_SEP}%file%`,
      'search', 'any', q,
    ]);
    const tracks = stdout.split('\n')
      .map(s => s.trim()).filter(Boolean)
      .slice(0, limit)
      .map(line => {
        const [title, artist, album, file] = line.split(MPC_FIELD_SEP);
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

// ── Radio directory browsing (genre/tag + trending) ─────────────────────────
// BluOS/WiiM-style directory pages on top of plain search. Results barely
// change minute to minute, so a small in-memory TTL cache keeps repeat taps
// instant and is kind to the public radio-browser mirrors.
const radioBrowseCache = new Map(); // key → { t, data }
const RADIO_BROWSE_TTL = 5 * 60 * 1000;

async function radioFetchCached(path, timeoutMs) {
  const hit = radioBrowseCache.get(path);
  if (hit && Date.now() - hit.t < RADIO_BROWSE_TTL) return hit.data;
  const data = await radioFetch(path, timeoutMs);
  radioBrowseCache.set(path, { t: Date.now(), data });
  return data;
}

// GET /api/player/radio-tags?limit=<n> → most-used genre tags for chip rows
router.get('/radio-tags', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 24, 100);
  try {
    const data = await radioFetchCached(`/json/tags?order=stationcount&reverse=true&limit=${limit}&hidebroken=true`);
    res.json(data.map(t => ({ name: t.name, count: t.stationcount })));
  } catch (err) {
    sendError(res, badGateway(err.message));
  }
});

// GET /api/player/radio-browse?by=trending|popular|tag&tag=<genre>&limit=<n>
//   trending → most clicked stations right now (topclick)
//   popular  → most voted all-time (topvote)
//   tag      → stations for one genre tag, best-voted first
router.get('/radio-browse', async (req, res) => {
  const by = (req.query.by || 'trending').trim();
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  try {
    let path;
    if (by === 'tag') {
      const tag = (req.query.tag || '').trim();
      if (!tag) return res.json([]);
      path = `/json/stations/bytag/${encodeURIComponent(tag)}?limit=${limit}&hidebroken=true&order=votes&reverse=true`;
    } else if (by === 'popular') {
      path = `/json/stations/topvote/${limit}?hidebroken=true`;
    } else {
      path = `/json/stations/topclick/${limit}?hidebroken=true`;
    }
    res.json(await radioFetchCached(path, 12000));
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

// ── Bluetooth OUTPUT (headphones/speakers — private listening) ──────────────
// Distinct from the A2DP INPUT above (a phone streaming INTO Resonance): here
// Resonance is the source and a paired BT device is the sink. WirePlumber
// creates a "bluez_output.<MAC>.1" PipeWire node once connected; switching
// output to it re-points CamillaDSP's playback device at that node via the
// pipewire-alsa plugin (see camilla-config.js's ensureAsoundConf/
// generateCamillaConfig) instead of the physical DAC.
const MAC_RE = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;

async function readBluetoothOutputSetting() {
  try {
    const raw = await getSetting('bluetooth_output');
    return raw ? JSON.parse(raw) : { enabled: false, mac: null, name: null };
  } catch { return { enabled: false, mac: null, name: null }; }
}

// GET /api/player/bluetooth-out/scan — power on + scan, return discovered devices
router.get('/bluetooth-out/scan', async (req, res) => {
  try {
    await execFilePromise('bluetoothctl', ['power', 'on']);
    // `bluetoothctl scan on` as a bare one-shot command only sets a discovery
    // filter and returns immediately — it does NOT keep discovery running.
    // Verified live: `Discovering: no` right after that call finished, so the
    // old scan-on/sleep/scan-off pattern here never actually discovered
    // anything; every scan just returned whatever was already sitting in
    // BlueZ's device cache from earlier. `--timeout` is bluetoothctl's own
    // documented flag for a real, blocking, non-interactive discovery
    // session — it genuinely finds nearby devices for the duration.
    //
    // 15s, not 8: classic BR/EDR inquiry (what a device in Bluetooth *pairing*
    // mode uses — AirPods, most headphones/speakers) needs a full ~10.24s
    // cycle per the Bluetooth spec to reliably enumerate, and BlueZ's default
    // "auto" transport interleaves that with LE scanning rather than running
    // it back-to-back. An 8s window reliably caught fast-advertising BLE
    // peripherals (which is why the fix above already surfaced smart bulbs
    // etc.) but cut off before a classic inquiry cycle completed — exactly
    // why AirPods still didn't show up even once scanning was actually working.
    await execFilePromise('bluetoothctl', ['--timeout', '15', 'scan', 'on']).catch(() => {});
    const { stdout } = await execFilePromise('bluetoothctl', ['devices']);
    // A real scan now genuinely finds everything broadcasting nearby — often a
    // dozen-plus BLE devices (phones, watches, smart bulbs) that have no
    // resolved name, which bluetoothctl lists with the MAC itself (dashes
    // instead of colons) standing in for the name. Those aren't identifiable
    // or reliably pairable from the UI, so they're filtered out rather than
    // burying the handful of devices someone could actually recognize and pick.
    const MAC_AS_NAME_RE = /^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$/;
    const devices = stdout.trim().split('\n').filter(Boolean).map(line => {
      const m = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/);
      return m ? { mac: m[1], name: m[2] } : null;
    }).filter(d => d && !MAC_AS_NAME_RE.test(d.name));
    res.json({ devices });
  } catch (err) {
    console.error('[Bluetooth Out] Scan failed:', err.message);
    sendError(res, err);
  }
});

// GET /api/player/bluetooth-out/paired — known devices, no scan needed.
//
// `bluetoothctl paired-devices` was REMOVED in BlueZ 5.65+ (this box runs
// 5.72) — it errors with "Invalid command in menu main", so this endpoint
// returned a 500 on every call and the UI could never show a previously
// used speaker without a fresh 15s scan. The replacement is
// `devices <filter>`. Both Paired and Trusted are queried and merged
// because they genuinely differ in practice: a device whose bonding keys
// were lost (BlueZ data wiped, speaker factory-reset, reinstall) still
// shows up as Trusted but NOT Paired, and it's exactly that device the
// user wants offered for a one-tap reconnect instead of re-scanning.
router.get('/bluetooth-out/paired', async (req, res) => {
  try {
    const lists = await Promise.all(
      ['Paired', 'Trusted'].map(filter =>
        execFilePromise('bluetoothctl', ['devices', filter])
          .then(r => r.stdout)
          .catch(() => '')
      )
    );
    const seen = new Set();
    const devices = [];
    for (const line of lists.join('\n').split('\n')) {
      const m = line.match(/^Device\s+([0-9A-Fa-f:]{17})\s+(.*)$/);
      if (m && !seen.has(m[1])) { seen.add(m[1]); devices.push({ mac: m[1], name: m[2] }); }
    }
    res.json({ devices });
  } catch (err) {
    sendError(res, err);
  }
});

// Runs a bluetoothctl subcommand and reports failure from its OUTPUT, not its
// exit code. bluetoothctl exits 0 while printing "Failed to pair: ..." — the
// old code trusted the exit code, so a failed pair looked like success and
// only the follow-up connect threw, surfacing as a generic 500 with none of
// BlueZ's actual reason (AUDIT-2026-08-01).
async function btctl(args) {
  const { stdout = '', stderr = '' } = await execFilePromise('bluetoothctl', args)
    .catch(err => ({ stdout: err.stdout || '', stderr: err.stderr || err.message || '' }));
  const out = `${stdout}\n${stderr}`;
  // "Failed to <verb>: <reason>" covers BlueZ's D-Bus errors, but a device
  // that was never discovered fails with a bare "not available" instead —
  // which matched nothing here and let a no-op pair report success.
  const failed = /Failed to [a-z]+:\s*(.+)/i.exec(out);
  const missing = /Device .* not available/i.test(out);
  return {
    out,
    error: failed ? failed[1].trim() : (missing ? 'not-discovered' : null),
  };
}

// Maps BlueZ's opaque D-Bus error names to something a person can act on.
function btReason(error) {
  if (error === 'not-discovered') {
    return 'The device was not found. Put it in pairing mode (for AirPods: lid open, hold the back button until the light flashes white), keep it close, then scan again.';
  }
  if (/AuthenticationFailed|AuthenticationCanceled/i.test(error)) {
    return 'Pairing was rejected. Put the device in pairing mode (for AirPods: lid open, hold the back button until the light flashes white) and try again.';
  }
  if (/br-connection-unknown|ConnectionAttemptFailed|Page Timeout/i.test(error)) {
    return 'The device did not respond. Make sure it is powered on, in pairing mode, and not connected to another device (phone/laptop).';
  }
  if (/AlreadyExists/i.test(error)) return 'Device is already paired.';
  return error;
}

// POST /api/player/bluetooth-out/pair — pair + trust + connect a scanned device
router.post('/bluetooth-out/pair', async (req, res) => {
  const { mac } = req.body || {};
  if (!MAC_RE.test(mac || '')) return sendError(res, badRequest('Invalid MAC address'));
  try {
    const { out: info } = await btctl(['info', mac]);
    const alreadyPaired = /Paired:\s*yes/i.test(info);

    if (!alreadyPaired && /Device \w/i.test(info)) {
      // A device record with no bonding keys (Paired: no / Bonded: no but
      // still known+Trusted) is what's left after the keys are lost — a
      // reinstall wiping /var/lib/bluetooth, or the headphones being
      // factory-reset/re-paired to a phone. BlueZ will NOT re-bond over that
      // stale record: pair returns AuthenticationFailed and connect returns
      // br-connection-unknown, forever, which is exactly the state this box
      // was stuck in. Removing the record first is the documented recovery.
      await btctl(['remove', mac]);
      // The device must be re-discovered before it can be paired again.
      await execFilePromise('bluetoothctl', ['--timeout', '12', 'scan', 'on']).catch(() => {});
    }

    if (!alreadyPaired) {
      const { error } = await btctl(['pair', mac]);
      if (error && !/AlreadyExists/i.test(error)) {
        return sendError(res, badRequest(btReason(error)));
      }
    }

    await btctl(['trust', mac]);
    const { error: connErr } = await btctl(['connect', mac]);
    if (connErr) return sendError(res, badRequest(btReason(connErr)));

    // Trust the DEVICE STATE, not the absence of an error line. Removing a
    // stale record and then failing to re-discover the device produced no
    // "Failed to" output at all, so this endpoint cheerfully reported
    // success while BlueZ had in fact just forgotten the device entirely.
    const { out: finalInfo } = await btctl(['info', mac]);
    if (!/Connected:\s*yes/i.test(finalInfo)) {
      return sendError(res, badRequest(btReason('not-discovered')));
    }

    // Same stale-PipeWire-link risk as the /connect route above: a device
    // that lost its bonding record and had to be removed+re-paired here is
    // exactly the case where CamillaDSP's existing stream (if this mac was
    // already the selected output) needs a forced restart to re-link.
    const current = await readBluetoothOutputSetting();
    if (current.mac === mac) {
      await updateCamillaConfigFromSettings({ forceRestart: true }).catch(err =>
        console.warn('[Bluetooth Out] CamillaDSP restart after re-pair failed (non-fatal):', err.message)
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[Bluetooth Out] Pair failed:', err.message);
    sendError(res, err);
  }
});

// POST /api/player/bluetooth-out/connect — (re)connect an already-paired device
router.post('/bluetooth-out/connect', async (req, res) => {
  const { mac } = req.body || {};
  if (!MAC_RE.test(mac || '')) return sendError(res, badRequest('Invalid MAC address'));
  try {
    // Same exit-code caveat as pair above — read the reason out of the output.
    const { error } = await btctl(['connect', mac]);
    if (error) return sendError(res, badRequest(btReason(error)));

    // If this device is the currently-selected CamillaDSP output, force a
    // restart so its PipeWire stream re-links to the bluez node that JUST
    // came back — a plain reconnect leaves CamillaDSP's existing (already
    // open) connection pointed at whatever it fell back to while the device
    // was away, silently producing zero audible output (AUDIT-2026-08-01,
    // see the forceRestart comment in updateCamillaConfigFromSettings).
    const current = await readBluetoothOutputSetting();
    if (current.mac === mac) {
      await updateCamillaConfigFromSettings({ forceRestart: true }).catch(err =>
        console.warn('[Bluetooth Out] CamillaDSP restart after reconnect failed (non-fatal):', err.message)
      );
    }

    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/player/bluetooth-out/disconnect
router.post('/bluetooth-out/disconnect', async (req, res) => {
  const { mac } = req.body || {};
  if (!MAC_RE.test(mac || '')) return sendError(res, badRequest('Invalid MAC address'));
  try {
    // Falling back to the DAC first avoids a moment where CamillaDSP's
    // playback device points at a bluez_output node that's about to vanish.
    const current = await readBluetoothOutputSetting();
    if (current.mac === mac) {
      await setSetting('bluetooth_output', JSON.stringify({ enabled: false, mac: null, name: null }));
      await updateCamillaConfigFromSettings();
    }
    // Best-effort: the switch back to the DAC above is the part that actually
    // matters (and has already succeeded by this point). If the BlueZ-level
    // disconnect itself fails — no adapter, device already gone, a stack
    // hiccup — that shouldn't turn the whole request into an error and leave
    // the toggle stuck showing "active" after the client never gets to
    // re-fetch status. Caught live: exactly this, on a box with no adapter.
    await execFilePromise('bluetoothctl', ['disconnect', mac]).catch(err =>
      console.warn('[Bluetooth Out] bluetoothctl disconnect failed (non-fatal):', err.message)
    );
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/player/bluetooth-out/select — make a paired+connected device the
// active CamillaDSP output (or switch back to the DAC when enabled=false)
router.post('/bluetooth-out/select', async (req, res) => {
  const { mac, name, enabled } = req.body || {};
  if (enabled && !MAC_RE.test(mac || '')) return sendError(res, badRequest('Invalid MAC address'));
  try {
    await setSetting('bluetooth_output', JSON.stringify(enabled ? { enabled: true, mac, name: name || mac } : { enabled: false, mac: null, name: null }));
    // forceRestart: switching the playback target to/from camilla_bt_output
    // needs CamillaDSP to actually reopen its PipeWire connection so
    // WirePlumber re-resolves playback_node against the CURRENT bluez node —
    // a hot-reload alone can leave it linked to the stale/default sink even
    // though the config on disk is correct (AUDIT-2026-08-01).
    const dacInfo = await updateCamillaConfigFromSettings({ forceRestart: true });
    res.json({ success: true, dacInfo });
  } catch (err) {
    console.error('[Bluetooth Out] Select failed:', err.message);
    sendError(res, err);
  }
});

// GET /api/player/bluetooth-out/status
router.get('/bluetooth-out/status', async (req, res) => {
  try {
    const setting = await readBluetoothOutputSetting();
    let connected = false;
    if (setting.mac) {
      const { stdout } = await execFilePromise('bluetoothctl', ['info', setting.mac]).catch(() => ({ stdout: '' }));
      connected = /Connected:\s*yes/i.test(stdout);
    }
    res.json({ ...setting, connected });
  } catch (err) {
    sendError(res, err);
  }
});

// ── Auto-reconnect watchdog (AUDIT-2026-08-01) ──────────────────────────────
// The /pair, /connect and /select routes above all force a CamillaDSP restart
// when THIS server drives the (re)connection — but real earbuds mostly don't
// go through those routes at all. AirPods reconnect at the BlueZ level the
// instant they're taken out of the case (they're already paired+trusted), with
// zero HTTP traffic to us. Without this watchdog, that spontaneous reconnect
// left CamillaDSP's already-open PipeWire stream linked to whatever it fell
// back to while the earbuds were away (the "ResonanceInput" default sink) —
// "it says connected but no sound" with no user action that could have fixed
// it, because nothing ever told CamillaDSP to reopen its output device.
const BT_RECONNECT_POLL_MS = 15_000;
let btLastKnownConnected = null; // null = unknown baseline, not yet a transition

setInterval(async () => {
  try {
    const setting = await readBluetoothOutputSetting();
    if (!setting.enabled || !setting.mac) { btLastKnownConnected = null; return; }
    const { stdout } = await execFilePromise('bluetoothctl', ['info', setting.mac]).catch(() => ({ stdout: '' }));
    const connected = /Connected:\s*yes/i.test(stdout);

    if (btLastKnownConnected === false && connected) {
      console.log(`[Bluetooth Out] ${setting.mac} reconnected outside our own routes — forcing CamillaDSP restart to re-link PipeWire output.`);
      await updateCamillaConfigFromSettings({ forceRestart: true }).catch(err =>
        console.warn('[Bluetooth Out] CamillaDSP restart after auto-reconnect failed (non-fatal):', err.message)
      );
    }
    btLastKnownConnected = connected;
  } catch { /* transient bluetoothctl hiccup — next tick retries */ }
}, BT_RECONNECT_POLL_MS);

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
  // Not connected → no results, not an error. The universal search fires this
  // on every keystroke regardless of connection state, and an unlinked Tidal
  // account was filling the browser console with a 502 per keypress.
  if (!(await tidalConnected())) return res.json([]);
  try {
    res.json(await tidalSearch(q, Math.min(parseInt(req.query.limit, 10) || 25, 50)));
  } catch (err) {
    // Expired/revoked session → empty results, not a per-keystroke 502
    // (same rationale as qobuz/search below).
    if (/auth|401|credential/i.test(err.message)) return res.json([]);
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
  // Not connected → no results, not an error (same rationale as tidal/search).
  if (!(await qobuzConnected())) return res.json([]);
  try {
    res.json(await qobuzSearch(q, Math.min(parseInt(req.query.limit, 10) || 25, 50)));
  } catch (err) {
    // Stored credentials that no longer authenticate (stale password, expired
    // token) make qobuzConnected() pass while the real call 401s — from the
    // search box's perspective that's still just "this source has nothing",
    // not a gateway error to spam the console with on every keystroke.
    if (/auth|401|credential/i.test(err.message)) return res.json([]);
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
    // AUDIT-2026-08-24: was /ReplayGain:\s*(\S+)/i, matching against mpc's
    // *heading* text — but mpc 0.35's actual `mpc replaygain` (no args, the
    // query form) output is `replay_gain_mode: track`, which that pattern
    // never matches (underscores break the contiguous "ReplayGain:" match).
    // So this endpoint always fell through to the 'off' fallback regardless
    // of MPD's real mode — confirmed live: MPD reported `replay_gain_mode:
    // track` and the DB's persisted replaygain_mode was genuinely "track"
    // (restored correctly on every startup), but the Advanced settings
    // screen always displayed "off". Reported live as part of a broader
    // "are we even reading/writing this stuff" check.
    const match = stdout.trim().match(/replay_gain_mode:\s*(\S+)/i);
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'replayGain', value: mode });
    res.json({ success: true, mode });
  } catch (err) { sendError(res, err); }
});

// ── Crossfade (#5) ────────────────────────────────────────────────────────────
router.get('/crossfade', async (req, res) => {
  try {
    // AUDIT-2026-08-24: was `mpc status`, which never includes a crossfade
    // line at all (confirmed live — its output is just the volume/repeat/
    // random/single/consume summary line) — the exact same "display always
    // shows off/default while MPD/DB genuinely differ" bug class as the
    // ReplayGain regex fixed in 11e2d0d, just for a different setting. The
    // bare query form `mpc crossfade` (no argument) is what actually prints
    // "crossfade: N".
    const { stdout } = await execPromise('mpc crossfade');
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'crossfade', value: secs });
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'gapless', value: enabled });
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'balance', value: bal });
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'phase', value: { left, right } });
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'bitPerfect', value: enabled });
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'dsdBypass', value: enabled });
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
    emit('ADVANCED_SETTING_CHANGED', { field: 'autoHeadroom', value: enabled });
    res.json({ success: true, enabled, headroomDb: getLastHeadroomDb() });
  } catch (err) { sendError(res, err); }
});

// ── Queue editing (#11) ───────────────────────────────────────────────────────
// GET /api/player/queue/detailed — returns id + title + artist + file
router.get('/queue/detailed', async (req, res) => {
  try {
    const { stdout } = await execFilePromise('mpc', ['-f', `%id%${MPC_FIELD_SEP}%title%${MPC_FIELD_SEP}%artist%${MPC_FIELD_SEP}%file%`, 'playlist']);
    const tracks = stdout.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [id, title, artist, file] = line.split(MPC_FIELD_SEP);
      return { id: id || '', title: title || file?.split('/').pop() || '', artist: artist || '', file: file || '' };
    });
    res.json({ tracks });
  } catch { res.json({ tracks: [] }); }
});

// DELETE /api/player/queue/:id — remove by MPD song id.
// `mpc deleteid` doesn't exist (verified — "unknown command"), so this goes
// through mpdCommand's raw protocol connection instead of mpc.
router.delete('/queue/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return sendError(res, badRequest('invalid id'));
  try {
    const ok = await mpdCommand(`deleteid ${id}`);
    if (!ok) return sendError(res, badGateway('Could not remove queue item'));
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// POST /api/player/queue/:id/play — jump to and play a specific queue entry
// by MPD song id (not queue position, which shifts as the queue plays).
// Same `mpc playid` non-existence as deleteid above — raw protocol only.
router.post('/queue/:id/play', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return sendError(res, badRequest('invalid id'));
  try {
    const ok = await mpdCommand(`playid ${id}`);
    if (!ok) return sendError(res, badGateway('Could not play queue item'));
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

// ── Quick-access presets — hardware-style numbered slots (1–6) ──────────────
// Each slot pins one playable thing (radio station, Spotify context, local or
// smart playlist) for one-tap recall in the remote. Stored as a JSON array in
// the settings table; playback itself happens client-side through the same
// handlers the touch UI uses (Spotify needs the browser's user token).
const PRESET_SLOTS = 6;

async function readPresets() {
  try {
    const raw = await getSetting('content_presets');
    const arr = raw ? JSON.parse(raw) : [];
    return Array.from({ length: PRESET_SLOTS }, (_, i) => arr[i] || null);
  } catch { return Array(PRESET_SLOTS).fill(null); }
}

router.get('/presets', async (req, res) => {
  res.json({ presets: await readPresets() });
});

router.put('/presets/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (!Number.isFinite(n) || n < 1 || n > PRESET_SLOTS) return sendError(res, badRequest('slot must be 1-6'));
  const { type, title, image, payload } = req.body || {};
  if (!type || !title) return sendError(res, badRequest('type and title required'));
  try {
    const presets = await readPresets();
    presets[n - 1] = { type, title, image: image || null, payload: payload || {} };
    await setSetting('content_presets', JSON.stringify(presets));
    res.json({ presets });
  } catch (err) { sendError(res, err); }
});

router.delete('/presets/:n', async (req, res) => {
  const n = parseInt(req.params.n, 10);
  if (!Number.isFinite(n) || n < 1 || n > PRESET_SLOTS) return sendError(res, badRequest('slot must be 1-6'));
  try {
    const presets = await readPresets();
    presets[n - 1] = null;
    await setSetting('content_presets', JSON.stringify(presets));
    res.json({ presets });
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
      '-f', `%title%${MPC_FIELD_SEP}%artist%${MPC_FIELD_SEP}%album%${MPC_FIELD_SEP}%file%`,
      'find', 'genre', genre,
    ]);
    const tracks = stdout.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
      const [title, artist, album, file] = line.split(MPC_FIELD_SEP);
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
    '-f', `%file%${MPC_FIELD_SEP}%title%${MPC_FIELD_SEP}%artist%${MPC_FIELD_SEP}%album%`,
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
      const [file, title, artist, album] = line.split(MPC_FIELD_SEP);
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

