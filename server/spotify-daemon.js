import express from 'express';
import { execFile } from 'child_process';
import { setSetting } from './db.js';

const router = express.Router();

// Builds the managed /etc/raspotify/conf content. Exported separately so the
// startup path can compare it against the last-applied copy (stored in the
// settings DB — the file itself is root-only readable) and skip the restart
// when nothing changed, keeping the Spotify Connect session alive.
// Password auth is deprecated in librespot 0.8 — zeroconf handles it.
function buildRaspotifyConf(extraLines = []) {
  const lines = [
      '# Resonance HiFi — managed by resonance-api, do not edit manually',
      'LIBRESPOT_NAME="Resonance Connect"',
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

export { buildRaspotifyConf, writeRaspotifyConf, restartRaspotify };
export default router;
