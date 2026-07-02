const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const readmePath = path.join(projectDir, '.claude', 'docs', 'README.md');

let content = '';
try {
  content = fs.readFileSync(readmePath, 'utf8');
} catch {
  process.exit(0);
}

const additionalContext = `Reference docs index (auto-loaded from .claude/docs/README.md at session start — read the specific doc file before touching that subsystem):\n\n${content}`;

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  })
);
