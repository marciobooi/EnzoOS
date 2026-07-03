import { useEffect, useRef } from 'react';

// Liquid-glass voice orb — WebGL2 port of the "Loading Orb" raymarch shader
// (codepen.io/TaminoMartinius/pen/MYJEyer), trimmed to a single orb with no
// GUI/presets. A glassy deforming blob with swirling liquid filaments inside
// and a glow that stays outside the silhouette.
//
// Props:
//   levelRef — ref holding 0..1 voice activity; drives deformation/morph/glow
//              so the orb visibly "hears" you.
//   mood     — 'listen' (blue/magenta) | 'ok' (greens) | 'error' (embers);
//              colors crossfade smoothly on change.
//
// Perf: raymarch steps and resolution are trimmed vs. the pen (this renders
// on phones): 110 march steps, 8 liquid samples, orb capped at 460 device px.

const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main(){ v_uv = a_pos * 0.5 + 0.5; gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_time;
uniform vec2  u_res;
uniform float u_radius;
uniform float u_deform;
uniform float u_freq;
uniform float u_morphSpeed;
uniform float u_rotSpeed;
uniform float u_glowStrength;
uniform vec3  u_colBlue;
uniform vec3  u_colMag;
uniform vec3  u_glowA;
uniform vec3  u_glowB;
uniform float u_liquidSpeed;
uniform float u_filament;
uniform vec3  u_bg;

mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }

float blobField(vec3 p){
  float t = u_time * u_morphSpeed;
  float f = u_freq;
  float d = 0.0;
  d += sin(p.x * 2.6 * f + t * 1.00);
  d += sin(p.y * 2.9 * f - t * 0.80 + 1.3);
  d += sin(p.z * 3.2 * f + t * 1.20 + 2.7);
  d += sin((p.x + p.z) * 2.2 * f - t * 0.90 + 4.1);
  d += sin((p.y - p.x) * 2.4 * f + t * 0.70 + 0.6);
  return d * 0.2;
}

float mapBlob(vec3 p){
  float t = u_time * u_rotSpeed;
  p.xy *= rot(t * 0.7);
  p.yz *= rot(t * 0.5);
  float r = u_radius + u_deform * blobField(p);
  return length(p) - r;
}

vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    mapBlob(p + e.xyy) - mapBlob(p - e.xyy),
    mapBlob(p + e.yxy) - mapBlob(p - e.yxy),
    mapBlob(p + e.yyx) - mapBlob(p - e.yyx)));
}

float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm3(vec3 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 3; i++){ v += a * vnoise3(p); p *= 2.03; a *= 0.5; } return v; }

float liquid(vec3 p){
  float t = u_time * u_liquidSpeed;
  p *= 2.2;
  p.xy *= rot(t * 0.15);
  p.yz *= rot(t * 0.10);
  vec3 w = vec3(fbm3(p + t * 0.2), fbm3(p + vec3(4.3, 1.2, -t * 0.15)), fbm3(p.zxy + vec3(7.7, 2.3, t * 0.10)));
  return fbm3(p + 1.8 * w);
}

