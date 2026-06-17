import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';

const execPromise = promisify(exec);
const router = express.Router();

const ALLOWED_SERVICES = ['mpd', 'camilladsp', 'raspotify'];

// GET /api/system/lan-url — returns the LAN-accessible remote URL for QR code generation
router.get('/lan-url', (req, res) => {
  const port = process.env.PORT || 5000;
  const ifaces = os.networkInterfaces();
  const lanIp = Object.values(ifaces)
    .flat()
    .find(i => i.family === 'IPv4' && !i.internal)?.address || 'localhost';
  res.json({ url: `http://${lanIp}:${port}/remote`, ip: lanIp, port });
});

// GET /api/system/services — status of all audio services
router.get('/services', async (req, res) => {
  const results = {};
  await Promise.all(ALLOWED_SERVICES.map(async svc => {
    try {
      const { stdout } = await execPromise(`systemctl is-active ${svc}`);
      results[svc] = stdout.trim();
    } catch (err) {
      results[svc] = (err.stdout || 'inactive').trim();
    }
  }));
  res.json({ success: true, services: results });
});

// POST /api/system/service/:name/restart
router.post('/service/:name/restart', async (req, res) => {
  const { name } = req.params;
  if (!ALLOWED_SERVICES.includes(name)) {
    return res.status(400).json({ error: 'Service not allowed' });
  }
  try {
    await execPromise(`sudo systemctl restart ${name}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/system/reboot
router.post('/reboot', (req, res) => {
  res.json({ success: true, message: 'Rebooting...' });
  setTimeout(() => execPromise('sudo systemctl reboot').catch(() => {}), 1500);
});

// POST /api/system/shutdown
router.post('/shutdown', (req, res) => {
  res.json({ success: true, message: 'Shutting down...' });
  setTimeout(() => execPromise('sudo systemctl poweroff').catch(() => {}), 1500);
});

export default router;
