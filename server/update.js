import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const router = express.Router();

// GET /api/system/update/status -> Check git commit difference
router.get('/status', async (req, res) => {
  try {
    // Run git fetch to update tracking branches
    await execPromise('git fetch origin main');
    
    // Get local and remote hashes
    const { stdout: localHash } = await execPromise('git rev-parse HEAD');
    const { stdout: remoteHash } = await execPromise('git rev-parse origin/main');
    
    const local = localHash.trim();
    const remote = remoteHash.trim();
    
    res.json({
      success: true,
      updateAvailable: local !== remote,
      localCommit: local.substring(0, 7),
      remoteCommit: remote.substring(0, 7)
    });
  } catch (err) {
    console.error('[Resonance Server] Failed checking git update status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/system/update -> Trigger update bash script
router.post('/', (req, res) => {
  console.log('[Resonance Server] Initiating OTA Update...');
  
  // Execute update.sh disowned / asynchronously
  exec('bash scripts/update.sh', (err, stdout, stderr) => {
    if (err) {
      console.error('[Resonance Server] OTA Update failed:', err);
      console.error('Stdout:', stdout);
      console.error('Stderr:', stderr);
      return;
    }
    console.log('[Resonance Server] OTA Update script executed successfully:');
    console.log(stdout);
  });
  
  res.json({
    success: true,
    message: 'OTA Update process started. The server will pull changes, compile and restart.'
  });
});

export default router;
