import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const router = express.Router();

// Writes /etc/raspotify/conf (the path allowed in NOPASSWD sudoers) and restarts.
// Newer raspotify (librespot 0.8+) uses LIBRESPOT_ env vars; no OPTIONS= wrapper.
// Device is forced to camilla_input so librespot writes directly to the ALSA
// loopback instead of trying to open PipeWire's "default" (which fails from
// a system service because PipeWire runs in user space as pi, not root).
function buildConf(username, password) {
  const lines = [
    '# Resonance HiFi',
    'LIBRESPOT_NAME="Resonance Connect"',
    'LIBRESPOT_BITRATE=320',
    'LIBRESPOT_BACKEND=alsa',
    'LIBRESPOT_DEVICE=camilla_input',
    'LIBRESPOT_INITIAL_VOLUME=50',
    'LIBRESPOT_ENABLE_VOLUME_NORMALISATION=true',
  ];
  if (username) lines.push(`LIBRESPOT_USERNAME="${username}"`);
  if (password) lines.push(`LIBRESPOT_PASSWORD="${password}"`);
  return lines.join('\n') + '\n';
}

// POST /api/spotify/credentials -> Configure Spotify Daemon credentials and restart service
router.post('/credentials', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }
  try {
    const conf = buildConf(username, password);
    // sudo tee /etc/raspotify/conf is in NOPASSWD sudoers — safe to call from PM2.
    await execPromise(`printf '%s' ${JSON.stringify(conf)} | sudo tee /etc/raspotify/conf`);
    await execPromise('sudo systemctl restart raspotify');
    console.log(`[Resonance Server] Spotify daemon configured for: ${username}`);
    res.json({ success: true, message: 'Spotify daemon configured and restarted' });
  } catch (err) {
    console.error('[Resonance Server] Failed to configure daemon:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/spotify/device -> Re-apply device config without changing credentials.
// Called after install to ensure camilla_input is always set.
router.post('/device', async (req, res) => {
  try {
    const conf = buildConf();
    await execPromise(`printf '%s' ${JSON.stringify(conf)} | sudo tee /etc/raspotify/conf`);
    await execPromise('sudo systemctl restart raspotify');
    console.log('[Resonance Server] Spotify daemon device config re-applied.');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
