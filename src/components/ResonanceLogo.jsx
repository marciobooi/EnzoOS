import React from 'react';

/**
 * ResonanceLogo — pure CSS/HTML origami intro animation.
 *
 * Self-contained: ships its own scoped <style> (all classes prefixed `rl-`,
 * no global resets) so it can't collide with app styles. Fills its parent up
 * to 760px wide at a 16:9 ratio — wrap it or pass `style`/`className` to size.
 *
 *   <ResonanceLogo />
 *
 * Faceted folded-paper transport controls shatter into paper triangles, then
 * the "res▶nance" wordmark folds in — the "o" is a play triangle. ~4.6s loop.
 */

const SHARDS = [
  { x: -150, y: -70,  r: 220,  rx: 1,  ry: 0.4, g: 120 },
  { x: -90,  y: -120, r: -180, rx: 0.6, ry: 1,  g: 160 },
  { x: 40,   y: -140, r: 300,  rx: 1,  ry: 0.2, g: 110 },
  { x: 150,  y: -90,  r: -240, rx: 0.3, ry: 1,  g: 150 },
  { x: 185,  y: 10,   r: 200,  rx: 1,  ry: 0.7, g: 130 },
  { x: 150,  y: 90,   r: -300, rx: 0.8, ry: 0.5, g: 140 },
  { x: 30,   y: 135,  r: 260,  rx: 1,  ry: 1,   g: 120 },
  { x: -80,  y: 115,  r: -220, rx: 0.5, ry: 0.9, g: 155 },
  { x: -170, y: 40,   r: 280,  rx: 1,  ry: 0.3, g: 115 },
  { x: 80,   y: -30,  r: 340,  rx: 1,  ry: 0.6, g: 125 },
  { x: -120, y: -10,  r: -280, rx: 0.9, ry: 0.4, g: 135 },
  { x: -30,  y: -40,  r: -160, rx: 0.7, ry: 0.7, g: 145 },
];

