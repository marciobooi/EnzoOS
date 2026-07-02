const fs = require('fs');
const path = require('path');
const os = require('os');

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

  // Transcript JSONL bytes are a rough proxy for tokens (~4 bytes/token),
  // not an exact count — tool_result payloads skew this, but it's good
  // enough to nudge on order-of-magnitude context growth.
  const sizeBytes = fs.statSync(transcriptPath).size;
  const approxTokens = Math.round(sizeBytes / 4);

  const THRESHOLD = 150000; // start nudging once context looks >150k tokens
  const STEP = 50000; // re-nudge every ~50k tokens of further growth

  if (approxTokens < THRESHOLD) process.exit(0);

  const stateDir = path.join(os.tmpdir(), 'claude-context-nudge');
  fs.mkdirSync(stateDir, { recursive: true });
  const stateFile = path.join(stateDir, sessionId);

  let last = 0;
  try {
    last = parseInt(fs.readFileSync(stateFile, 'utf8'), 10) || 0;
  } catch {
    // no prior nudge recorded for this session
  }

  const mark = THRESHOLD + Math.floor((approxTokens - THRESHOLD) / STEP) * STEP;
  if (mark <= last) process.exit(0);

  fs.writeFileSync(stateFile, String(mark));

  const kTokens = Math.round(approxTokens / 1000);
  process.stdout.write(
    JSON.stringify({
      systemMessage: `Context is roughly ~${kTokens}k tokens (transcript-size estimate). Still on the same task? Run /compact. Starting something new? Run /clear instead.`,
    })
  );
});
