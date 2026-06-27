import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting, setSetting } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

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

// ── Storage stats (#22) ───────────────────────────────────────────────────────
router.get('/storage', async (req, res) => {
  try {
    const { stdout: dfOut } = await execPromise("df -BM / --output=size,used,avail | tail -1");
    const [sizeS, usedS, availS] = dfOut.trim().split(/\s+/);
    const parse = s => parseInt(s, 10) || 0;
    const size = parse(sizeS); const used = parse(usedS); const avail = parse(availS);

    let musicFiles = 0; let musicSize = 0;
    const musicDir = process.env.MUSIC_DIR || '/home/pi/Music';
    try {
      const { stdout: duOut } = await execPromise(`find ${musicDir} -type f \\( -name "*.flac" -o -name "*.mp3" -o -name "*.wav" -o -name "*.aac" -o -name "*.ogg" \\) | wc -l`);
      musicFiles = parseInt(duOut.trim(), 10) || 0;
      const { stdout: duSz } = await execPromise(`du -sBM ${musicDir} 2>/dev/null | cut -f1`);
      musicSize = parseInt(duSz.trim(), 10) || 0;
    } catch {}

    res.json({ rootMb: { size, used, avail, pct: size ? Math.round((used / size) * 100) : 0 }, musicFiles, musicSizeMb: musicSize });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Wi-Fi configuration (#21) ─────────────────────────────────────────────────
router.get('/wifi', async (req, res) => {
  try {
    const { stdout } = await execPromise('nmcli -t -f NAME,ACTIVE connection show --active');
    const lines = stdout.trim().split('\n').filter(Boolean);
    const active = lines.map(l => { const [name, act] = l.split(':'); return { name, active: act === 'yes' }; });
    res.json({ connections: active });
  } catch (err) { res.json({ connections: [], error: err.message }); }
});

router.get('/wifi/scan', async (req, res) => {
  try {
    await execPromise('nmcli device wifi rescan').catch(() => {});
    const { stdout } = await execPromise('nmcli -t -f SSID,SIGNAL,SECURITY device wifi list');
    const networks = stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(':');
      return { ssid: parts[0] || '', signal: parseInt(parts[1], 10) || 0, security: parts[2] || '' };
    }).filter(n => n.ssid);
    res.json({ networks });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/wifi/connect', async (req, res) => {
  const { ssid, password } = req.body || {};
  if (!ssid) return res.status(400).json({ error: 'ssid required' });
  try {
    if (password) {
      await execPromise(`nmcli device wifi connect ${JSON.stringify(ssid)} password ${JSON.stringify(password)}`);
    } else {
      await execPromise(`nmcli device wifi connect ${JSON.stringify(ssid)}`);
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Backup / Restore (#19) ────────────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, '../resonance.db');

router.get('/backup', async (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) return res.status(404).json({ error: 'Database not found' });
    const filename = `resonance-backup-${new Date().toISOString().slice(0, 10)}.db`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(DB_PATH).pipe(res);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/restore', async (req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return res.status(400).json({ error: 'Empty file' });
      if (!buf.slice(0, 16).toString('ascii').startsWith('SQLite format 3')) {
        return res.status(400).json({ error: 'Not a valid SQLite database' });
      }
      const backupPath = DB_PATH + '.bak';
      fs.copyFileSync(DB_PATH, backupPath);
      fs.writeFileSync(DB_PATH, buf);
      res.json({ success: true, message: 'Database restored. Restart the server to apply.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
});

// ── Factory Reset (#20) ───────────────────────────────────────────────────────
const FACTORY_RESET_KEYS = [
  'dsp_calibration', 'eq_settings', 'balance', 'phase',
  'replaygain_mode', 'crossfade_seconds',
  'tidal_session', 'qobuz_username', 'qobuz_password', 'qobuz_token',
  'active_source', 'last_radio_url', 'last_radio_name', 'last_radio_favicon',
];

router.post('/factory-reset', async (req, res) => {
  try {
    await Promise.all(FACTORY_RESET_KEYS.map(k => setSetting(k, '')));
    res.json({ success: true, message: 'Settings reset to factory defaults.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
