import express from 'express';
import { execFile } from 'child_process';
import { setSetting, getSetting } from './db.js';
import { getValidAccessToken } from './spotify-auth.js';
import { sendCamillaCommand } from './camilla-ws.js';

const router = express.Router();

// Single source of truth for the librespot Connect device name — imported by
// dj.js and event-service.js rather than each re-hardcoding the string.
//
// AUDIT-2026-08-01: this name is Spotify's own key for ITS backend cache of
// "what's currently playing" on this device. That cache got permanently
// stuck for "Resonance Connect" — frozen track/position/paused forever
// regardless of what the device actually played, confirmed via raw API
// calls bypassing this app entirely, and unrecoverable via token refresh,
// restarting raspotify, or wiping its cached credentials (librespot's
// Spotify device id is derived deterministically from this name — no
// --device-id override exists in this librespot build — so none of those
// actually changed its identity). Renaming to a never-before-used value
// immediately produced correct, real-time-advancing state.
// If this exact symptom recurs (metadata frozen while audio keeps
// changing/advancing normally), change this constant to something NEVER
// used before. Do not reuse a name that has ever shown this symptom — it
// will not un-stick itself, no matter what else is tried.
export const LIBRESPOT_DEVICE_NAME = 'Resonance HiFi';

// Builds the managed /etc/raspotify/conf content. Exported separately so the
// startup path can compare it against the last-applied copy (stored in the
// settings DB — the file itself is root-only readable) and skip the restart
// when nothing changed, keeping the Spotify Connect session alive.
// Password auth is deprecated in librespot 0.8 — zeroconf handles it.
function buildRaspotifyConf(extraLines = []) {
  const lines = [
      '# Resonance HiFi — managed by resonance-api, do not edit manually',
      `LIBRESPOT_NAME="${LIBRESPOT_DEVICE_NAME}"`,
      'LIBRESPOT_BITRATE=320',
      'LIBRESPOT_BACKEND=alsa',
      // plug: prefix adds ALSA's automatic rate/format converter so librespot's
      // 44100 Hz output is resampled to the 48000 Hz the dmix loopback requires.
      'LIBRESPOT_DEVICE=plug:camilla_input',
      // Fixed at 100% — CamillaDSP is the single master volume for all sources.
      // LIBRESPOT_VOLUME_CTRL=fixed means librespot ignores Spotify app volume
      // commands completely, so the Spotify app slider has no effect.
      // Without this, two independent gain stages compound (e.g. Spotify 50% ×
      // CamillaDSP 50% = 25% actual output, making the kiosk slider lie).
      'LIBRESPOT_INITIAL_VOLUME=100',
      'LIBRESPOT_MIXER=softvol',
      'LIBRESPOT_VOLUME_CTRL=fixed',
      'LIBRESPOT_ENABLE_VOLUME_NORMALISATION=true',
      'LIBRESPOT_FORMAT=S16',
      // Off, not "follow client setting" (the default): DJ mode (dj.js) plays
      // one explicit track URI at a time with no queue/context behind it, so
      // the instant that track ends, Spotify's own autoplay would otherwise
      // pick something from ITS OWN algorithmic "radio" mix to keep going —
      // reported live as "DJ is passing radio" content that was never
      // selected by dj.js's own Liked-Songs/Top-Tracks pool. This device is
      // driven entirely by explicit play() calls; nothing should ever start
      // playing here that dj.js (or the user, via a real client) didn't ask for.
      'LIBRESPOT_AUTOPLAY=off',
      // Fire librespot-event.sh on every Spotify Connect event (volumeset, etc.)
      // The script translates volume commands to CamillaDSP via /api/player/spotify-volume.
      'LIBRESPOT_ONEVENT=/home/pi/EnzoOS/scripts/librespot-event.sh',
      ...extraLines,
  ];
  return lines.join('\n') + '\n';
}

