/**
 * DJ mode — a self-contained "source" that plays Spotify tracks from your
 * library, with a locally-generated (Ollama) + locally-synthesized (Piper
 * TTS) voice announcer between tracks, like a radio DJ. Plays a block of
 * SONGS_PER_SET tracks, then does a short "check-in" line and starts a new
 * block, repeating until stopped.
 *
 * DELIBERATELY ISOLATED: this is the only file with any DJ-specific logic.
 * The only touches outside this file are: one import + one `app.use()` line
 * in server/index.js, and 'DJ_STATE' added to the PASSTHROUGH set in
 * event-service.js. Deleting this file, those two index.js lines, and that
 * one Set entry removes the feature completely — nothing else references it.
 * Client-side source-list entries are equally self-contained (see git
 * history for the matching frontend commits).
 *
 * Playback is Spotify only for now (explicit direction — not local/Qobuz/
 * Tidal). Doesn't reimplement any Spotify Web API calls: imports
 * `spotifyApi` straight from src/api/spotify.js — the exact same functions
 * the client already uses (getDevices, transferPlayback, play, pause,
 * getSavedTracks, getUserTopTracks, getPlaybackState) — driven server-side
 * with the token server/spotify-auth.js already persists/refreshes. That
 * file has no browser-only dependencies (no `window`/`document`, no Vite
 * env vars), so it's plain portable ESM; the only change needed to import
 * it from Node was adding the .js extension to its own `./_client` import,
 * which Vite tolerated but Node's ESM resolver doesn't (fixed in the same
 * commit as this file). Track metadata (popularity, album_type, release
 * date) comes directly from Spotify's own API fields, which is what the
 * original DJ prompt spec was written against.
 *
 * Hardware reality this was designed against (live-benchmarked on the
 * actual Pi 4 4GB, 2026-07-31): qwen2.5:1.5b (Q4) generates a ~15-word line
 * in ~10-12s once warm, ~44s cold. Piper (medium voices) adds ~3s load +
 * roughly real-time synthesis. That's 15-20s of dead air if done
 * synchronously between tracks — unacceptable. So the NEXT track's
 * announcement is always generated in the background WHILE the current
 * track plays (typically 3+ minutes of runway vs ~20s of prep), and the
 * only real wait is the very first announcement when DJ mode switches on.
 *
 * Audio path for the VOICE: Piper writes a WAV, played via `pw-play
 * --target ResonanceInput` — the exact same PipeWire virtual sink every
 * other source (MPD/Spotify/AirPlay/Bluetooth) already converges on (see
 * install.sh), so no changes to asound.conf/camilladsp.yml/PipeWire config
 * were needed. resonance-api's systemd unit doesn't set PIPEWIRE_REMOTE/
 * XDG_RUNTIME_DIR (only the audio daemons' own units do), so this file sets
 * them explicitly per pw-play call. The MUSIC itself plays through Spotify
 * Connect exactly as it always does (raspotify/librespot → PipeWire →
 * CamillaDSP → DAC) — dj.js never touches that path directly, it only
 * issues Spotify Web API play/pause commands.
 */
import express from 'express';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getSetting } from './db.js';
import { emit } from './event-service.js';
import { getValidAccessToken } from './spotify-auth.js';
import { spotifyApi } from '../src/api/spotify.js';

const execFilePromise = promisify(execFile);
const router = express.Router();

