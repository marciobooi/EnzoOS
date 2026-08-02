/**
 * Embedded cover art via MPD's binary protocol commands (`readpicture` for
 * ID3/FLAC picture tags, `albumart` for a folder-level cover file). Neither
 * is exposed as an `mpc` CLI subcommand on this build (confirmed live
 * against the real MPD instance: both commands ARE recognized — "No such
 * song"/"No file exists" ACK errors, not "unknown command" — but `mpc`
 * itself has no matching flag), so this talks to MPD's TCP socket directly,
 * parsing the mixed text-header + raw-binary-chunk reply format by hand.
 *
 * Both commands return a picture in size-limited chunks (MPD's default
 * `binarylimit` is small, 8192 bytes) rather than the whole file at once —
 * `binarylimit` is raised once per connection so a typical embedded JPEG/PNG
 * fits in a single round trip, with a loop as the fallback for anything
 * larger.
 */
import net from 'net';

const MPD_HOST = '127.0.0.1';
const MPD_PORT = 6600;
const BINARY_LIMIT = 1024 * 1024; // 1MB chunks — comfortably above typical embedded art
const CONNECT_TIMEOUT_MS = 2000;
const RESPONSE_TIMEOUT_MS = 5000;

function connectMpd() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(MPD_PORT, MPD_HOST);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('MPD connect timeout')); }, CONNECT_TIMEOUT_MS);
    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const nl = buf.indexOf(0x0a);
      if (nl === -1) return; // wait for the rest of the greeting line
      clearTimeout(timer);
      socket.removeListener('data', onData);
      socket.removeListener('error', onError);
      resolve(socket);
    };
    const onError = (err) => { clearTimeout(timer); reject(err); };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

// Reads exactly one MPD response for a command that may include a single
// `binary: N` chunk (readpicture/albumart's reply shape: zero or more
// `key: value` header lines, optionally one `binary: N` line followed by N
// raw bytes, then a trailing OK — or, when there's simply no picture, a bare
// OK with no headers at all, which is NOT an error).
function readOneResponse(socket) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    const headers = {};
    let phase = 'headers'; // 'headers' | 'binary'
    let binaryRemaining = 0;
    const chunks = [];
    const timer = setTimeout(() => { cleanup(); reject(new Error('MPD response timeout')); }, RESPONSE_TIMEOUT_MS);
    const cleanup = () => { clearTimeout(timer); socket.removeListener('data', onData); socket.removeListener('error', onError); };
    const onError = (err) => { cleanup(); reject(err); };
    const process = () => {
      for (;;) {
        if (phase === 'binary') {
          if (buf.length < binaryRemaining) return; // need more bytes
          chunks.push(buf.subarray(0, binaryRemaining));
          buf = buf.subarray(binaryRemaining);
          binaryRemaining = 0;
          phase = 'headers';
          continue;
        }
        const nl = buf.indexOf(0x0a);
        if (nl === -1) return; // need more data for the next line
        const line = buf.subarray(0, nl).toString('utf8').replace(/\r$/, '');
        buf = buf.subarray(nl + 1);
        if (line.startsWith('ACK [')) { cleanup(); reject(new Error(line)); return; }
        if (line === 'OK') { cleanup(); resolve({ headers, data: Buffer.concat(chunks) }); return; }
        const binMatch = line.match(/^binary:\s*(\d+)$/);
        if (binMatch) { binaryRemaining = parseInt(binMatch[1], 10); phase = binaryRemaining > 0 ? 'binary' : 'headers'; continue; }
        const kv = line.match(/^([a-zA-Z_-]+):\s*(.*)$/);
        if (kv) headers[kv[1]] = kv[2];
        // unrecognized lines are ignored rather than treated as fatal
      }
    };
    const onData = (chunk) => { buf = Buffer.concat([buf, chunk]); process(); };
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

function mpdQuoteArg(str) {
  return `"${String(str).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function sendCommand(socket, cmd) {
  socket.write(`${cmd}\n`);
  return readOneResponse(socket);
}

// Fetches the picture for one command (readpicture or albumart), looping on
// offset if MPD's reply spans more than one binarylimit-sized chunk. Returns
// null if this specific command has no picture for the file (not an error —
// the caller tries the other command next).
async function fetchViaCommand(socket, commandName, file) {
  let offset = 0;
  let total;
  let mimeType = null;
  const chunks = [];
  for (;;) {
    const resp = await sendCommand(socket, `${commandName} ${mpdQuoteArg(file)} ${offset}`);
    const size = parseInt(resp.headers.size, 10);
    if (!Number.isFinite(size) || size <= 0) return null; // no art via this command
    total = size;
    mimeType = resp.headers.type || mimeType;
    if (resp.data.length === 0) break; // nothing left to read despite a nonzero size
    chunks.push(resp.data);
    offset += resp.data.length;
    if (offset >= total) break;
  }
  if (!chunks.length) return null;
  return { data: Buffer.concat(chunks), mimeType: mimeType || 'image/jpeg' };
}

/**
 * Returns { data: Buffer, mimeType } for the given library-relative file
 * path's embedded cover art, or null if neither an embedded picture nor a
 * folder-level cover exists (the common case for untagged files — not an
 * error, callers should 404 quietly).
 */
export async function mpdReadPicture(file) {
  let socket;
  try {
    socket = await connectMpd();
  } catch {
    return null; // MPD unreachable — treat like "no art" rather than a 500
  }
  try {
    await sendCommand(socket, `binarylimit ${BINARY_LIMIT}`);
    const embedded = await fetchViaCommand(socket, 'readpicture', file).catch(() => null);
    if (embedded) return embedded;
    return await fetchViaCommand(socket, 'albumart', file).catch(() => null);
  } finally {
    socket.end();
  }
}