const CSS = `
.rlogo,.rlogo *{box-sizing:border-box}
.rlogo{--cycle:4.6s;display:flex;align-items:center;justify-content:center;width:100%}
.rl-stage{position:relative;width:100%;max-width:760px;aspect-ratio:16/9;border-radius:22px;
  overflow:hidden;perspective:1100px;font-family:'Manrope',system-ui,sans-serif;
  background:radial-gradient(125% 105% at 50% 24%,#e4e0d3 0%,#cfccbe 52%,#b7b4a7 100%);
  box-shadow:0 40px 110px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.25)}
.rl-stage::after{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(140% 120% at 50% 30%,transparent 56%,rgba(42,40,38,.13)),
    repeating-linear-gradient(46deg,rgba(42,40,38,.014) 0 2px,transparent 2px 4px)}
/* bare: drop the card surface and fill the parent (any aspect ratio, e.g. the
   1400x320 kiosk display) so the logo sits on a parent-provided background */
.rlogo.rl-bare{width:100%;height:100%}
.rlogo.rl-bare .rl-stage{background:transparent;box-shadow:none;border-radius:0;
  max-width:none;width:100%;height:100%;aspect-ratio:auto}
.rlogo.rl-bare .rl-stage::after{display:none}
.rl-scene{position:absolute;inset:0;transform-style:preserve-3d;display:grid;place-items:center}

.rl-controls{position:absolute;display:flex;align-items:center;gap:36px;
  filter:drop-shadow(-7px 9px 6px rgba(42,40,38,.32));
  animation:rl-controls var(--cycle) ease-in-out infinite}
@keyframes rl-controls{0%{opacity:0;transform:translateY(10px)}6%{opacity:1;transform:translateY(0)}
  24%{opacity:1}30%{opacity:0}100%{opacity:0}}
.rl-ctl{position:relative}.rl-ctl i{position:absolute;inset:0;display:block}
.rl-fa{background:linear-gradient(135deg,#d6d3c8,#bebbb1)}
.rl-fb{background:linear-gradient(135deg,#a6a399,#8c897f)}
.rl-fc{background:linear-gradient(135deg,#787469,#5d5a52)}
.rl-prev{width:30px;height:46px}
.rl-prev .rl-fa{clip-path:polygon(100% 0,0 50%,60% 50%)}
.rl-prev .rl-fb{clip-path:polygon(100% 100%,0 50%,60% 50%)}
.rl-prev .rl-fc{clip-path:polygon(100% 0,100% 100%,60% 50%)}
.rl-next{width:30px;height:46px}
.rl-next .rl-fa{clip-path:polygon(0 0,100% 50%,40% 50%)}
.rl-next .rl-fb{clip-path:polygon(0 100%,100% 50%,40% 50%)}
.rl-next .rl-fc{clip-path:polygon(0 0,0 100%,40% 50%)}
.rl-play{width:52px;height:60px;transform-origin:50% 50%;
  animation:rl-playFold var(--cycle) cubic-bezier(.6,0,.4,1) infinite}
.rl-play .rl-fa{clip-path:polygon(0 0,100% 50%,40% 50%)}
.rl-play .rl-fb{clip-path:polygon(0 100%,100% 50%,40% 50%)}
.rl-play .rl-fc{clip-path:polygon(0 0,0 100%,40% 50%)}
@keyframes rl-playFold{0%,12%{transform:rotateY(0) scale(1);opacity:1}
  24%{transform:rotateY(-68deg) scale(.92);opacity:1}
  28%{transform:rotateY(-120deg) scale(.7);opacity:0}100%{opacity:0}}

.rl-shards{position:absolute;transform-style:preserve-3d}
.rl-sh{position:absolute;left:-13px;top:-13px;width:26px;height:26px;
  clip-path:polygon(50% 0,100% 100%,0 100%);
  background:linear-gradient(var(--g,135deg),#d6d3c8 0 45%,#8c897f 100%);
  filter:drop-shadow(-3px 5px 4px rgba(42,40,38,.32));opacity:0;
  animation:rl-shard var(--cycle) cubic-bezier(.3,.7,.3,1) infinite}
@keyframes rl-shard{0%,25%{opacity:0;transform:translate3d(0,0,0) rotate(0) scale(.4)}
  29%{opacity:1;transform:translate3d(0,0,30px) rotate(0) scale(1)}
  44%{opacity:1;transform:translate(var(--x),var(--y)) rotate3d(var(--rx),var(--ry),1,var(--r)) scale(1)}
  60%{opacity:0;transform:translate(calc(var(--x)*1.2),calc(var(--y)*1.2 + 24px)) rotate3d(var(--rx),var(--ry),1,calc(var(--r)*1.4)) scale(.7)}
  100%{opacity:0}}

.rl-word{position:absolute;top:50%;left:50%;white-space:nowrap;display:inline-flex;align-items:baseline;
  font:800 clamp(40px,11.5vw,140px)/1 'Manrope',sans-serif;letter-spacing:1px;
  transform:translate(-50%,-50%) rotateX(-80deg);transform-origin:50% 62%;
  clip-path:inset(0 100% 0 0);opacity:0;
  filter:drop-shadow(-2px 3px 1.5px rgba(42,40,38,.45)) drop-shadow(-9px 17px 9px rgba(42,40,38,.24));
  animation:rl-wordIn var(--cycle) cubic-bezier(.2,.85,.25,1) infinite}
.rlogo .rl-txt,.rlogo .rl-play-o{
  background:
    repeating-linear-gradient(45deg,rgba(42,40,38,.16) 0 1px,transparent 1px 23px),
    repeating-linear-gradient(135deg,rgba(42,40,38,.16) 0 1px,transparent 1px 23px),
    conic-gradient(from 45deg,#d8d5ca 0 90deg,#8d8a80 90deg 180deg,#6c685f 180deg 270deg,#9c988c 270deg 360deg);
  background-size:46px 46px}
.rlogo .rl-txt{-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.rlogo .rl-play-o{display:inline-block;width:1ex;height:1ex;margin:0 .06em;
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath fill='%23fff' fill-rule='evenodd' d='M50 1A49 49 0 1 0 50 99A49 49 0 1 0 50 1Z M40 31L70 50L40 69Z'/%3E%3C/svg%3E") center/contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath fill='%23fff' fill-rule='evenodd' d='M50 1A49 49 0 1 0 50 99A49 49 0 1 0 50 1Z M40 31L70 50L40 69Z'/%3E%3C/svg%3E") center/contain no-repeat}
@keyframes rl-wordIn{
  0%,34%{opacity:0;clip-path:inset(0 100% 0 0);transform:translate(-50%,-50%) rotateX(-80deg)}
  42%{opacity:1}
  58%{opacity:1;clip-path:inset(0 0 0 0);transform:translate(-50%,-50%) rotateX(0)}
  88%{opacity:1;clip-path:inset(0 0 0 0);transform:translate(-50%,-50%) rotateX(0)}
  96%,100%{opacity:0;transform:translate(-50%,-50%) rotateX(34deg)}}

/* static faceted wordmark (no animation) — for sign-offs / standalone use */
.rl-mark{display:inline-flex;align-items:baseline;white-space:nowrap;
  font:800 clamp(34px,9vw,96px)/1 'Manrope',sans-serif;letter-spacing:1px;
  filter:drop-shadow(-2px 3px 1.5px rgba(42,40,38,.45)) drop-shadow(-9px 17px 9px rgba(42,40,38,.24))}
`;

/** Static faceted "res▶nance" wordmark (no animation) — e.g. for the goodbye. */
export function ResonanceWordmark({ className = '', style }) {
  return (
    <span className={`rlogo ${className}`.trim()} style={style}>
      <style>{CSS}</style>
      <span className="rl-mark">
        <span className="rl-txt">res</span>
        <span className="rl-play-o" />
        <span className="rl-txt">nance</span>
      </span>
    </span>
  );
}

export default function ResonanceLogo({ className = '', style, bare = false }) {
  return (
    <div className={`rlogo ${bare ? 'rl-bare' : ''} ${className}`.trim()} style={style}>
      <style>{CSS}</style>
      <div className="rl-stage">
        <div className="rl-scene">
          <div className="rl-controls">
            <div className="rl-ctl rl-prev"><i className="rl-fa" /><i className="rl-fb" /><i className="rl-fc" /></div>
            <div className="rl-ctl rl-play"><i className="rl-fa" /><i className="rl-fb" /><i className="rl-fc" /></div>
            <div className="rl-ctl rl-next"><i className="rl-fa" /><i className="rl-fb" /><i className="rl-fc" /></div>
          </div>

          <div className="rl-shards">
            {SHARDS.map((s, i) => (
              <i key={i} className="rl-sh" style={{
                '--x': `${s.x}px`, '--y': `${s.y}px`, '--r': `${s.r}deg`,
                '--rx': s.rx, '--ry': s.ry, '--g': `${s.g}deg`,
              }} />
            ))}
          </div>

          <div className="rl-word">
            <span className="rl-txt">res</span>
            <span className="rl-play-o" />
            <span className="rl-txt">nance</span>
          </div>
        </div>
      </div>
    </div>
  );
}
