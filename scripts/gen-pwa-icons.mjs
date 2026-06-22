// One-shot generator for the PWA / home-screen icons. Pure Node (no deps) so it
// runs in any environment: encodes an RGBA buffer straight to PNG. The art is a
// Resonance-purple vertical gradient with a white waveform — matches the brand.
import zlib from 'zlib';
import { writeFileSync } from 'fs';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(CRC(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function png(N, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit, RGBA
  const stride = N * 4 + 1;
  const raw = Buffer.alloc(stride * N);
  for (let y = 0; y < N; y++) rgba.copy(raw, y * stride + 1, y * N * 4, (y + 1) * N * 4);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function render(N) {
  const rgba = Buffer.alloc(N * N * 4);
  const T = [143, 71, 255], B = [74, 30, 150];          // gradient top → bottom
  const waves = [
    { amp: 0.13, freq: 1.55, phase: 0.0,         th: 0.060, a: 1.00 },
    { amp: 0.10, freq: 1.55, phase: Math.PI,     th: 0.032, a: 0.40 },
  ];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const fx = x / (N - 1), fy = y / (N - 1);
      let r = T[0] + (B[0] - T[0]) * fy;
      let g = T[1] + (B[1] - T[1]) * fy;
      let b = T[2] + (B[2] - T[2]) * fy;
      for (const w of waves) {
        const yc = 0.5 + w.amp * Math.sin(2 * Math.PI * w.freq * fx + w.phase);
        const d = Math.abs(fy - yc);
        if (d < w.th) {
          const alpha = w.a * Math.min(1, (1 - d / w.th) * 1.7);
          r += (255 - r) * alpha; g += (255 - g) * alpha; b += (255 - b) * alpha;
        }
      }
      const i = (y * N + x) * 4;
      rgba[i] = Math.round(r); rgba[i + 1] = Math.round(g); rgba[i + 2] = Math.round(b); rgba[i + 3] = 255;
    }
  }
  return rgba;
}

for (const [N, file] of [[512, 'icon-512.png'], [192, 'icon-192.png'], [180, 'apple-touch-icon.png']]) {
  writeFileSync(`public/${file}`, png(N, render(N)));
  console.log('wrote public/' + file);
}