// ── Config ────────────────────────────────────────────────────────────────
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = 'qwen2.5:1.5b';
// Session-length, not permanent — the model unloads (freeing ~1-1.5GB RAM,
// real headroom on a 4GB Pi4 with no swap) a few minutes after DJ mode
// stops, matching Ollama's normal idle-unload behavior.
const OLLAMA_KEEP_ALIVE = '15m';
const PIPER_BIN = '/opt/piper-tts/piper/piper';
const PIPER_ESPEAK_DATA = '/opt/piper-tts/piper/espeak-ng-data';
const VOICES = {
  en: '/opt/piper-tts/piper/voices/en_US-lessac-medium.onnx',
  pt: '/opt/piper-tts/piper/voices/pt_PT-tugao-medium.onnx',
};
const SONGS_PER_SET = 5;
// Single-user kiosk image — matches install.sh's own $TARGET_UID assumption
// for the same env vars on the MPD/raspotify/shairport-sync systemd units.
const PW_UID = 1000;
const PW_ENV = {
  ...process.env,
  XDG_RUNTIME_DIR: `/run/user/${PW_UID}`,
  PIPEWIRE_REMOTE: `/run/user/${PW_UID}/pipewire-0`,
};
const RANDOM_ENERGY = {
  en: ['super hyped and energetic', 'smooth late-night radio vibe', 'casual and cool', 'intense and dramatic', 'playful and cheeky'],
  pt: ['super hiperativo e enérgico', 'smooth rádio de fim de noite', 'casual e cool', 'intenso e dramático', 'brincalhão e divertido'],
};

// ── Spotify helpers ───────────────────────────────────────────────────────
// Thin wrappers around spotifyApi — the orchestration-specific bits only
// (which device to target, which pools to merge), not the HTTP calls
// themselves.

// Finds the "Resonance Connect" librespot device and makes it Spotify's
// active playback target if it isn't already. Deliberately simple for now
// (no raspotify-restart-and-retry loop like the kiosk's own ensureRaspotify)
// — if the device isn't up at all, start() just surfaces that as an error.
async function ensureSpotifyDevice(token) {
  const data = await spotifyApi.getDevices(token).catch(() => null);
  const device = (data?.devices || []).find(d => d.name === 'Resonance Connect');
  if (!device) return null;
  if (!device.is_active) {
    await spotifyApi.transferPlayback(token, device.id, false).catch(() => {});
  }
  return device.id;
}

// Pool = Liked Songs + medium-term Top Tracks, deduped by URI. Mixing both
// gives a bigger, more varied pool than either alone, and both are always
// available for any account with listening history (no user-picked
// playlist needed for this first pass).
async function getSpotifyTrackPool(token) {
  const [savedData, topData] = await Promise.all([
    spotifyApi.getSavedTracks(token, 50).catch(() => null),
    spotifyApi.getUserTopTracks(token, 50, 'medium_term').catch(() => null),
  ]);
  const saved = (savedData?.items || []).map(i => i.track).filter(Boolean);
  const top = topData?.items || [];
  const seen = new Set();
  const pool = [];
  for (const t of [...saved, ...top]) {
    if (t?.uri && !seen.has(t.uri)) { seen.add(t.uri); pool.push(t); }
  }
  return pool;
}

// Broadcasts full now-playing info through the SAME channel Kiosk.jsx's own
// Spotify polling (syncCurrentState) already uses to push state after a
// poll — the client needs zero new wiring, PlayerDisplay already renders
// whatever this produces.
function broadcastSpotifyState(track, paused, positionMs) {
  emit('BROADCAST_STATE', {
    paused,
    position: positionMs || 0,
    duration: track.duration_ms || 0,
    track_window: {
      current_track: {
        uri: track.uri,
        name: track.name,
        album: { name: track.album?.name || '', images: track.album?.images || [] },
        artists: track.artists || [],
      },
    },
  });
}

// ── Metadata derivation (the {era_context} injected var) ─────────────────
// {popularity} and {album_type} come straight from Spotify's own track/
// album fields — no heuristic needed, unlike the local-library version this
// replaced.
function eraContextFor(releaseDate, lang) {
  const year = parseInt(String(releaseDate || '').slice(0, 4), 10);
  if (!Number.isFinite(year) || year < 1900 || year > new Date().getFullYear()) return null;
  const age = new Date().getFullYear() - year;
  const decade = Math.floor(year / 10) * 10;
  if (age <= 2) return lang === 'pt' ? 'lançamento recente' : 'a recent release';
  if (age >= 20) return lang === 'pt' ? `um clássico old school dos anos ${decade}` : `an old-school classic from the ${decade}s`;
  if (age >= 8) return lang === 'pt' ? `nostalgia dos anos ${decade}` : `a ${decade}s nostalgia trip`;
  return lang === 'pt' ? `um favorito dos anos ${decade}` : `a ${decade}s favorite`;
}

