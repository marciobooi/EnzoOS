/**
 * DJ mode — a self-contained "source" that runs its own playlist from the
 * local library, with a locally-generated (Ollama) + locally-synthesized
 * (Piper TTS) voice announcer between tracks, like a radio DJ.
 *
 * DELIBERATELY ISOLATED: this is the only file with any DJ-specific logic.
 * The only touches outside this file are: one import + one `app.use()` line
 * in server/index.js, and 'DJ_STATE' added to the PASSTHROUGH set in
 * event-service.js. Deleting this file, those two index.js lines, and that
 * one Set entry removes the feature completely — nothing else references it.
 * Client-side source-list entries are equally self-contained (see
 * CLAUDE.md/git history for the matching frontend commit).
 *
 * Hardware reality this was designed against (live-benchmarked on the
 * actual Pi 4 4GB, 2026-07-31): qwen2.5:1.5b (Q4) generates a ~15-word line
 * in ~10-12s once warm, ~44s cold. Piper (medium voices) adds ~3s load +
 * roughly real-time synthesis. That's 15-20s of dead air if done
 * synchronously between tracks — unacceptable. So the NEXT track's
 * announcement is always generated in the background WHILE the current
 * track plays (3-4 min of runway vs ~20s of prep), and the only real wait
 * is the very first announcement when DJ mode is switched on.
 *
 * Audio path: Piper writes a WAV, played via `pw-play --target
 * ResonanceInput` — the exact same PipeWire virtual sink every other source
 * (MPD/Spotify/AirPlay/Bluetooth) already converges on (see install.sh),
 * so no changes to asound.conf/camilladsp.yml/PipeWire config were needed.
 * resonance-api's systemd unit doesn't set PIPEWIRE_REMOTE/XDG_RUNTIME_DIR
 * (only the audio daemons' own units do), so this file sets them explicitly
 * per pw-play call.
 */
import express from 'express';
import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import net from 'net';
import { getSetting, getMostPlayedTracks } from './db.js';
import { emit } from './event-service.js';

const execPromise = promisify(exec);
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

// ── Raw MPD protocol client ──────────────────────────────────────────────
// Self-contained on purpose (see file header) — duplicates the ~15 lines
// server/player.js's own mpdCommand() helper would otherwise provide,
// rather than importing from it, so this file has zero coupling to player.js.
function mpdQuery(command, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host: '127.0.0.1', port: 6600 });
    let buf = '';
    let gotBanner = false;
    const timer = setTimeout(() => { sock.destroy(); reject(new Error('MPD query timeout')); }, timeoutMs);
    sock.on('error', (err) => { clearTimeout(timer); reject(err); });
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      if (!gotBanner) {
        const nl = buf.indexOf('\n');
        if (nl === -1) return;
        gotBanner = true;
        buf = buf.slice(nl + 1);
        sock.write(command + '\n');
        return;
      }
      // An empty result set (e.g. an empty library) means the whole response
      // is just "OK\n" with no preceding newline — a plain endsWith/startsWith
      // check handles that; a regex anchored on "\nOK\n" doesn't.
      if (buf === 'OK\n' || buf.endsWith('\nOK\n') || buf.startsWith('ACK ') || buf.includes('\nACK ')) {
        clearTimeout(timer);
        sock.end();
        resolve(buf);
      }
    });
    sock.on('close', () => { clearTimeout(timer); resolve(buf); });
  });
}

// Parses MPD's `file:`/`Key: Value` block format (listallinfo output) into
// track objects. `directory:` lines end the preceding track's block.
function parseMpdTracks(raw) {
  const tracks = [];
  let cur = null;
  for (const line of raw.split('\n')) {
    const idx = line.indexOf(': ');
    if (idx === -1) continue;
    const key = line.slice(0, idx);
    const val = line.slice(idx + 2);
    if (key === 'file') {
      if (cur) tracks.push(cur);
      cur = { file: val, title: '', artist: '', album: '', date: '' };
    } else if (key === 'directory') {
      if (cur) { tracks.push(cur); cur = null; }
    } else if (cur && key === 'Title') cur.title = val;
    else if (cur && key === 'Artist') cur.artist = val;
    else if (cur && key === 'Album') cur.album = val;
    else if (cur && key === 'Date') cur.date = val;
  }
  if (cur) tracks.push(cur);
  return tracks.filter(t => t.file);
}

async function getLibraryPool() {
  const raw = await mpdQuery('listallinfo /', 15000);
  return parseMpdTracks(raw);
}

// ── Metadata derivation (the {popularity}/{era_context} injected vars) ────
async function buildPopularityMap() {
  const rows = await getMostPlayedTracks(500).catch(() => []);
  const map = new Map();
  let max = 1;
  for (const r of rows) { map.set(r.file, r.playCount); if (r.playCount > max) max = r.playCount; }
  return { map, max };
}

function popularityFor(file, { map, max }) {
  if (map.has(file)) return Math.max(15, Math.round((map.get(file) / max) * 100));
  // No play history for this file — mid-range so an unknown track isn't
  // falsely framed as either a "world hit" or "niche" pick.
  return 35 + Math.floor(Math.random() * 30);
}

