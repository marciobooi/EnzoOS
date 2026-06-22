/**
 * PWA icon generator.
 *
 * Reads public/icon-source.png (the master brand image) and produces:
 *   public/icon-512.png       (PWA large icon)
 *   public/icon-192.png       (PWA small icon)
 *   public/apple-touch-icon.png  (iOS home screen, 180×180)
 *
 * Uses Python 3 + Pillow for resizing so no npm deps are needed.
 * Install Pillow once if missing:  pip install Pillow
 *
 * Run:  node scripts/gen-pwa-icons.mjs
 */
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root   = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'public', 'icon-source.png');

if (!existsSync(source)) {
  console.error(`\n  ERROR: source image not found at public/icon-source.png`);
  console.error(`  Save your logo there and re-run this script.\n`);
  process.exit(1);
}

const sizes = [
  [512, 'icon-512.png'],
  [192, 'icon-192.png'],
  [180, 'apple-touch-icon.png'],
];

const pyScript = `
import sys
from PIL import Image

src = sys.argv[1]
sizes = [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'apple-touch-icon.png')]
root = sys.argv[2]
import os

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

try {
  const result = execSync(
    `python3 -c "${pyScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" "${source}" "${root}"`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(result.trim());
  console.log('\nAll icons generated successfully.');
} catch (err) {
  // Try python instead of python3 (Windows)
  try {
    const result = execSync(
      `python -c "${pyScript.replace(/"/g, '\\"').replace(/\n/g, '\\n')}" "${source}" "${root}"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    console.log(result.trim());
    console.log('\nAll icons generated successfully.');
  } catch (err2) {
    console.error('\nFailed to run Python. Make sure Python 3 + Pillow are installed:');
    console.error('  pip install Pillow\n');
    console.error(err2.stderr || err2.message);
    process.exit(1);
  }
}