// ── Text sanitization — the hard safety net ──────────────────────────────
// Prompt-following alone isn't reliable on a model this small (live testing
// showed qwen2.5:1.5b using quote marks despite explicit instructions not
// to), so every rule that matters for TTS + the word-count constraint is
// enforced here in code, not just requested in the prompt.
function sanitizeSpokenLine(raw, maxWords = 18) {
  let text = String(raw || '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    .replace(/[#*_`~]/g, '')
    .replace(/["“”'‘’()[\]{}]/g, '')
    .replace(/^\s*(DJ|LOCUTOR|HOST)\s*[:-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const words = text.split(' ').filter(Boolean);
  if (words.length > maxWords) {
    text = words.slice(0, maxWords).join(' ').replace(/[,;:–—-]+$/, '');
  }
  if (text && !/[.!?]$/.test(text)) text += '.';
  return text;
}

// ── Ollama call ───────────────────────────────────────────────────────────
async function generateLine({ music, artist, albumType, popularity, eraContext, randomEnergy, randomTrigger, language, isCheckIn }) {
  const langName = language === 'pt' ? 'Portuguese' : 'English';
  const system = [
    'You are an extremely charismatic, unpredictable club radio DJ speaking live on air.',
    'Output ONLY the raw spoken line - no prefixes like "DJ:" or "Host:", no quotes, no markdown, no hashtags, no emojis, no parentheses.',
    'Maximum 15 words, never exceed it.',
    'Never start with cliches like "And now we have", "Here is", "Straight from", "Coming up", "E agora temos", "Fica com", "Diretamente de" - vary your opening every single time, using the given energy and focus to change your approach completely.',
    `Speak in ${langName} - natural, fluent, native-sounding, never translated-sounding.`,
  ].join(' ');

  const prompt = isCheckIn
    ? `You just wrapped a run of tracks, the last one being ${music} by ${artist}. Energy style: ${randomEnergy}. React to it briefly, then hype that more tracks are coming up. Say your line now.`
    : `Track: ${music} | Artist: ${artist} | Type: ${albumType} | Popularity: ${popularity} out of 100 | Era: ${eraContext || 'unspecified'} | Energy style: ${randomEnergy} | Focus: ${randomTrigger}. Say your line now.`;

  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      system,
      prompt,
      stream: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: { num_predict: 50, num_ctx: 512, temperature: 0.95 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = await res.json();
  return sanitizeSpokenLine(data.response);
}

// ── Piper synthesis ───────────────────────────────────────────────────────
// Piper's voice models output 22050Hz MONO — live-tested against the real
// Pi, playing that straight into ResonanceInput alongside the rest of the
// pipeline (which runs at 44.1/48kHz stereo) triggered a
// `snd_pcm_hw_params_set_rate: Invalid argument` crash loop in CamillaDSP.
// Piper has no built-in resample flag, so the raw output is immediately
// upsampled to 48000Hz stereo before it ever reaches the shared PipeWire
// graph. Requires ffmpeg (not part of install.sh — a manually installed
// prerequisite for this feature, same as Ollama/Piper themselves).
const CLIP_RATE = 48000;

function synthesizeRaw(text, language) {
  return new Promise((resolve, reject) => {
    const voice = VOICES[language] || VOICES.en;
    const outFile = path.join(os.tmpdir(), `dj-line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.raw.wav`);
    const proc = spawn(PIPER_BIN, ['--model', voice, '--output_file', outFile, '--espeak_data', PIPER_ESPEAK_DATA]);
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outFile)) resolve(outFile);
      else reject(new Error(`piper exited ${code}: ${stderr.slice(-300)}`));
    });
    proc.stdin.write(text + '\n');
    proc.stdin.end();
  });
}

async function synthesize(text, language) {
  const rawFile = await synthesizeRaw(text, language);
  const outFile = rawFile.replace(/\.raw\.wav$/, '.wav');
  try {
    await execFilePromise('ffmpeg', ['-y', '-i', rawFile, '-ar', String(CLIP_RATE), '-ac', '2', outFile]);
  } finally {
    fs.unlink(rawFile, () => {});
  }
  return outFile;
}

function playClip(wavPath) {
  return execFilePromise('pw-play', ['--target', 'ResonanceInput', wavPath], { env: PW_ENV, timeout: 30000 });
}

// ── Session state machine ─────────────────────────────────────────────────
const state = {
  active: false,
  pool: [],
  queue: [],
  pending: null, // { text, wavPath, forTrack } for the track about to play, prepared ahead of time
  pollInterval: null,
  loopPromise: null,
  deviceId: null,
};

function pickTracks(n) {
  const shuffled = [...state.pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function broadcastState(extra = {}) {
  emit('DJ_STATE', { active: state.active, ...extra });
}

async function prepare(track, language, isCheckIn = false) {
  const trigger = track.album?.release_date
    ? ['focus on the era', 'focus on the artist', 'focus on the hype'][Math.floor(Math.random() * 3)]
    : ['focus on the artist', 'focus on the hype'][Math.floor(Math.random() * 2)];
  const energyList = RANDOM_ENERGY[language] || RANDOM_ENERGY.en;
  const text = await generateLine({
    music: track.name,
    artist: (track.artists || []).map(a => a.name).join(', ') || 'unknown artist',
    albumType: track.album?.album_type || 'track',
    popularity: typeof track.popularity === 'number' ? track.popularity : 50,
    eraContext: eraContextFor(track.album?.release_date, language),
    randomEnergy: energyList[Math.floor(Math.random() * energyList.length)],
    randomTrigger: trigger,
    language,
    isCheckIn,
  });
  const wavPath = await synthesize(text, language);
  return { text, wavPath, forTrack: track };
}

// Polls Spotify's own playback state (no push API for third parties) both to
// detect the track ending AND to keep the kiosk's now-playing display
// current for the whole time the track plays, not just at the start.
function waitForSpotifyTrackEnd(token, expectedUri, maxMs = 12 * 60 * 1000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    state.pollInterval = setInterval(async () => {
      if (!state.active) { clearInterval(state.pollInterval); resolve(); return; }
      if (Date.now() - startedAt > maxMs) { clearInterval(state.pollInterval); resolve(); return; }
      try {
        const data = await spotifyApi.getPlaybackState(token);
        if (!data) { clearInterval(state.pollInterval); resolve(); return; } // null = 204, nothing playing
        if (data?.item) broadcastSpotifyState(data.item, !data.is_playing, data.progress_ms);
        if (!data?.is_playing || data?.item?.uri !== expectedUri) {
          clearInterval(state.pollInterval); resolve();
        }
      } catch { /* transient network hiccup — keep polling, don't abort the session over it */ }
    }, 3000);
  });
}

async function runLoop() {
  const language = (await getSetting('language').catch(() => null)) === 'pt' ? 'pt' : 'en';

  while (state.active) {
    // Refreshed every iteration (not captured once) — a long session can
    // outlive a single Spotify access token; getValidAccessToken() renews
    // it transparently when it's close to expiry.
    const token = await getValidAccessToken();
    if (!token) {
      broadcastState({ phase: 'error', message: 'Spotify is not connected.' });
      break;
    }

    if (state.queue.length === 0) {
      state.pool = await getSpotifyTrackPool(token);
      state.queue = pickTracks(SONGS_PER_SET);
      if (state.queue.length === 0) {
        broadcastState({ phase: 'error', message: 'No Spotify tracks available — save some Liked Songs first.' });
        break;
      }
    }

    const track = state.queue.shift();

    // The very first announcement of a session has no lookahead runway —
    // this is the one moment DJ mode has a real, visible wait. Every
    // subsequent one was already prepared while the previous track played.
    if (!state.pending) {
      broadcastState({ phase: 'preparing' });
      try { state.pending = await prepare(track, language); }
      catch (err) { console.error('[DJ] prepare failed:', err.message); state.pending = null; }
    }

    if (!state.active) break;

    if (state.pending) {
      await spotifyApi.pause(token).catch(() => {});
      broadcastState({ phase: 'announcing', line: state.pending.text });
      try { await playClip(state.pending.wavPath); } catch (err) { console.error('[DJ] playback failed:', err.message); }
      fs.unlink(state.pending.wavPath, () => {});
    }
    state.pending = null;
    if (!state.active) break;

    broadcastState({ phase: 'playing', track: { title: track.name, artist: (track.artists || []).map(a => a.name).join(', ') } });
    try {
      await spotifyApi.play(token, state.deviceId, null, [track.uri]);
      broadcastSpotifyState(track, false, 0);
    } catch (err) { console.error('[DJ] Spotify play failed:', err.message); }

    // Prepare the NEXT segment in the background while this track plays —
    // the whole point: ~15-20s of generation+synthesis hidden inside
    // several minutes of song instead of sitting between tracks as dead air.
    const isSetEnd = state.queue.length === 0;
    const nextTrack = isSetEnd ? null : state.queue[0];
    const prepPromise = isSetEnd
      ? prepare(track, language, true) // check-in line refers to the track that just finished
      : prepare(nextTrack, language);
    prepPromise
      .then((p) => { if (state.active) state.pending = p; else fs.unlink(p.wavPath, () => {}); })
      .catch((err) => console.error('[DJ] background prepare failed:', err.message));

    await waitForSpotifyTrackEnd(token, track.uri);
  }

  state.active = false;
  broadcastState({ phase: 'stopped' });
}

async function start() {
  if (state.active) return { alreadyActive: true };
  const token = await getValidAccessToken();
  if (!token) {
    broadcastState({ phase: 'error', message: 'Spotify is not connected.' });
    return { error: 'spotify_not_connected' };
  }
  const pool = await getSpotifyTrackPool(token);
  if (pool.length === 0) {
    broadcastState({ phase: 'error', message: 'No Spotify tracks available — save some Liked Songs first.' });
    return { error: 'empty_pool' };
  }
  state.deviceId = await ensureSpotifyDevice(token);
  state.pool = pool;
  state.active = true;
  state.queue = [];
  state.pending = null;
  broadcastState({ phase: 'starting' });
  state.loopPromise = runLoop();
  return { started: true };
}

async function stop() {
  state.active = false;
  if (state.pollInterval) clearInterval(state.pollInterval);
  if (state.pending?.wavPath) fs.unlink(state.pending.wavPath, () => {});
  state.pending = null;
  state.queue = [];
  const token = await getValidAccessToken().catch(() => null);
  if (token) await spotifyApi.pause(token).catch(() => {});
  broadcastState({ phase: 'stopped' });
  return { stopped: true };
}

// ── Routes ────────────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  try { res.json(await start()); }
  catch (err) { console.error('[DJ] start failed:', err); res.status(500).json({ error: err.message }); }
});

router.post('/stop', async (req, res) => {
  try { res.json(await stop()); }
  catch (err) { console.error('[DJ] stop failed:', err); res.status(500).json({ error: err.message }); }
});

router.get('/status', (req, res) => {
  res.json({ active: state.active, upNext: state.queue.length });
});

export default router;
