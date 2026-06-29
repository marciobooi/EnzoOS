import express from 'express';
import { rateLimit } from 'express-rate-limit';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { clearSettingsExcept, getSetting, setSetting } from './db.js';
import { sendError, badRequest, notFound } from './lib/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const execPromise = promisify(exec);
// execFileP runs a binary with an explicit argv array and NO shell, so user
// input (SSID, password, service name) can never be interpreted as shell.
const execFileP = promisify(execFile);
const router = express.Router();

const ALLOWED_SERVICES = ['mpd', 'camilladsp', 'raspotify'];

// Tight limiter for destructive / privileged actions (reboot, shutdown, factory
// reset, service restart, Wi-Fi connect) — these are one-shot user actions, so a
// low cap stops abuse without affecting the read-only status/storage polling.
const sensitiveLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

// ── Onboarding (first-boot welcome wizard) ────────────────────────────────────
// Persisted so the wizard only shows once. Unset (fresh install / factory reset)
// reads as not complete → wizard shows. POST { complete:false } re-arms it so a
// "Run setup again" button can re-display the wizard.
router.get('/onboarding', async (req, res) => {
  const v = await getSetting('onboarding_complete').catch(() => null);
  res.json({ complete: v === 'true' });
});

router.post('/onboarding', async (req, res) => {
  const complete = !(req.body.complete === false || req.body.complete === 'false');
  try {
    await setSetting('onboarding_complete', complete ? 'true' : 'false');
    res.json({ success: true, complete });
  } catch (err) { sendError(res, err); }
});

// ── Language / locale ─────────────────────────────────────────────────────────
// Persisted so the UI language survives a restart and is shared across the kiosk
// and every phone remote. Defaults to English when unset.
const SUPPORTED_LANGS = ['en', 'pt'];

router.get('/language', async (req, res) => {
  const v = await getSetting('language').catch(() => null);
  res.json({ language: SUPPORTED_LANGS.includes(v) ? v : 'en' });
});

router.post('/language', async (req, res) => {
  const language = String(req.body?.language || '').toLowerCase();
  if (!SUPPORTED_LANGS.includes(language)) {
    return sendError(res, badRequest('Unsupported language'));
  }
  try {
    await setSetting('language', language);
    res.json({ success: true, language });
  } catch (err) { sendError(res, err); }
});

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
router.post('/service/:name/restart', sensitiveLimiter, async (req, res) => {
  const { name } = req.params;
  if (!ALLOWED_SERVICES.includes(name)) {
    return sendError(res, badRequest('Service not allowed'));
  }
  try {
    await execFileP('sudo', ['systemctl', 'restart', name]);
    res.json({ success: true });
  } catch (err) {
    sendError(res, err);
  }
});

// POST /api/system/reboot
router.post('/reboot', sensitiveLimiter, (req, res) => {
  res.json({ success: true, message: 'Rebooting...' });
  setTimeout(() => execFileP('sudo', ['systemctl', 'reboot']).catch(() => {}), 1500);
});

// POST /api/system/shutdown
router.post('/shutdown', sensitiveLimiter, (req, res) => {
  res.json({ success: true, message: 'Shutting down...' });
  setTimeout(() => execFileP('sudo', ['systemctl', 'poweroff']).catch(() => {}), 1500);
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
  } catch (err) { sendError(res, err); }
});

// ── Wi-Fi configuration (#21) ─────────────────────────────────────────────────
router.get('/wifi', async (req, res) => {
  try {
    // Read-only — no privileges needed.
    const { stdout } = await execFileP('nmcli', ['-t', '-f', 'NAME,ACTIVE', 'connection', 'show', '--active']);
    const lines = stdout.trim().split('\n').filter(Boolean);
    const active = lines.map(l => { const [name, act] = l.split(':'); return { name, active: act === 'yes' }; });
    res.json({ connections: active });
  } catch (err) { res.json({ connections: [], error: err.message }); }
});

router.get('/wifi/scan', async (req, res) => {
  try {
    // rescan needs root; the list read does not.
    await execFileP('sudo', ['nmcli', 'device', 'wifi', 'rescan']).catch(() => {});
    const { stdout } = await execFileP('nmcli', ['-t', '-f', 'SSID,SIGNAL,SECURITY', 'device', 'wifi', 'list']);
    const networks = stdout.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(':');
      return { ssid: parts[0] || '', signal: parseInt(parts[1], 10) || 0, security: parts[2] || '' };
    }).filter(n => n.ssid);
    res.json({ networks });
  } catch (err) { sendError(res, err); }
});

router.post('/wifi/connect', sensitiveLimiter, async (req, res) => {
  const { ssid, password } = req.body || {};
  if (!ssid) return sendError(res, badRequest('ssid required'));
  try {
    // Argv array (no shell) — ssid/password are passed verbatim, never parsed
    // by a shell, so a value like `$(reboot)` is just text. Needs root → sudo.
    const args = ['nmcli', 'device', 'wifi', 'connect', ssid];
    if (password) args.push('password', password);
    await execFileP('sudo', args);
    res.json({ success: true });
  } catch (err) { sendError(res, err); }
});

// ── Backup / Restore (#19) ────────────────────────────────────────────────────
const DB_PATH = path.resolve(__dirname, '../resonance.db');

router.get('/backup', async (req, res) => {
  try {
    if (!fs.existsSync(DB_PATH)) return sendError(res, notFound('Database not found'));
    const filename = `resonance-backup-${new Date().toISOString().slice(0, 10)}.db`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(DB_PATH).pipe(res);
  } catch (err) { sendError(res, err); }
});

router.post('/restore', async (req, res) => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', async () => {
    try {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return sendError(res, badRequest('Empty file'));
      if (!buf.slice(0, 16).toString('ascii').startsWith('SQLite format 3')) {
        return sendError(res, badRequest('Not a valid SQLite database'));
      }
      const backupPath = DB_PATH + '.bak';
      fs.copyFileSync(DB_PATH, backupPath);
      fs.writeFileSync(DB_PATH, buf);
      res.json({ success: true, message: 'Database restored. Restart the server to apply.' });
    } catch (err) { sendError(res, err); }
  });
});

// ── Factory Reset (#20) ───────────────────────────────────────────────────────
// Wipe ALL settings — DSP, EQ, sources, streaming sessions, theme, volume — so
// new settings are covered automatically. Only the remote-access credentials are
// preserved, so the user driving the reset from the remote isn't locked out.
const FACTORY_RESET_PROTECTED = ['auth_secret', 'remote_access_enabled'];

router.post('/factory-reset', sensitiveLimiter, async (req, res) => {
  try {
    await clearSettingsExcept(FACTORY_RESET_PROTECTED);
    res.json({ success: true, message: 'Settings reset to factory defaults. Restart to apply.' });
  } catch (err) { sendError(res, err); }
});

export default router;
