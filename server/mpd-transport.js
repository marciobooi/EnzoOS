/**
 * Digital Transport — Phase 4 of the DSP-refinements work, design-only (no
 * S/PDIF/AES/I2S hardware available to test against as of this writing; see
 * the Phase 4 verification notes for exactly what could and couldn't be
 * exercised live).
 *
 * Generalizes the existing DSD Native Bypass mechanism (this file's sibling
 * logic in player.js: applyDsdRouting()/mpcEnableOnly()/getMpdOutputs()) —
 * confirmed live to already be format-agnostic plumbing, a second named MPD
 * audio_output pointed straight at a hw:CARD=... device, toggled via `mpc
 * enable/disable` with no playback interruption. A card presenting S/PDIF/
 * AES/I2S output is, from ALSA's point of view, an ordinary hw:CARD=X PCM
 * device (the interface electrical/protocol difference is handled by the
 * kernel driver, invisible to userspace clients like MPD) — so no new
 * low-level ALSA/kernel work is needed, only this UX/config layer letting
 * the user point a new named output at an arbitrary card at runtime.
 *
 * Explicit scope boundary: applies ONLY to MPD-driven sources (local/radio/
 * Tidal/Qobuz). Spotify/AirPlay/UPnP/Bluetooth never touch MPD's output
 * selection and always stay on the normal PipeWire/CamillaDSP path
 * regardless of this setting — not an oversight, a documented limitation of
 * what MPD's own output-switching mechanism can reach.
 */
import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { getSetting, setSetting } from './db.js';
import { sendError, badRequest } from './lib/errors.js';
import { detectDac } from './camilla-config.js';
import { getMpdOutputs, mpcEnableOnly } from './player.js';
import { emit } from './event-service.js';

const execPromise = promisify(exec);
const router = express.Router();

const INCLUDE_LINE = 'include_optional        "/etc/mpd-digital-transport.conf"';
const TRANSPORT_CONF_PATH = '/etc/mpd-digital-transport.conf';
const MPD_CONF_PATH = '/etc/mpd.conf';
export const TRANSPORT_OUTPUT_NAME = 'Digital Transport';
const PCM_OUTPUT_NAME = 'CamillaDSP Input';

/**
 * Idempotently patches /etc/mpd.conf to include the digital-transport config
 * on already-installed boxes — install.sh only runs once, so a box installed
 * before this feature shipped needs this at server startup instead. Same
 * read-compare-tee-full-content pattern as camilla-config.js's
 * ensureAsoundConf() (a plain sudo append (`tee -a`) would need its own
 * separate sudoers grant shape; rewriting the whole file matches what's
 * already granted for /etc/mpd.conf).
 */
export async function ensureDigitalTransportInclude() {
  let current;
  try { current = fs.readFileSync(MPD_CONF_PATH, 'utf8'); } catch (err) {
    console.warn('[Digital Transport] Could not read /etc/mpd.conf (non-fatal):', err.message);
    return;
  }
  if (current.includes(INCLUDE_LINE) || current.includes('mpd-digital-transport.conf')) return;

  const updated = `${current.trimEnd()}\n\n${INCLUDE_LINE}\n`;
  const tempPath = path.join('/tmp', `mpd-conf-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tempPath, updated, 'utf8');
    await execPromise(`sudo /usr/bin/tee ${MPD_CONF_PATH} < ${tempPath} > /dev/null`);
    console.log('[Digital Transport] Patched /etc/mpd.conf with include_optional line.');
  } catch (err) {
    console.warn('[Digital Transport] Failed to patch /etc/mpd.conf (check sudoers):', err.message);
  } finally {
    try { fs.unlinkSync(tempPath); } catch { /* already gone */ }
  }
}

function buildTransportConf(device) {
  return [
    'audio_output {',
    '    type            "alsa"',
    `    name            "${TRANSPORT_OUTPUT_NAME}"`,
    `    device          "${device}"`,
    '    mixer_type      "none"',
    '    enabled         "no"',
    '}',
    '',
  ].join('\n');
}

/**
 * (Re)writes the Digital Transport output's target device and restarts MPD
 * — adding/changing a NAMED output (unlike toggling one on/off) needs a
 * restart, MPD doesn't pick up a new/changed audio_output block at runtime.
 * Mirrors the forceRestart rationale already documented for Bluetooth-output
 * switching in camilla-config.js.
 */
export async function writeDigitalTransportConf(device) {
  const content = buildTransportConf(device);
  const tempPath = path.join('/tmp', `mpd-transport-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(tempPath, content, 'utf8');
    await execPromise(`sudo /usr/bin/tee ${TRANSPORT_CONF_PATH} < ${tempPath} > /dev/null`);
    await execPromise('sudo systemctl restart mpd');
    // MPD needs a moment to come back up before its socket accepts commands.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        await execPromise('mpc version');
        // `mpc outputs` reports id/name/enabled only, no device string — the
        // GET route needs the configured device back for the UI's checkmark,
        // so it's persisted here as its own setting rather than re-parsed
        // out of the conf file on every read.
        await setSetting('digital_transport_device', device);
        return true;
      }
      catch { await new Promise(r => setTimeout(r, 1000)); }
    }
    console.warn('[Digital Transport] MPD did not come back up after restart within 10s.');
    return false;
  } catch (err) {
    console.warn('[Digital Transport] Failed to write transport config (check sudoers):', err.message);
    return false;
  } finally {
    try { fs.unlinkSync(tempPath); } catch { /* already gone */ }
  }
}

