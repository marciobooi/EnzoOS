/**
 * FIR (convolution) filter import — Phase 3 of the DSP-refinements work.
 * CamillaDSP already supports a Conv filter type natively; this project's
 * config generator (camilla-config.js) simply never wired it up before now.
 *
 * No multer/multipart anywhere in this codebase — reuses the one existing
 * raw-body-upload precedent, server/system.js's `/api/system/restore`
 * (stream via req.on('data'/'end') with a byte cap), rather than adding a
 * new dependency for a single upload route.
 *
 * CRITICAL, confirmed via CamillaDSP's own docs: hot-reloading via SetConfig
 * only picks up new FIR coefficients when the *filename itself* changes —
 * overwriting the same path while CamillaDSP is running does NOT reload it.
 * Every upload therefore gets a fresh timestamped filename, with the
 * previous one deleted, mirroring dj.js's own orphaned-clip cleanup pattern.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSetting, setSetting } from './db.js';
import { sendError, badRequest } from './lib/errors.js';
import { updateCamillaConfigFromSettings } from './camilla-config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIR_DIR = path.resolve(__dirname, '../data/fir-filters');
fs.mkdirSync(FIR_DIR, { recursive: true });

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB
// ~1.4s at 48kHz — a conservative starting ceiling for Pi 4 CPU budget,
// flagged as needing real GetProcessingLoad measurement once hardware is in
// regular use with a real measured filter, not tuned analytically here.
const MAX_TAPS = 65536;

const router = express.Router();

// Minimal WAV header parser — just enough to read fmt/data chunk info, not a
// general-purpose WAV library. Scans chunks from offset 12 (past "RIFF"
// size "WAVE") until both "fmt " and "data" are found or the buffer ends.
// Chunks are word-aligned: an odd-sized chunk has one padding byte after it.
function parseWavHeader(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    return null;
  }
  let offset = 12;
  let fmt = null;
  let dataBytes = null;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const bodyStart = offset + 8;
    if (chunkId === 'fmt ') {
      fmt = {
        numChannels: buf.readUInt16LE(bodyStart + 2),
        sampleRate: buf.readUInt32LE(bodyStart + 4),
        bitsPerSample: buf.readUInt16LE(bodyStart + 14),
      };
    } else if (chunkId === 'data') {
      dataBytes = chunkSize;
    }
    if (fmt && dataBytes != null) break;
    offset = bodyStart + chunkSize + (chunkSize % 2);
  }
  if (!fmt || dataBytes == null || !fmt.numChannels || !fmt.bitsPerSample) return null;
  const bytesPerSample = fmt.bitsPerSample / 8;
  const tapCount = Math.floor(dataBytes / bytesPerSample / fmt.numChannels);
  return { ...fmt, tapCount };
}

async function getFirState() {
  const [enabledVal, filterPath, filterName, metaVal] = await Promise.all([
    getSetting('fir_enabled'),
    getSetting('fir_filter_path'),
    getSetting('fir_filter_name'),
    getSetting('fir_filter_meta'),
  ]);
  let meta;
  try { meta = metaVal ? JSON.parse(metaVal) : null; } catch { meta = null; }
  return {
    enabled: enabledVal === 'true',
    name: filterName || null,
    path: filterPath || null,
    ...(meta || {}),
  };
}

router.get('/dsp/fir-filter', async (req, res) => {
  const { path: _p, ...state } = await getFirState();
  res.json(state);
});

router.post('/dsp/fir-filter', async (req, res) => {
  let displayName = 'Custom Filter';
  try { displayName = decodeURIComponent((req.headers['x-filter-name'] || '').toString()) || 'Custom Filter'; } catch { /* keep default on bad encoding */ }
  displayName = displayName.slice(0, 200);
  const chunks = [];
  let received = 0;
  let rejected = false;

  req.on('data', (c) => {
    if (rejected) return;
    received += c.length;
    if (received > MAX_UPLOAD_BYTES) {
      rejected = true;
      sendError(res, badRequest(`File too large (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB)`));
      req.destroy();
      return;
    }
    chunks.push(c);
  });

  req.on('end', async () => {
    if (rejected) return;
    try {
      const buf = Buffer.concat(chunks);
      if (!buf.length) return sendError(res, badRequest('Empty file'));
      const wav = parseWavHeader(buf);
      if (!wav) return sendError(res, badRequest('Not a valid WAV file'));
      if (wav.tapCount > MAX_TAPS) {
        return sendError(res, badRequest(`Filter too long: ${wav.tapCount} taps (max ${MAX_TAPS} — roughly 1.4s at 48kHz)`));
      }

      // New timestamped filename every time — see module docstring for why
      // reusing the same path would silently fail to hot-reload.
      const filename = `fir-${Date.now()}.wav`;
      const filePath = path.join(FIR_DIR, filename);
      await fs.promises.writeFile(filePath, buf);

      const prevPath = await getSetting('fir_filter_path');
      if (prevPath && prevPath !== filePath) {
        fs.unlink(prevPath, () => {});
      }

      const meta = { tapCount: wav.tapCount, sampleRate: wav.sampleRate, channels: wav.numChannels, uploadedAt: Date.now() };
      await Promise.all([
        setSetting('fir_enabled', 'true'),
        setSetting('fir_filter_path', filePath),
        setSetting('fir_filter_name', displayName),
        setSetting('fir_filter_meta', JSON.stringify(meta)),
      ]);

      await updateCamillaConfigFromSettings({ skipAlsa: true });
      const { path: _p, ...state } = await getFirState();
      res.json(state);
    } catch (err) {
      sendError(res, err);
    }
  });
});

router.post('/dsp/fir-filter/toggle', async (req, res) => {
  const { enabled } = req.body || {};
  try {
    const filterPath = await getSetting('fir_filter_path');
    if (enabled && !filterPath) return sendError(res, badRequest('No filter uploaded yet'));
    await setSetting('fir_enabled', enabled ? 'true' : 'false');
    await updateCamillaConfigFromSettings({ skipAlsa: true });
    const { path: _p, ...state } = await getFirState();
    res.json(state);
  } catch (err) {
    sendError(res, err);
  }
});

router.delete('/dsp/fir-filter', async (req, res) => {
  try {
    const filterPath = await getSetting('fir_filter_path');
    if (filterPath) fs.unlink(filterPath, () => {});
    await Promise.all([
      setSetting('fir_enabled', 'false'),
      setSetting('fir_filter_path', ''),
      setSetting('fir_filter_name', ''),
      setSetting('fir_filter_meta', ''),
    ]);
    await updateCamillaConfigFromSettings({ skipAlsa: true });
    res.json({ enabled: false, name: null });
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