function eraContextFor(dateTag, lang) {
  const year = parseInt(String(dateTag || '').slice(0, 4), 10);
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
    text = words.slice(0, maxWords).join(' ').replace(/[,;:\-–—]+$/, '');
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
// pipeline (MPD/Spotify etc. all at 44.1/48kHz stereo) triggered a
// `snd_pcm_hw_params_set_rate: Invalid argument` crash loop in CamillaDSP
// (only recovered by a full resonance-api restart, which regenerates and
// re-applies its config). Piper has no built-in resample flag, so the raw
// output is immediately upsampled to 48000Hz stereo — the rate this
// project's own CamillaDSP config generator (server/camilla-config.js)
// documents as its default — before it ever reaches the shared PipeWire
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

// ── MPD playback ──────────────────────────────────────────────────────────
// `mpc clear` then `add` then `play` (the obvious way to write this) passes
// through a moment where the queue is empty and nothing is playing — live-
// tested against the real Pi, that transient state was enough to trip
// server/player.js's MPD-idle-driven "bit-perfect rate-following" listener
// (it reacts to MPD's `changed: player` event on EVERY queue mutation,
// re-reads the current format, and pushes a new CamillaDSP config+hot-reload
// if it differs) into detecting a bogus/absent format and regenerating
// CamillaDSP's config to a bad value — crash-looped CamillaDSP for real
// during testing. Appending the new track, jumping straight to its position,
// then deleting everything before it never leaves the queue empty, so that
// listener only ever observes real, meaningful transitions.
async function playTrack(file) {
  await execFilePromise('mpc', ['add', file]);
  const { stdout } = await execPromise('mpc playlist');
  const position = stdout.trim().split('\n').filter(Boolean).length;
  await execFilePromise('mpc', ['play', String(position)]);
  for (let i = 1; i < position; i++) {
    await execFilePromise('mpc', ['del', '1']).catch(() => {});
  }
}

function waitForTrackEnd(maxMs = 12 * 60 * 1000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    state.pollInterval = setInterval(async () => {
      if (!state.active) { clearInterval(state.pollInterval); resolve(); return; }
      if (Date.now() - startedAt > maxMs) { clearInterval(state.pollInterval); resolve(); return; }
      try {
        const { stdout } = await execPromise('mpc status');
        if (!stdout.includes('[playing]') && !stdout.includes('[paused]')) {
          clearInterval(state.pollInterval); resolve();
        }
      } catch { clearInterval(state.pollInterval); resolve(); }
    }, 2000);
  });
}

// ── Session state machine ─────────────────────────────────────────────────
const state = {
  active: false,
  pool: [],
  popularity: { map: new Map(), max: 1 },
  queue: [],
  pending: null, // { text, wavPath } for the track about to play, prepared ahead of time
  pollInterval: null,
  loopPromise: null,
};

function pickTracks(n) {
  const shuffled = [...state.pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function broadcastState(extra = {}) {
  emit('DJ_STATE', { active: state.active, ...extra });
}

async function prepare(track, language, isCheckIn = false) {
  const trigger = track.date
    ? ['focus on the era', 'focus on the artist', 'focus on the hype'][Math.floor(Math.random() * 3)]
    : ['focus on the artist', 'focus on the hype'][Math.floor(Math.random() * 2)];
  const energyList = RANDOM_ENERGY[language] || RANDOM_ENERGY.en;
  const text = await generateLine({
    music: track.title || path.basename(track.file),
    artist: track.artist || 'unknown artist',
    albumType: 'album track',
    popularity: popularityFor(track.file, state.popularity),
    eraContext: eraContextFor(track.date, language),
    randomEnergy: energyList[Math.floor(Math.random() * energyList.length)],
    randomTrigger: trigger,
    language,
    isCheckIn,
  });
  const wavPath = await synthesize(text, language);
  return { text, wavPath, forTrack: track };
}

async function runLoop() {
  const language = (await getSetting('language').catch(() => null)) === 'pt' ? 'pt' : 'en';

  while (state.active) {
    if (state.queue.length === 0) {
      state.queue = pickTracks(SONGS_PER_SET);
      if (state.queue.length === 0) {
        broadcastState({ phase: 'error', message: 'No tracks found in your local library.' });
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
      broadcastState({ phase: 'announcing', line: state.pending.text });
      try { await playClip(state.pending.wavPath); } catch (err) { console.error('[DJ] playback failed:', err.message); }
      fs.unlink(state.pending.wavPath, () => {});
    }
    state.pending = null;
    if (!state.active) break;

    broadcastState({ phase: 'playing', track: { title: track.title, artist: track.artist, file: track.file } });
    try { await playTrack(track.file); } catch (err) { console.error('[DJ] playTrack failed:', err.message); }

    // Prepare the NEXT segment in the background while this track plays —
    // the whole point: ~15-20s of generation+synthesis hidden inside a
    // 3-4 minute song instead of sitting between tracks as dead air.
    const isSetEnd = state.queue.length === 0;
    const nextTrack = isSetEnd ? null : state.queue[0];
    const prepPromise = isSetEnd
      ? prepare(track, language, true) // check-in line refers to the track that just finished
      : prepare(nextTrack, language);
    prepPromise
      .then((p) => { if (state.active) state.pending = p; else fs.unlink(p.wavPath, () => {}); })
      .catch((err) => console.error('[DJ] background prepare failed:', err.message));

    await waitForTrackEnd();
  }

  state.active = false;
  broadcastState({ phase: 'stopped' });
}

async function start() {
  if (state.active) return { alreadyActive: true };
  state.pool = await getLibraryPool();
  if (state.pool.length === 0) {
    broadcastState({ phase: 'error', message: 'No tracks found in your local library.' });
    return { error: 'empty_library' };
  }
  state.popularity = await buildPopularityMap();
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
  try { await execPromise('mpc stop'); } catch { /* best effort */ }
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
