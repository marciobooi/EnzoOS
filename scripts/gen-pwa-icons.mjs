/**
 * PWA icon generator.
 *
 * Reads public/icon-source.png and produces:
 *   public/icon-512.png
 *   public/icon-192.png
 *   public/apple-touch-icon.png
 *
 * Requires Python 3 + Pillow:
 *   pip install Pillow
 *
 * Run from project root:
 *   node scripts/gen-pwa-icons.mjs
 */

import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'public', 'icon-source.png');

if (!existsSync(source)) {
  console.error('\nERROR: source image not found at public/icon-source.png');
  console.error('Save your logo there and re-run this script.\n');
  process.exit(1);
}

const pyScript = `
import sys
import os
from PIL import Image

src = sys.argv[1]
root = sys.argv[2]

sizes = [
    (512, 'icon-512.png'),
    (192, 'icon-192.png'),
    (180, 'apple-touch-icon.png'),
]

img = Image.open(src).convert('RGBA')

# Pad to square with transparent background if not already square
w, h = img.size
if w != h:
    side = max(w, h)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(img, ((side - w) // 2, (side - h) // 2))
    img = sq

for size, name in sizes:
    out = img.resize((size, size), Image.LANCZOS)
    path = os.path.join(root, 'public', name)
    out.save(path, 'PNG', optimize=True)
    print(f'wrote {path}')
`.trim();

function runPython(command) {
  return spawnSync(command, ['-c', pyScript, source, root], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

let result = runPython('python3');

if (result.error || result.status !== 0) {
  result = runPython('python');
}

if (result.error || result.status !== 0) {
  result = spawnSync('py', ['-3', '-c', pyScript, source, root], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

if (result.error || result.status !== 0) {
  console.error('\nFailed to run Python. Make sure Python 3 + Pillow are installed:');
  console.error('  python -m pip install Pillow\n');

  if (result.stderr) {
    console.error(result.stderr);
  } else if (result.error) {
    console.error(result.error.message);
  }

  process.exit(1);
}

console.log(result.stdout.trim());
console.log('\nAll icons generated successfully.');