/**
 * DJ mode — a self-contained "source" that plays Spotify tracks from your
 * library, with a locally-generated (Ollama) + locally-synthesized (Piper
 * TTS) voice announcer between tracks, like a radio DJ. Plays a block of
 * SONGS_PER_SET tracks, then does a short "check-in" line and starts a new
 * block, repeating until stopped.
 *
 * Mood buttons (POST /api/dj/mood, see MOODS below) let the listener pin the
 * announcer's energy instead of it rolling randomly per line, and — the
 * Spotify-DJ-inspired part — pivot mid-session: pressing one while active
 * cuts the current track immediately, throws away whatever was queued/
 * pre-generated for the old lineup, and draws a fresh block avoiding
 * anything already played this session (setMood()/pickTracks()).
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
 * track plays (typically 3+ minutes of runway vs ~20s of prep).
 *
 * DJ is Spotify, disguised — the music must never wait on the AI
 * (AUDIT-2026-08-01). runLoop() only ever plays an announcement that's
 * already finished generating AND was written for the exact track about to
 * play (matched by forTrack.uri); if it isn't ready in time (cold start, a
 * pivot, or a slow generation), that track just plays with no intro and the
 * announcement — once it finishes — is delivered before whichever later
 * track it's actually ready for instead. There is no code path left that
 * blocks playback waiting on Ollama/Piper. The handoff between tracks also
 * fires ~8s BEFORE the current one actually ends (waitForSpotifyTrackEnd),
 * not after Spotify reports it over, so there's no dead air from poll
 * latency either and Spotify's own end-of-track handling never gets a
 * window to run (see also LIBRESPOT_AUTOPLAY=off in spotify-daemon.js).
 *
 * Announcements OVERLAY the next track rather than pausing for them
 * (duckThroughCut): the next track starts immediately, the shared
 * CamillaDSP master volume dips ~14dB for the duration of the clip, then
 * fades back up. EVERY track handoff ducks through the cut this way now,
 * not just announced ones — Spotify's Web API has no crossfade/mix
 * primitive (it can only replace what's playing instantly), so this can't
 * literally overlap the end of one song with the start of the next the way
 * a real mixer (or Spotify's own first-party DJ feature) does; a brief duck
 * through the edit is the closest approximation available and reads far
 * less like a jump-cut than switching at full volume (requested live: "we
 * don't add breaks between songs, Spotify DJ is like this, they mix the end
 * and start of the songs like radio"). Two things were tried and ruled out
 * for doing this per-source instead of on the shared master — see the AUDIT
 * comment on synthesize() for the full story: Spotify's own device volume
 * doesn't reliably reach librespot at all for API-driven changes (confirmed
 * live: zero effect, zero onevent trigger), and CamillaDSP only ever sees the
 * already-mixed signal (both this clip and Spotify's audio converge at the
 * shared ALSA loopback before CamillaDSP's capture ever sees either one), so
 * it can't tell them apart to duck just one. The clip itself is instead
 * pre-boosted by the same amount the master gets ducked by, so it lands back
 * at ~full loudness once played through the ducked master while the music
 * (never independently boosted) is genuinely quieter underneath it.
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
import { emit, getEffectiveVolumeDb, getState } from './event-service.js';
import { getValidAccessToken } from './spotify-auth.js';
import { spotifyApi } from '../src/api/spotify.js';
import { LIBRESPOT_DEVICE_NAME } from './spotify-daemon.js';
import { setCamillaVolume } from './camilla-config.js';

const execFilePromise = promisify(execFile);
const router = express.Router();

// ── Config ────────────────────────────────────────────────────────────────
const OLLAMA_URL = 'http://127.0.0.1:11434/api/generate';
const OLLAMA_MODEL = 'qwen2.5:1.5b';
// Keeps the model warm between the frequent generate calls WITHIN one DJ
// session (so back-to-back lines don't each pay the ~44s cold-load cost).
// stop() explicitly overrides this with keep_alive: 0 to unload right away
// instead of waiting out this window — see unloadOllamaModel(). On a 4GB
// Pi4 with no swap, ~1-1.5GB held by an idle model between DJ sessions is
// real headroom other features need back promptly, not "eventually".
const OLLAMA_KEEP_ALIVE = '15m';
const PIPER_BIN = '/opt/piper-tts/piper/piper';
const PIPER_ESPEAK_DATA = '/opt/piper-tts/piper/espeak-ng-data';
// Piper's --length_scale is a phoneme-duration multiplier (1.0 = the
// model's native pace); >1 stretches it out. Reported live as talking too
// fast — 1.2 lands close to a natural, unhurried radio-DJ cadence without
// dragging (tune here if it still isn't slow enough).
const SPEECH_LENGTH_SCALE = 1.2;
const VOICES = {
  // High-quality tier, not medium (user-requested voice change 2026-08-01) —
  // noticeably more natural/energetic than the previous en_US-lessac-medium.
  // Slower to synthesize (~2.7x realtime vs medium's ~1x, live-benchmarked),
  // but that's fully absorbed by the several-minutes-of-runway background
  // prepare — never on the critical path to a track transition.
  en: '/opt/piper-tts/piper/voices/en_US-ryan-high.onnx',
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
// Mood buttons (client) map 1:1 to these ids. Doubles as the source of the
// random per-line energy style when no mood is pinned — picking one of these
// five phrases at random is exactly what the old RANDOM_ENERGY array did,
// this just gives each phrase a stable id so it can also be pinned on
// purpose via POST /api/dj/mood.
const MOODS = {
  hype:     { en: 'super hyped and energetic',   pt: 'super hiperativo e enérgico' },
  chill:    { en: 'smooth late-night radio vibe', pt: 'smooth rádio de fim de noite' },
  casual:   { en: 'casual and cool',              pt: 'casual e cool' },
  dramatic: { en: 'intense and dramatic',         pt: 'intenso e dramático' },
  playful:  { en: 'playful and cheeky',           pt: 'brincalhão e divertido' },
};
const MOOD_IDS = Object.keys(MOODS);

// ── Spotify helpers ───────────────────────────────────────────────────────
// Thin wrappers around spotifyApi — the orchestration-specific bits only
// (which device to target, which pools to merge), not the HTTP calls
// themselves.

// Finds the librespot Connect device (LIBRESPOT_DEVICE_NAME) and makes it
// Spotify's active playback target if it isn't already. Deliberately simple
// for now (no raspotify-restart-and-retry loop like the kiosk's own
// ensureRaspotify) — if the device isn't up at all, start() just surfaces
// that as an error.
async function ensureSpotifyDevice(token) {
  const data = await spotifyApi.getDevices(token).catch(() => null);
  const device = (data?.devices || []).find(d => d.name === LIBRESPOT_DEVICE_NAME);
  if (!device) return null;
  if (!device.is_active) {
    await spotifyApi.transferPlayback(token, device.id, false).catch(() => {});
    // Spotify applies a transfer asynchronously; without waiting for it to
    // actually land, the first play() and the first status poll both race it
    // and can still be answered for the PREVIOUS active device (typically the
    // user's phone) — which is what made DJ mode look stuck on a paused,
    // unrelated track while the Pi played fine.
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const check = await spotifyApi.getPlaybackState(token).catch(() => null);
      if (check?.device?.id === device.id) break;
    }
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
async function generateLine({ music, artist, albumType, popularity, eraContext, randomEnergy, randomTrigger, language, isCheckIn, isPivot }) {
  const langName = language === 'pt' ? 'Portuguese' : 'English';
  const system = [
    'You are an extremely charismatic, unpredictable club radio DJ speaking live on air.',
    'Output ONLY the raw spoken line - no prefixes like "DJ:" or "Host:", no quotes, no markdown, no hashtags, no emojis, no parentheses.',
    'Maximum 15 words, never exceed it.',
    'Never start with cliches like "And now we have", "Here is", "Straight from", "Coming up", "E agora temos", "Fica com", "Diretamente de" - vary your opening every single time, using the given energy and focus to change your approach completely.',
    `Speak in ${langName} - natural, fluent, native-sounding, never translated-sounding.`,
  ].join(' ');

  // isPivot = the listener just pressed a mood button: the persona should
  // acknowledge switching gears live (mirroring Spotify DJ's own "pivoting
  // the mix" moment) before introducing what's coming up next.
  const prompt = isPivot
    ? `You're changing the vibe live on air right now to something ${randomEnergy}. React to the pivot in one punchy line, then tease that ${music} by ${artist} is coming up next. Say your line now.`
    : isCheckIn
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

// keep_alive: 0 on a generate call is Ollama's documented way to unload a
// model immediately (there's no separate "/api/unload" endpoint) — an empty
// prompt means this doesn't actually generate anything, it just piggybacks
// on the same mechanism to drop the model from RAM as soon as DJ mode stops
// instead of waiting out OLLAMA_KEEP_ALIVE.
async function unloadOllamaModel() {
  try {
    await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, prompt: '', keep_alive: 0 }),
    });
  } catch (err) {
    console.warn('[DJ] Ollama unload request failed (non-fatal):', err.message);
  }
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
    const proc = spawn(PIPER_BIN, ['--model', voice, '--output_file', outFile, '--espeak_data', PIPER_ESPEAK_DATA, '--length_scale', String(SPEECH_LENGTH_SCALE)]);
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

// AUDIT-2026-08-01 (audio ducking): CamillaDSP's SetVolume is a SINGLE
// master gain applied to the already-mixed signal — by the time it sees
// anything, this clip and the Spotify track have already summed together at
// the shared ALSA loopback (librespot writes straight to the camilla_input
// dmix; this clip reaches the same loopback via pw-play → ResonanceInput →
// PipeWire loopback module). There is no way to turn down "just the music"
// at that stage. Spotify's own per-device volume was the other candidate —
// tested live via PUT /me/player/volume against the real device: Spotify's
// API accepted it and reported the new value back, but librespot never
// applied it and never fired its volume_set onevent (confirmed via
// journalctl — nothing, not even after 5+ seconds), so it doesn't reach the
// device at all for API-driven changes. The only combination that actually
// works: duck the shared master (see duckThroughCut below) AND boost this
// clip's own gain by the exact same amount here, so once played back through
// the ducked master it lands back at ~its original loudness while the music
// (never independently boosted) is genuinely quieter. DUCK_DB is defined
// with duckThroughCut a bit further down.
async function synthesize(text, language) {
  const rawFile = await synthesizeRaw(text, language);
  const outFile = rawFile.replace(/\.raw\.wav$/, '.wav');
  try {
    // alimiter catches whatever peaks the +DUCK_DB boost would otherwise
    // send over 0dBFS — Piper's own output already peaks close to full
    // scale, so a flat +14dB boost with no limiter would clip audibly.
    // level=disabled: alimiter's own auto-gain would otherwise fight the
    // boost we're deliberately asking for.
    await execFilePromise('ffmpeg', [
      '-y', '-i', rawFile,
      '-af', `volume=${DUCK_DB}dB,alimiter=limit=0.97:level=disabled`,
      '-ar', String(CLIP_RATE), '-ac', '2', outFile,
    ]);
  } finally {
    fs.unlink(rawFile, () => {});
  }
  return outFile;
}

function playClip(wavPath) {
  return execFilePromise('pw-play', ['--target', 'ResonanceInput', wavPath], { env: PW_ENV, timeout: 30000 });
}

// Ducks the shared master volume, runs the actual track cut (playNextTrack)
// while ducked, optionally plays an announcement clip (already pre-boosted
// for exactly this DUCK_DB — see synthesize()) while still ducked, then
// smoothly fades back up — the only working way to make music sound quieter
// under the DJ's voice without an independent per-source mixer (see the
// AUDIT comment on synthesize() above for what was tried and ruled out).
// 14dB ≈ reduces linear amplitude to ~20% (20*log10(0.2) ≈ -13.98dB),
// matching the requested "duck to 20%, fade back to 100%" spec.
//
// EVERY handoff goes through this now, not just announced ones (AUDIT-
// 2026-08-02): Spotify's Web API can only replace what's playing instantly,
// there's no crossfade primitive, so the cut itself needs masking too — a
// plain announcement-free transition briefly ducks, executes the cut, holds
// for a beat, then swells back up, instead of switching at full volume.
// Requested live: "we don't add breaks between songs, Spotify DJ is like
// this, they mix the end and start of the songs like radio." Skips the
// whole dance if the user has the system muted/near-silent already —
// nothing to duck.
const DUCK_DB = 14;
async function duckThroughCut(playNextTrack, announcementWavPath) {
  // getEffectiveVolumeDb() (not getCachedVolumeDb()) — DJ is Spotify-only,
  // exactly where the Spotify Level Trim applies (event-service.js), so the
  // duck-down/fade-back-up baseline must include it or resuming after an
  // announcement produces its own small audible jump.
  const before = getEffectiveVolumeDb();
  const canDuck = before > -90;
  if (canDuck) {
    // One immediate retry: live-tested, the WS command occasionally reports
    // failure (transient — CamillaDSP's connection isn't always instantly
    // ready). Worth retrying here specifically because an announcement clip
    // is already baked with the +DUCK_DB boost — if the duck never lands, it
    // plays louder than intended over full-volume music instead of just
    // being a bit quiet.
    let ok = await setCamillaVolume(before - DUCK_DB);
    if (!ok) ok = await setCamillaVolume(before - DUCK_DB);
    if (!ok) console.warn('[DJ] Duck failed twice — transition/announcement will play louder than intended over full-volume music.');
  }
  await playNextTrack();
  try {
    if (announcementWavPath) {
      await playClip(announcementWavPath);
    } else if (canDuck) {
      // No announcement this time — just hold briefly so the cut itself
      // lands while quiet, then straight into the fade-up below.
      await new Promise((r) => setTimeout(r, 250));
    }
  } catch (err) {
    console.error('[DJ] playback failed:', err.message);
  } finally {
    if (canDuck) {
      // Stepped rather than instant — "smoothly fade the music volume back
      // up" per spec. 6 steps over ~700ms.
      const STEPS = 6;
      for (let i = 1; i <= STEPS; i++) {
        await setCamillaVolume(before - DUCK_DB + (DUCK_DB * i) / STEPS);
        await new Promise((r) => setTimeout(r, 120));
      }
    }
  }
}

// Every clip this module creates is unlinked as soon as it's done with (see
// the unlink calls in runLoop/stop below) — this sweep only exists to catch
// the one path those can't cover: resonance-api getting killed (crash,
// `systemctl restart`, power loss) mid-session, orphaning whatever clip was
// mid-synthesis or queued as `state.pending` at that moment. Scoped tightly
// to this module's own filename prefix so it can never touch unrelated
// files in the shared tmpdir.
function cleanupOrphanedClips() {
  fs.readdir(os.tmpdir(), (err, files) => {
    if (err) return;
    for (const f of files) {
      if (/^dj-line-.*\.wav$/.test(f)) fs.unlink(path.join(os.tmpdir(), f), () => {});
    }
  });
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
  mood: null, // one of MOOD_IDS, or null = random energy per line (default)
  pivotRequested: false, // set by setMood() to cut the current track short
  generation: 0, // bumped on every pivot so a background prepare() started
                 // for the OLD lineup can tell it's stale once it resolves
  playedUris: new Set(), // this session's history — pickTracks avoids repeats
};

// Prefers tracks not yet played this session (falls back to the full pool
// once everything's been heard) so a mood pivot actually feels like "a new
// lineup" instead of possibly re-drawing the track that's just about to end.
function pickTracks(n) {
  const unplayed = state.pool.filter(t => !state.playedUris.has(t.uri));
  const source = unplayed.length >= n ? unplayed : state.pool;
  const shuffled = [...source].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function broadcastState(extra = {}) {
  emit('DJ_STATE', { active: state.active, ...extra });
}

async function prepare(track, language, isCheckIn = false, isPivot = false) {
  const trigger = track.album?.release_date
    ? ['focus on the era', 'focus on the artist', 'focus on the hype'][Math.floor(Math.random() * 3)]
    : ['focus on the artist', 'focus on the hype'][Math.floor(Math.random() * 2)];
  // A pinned mood always wins over the random per-line roll — that's the
  // whole point of pressing a mood button instead of just waiting.
  const energyList = MOOD_IDS.map(id => MOODS[id][language] || MOODS[id].en);
  const randomEnergy = state.mood
    ? (MOODS[state.mood]?.[language] || MOODS[state.mood]?.en)
    : energyList[Math.floor(Math.random() * energyList.length)];
  const text = await generateLine({
    music: track.name,
    artist: (track.artists || []).map(a => a.name).join(', ') || 'unknown artist',
    albumType: track.album?.album_type || 'track',
    popularity: typeof track.popularity === 'number' ? track.popularity : 50,
    eraContext: eraContextFor(track.album?.release_date, language),
    randomEnergy,
    randomTrigger: trigger,
    language,
    isCheckIn,
    isPivot,
  });
  const wavPath = await synthesize(text, language);
  // forTrack: which track this was written FOR (used to match it up before
  // playing — see runLoop). A check-in is different: it's written ABOUT the
  // track that just finished (so it has something concrete to react to) but
  // is meant to play before WHATEVER comes next, not specifically require
  // that exact track — it never names an upcoming track the way a normal
  // intro or pivot line does. forTrack is set for logging/debugging only in
  // that case; matching is skipped via isCheckIn instead.
  return { text, wavPath, forTrack: track, isCheckIn };
}

// Polls Spotify's own playback state (no push API for third parties) both to
// detect the track ending AND to keep the kiosk's now-playing display
// current for the whole time the track plays, not just at the start.
function waitForSpotifyTrackEnd(token, expectedUri, maxMs = 12 * 60 * 1000) {
  const startedAt = Date.now();
  // Spotify needs a moment to report the track we just started; treat "not
  // our device / not playing yet" as "still starting" rather than "ended"
  // for this long, so a slow Connect handover can't abort the track instantly.
  const graceMs = 12000;
  // Hand off a bit BEFORE the track actually ends rather than reacting after
  // Spotify reports it's over — requested live as "call it 5-10s before the
  // end so it feels fluid". This also eliminates the ~0-3s poll-detection lag
  // after a real end, and means Spotify's own end-of-track handling never
  // gets a window to run at all (see LIBRESPOT_AUTOPLAY=off in
  // spotify-daemon.js for the belt-and-suspenders half of that).
  const HANDOFF_LEAD_MS = 8000;
  return new Promise((resolve) => {
    // AUDIT-2026-08-03: exposed on `state` so setMood() can resolve this
    // immediately on a pivot instead of either (a) waiting up to 3s for the
    // next poll tick, or (b) what it used to do — calling spotifyApi.pause()
    // directly as a separate, unsynchronized request. That pause raced
    // against THIS function's own in-flight getPlaybackState() calls and,
    // worse, against runLoop()'s very next spotifyApi.play() call for the
    // track the pivot is cutting TO — confirmed live: a pause fired from a
    // second/third rapid mood click could land on Spotify's servers AFTER
    // the new track's play() call, leaving Spotify genuinely paused while
    // the app's own state believed it was playing (silent audio, "STREAMING"
    // still shown). Spotify's play endpoint with a specific track URI
    // already replaces whatever's currently playing atomically — no
    // separate pause was ever needed for that; it just wasn't safe here.
    const finish = () => {
      clearInterval(state.pollInterval);
      state.pollInterval = null;
      if (state.resolveTrackWait === finish) state.resolveTrackWait = null;
      resolve();
    };
    state.resolveTrackWait = finish;
    state.pollInterval = setInterval(async () => {
      if (!state.active || state.pivotRequested) { finish(); return; }
      if (Date.now() - startedAt > maxMs) { finish(); return; }
      try {
        const data = await spotifyApi.getPlaybackState(token);
        const settling = Date.now() - startedAt < graceMs;

        // /me/player reports the account's ACTIVE device, which is not
        // necessarily ours: with the Spotify app open on a phone, it returns
        // the phone's state instead. That state is usually paused on some
        // unrelated old track, and the DJ used to (a) rebroadcast it to every
        // screen — so the kiosk showed a frozen, paused, wrong track while
        // the Pi was audibly playing something else — and (b) read
        // is_playing:false as "track ended" and immediately skip, burning
        // through the whole set in seconds. Ignore anything that isn't the
        // device we're driving (AUDIT-2026-08-01).
        // No "unknown device is fine" fallback: treating a missing deviceId as
        // a match is what let the phone's state back in.
        const isOurDevice = !!state.deviceId && data?.device?.id === state.deviceId;
        if (!data || !isOurDevice) {
          if (settling) return; // still handing over — keep waiting
          finish(); return;
        }

        if (data.item) broadcastSpotifyState(data.item, !data.is_playing, data.progress_ms);

        const remainingMs = (data.item?.duration_ms ?? Infinity) - (data.progress_ms ?? 0);
        const nearEnd = data.item?.uri === expectedUri && data.is_playing && remainingMs <= HANDOFF_LEAD_MS;

        if (!data.is_playing || data.item?.uri !== expectedUri || nearEnd) {
          if (settling && data.item?.uri !== expectedUri) return; // our track hasn't shown up yet
          finish();
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

    // Consumed here regardless of outcome below — carried into the
    // background prepare call further down, so a pivot's "we're switching
    // things up" framing lands on the very next announcement instead of
    // ever blocking playback to say it immediately (see the no-blocking
    // design right below).
    const wasPivot = state.pivotRequested;
    state.pivotRequested = false;

    // DJ is Spotify, disguised — the music must never wait on the AI. Only
    // announce if the segment prepared FOR THIS EXACT track is ready; if
    // nothing's ready (session just started, a pivot just reset the queue,
    // or generation simply ran long — an LLM+TTS round trip can take up to
    // ~45s cold), skip the announcement THIS time and go straight to the
    // music with zero dead air. A fresh one is prepared below and plays
    // before whichever track it's actually ready in time for.
    const announcement = (state.pending && (state.pending.isCheckIn || state.pending.forTrack?.uri === track.uri))
      ? state.pending
      : null;
    if (state.pending && state.pending !== announcement) {
      // Belongs to a track we're skipping past — by the time it finishes
      // generating it would be introducing something already mid-playback.
      // Discard rather than deliver a mismatched announcement.
      fs.unlink(state.pending.wavPath, () => {});
    }
    state.pending = null;
    if (!state.active) break;

    // Next track starts immediately — no pause, no gap, and the cut always
    // happens ducked (duckThroughCut) rather than at full volume: "song ends
    // → next song starts, ducked → DJ talks over the quiet intro (if ready)
    // → fade back up", matching how a real radio handoff (and Spotify's own
    // DJ feature) actually sounds, and per explicit spec. Never pausing
    // means there's no dead air even when no announcement is ready at all.
    broadcastState({ phase: 'playing', mood: state.mood, track: { title: track.name, artist: (track.artists || []).map(a => a.name).join(', ') } });
    if (announcement) broadcastState({ phase: 'announcing', line: announcement.text });
    await duckThroughCut(async () => {
      try {
        await spotifyApi.play(token, state.deviceId, null, [track.uri]);
        state.playedUris.add(track.uri);
        broadcastSpotifyState(track, false, 0);
      } catch (err) { console.error('[DJ] Spotify play failed:', err.message); }
    }, announcement?.wavPath);
    if (announcement) fs.unlink(announcement.wavPath, () => {});

    // Prepare the NEXT segment in the background while this track plays —
    // the whole point: generation+synthesis latency hidden inside several
    // minutes of song instead of ever sitting between tracks as dead air.
    // Tagged with the current generation so that if a mood pivot happens
    // before this resolves, the stale result (built for a lineup that no
    // longer exists) gets discarded instead of clobbering the fresh pivot
    // announcement setMood()/this loop are about to prepare instead.
    //
    // Only prepare an announcement at a BLOCK boundary (the check-in, using
    // the block's last song as material) or right after a mood pivot (the
    // explicit, user-requested "switching things up" cue) — NOT before every
    // individual song in the block. It used to announce every single track;
    // a manual skip looks identical to a natural track-end here, so
    // skipping through songs re-triggered a fresh announcement on every
    // skip. Reported live: "if I skip songs we will trigger the same dj at
    // the end of the block to present the next block, so we present block
    // not songs... we use just the song to make conversation" — the block
    // is the unit that gets announced; a specific song's details are still
    // what the line is actually built from (prepare() below is unchanged),
    // only the CADENCE moved from per-song to per-block.
    const gen = state.generation;
    const isSetEnd = state.queue.length === 0;
    const nextTrack = isSetEnd ? null : state.queue[0];
    let prepPromise = null;
    if (isSetEnd) {
      prepPromise = prepare(track, language, true); // check-in line refers to the track that just finished
    } else if (wasPivot) {
      prepPromise = prepare(nextTrack, language, false, true);
    }
    if (prepPromise) {
      prepPromise
        .then((p) => {
          if (state.active && gen === state.generation) {
            // A second block boundary (or another pivot) can race past
            // before this one finishes generating — skip through an entire
            // block faster than the ~10-45s an LLM+TTS round trip takes and
            // two prepares end up in flight at once. The newer one always
            // wins; clean up whichever one loses instead of leaking its
            // wav file in /tmp.
            if (state.pending?.wavPath) fs.unlink(state.pending.wavPath, () => {});
            state.pending = p;
          } else {
            fs.unlink(p.wavPath, () => {});
          }
        })
        .catch((err) => console.error('[DJ] background prepare failed:', err.message));
    }

    await waitForSpotifyTrackEnd(token, track.uri);
  }

  state.active = false;
  await releaseSourceIfStillDj();
  broadcastState({ phase: 'stopped' });
}

// AUDIT-2026-08-03: DJ mode ending — whether by an explicit stop() call, or
// runLoop() breaking out of its own while loop on an error (token expired,
// empty Spotify pool) — used to leave cachedSourceState.source stuck on
// 'dj' forever, since nothing here ever told the server the active source
// had reverted to plain Spotify. /api/dj/status would correctly report
// active:false, but /api/status kept reporting source:"dj" indefinitely —
// reported live as DJ mode "sometimes failing to [switch back to] Spotify
// source". Guarded on the source still actually being 'dj' at the moment
// this runs (not unconditional) so it can never stomp on a legitimate
// concurrent switch to a THIRD source (e.g. the user hit "Radio" while this
// was mid-shutdown) — last-write-wins is correct there, same as any other
// two-clients-switch-source-at-once case already possible today.
async function releaseSourceIfStillDj() {
  if (getState().sourceState?.source === 'dj') {
    emit('SET_SOURCE', { source: 'spotify', spotify: true });
  }
}

async function start() {
  if (state.active) return { alreadyActive: true };
  cleanupOrphanedClips();
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
  if (!state.deviceId) {
    // Without our own device id every poll would have to accept whatever
    // device Spotify calls active — i.e. the user's phone — which is exactly
    // the confusion this session is meant to avoid. Fail loudly instead.
    broadcastState({ phase: 'error', message: `${LIBRESPOT_DEVICE_NAME} is not available on Spotify yet — try again in a moment.` });
    return { error: 'device_unavailable' };
  }
  // Claim the active source server-side. DJ and Spotify are separate sources
  // that happen to share the same Connect device, and until this existed only
  // the kiosk's own click handler ever set the source — so starting DJ any
  // other way (this REST endpoint, a second screen, a client that missed the
  // event) left active_source stuck on 'spotify'. Every Spotify-source client
  // then kept polling /me/player on its 3s timer and rebroadcasting whatever
  // it found — usually the phone's paused state — straight over the top of
  // the DJ's own now-playing broadcasts, which is why the kiosk showed a
  // frozen, wrong, paused track while the DJ was audibly playing something
  // else. Reusing SET_SOURCE rather than inventing a parallel mechanism means
  // the existing "stop the previous source" teardown runs too.
  // Verified live: active_source read 'spotify' throughout a DJ session.
  emit('SET_SOURCE', { source: 'dj', spotify: false });
  // Belt-and-suspenders beyond SET_SOURCE's own previousSource-based teardown:
  // that logic only fires correctly if cachedSourceState already reflects
  // whatever was really playing (radio, local, etc.) — a stale/reset value
  // (e.g. right after a resonance-api restart) would skip it, leaving MPD's
  // stream mixed into the shared PipeWire input alongside DJ's Spotify audio.
  // Reported live as "DJ is passing radio". DJ must own the input exclusively
  // no matter what the tracked previous source was, so stop MPD unconditionally.
  await execFilePromise('mpc', ['stop']).catch(() => {});

  state.pool = pool;
  state.active = true;
  state.queue = [];
  state.pending = null;
  // Fresh session — no mood pinned, no play history, no stale pivot signal.
  state.mood = null;
  state.pivotRequested = false;
  state.generation = 0;
  state.playedUris = new Set();
  broadcastState({ phase: 'starting' });
  state.loopPromise = runLoop();
  return { started: true };
}

// Pins (or clears, if moodId is null) the announcer's energy for every line
// from here on. While a session is active this also pivots immediately —
// cuts the current track, discards whatever was queued/pre-generated for
// the OLD lineup, and draws a fresh block — mirroring the "press the DJ
// button again to pivot to a totally new lineup" behavior this feature was
// modeled on. If DJ mode isn't running yet, it just takes effect at the
// next start().
async function setMood(moodId) {
  state.mood = moodId || null;
  if (!state.active) return { mood: state.mood, active: false };

  state.generation++; // invalidate any in-flight background prepare for the old lineup
  state.pivotRequested = true;
  state.queue = [];
  if (state.pending?.wavPath) fs.unlink(state.pending.wavPath, () => {});
  state.pending = null;

  // Resolve the current waitForSpotifyTrackEnd() immediately rather than
  // waiting up to 3s for its next poll tick — this used to instead call
  // spotifyApi.pause() directly here, which raced against runLoop()'s own
  // upcoming play() call for the track being pivoted TO (see the audit
  // comment on waitForSpotifyTrackEnd). Calling the exposed resolver is
  // synchronous and safe to call more than once in a row (rapid repeated
  // mood clicks) — each call just lets runLoop's single-threaded while loop
  // reach its next iteration a little sooner; only the LAST mood/queue state
  // before runLoop actually reads it takes effect either way.
  if (state.resolveTrackWait) state.resolveTrackWait();
  broadcastState({ phase: 'pivoting', mood: state.mood });
  return { mood: state.mood, active: true };
}

async function stop() {
  state.active = false;
  state.generation++; // invalidate any in-flight background prepare
  state.pivotRequested = false;
  state.mood = null;
  // AUDIT-2026-08-03: this used to clearInterval() directly instead of
  // calling the promise's own resolver — clearing the interval stops it from
  // firing again, but never resolves runLoop()'s `await
  // waitForSpotifyTrackEnd(...)`, leaving that call hanging forever (state.active
  // is false, but the while loop can't get back around to check it). The
  // dangling promise meant runLoop() never reached its own post-loop cleanup
  // on an explicit stop — including the releaseSourceIfStillDj() call below,
  // which is why this function calls it directly too rather than relying on
  // runLoop() to eventually get there.
  if (state.resolveTrackWait) state.resolveTrackWait();
  if (state.pending?.wavPath) fs.unlink(state.pending.wavPath, () => {});
  state.pending = null;
  state.queue = [];
  cleanupOrphanedClips();
  const token = await getValidAccessToken().catch(() => null);
  if (token) await spotifyApi.pause(token).catch(() => {});
  await unloadOllamaModel();
  await releaseSourceIfStillDj();
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

router.post('/mood', async (req, res) => {
  const { mood } = req.body || {};
  if (mood != null && !MOODS[mood]) {
    return res.status(400).json({ error: 'unknown_mood', valid: MOOD_IDS });
  }
  try { res.json(await setMood(mood || null)); }
  catch (err) { console.error('[DJ] mood failed:', err); res.status(500).json({ error: err.message }); }
});

router.get('/status', (req, res) => {
  // DJ mode never touches Spotify's real /me/player/queue (every track
  // transition is a fresh single-URI play call, not a queue push — see the
  // module docstring), so the remote's "Up Next" panel found it permanently
  // empty here even mid-session. state.queue already holds the actual
  // upcoming Spotify track objects (pickTracks' pre-selected batch minus
  // whatever's already played) — shape them the same way Spotify's own
  // queue endpoint does so the client's existing queue UI needs no changes
  // beyond picking this endpoint as its source while source === 'dj'.
  const queue = state.queue.map(t => ({ uri: t.uri, name: t.name, artists: t.artists, album: { images: t.album?.images } }));
  res.json({ active: state.active, upNext: state.queue.length, mood: state.mood, moods: MOOD_IDS, queue });
});

export default router;