/**
 * Pure on/off — no restart needed, `mpc enable/disable` on an already-
 * defined output takes effect immediately without interrupting playback.
 * Fails safe: if the target output doesn't come up enabled after asking
 * (card missing, failed to open), falls back to the normal CamillaDSP path
 * and surfaces a clear error rather than leaving MPD silently outputting
 * nowhere.
 */
export async function setDigitalTransportEnabled(enabled) {
  if (!enabled) {
    await mpcEnableOnly(PCM_OUTPUT_NAME);
    await setSetting('digital_transport_enabled', 'false');
    return { ok: true };
  }

  const outs = await getMpdOutputs();
  if (!outs.some(o => o.name === TRANSPORT_OUTPUT_NAME)) {
    return { ok: false, error: 'Digital Transport output is not configured yet — pick a card first.' };
  }
  const switched = await mpcEnableOnly(TRANSPORT_OUTPUT_NAME);
  const after = await getMpdOutputs();
  const target = after.find(o => o.name === TRANSPORT_OUTPUT_NAME);
  if (!switched || !target?.enabled) {
    // Degrade safely — same pattern as applyDsdRouting()'s own fallback.
    await mpcEnableOnly(PCM_OUTPUT_NAME);
    await setSetting('digital_transport_enabled', 'false');
    return { ok: false, error: 'Could not enable the selected card — falling back to the normal DSP output.' };
  }
  await setSetting('digital_transport_enabled', 'true');
  return { ok: true };
}

export async function isDigitalTransportEnabled() {
  const val = await getSetting('digital_transport_enabled');
  return val === 'true';
}

/**
 * Every plain ALSA card ALSA/the kernel actually exposes for playback,
 * excluding the loopback (used internally for the shared CamillaDSP bridge,
 * never a valid transport target) — shared enumerator so the client can
 * present a real, current list of cards to point Digital Transport at.
 */
export async function listAudioCards() {
  const dac = detectDac();
  const cards = [];
  try {
    const raw = fs.readFileSync('/proc/asound/cards', 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*\d+\s+\[(\S+)\s*\]:\s*(.+)$/);
      if (!m) continue;
      const [, id, longname] = m;
      if (/loopback/i.test(id) || /loopback/i.test(longname)) continue;
      cards.push({ id, device: `hw:CARD=${id},DEV=0`, cardName: longname.trim() });
    }
  } catch (err) {
    console.warn('[Digital Transport] Could not read /proc/asound/cards:', err.message);
  }
  // The DAC currently in use by the normal DSP path is worth flagging in the
  // UI (picking the SAME card for Digital Transport is a legitimate thing to
  // do — it just means "give me pass-through instead of DSP on this card" —
  // so this is informational, not a filter).
  return cards.map(c => ({ ...c, isCurrentDac: c.device === dac.device }));
}

// ── Routes ────────────────────────────────────────────────────────────────
router.get('/audio-cards', async (req, res) => {
  res.json({ cards: await listAudioCards() });
});

router.get('/digital-transport', async (req, res) => {
  const [enabled, outs, device] = await Promise.all([
    isDigitalTransportEnabled(), getMpdOutputs(), getSetting('digital_transport_device'),
  ]);
  const configured = outs.find(o => o.name === TRANSPORT_OUTPUT_NAME);
  res.json({ enabled, configured: !!configured, device: device || null });
});

router.post('/digital-transport', async (req, res) => {
  const { enabled, device } = req.body || {};
  try {
    if (device) {
      const cards = await listAudioCards();
      if (!cards.some(c => c.device === device)) {
        return sendError(res, badRequest('Unknown card — refresh the card list and try again.'));
      }
      const wrote = await writeDigitalTransportConf(device);
      if (!wrote) return sendError(res, badRequest('Failed to apply the new transport device — check server logs.'));
    }
    if (enabled !== undefined) {
      const result = await setDigitalTransportEnabled(!!enabled);
      if (!result.ok) return sendError(res, badRequest(result.error));
    }
    const [finalEnabled, outs, finalDevice] = await Promise.all([
      isDigitalTransportEnabled(), getMpdOutputs(), getSetting('digital_transport_device'),
    ]);
    const state = { enabled: finalEnabled, configured: outs.some(o => o.name === TRANSPORT_OUTPUT_NAME), device: finalDevice || null };
    emit('ADVANCED_SETTING_CHANGED', { field: 'digitalTransport', value: state });
    res.json(state);
  } catch (err) {
    sendError(res, err);
  }
});

export default router;