// Writes /etc/raspotify/conf using sudo tee (NOPASSWD in sudoers).
// Uses execFile + stdin pipe to avoid any shell escaping issues.
function writeRaspotifyConf(extraLines = []) {
  return new Promise((resolve, reject) => {
    const conf = buildRaspotifyConf(extraLines);
    const child = execFile('sudo', ['/usr/bin/tee', '/etc/raspotify/conf'], (err) => {
      if (err) reject(err); else resolve();
    });
    child.stdin.write(conf);
    child.stdin.end();
  });
}

function restartRaspotify() {
  return new Promise((resolve, reject) => {
    execFile('sudo', ['systemctl', 'restart', 'raspotify'], (err) => {
      if (err) reject(err); else resolve();
    });
  });
}

// POST /api/spotify/credentials — kept for backwards compat but creds are
// ignored (librespot 0.8 deprecated username/password auth). Just (re-)writes
// the device config and restarts so the device name and ALSA routing are right.
router.post('/credentials', async (req, res) => {
  try {
    await writeRaspotifyConf();
    await restartRaspotify();
    await setSetting('raspotify_applied_conf', buildRaspotifyConf()).catch(() => {});
    console.log('[Resonance Server] Spotify daemon device config applied and restarted.');
    res.json({ success: true, message: 'Spotify daemon configured and restarted' });
  } catch (err) {
    console.error('[Resonance Server] Failed to configure daemon:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/spotify/device — apply device config without touching credentials.
router.post('/device', async (req, res) => {
  try {
    await writeRaspotifyConf();
    await restartRaspotify();
    await setSetting('raspotify_applied_conf', buildRaspotifyConf()).catch(() => {});
    console.log('[Resonance Server] Spotify daemon device config re-applied.');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Stuck-device-cache watchdog (AUDIT-2026-08-01) ──────────────────────────
// Detects a recurrence of the exact bug this audit fixed, automatically,
// instead of requiring another multi-hour manual investigation next time.
//
// The one reliable, low-false-positive signal we have: Spotify saying the
// device is PAUSED while CamillaDSP is simultaneously capturing real audio
// signal. A genuine pause produces silence; it can't produce this
// combination. (Position/track staleness alone isn't safe to alarm on — a
// user legitimately pausing and stepping away for a while looks identical.)
const STALE_CHECK_INTERVAL_MS = 45_000;
const AUDIBLE_SIGNAL_DB = -50; // above this = "CamillaDSP is capturing something", not silence
let lastStaleWarningAt = 0;

setInterval(async () => {
  try {
    const source = await getSetting('active_source').catch(() => null);
    if (source !== 'spotify' && source !== 'dj') return; // Spotify audio isn't expected right now
    const standby = await getSetting('standby').catch(() => null);
    if (standby === 'true') return;

    const token = await getValidAccessToken();
    if (!token) return;
    const r = await fetch('https://api.spotify.com/v1/me/player', { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return;
    const j = await r.json();
    if (j.device?.name !== LIBRESPOT_DEVICE_NAME || j.is_playing !== false) return;

    const msg = await sendCamillaCommand('GetCaptureSignalPeak').catch(() => null);
    const peak = msg?.GetCaptureSignalPeak?.value;
    const audible = Array.isArray(peak) && Math.max(peak[0] ?? -99, peak[1] ?? -99) > AUDIBLE_SIGNAL_DB;
    if (!audible) return;

    // Once per 30 min while it persists — enough to be found in logs without spamming them.
    if (Date.now() - lastStaleWarningAt < 30 * 60 * 1000) return;
    lastStaleWarningAt = Date.now();
    console.warn(
      `[Spotify Watchdog] STALE STATE SUSPECTED: Spotify reports "${j.item?.name}" PAUSED on ` +
      `"${LIBRESPOT_DEVICE_NAME}", but CamillaDSP is capturing real audio signal (peak ${Math.max(peak[0], peak[1]).toFixed(1)} dB) ` +
      `— a genuine pause would be silent. This matches the AUDIT-2026-08-01 stuck-device-cache bug: Spotify's own backend ` +
      `permanently freezes its "now playing" cache for a specific device name. Fix: change LIBRESPOT_DEVICE_NAME in this file ` +
      `(and src/lib/spotifyDevice.js) to something NEVER used before, then re-run install.sh or POST /api/spotify/device.`
    );
  } catch { /* transient network/CamillaDSP hiccup — next tick retries */ }
}, STALE_CHECK_INTERVAL_MS);

// ── Crash-loop watchdog (AUDIT-2026-08-03) ──────────────────────────────────
// A different failure mode from the stale-cache watchdog above: an ALSA
// "Broken pipe" (snd_pcm_drain) — e.g. triggered by CamillaDSP reloading its
// config during a resonance-api restart, which briefly drops the ALSA
// loopback device librespot writes into — can crash librespot outright.
// systemd auto-restarts it, but the new process sometimes comes back wedged
// in a WebSocket-dealer reconnect loop that never self-stabilizes (confirmed
// live via journalctl -u raspotify: repeating "Websocket connection failed:
// ... unexpected-eof" / "Wasn't able to reply to dealer request: channel
// closed" every ~6-7s, indefinitely). From the user's side this presents as
// the official Spotify app showing "Resonance HiFi" stuck on "Connecting..."
// forever — it required a manual `sudo systemctl restart raspotify` to clear
// last time. This automates that instead of needing another SSH session.
//
// Signal: our device is completely absent from Spotify's own device list
// for several consecutive checks. A healthy device shows up here even while
// idle/paused (zeroconf advertising + dealer connection both up); a device
// stuck in the reconnect loop drops off it because the dealer never holds
// a session long enough for Spotify's backend to register it as present.
const DEVICE_CHECK_INTERVAL_MS = 40_000;
const MISSES_BEFORE_RESTART = 3; // ~2 min of sustained unreachability
const MAX_AUTO_RESTARTS_PER_HOUR = 3; // give up and wait for a human past this
let consecutiveDeviceMisses = 0;
let autoRestartTimestamps = [];

setInterval(async () => {
  try {
    const standby = await getSetting('standby').catch(() => null);
    if (standby === 'true') { consecutiveDeviceMisses = 0; return; }

    const token = await getValidAccessToken();
    if (!token) { consecutiveDeviceMisses = 0; return; } // not linked — not our problem

    const r = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return; // transient API hiccup, don't count it
    const j = await r.json();
    const present = (j.devices || []).some(d => d.name === LIBRESPOT_DEVICE_NAME);

    if (present) { consecutiveDeviceMisses = 0; return; }
    consecutiveDeviceMisses++;
    if (consecutiveDeviceMisses < MISSES_BEFORE_RESTART) return;
    consecutiveDeviceMisses = 0;

    const now = Date.now();
    autoRestartTimestamps = autoRestartTimestamps.filter(t => now - t < 60 * 60 * 1000);
    if (autoRestartTimestamps.length >= MAX_AUTO_RESTARTS_PER_HOUR) {
      console.error(
        `[Spotify Watchdog] "${LIBRESPOT_DEVICE_NAME}" still unreachable but ${MAX_AUTO_RESTARTS_PER_HOUR} ` +
        `auto-restarts already happened in the last hour — giving up to avoid a restart loop. ` +
        `Needs manual investigation (journalctl -u raspotify).`
      );
      return;
    }

    autoRestartTimestamps.push(now);
    console.warn(
      `[Spotify Watchdog] "${LIBRESPOT_DEVICE_NAME}" unreachable for ~${Math.round(MISSES_BEFORE_RESTART * DEVICE_CHECK_INTERVAL_MS / 1000)}s ` +
      `— auto-restarting raspotify (attempt ${autoRestartTimestamps.length}/${MAX_AUTO_RESTARTS_PER_HOUR} this hour).`
    );
    await restartRaspotify().catch(err => console.error('[Spotify Watchdog] auto-restart failed:', err.message));
  } catch { /* transient network hiccup — next tick retries */ }
}, DEVICE_CHECK_INTERVAL_MS);

export { buildRaspotifyConf, writeRaspotifyConf, restartRaspotify };
export default router;
