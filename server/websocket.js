import { WebSocketServer, WebSocket } from 'ws';
import { getValidAccessToken } from './spotify-auth.js';
import { getSetting } from './db.js';
import { setBroadcast, emit, getState } from './event-service.js';
import { isWsAuthorized } from './auth.js';
import { sendCamillaCommand } from './camilla-ws.js';

function safeParse(jsonStr, label) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    console.warn(`[Resonance WS] Corrupted DB value for "${label}", skipping:`, e.message);
    return null;
  }
}

export function setupWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true });

  const broadcast = (data, excludeWs = null) => {
    const message = JSON.stringify(data);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
        client.send(message);
      }
    });
  };

  // Register broadcast function with the EventService
  setBroadcast(broadcast);

  wss.on('connection', async (ws) => {
    console.log('[Resonance WS] Client connected. Active clients:', wss.clients.size);

    // Always send PLAYBACK_STATE (even null) so reconnecting clients always clear stale state
    const { playbackState, sourceState, standbyState } = getState();
    ws.send(JSON.stringify({ type: 'PLAYBACK_STATE', payload: playbackState }));
    ws.send(JSON.stringify({ type: 'SET_SOURCE', payload: sourceState }));
    ws.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: standbyState } }));

    const eqSettings = await getSetting('eq_settings');
    const eqParsed = eqSettings ? safeParse(eqSettings, 'eq_settings') : null;
    if (eqParsed) ws.send(JSON.stringify({ type: 'EQ_SETTINGS', payload: eqParsed }));

    const dspCalibration = await getSetting('dsp_calibration');
    const dspParsed = dspCalibration ? safeParse(dspCalibration, 'dsp_calibration') : null;
    if (dspParsed) ws.send(JSON.stringify({ type: 'DSP_CALIBRATION', payload: dspParsed }));

    const themeSettings = await getSetting('theme_settings');
    const themeParsed = themeSettings ? safeParse(themeSettings, 'theme_settings') : null;
    if (themeParsed) ws.send(JSON.stringify({ type: 'THEME_SETTINGS', payload: themeParsed }));

    const remoteAccess = await getSetting('remote_access_enabled');
    ws.send(JSON.stringify({ type: 'SET_REMOTE_ACCESS', payload: { enabled: remoteAccess === 'true' } }));

    const serverToken = await getValidAccessToken();
    if (serverToken) {
      ws.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token: serverToken } }));
    }

    // All messages routed through EventService — no ad-hoc state mutations here
    ws.on('message', async (messageStr) => {
      let type;
      try {
        const parsed = JSON.parse(messageStr);
        type = parsed.type;
        await emit(type, parsed.payload, ws);
      } catch (err) {
        if (type) {
          console.error(`[Resonance WS] Failed handling message type "${type}":`, err);
        } else {
          console.error('[Resonance WS] Failed parsing client message:', err);
        }
      }
    });

    ws.on('close', () => {
      console.log('[Resonance WS] Client disconnected. Active clients:', wss.clients.size);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    let pathname;
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (err) {
      pathname = request.url ? request.url.split('?')[0] : '';
    }

    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    // Loopback (kiosk) is trusted; LAN clients must present a valid token.
    isWsAuthorized(request).then((ok) => {
      if (!ok) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }).catch(() => socket.destroy());
  });

  return { wss, broadcast };
}

// ─── Audio level monitor ──────────────────────────────────────────────────────
// Polls CamillaDSP's own GetCaptureSignalPeak instead of running a permanent
// `arecord` process on loop_dsnoop: CamillaDSP already computes this, so this
// removes a whole ALSA client reading ~384 KB/s of raw PCM in Node. It also
// removes the one thing pinning the shared dsnoop device to a fixed 48 kHz —
// arecord's `-r 48000` locked that rate for every other reader too (dsnoop's
// slave params are fixed by whichever client opens it first), which was the
// last blocker for bit-perfect rate-following actually working.

let levelPollInterval = null;
const POLL_INTERVAL_MS = 100;
const SILENCE_FLOOR_DB = -45.0;

export function startAudioLevelMonitor() {
  if (levelPollInterval) return;
  console.log('[Audio Monitor] Starting CamillaDSP-based VU meter (GetCaptureSignalPeak poll)...');

  levelPollInterval = setInterval(async () => {
    try {
      const msg = await sendCamillaCommand('GetCaptureSignalPeak');
      const value = msg.GetCaptureSignalPeak?.value;
      if (!Array.isArray(value)) return;
      const clamp = (db) => Math.max(SILENCE_FLOOR_DB, Math.round((db ?? SILENCE_FLOOR_DB) * 10) / 10);
      emit('AUDIO_LEVELS', { dbL: clamp(value[0]), dbR: clamp(value[1]) });
    } catch {
      // CamillaDSP WS not connected right now — next tick retries; no
      // separate retry/backoff bookkeeping needed since camilla-ws.js
      // already handles reconnection.
    }
  }, POLL_INTERVAL_MS);
}

export function stopAudioLevelMonitor() {
  if (levelPollInterval) {
    clearInterval(levelPollInterval);
    levelPollInterval = null;
    console.log('[Audio Monitor] Stopped CamillaDSP VU meter poll.');
  }
}
