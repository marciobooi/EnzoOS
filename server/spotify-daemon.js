import express from 'express';
import { execFile } from 'child_process';

const router = express.Router();

// Writes /etc/raspotify/conf using sudo tee (NOPASSWD in sudoers).
// Uses execFile + stdin pipe to avoid any shell escaping issues.
// Password auth is deprecated in librespot 0.8 — zeroconf handles it.
function writeRaspotifyConf(extraLines = []) {
  return new Promise((resolve, reject) => {
    const lines = [
      '# Resonance HiFi — managed by resonance-api, do not edit manually',
      'LIBRESPOT_NAME="Resonance Connect"',
      'LIBRESPOT_BITRATE=320',
      'LIBRESPOT_BACKEND=alsa',
      'LIBRESPOT_DEVICE=camilla_input',
      // Start at full volume — server pins Spotify device to 100% anyway,
      // so starting at 50 (the default) causes a brief audible dip on first play.
      'LIBRESPOT_INITIAL_VOLUME=100',
      // Softvol mixer: volume changes come from the Spotify app and are
      // immediately overridden to 100% by the server — CamillaDSP owns gain.
      'LIBRESPOT_MIXER=softvol',
      'LIBRESPOT_VOLUME_CTRL=log',
      'LIBRESPOT_ENABLE_VOLUME_NORMALISATION=true',
      'LIBRESPOT_FORMAT=S16',
      ...extraLines,
    ];
    const conf = lines.join('\n') + '\n';

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
    console.log('[Resonance Server] Spotify daemon device config re-applied.');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { writeRaspotifyConf, restartRaspotify };
export default router;