void main(){
  vec2 p = v_uv * 2.0 - 1.0;
  p.x *= u_res.x / u_res.y;

  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(p, -1.8));

  float t = 0.0;
  bool hit = false;
  vec3 pos = ro;
  float minD = 1e3;
  for (int i = 0; i < 110; i++) {
    pos = ro + rd * t;
    float d = mapBlob(pos);
    minD = min(minD, d);
    if (d < 0.001) { hit = true; break; }
    t += d * 0.40;
    if (t > 6.0) break;
  }

  vec3 E = vec3(0.0);

  if (hit) {
    vec3 n = calcNormal(pos);
    vec3 v = -rd;
    float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);

    vec3 rp = pos + rd * 0.04;
    float trans = 1.0;
    vec3 inner = vec3(0.0);
    for (int k = 0; k < 8; k++) {
      float raw = liquid(rp);
      float dens = smoothstep(0.30, 0.70, raw);
      float fil = pow(1.0 - abs(2.0 * raw - 1.0), 5.0);
      vec3 c = mix(u_colMag, u_colBlue, 0.5 + 0.5 * sin(raw * 6.0 + u_time * 0.3 + rp.y * 2.5));
      vec3 emit = c * dens * 0.55 + c * fil * u_filament + vec3(1.0) * pow(fil, 3.0) * u_filament * 0.4;
      emit += u_colBlue * smoothstep(0.5, 0.0, length(rp)) * 0.3;
      inner += trans * emit * 0.19;
      trans *= 0.84;
      rp += rd * 0.13;
      if (length(rp) > 1.0) break;
    }
    E += inner * (1.0 - fres * 0.6);

    vec3 rim = mix(u_colMag, u_colBlue, 0.5 + 0.5 * (n.x * 0.7 + n.y * 0.45));
    E += rim * fres * 1.3;
    vec3 l1 = normalize(vec3(0.6, 0.85, 0.6));
    vec3 l2 = normalize(vec3(-0.7, 0.25, 0.55));
    vec3 h1 = normalize(l1 + v);
    vec3 h2 = normalize(l2 + v);
    E += vec3(1.0) * pow(max(dot(n, h1), 0.0), 140.0) * 1.3;
    E += vec3(0.8, 0.9, 1.0) * pow(max(dot(n, h2), 0.0), 63.0) * 0.6;
  } else {
    float g = exp(-minD * 5.5);
    float ang = atan(rd.y, rd.x);
    vec3 gc = mix(u_glowA, u_glowB, 0.5 + 0.5 * sin(ang * 3.0 + u_time * 0.5));
    E += (gc * g * 1.4 + vec3(0.6, 0.8, 1.0) * pow(g, 3.0) * 0.7) * u_glowStrength;
  }

  fragColor = vec4(clamp(u_bg + E, 0.0, 1.0), 1.0);
}`;

const MOODS = {
  listen: { blue: [0.25, 0.60, 1.00], mag: [0.90, 0.20, 0.75], glowA: [0.20, 0.71, 1.00], glowB: [0.89, 0.30, 0.82] },
  ok:     { blue: [0.35, 1.00, 0.63], mag: [0.00, 0.90, 0.63], glowA: [0.34, 1.00, 0.24], glowB: [0.00, 1.00, 0.78] },
  error:  { blue: [1.00, 0.76, 0.30], mag: [1.00, 0.23, 0.18], glowA: [1.00, 0.48, 0.09], glowB: [1.00, 0.18, 0.33] },
};
const BG = [7 / 255, 10 / 255, 24 / 255]; // #070A18 — must match the overlay bg

export default function VoiceOrb({ levelRef, mood = 'listen', size = 280 }) {
  const canvasRef = useRef(null);
  const moodRef = useRef(mood);
  moodRef.current = mood;

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) return; // fallback element behind the canvas stays visible

    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader compile failed');
      return sh;
    };
    let program;
    try {
      program = gl.createProgram();
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link failed');
    } catch (e) {
      console.warn('[VoiceOrb] shader failed, falling back:', e.message);
      return;
    }
    gl.useProgram(program);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const U = {};
    for (const name of ['time', 'res', 'radius', 'deform', 'freq', 'morphSpeed', 'rotSpeed',
      'glowStrength', 'colBlue', 'colMag', 'glowA', 'glowB', 'liquidSpeed', 'filament', 'bg']) {
      U[name] = gl.getUniformLocation(program, 'u_' + name);
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const px = Math.min(Math.floor(size * dpr), 460);
    canvas.width = px;
    canvas.height = px;
    gl.viewport(0, 0, px, px);

    // smoothed voice level + color crossfade state
    let lvl = 0;
    const col = {
      blue: [...MOODS.listen.blue], mag: [...MOODS.listen.mag],
      glowA: [...MOODS.listen.glowA], glowB: [...MOODS.listen.glowB],
    };
    const lerp3 = (a, b, k) => { a[0] += (b[0] - a[0]) * k; a[1] += (b[1] - a[1]) * k; a[2] += (b[2] - a[2]) * k; };

    let raf;
    const frame = (now) => {
      const time = now * 0.001;
      const target = Math.max(0, Math.min(1, levelRef?.current ?? 0));
      lvl += (target - lvl) * 0.12;

      const m = MOODS[moodRef.current] || MOODS.listen;
      lerp3(col.blue, m.blue, 0.08);
      lerp3(col.mag, m.mag, 0.08);
      lerp3(col.glowA, m.glowA, 0.08);
      lerp3(col.glowB, m.glowB, 0.08);

      gl.uniform1f(U.time, time);
      gl.uniform2f(U.res, px, px);
      gl.uniform1f(U.radius, 0.30);
      gl.uniform1f(U.deform, 0.28 + lvl * 0.30);
      gl.uniform1f(U.freq, 2.0);
      gl.uniform1f(U.morphSpeed, 0.9 + lvl * 1.6);
      gl.uniform1f(U.rotSpeed, 0.12 + lvl * 0.10);
      gl.uniform1f(U.glowStrength, 0.62 + lvl * 0.55);
      gl.uniform3fv(U.colBlue, col.blue);
      gl.uniform3fv(U.colMag, col.mag);
      gl.uniform3fv(U.glowA, col.glowA);
      gl.uniform3fv(U.glowB, col.glowB);
      gl.uniform1f(U.liquidSpeed, 0.45 + lvl * 0.9);
      gl.uniform1f(U.filament, 1.4 + lvl * 0.9);
      gl.uniform3fv(U.bg, BG);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [levelRef, size]);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* CSS fallback pulse — visible only when WebGL2 is unavailable
          (the opaque canvas covers it otherwise) */}
      <div className="absolute inset-[15%] rounded-full animate-pulse"
        style={{ background: 'radial-gradient(circle at 40% 35%, #4099FF 0%, #E633BF 70%, transparent 100%)', filter: 'blur(6px)', opacity: 0.85 }} />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
}
