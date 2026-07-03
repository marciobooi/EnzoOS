const fs = require('fs');
const path = require('path');
const os = require('os');

// Nudge thresholds. 2026-07 usage stats showed 91% of spend happened at
// >150k context with the old 150k threshold — the nudge only fired once the
// session was already in the expensive zone. Nudge earlier instead.
const TOKEN_THRESHOLD = 100000; // start nudging at ~100k tokens
const TOKEN_STEP = 40000; // re-nudge every ~40k tokens of further growth
const AGE_THRESHOLD_MS = 6 * 3600 * 1000; // first session-age nudge at 6h
const AGE_STEP_MS = 6 * 3600 * 1000; // re-nudge every further 6h

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  const { transcript_path: transcriptPath, session_id: sessionId } = input;
  if (!transcriptPath || !sessionId || !fs.existsSync(transcriptPath)) {
    process.exit(0);
  }

  const stateDir = path.join(os.tmpdir(), 'claude-context-nudge');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, sessionId);

  const now = Date.now();
  let state = { firstSeen: now, lastTokenMark: 0, lastAgeMark: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    if (typeof parsed === 'number') {
      // legacy format: the file held a bare token mark
      state.lastTokenMark = parsed;
    } else if (parsed && typeof parsed === 'object') {
      state = Object.assign(state, parsed);
    }
  } catch {
    // no prior state recorded for this session
  }

  const { tokens, exact } = estimateContextTokens(transcriptPath);
  const messages = [];

  if (tokens >= TOKEN_THRESHOLD) {
    const mark =
      TOKEN_THRESHOLD +
      Math.floor((tokens - TOKEN_THRESHOLD) / TOKEN_STEP) * TOKEN_STEP;
    if (mark > state.lastTokenMark) {
      state.lastTokenMark = mark;
      const kTokens = Math.round(tokens / 1000);
      const qualifier = exact ? '' : ' (transcript-size estimate)';
      messages.push(
        `Context is ~${kTokens}k tokens${qualifier}. Still on the same task? Run /compact. Starting something new? Run /clear instead.`
      );
    }
  }

  const ageMs = now - state.firstSeen;
  if (ageMs >= AGE_THRESHOLD_MS) {
    const ageMark =
      AGE_THRESHOLD_MS +
      Math.floor((ageMs - AGE_THRESHOLD_MS) / AGE_STEP_MS) * AGE_STEP_MS;
    if (ageMark > state.lastAgeMark) {
      state.lastAgeMark = ageMark;
      const hours = Math.round(ageMs / 3600000);
      messages.push(
        `This session has been active ~${hours}h. Long-lived sessions dominate cost on this machine — if it's a loop/background session, check it's still doing intentional work; if the original task is done, /clear and start fresh.`
      );
    }
  }

  fs.writeFileSync(stateFile, JSON.stringify(state));

  if (messages.length > 0) {
    process.stdout.write(JSON.stringify({ systemMessage: messages.join(' ') }));
  }
});

// Prefer the real context size from the newest `usage` record in the
// transcript tail — accurate, and it resets correctly after /compact,
// unlike the whole-file byte count which keeps every pre-compact turn.
// Fall back to bytes/4 when no usage record is found.
function estimateContextTokens(transcriptPath) {
  const sizeBytes = fs.statSync(transcriptPath).size;
  try {
    const tailLen = Math.min(sizeBytes, 256 * 1024);
    const buf = Buffer.alloc(tailLen);
    const fd = fs.openSync(transcriptPath, 'r');
    fs.readSync(fd, buf, 0, tailLen, sizeBytes - tailLen);
    fs.closeSync(fd);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i]) continue;
      let entry;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue; // the first tail line may be a truncated record
      }
      const usage = entry && entry.message && entry.message.usage;
      if (usage && typeof usage.input_tokens === 'number') {
        const tokens =
          usage.input_tokens +
          (usage.cache_read_input_tokens || 0) +
          (usage.cache_creation_input_tokens || 0);
        if (tokens > 0) return { tokens, exact: true };
      }
    }
  } catch {
    // unreadable tail — fall through to the size-based estimate
  }
  return { tokens: Math.round(sizeBytes / 4), exact: false };
}
