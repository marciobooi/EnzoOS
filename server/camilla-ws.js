import { WebSocket } from 'ws';

// Single persistent connection to CamillaDSP's control WebSocket (loopback
// only, ws://localhost:1234), shared by every caller instead of opening a
// fresh socket per command. Volume drags previously fired dozens of
// connect/handshake/close cycles per second, and the 5s signal-path poll
// added more — this makes volume changes feel instant and removes that churn.
const CAMILLA_WS_URL = 'ws://localhost:1234';
const RECONNECT_DELAY_MS = 2000;
const COMMAND_TIMEOUT_MS = 1500;

let ws = null;
let connecting = false;
// FIFO queues keyed by command name — CamillaDSP's replies carry no request
// id, only the command's own name as the top-level key, so same-command
// requests are matched to responses in send order (fair for a single
// control connection that processes commands sequentially).
const pending = new Map();

function commandKey(command) {
  return typeof command === 'string' ? command : Object.keys(command)[0];
}

function failAllPending(reason) {
  for (const queue of pending.values()) {
    while (queue.length) {
      const { reject, timer } = queue.shift();
      clearTimeout(timer);
      reject(new Error(reason));
    }
  }
}

function connect() {
  if (ws || connecting) return;
  connecting = true;
  const socket = new WebSocket(CAMILLA_WS_URL);

  socket.on('open', () => {
    connecting = false;
    ws = socket;
  });

  socket.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    const key = Object.keys(msg)[0];
    const queue = pending.get(key);
    if (queue && queue.length) {
      const { resolve, timer } = queue.shift();
      clearTimeout(timer);
      resolve(msg);
    }
  });

  const onClose = () => {
    connecting = false;
    ws = null;
    socket.removeAllListeners();
    failAllPending('CamillaDSP WS disconnected');
    setTimeout(connect, RECONNECT_DELAY_MS);
  };

  socket.on('close', onClose);
  socket.on('error', (err) => {
    console.warn('[CamillaDSP WS] Error:', err.message);
    onClose();
  });
}

connect();

/**
 * Send a CamillaDSP command over the shared connection.
 * @param {string|object} command e.g. 'GetCaptureSignalPeak' or { SetVolume: -20 }
 * @returns {Promise<object>} parsed response envelope, e.g. { SetVolume: { result: 'Ok' } }
 */
export function sendCamillaCommand(command) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      reject(new Error('CamillaDSP WS not connected'));
      return;
    }
    const key = commandKey(command);
    const entry = { resolve, reject, timer: null };
    entry.timer = setTimeout(() => {
      const queue = pending.get(key);
      if (queue) {
        const idx = queue.indexOf(entry);
        if (idx !== -1) queue.splice(idx, 1);
      }
      reject(new Error('CamillaDSP command timed out'));
    }, COMMAND_TIMEOUT_MS);
    if (!pending.has(key)) pending.set(key, []);
    pending.get(key).push(entry);
    try {
      ws.send(JSON.stringify(command));
    } catch (err) {
      clearTimeout(entry.timer);
      pending.get(key).pop();
      reject(err);
    }
  });
}

export function isCamillaConnected() {
  return !!ws && ws.readyState === WebSocket.OPEN;
}
