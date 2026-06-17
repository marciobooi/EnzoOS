import { WebSocketServer, WebSocket } from 'ws';
import { spawn } from 'child_process';
import { getValidAccessToken } from './spotify-auth.js';
import { getSetting } from './db.js';
import { setBroadcast, emit, getState } from './event-service.js';

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

    // Send current cached state to the new client
    const { playbackState, sourceState, standbyState } = getState();
    if (playbackState) {
      ws.send(JSON.stringify({ type: 'PLAYBACK_STATE', payload: playbackState }));
    }
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
    let pathname = '';
    try {
      pathname = new URL(request.url, 'http://localhost').pathname;
    } catch (err) {
      pathname = request.url ? request.url.split('?')[0] : '';
    }

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  return { wss, broadcast };
}

// ─── Audio level monitor ──────────────────────────────────────────────────────

let arecordProcess = null;
let arecordRetryCount = 0;
const MAX_RETRY_COUNT = 5;
let arecordRetryTimeout = null;

export function startAudioLevelMonitor() {
  if (arecordProcess) return;
  if (arecordRetryCount >= MAX_RETRY_COUNT) {
    console.warn('[Audio Monitor] Max retry count reached. Monitor disabled.');
    return;
  }

  console.log('[Audio Monitor] Starting arecord loopback level monitor...');

  try {
    arecordProcess = spawn('arecord', [
      '-D', 'loop_dsnoop',
      '-f', 'S16_LE',
      '-c', '2',
      '-r', '44100',
      '-t', 'raw',
      '-q',
    ]);
  } catch (err) {
    console.error('[Audio Monitor] Failed to spawn arecord:', err.message);
    arecordProcess = null;
    scheduleRetry();
    return;
  }

  let bufferAccumulator = Buffer.alloc(0);
  const CHUNK_SIZE = 8820; // 50ms at 44.1kHz stereo 16-bit

  arecordProcess.stdout.on('data', (chunk) => {
    arecordRetryCount = 0;
    bufferAccumulator = Buffer.concat([bufferAccumulator, chunk]);

    while (bufferAccumulator.length >= CHUNK_SIZE) {
      const chunkToProcess = bufferAccumulator.subarray(0, CHUNK_SIZE);
      bufferAccumulator = bufferAccumulator.subarray(CHUNK_SIZE);

      let maxL = 0;
      let maxR = 0;
      for (let i = 0; i < chunkToProcess.length; i += 4) {
        if (i + 3 >= chunkToProcess.length) break;
        const absL = Math.abs(chunkToProcess.readInt16LE(i));
        const absR = Math.abs(chunkToProcess.readInt16LE(i + 2));
        if (absL > maxL) maxL = absL;
        if (absR > maxR) maxR = absR;
      }

      const calcDb = (val) => {
        if (val <= 0) return -45.0;
        return Math.max(-45.0, Math.round(20 * Math.log10(val / 32767.0) * 10) / 10);
      };

      emit('AUDIO_LEVELS', { dbL: calcDb(maxL), dbR: calcDb(maxR) });
    }
  });

  arecordProcess.on('error', (err) => {
    console.error('[Audio Monitor] arecord process error:', err.message);
  });

  arecordProcess.on('exit', (code) => {
    console.log(`[Audio Monitor] arecord process exited with code ${code}`);
    arecordProcess = null;
    // Lazily check standby state to avoid reading stale closure value
    import('./event-service.js').then(({ getStandbyState }) => {
      if (!getStandbyState()) scheduleRetry();
    });
  });
}

function scheduleRetry() {
  if (arecordRetryTimeout) clearTimeout(arecordRetryTimeout);
  arecordRetryCount++;
  console.log(`[Audio Monitor] Scheduling retry ${arecordRetryCount}/${MAX_RETRY_COUNT} in 15 seconds...`);
  arecordRetryTimeout = setTimeout(() => startAudioLevelMonitor(), 15000);
}

export function stopAudioLevelMonitor() {
  if (arecordRetryTimeout) {
    clearTimeout(arecordRetryTimeout);
    arecordRetryTimeout = null;
  }
  arecordRetryCount = 0;
  if (arecordProcess) {
    console.log('[Audio Monitor] Stopping arecord loopback level monitor...');
    arecordProcess.kill('SIGTERM');
    arecordProcess = null;
  }
}
