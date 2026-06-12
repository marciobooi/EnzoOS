import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);
const router = express.Router();

// POST /api/player/play -> Play local media
router.post('/play', async (req, res) => {
  try {
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

// POST /api/player/volume -> Set local player volume
router.post('/volume', async (req, res) => {
  const { volume } = req.body;
  try {
    await execPromise(`mpc volume ${volume}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Volume failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/player/seek -> Seek local track
router.post('/seek', async (req, res) => {
  const { position } = req.body;
  try {
    await execPromise(`mpc seek ${position}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[Local Player] Seek failed:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
