import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const router = express.Router();

// POST /api/spotify/credentials -> Configure Spotify Daemon credentials and restart service
router.post('/credentials', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, error: 'Username and password are required' });
  }
  try {
    const configContent = `# Resonance HiFi - Raspotify Configuration
DEVICE_NAME="Resonance Connect"
BITRATE="320"
OPTIONS="--backend alsa --initial-volume 50 --enable-volume-normalisation --username ${username} --password ${password}"
`;
    const escapedContent = configContent.replace(/'/g, "'\\''");
    await execPromise(`echo '${escapedContent}' | sudo tee /etc/default/raspotify`);
    await execPromise('sudo systemctl restart raspotify');
    console.log(`[Resonance Server] Spotify daemon credentials updated for: ${username}`);
    res.json({ success: true, message: 'Spotify daemon credentials updated and service restarted' });
  } catch (err) {
    console.error('[Resonance Server] Failed to update daemon credentials:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
