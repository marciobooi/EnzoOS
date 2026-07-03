
/**
 * ResonanceLogo — pure CSS/HTML origami intro animation.
 *
 * Self-contained: ships its own scoped <style> (all classes prefixed `rl-`,
 * no global resets) so it can't collide with app styles. Fills its parent up
 * to 760px wide at a 16:9 ratio — wrap it or pass `style`/`className` to size.
 *
 *   <ResonanceLogo />
 *
 * Choreography (~5.2s cycle; the kiosk welcome dismisses during the hold):
 *   1. Folded-paper transport controls rise one after another (staggered).
 *   2. The play triangle presses down (anticipation), then folds away like a
 *      page turning — the snap throws prev/next outward and bursts a crackle
 *      of paper shards (per-shard delay/size, tumbling out with gravity).
 *   3. Through the dissipating shards the "res▶nance" wordmark folds up
 *      letter by letter from the baseline, each with a slight overshoot.
 *   4. Once settled, a soft sheen travels across the glyphs, then it holds.
 * Honors prefers-reduced-motion (static wordmark, no shards/controls).
 */

const SHARDS = [
  { x: -150, y: -70,  r: 220,  rx: 1,   ry: 0.4, g: 120, d: 0.00, s: 1.00 },
  { x: -90,  y: -120, r: -180, rx: 0.6, ry: 1,   g: 160, d: 0.06, s: 0.80 },
  { x: 40,   y: -140, r: 300,  rx: 1,   ry: 0.2, g: 110, d: 0.03, s: 1.15 },
  { x: 150,  y: -90,  r: -240, rx: 0.3, ry: 1,   g: 150, d: 0.10, s: 0.70 },
  { x: 185,  y: 10,   r: 200,  rx: 1,   ry: 0.7, g: 130, d: 0.02, s: 0.95 },
  { x: 150,  y: 90,   r: -300, rx: 0.8, ry: 0.5, g: 140, d: 0.12, s: 1.20 },
  { x: 30,   y: 135,  r: 260,  rx: 1,   ry: 1,   g: 120, d: 0.05, s: 0.85 },
  { x: -80,  y: 115,  r: -220, rx: 0.5, ry: 0.9, g: 155, d: 0.08, s: 1.05 },
  { x: -170, y: 40,   r: 280,  rx: 1,   ry: 0.3, g: 115, d: 0.01, s: 0.75 },
  { x: 80,   y: -30,  r: 340,  rx: 1,   ry: 0.6, g: 125, d: 0.14, s: 1.10 },
  { x: -120, y: -10,  r: -280, rx: 0.9, ry: 0.4, g: 135, d: 0.07, s: 0.90 },
  { x: -30,  y: -40,  r: -160, rx: 0.7, ry: 0.7, g: 145, d: 0.04, s: 0.65 },
];

// The wordmark glyphs — null is the play-triangle "o". Each gets a fold-up
// animation staggered by its index, so the word builds left to right.
const LETTERS = ['r', 'e', 's', null, 'n', 'a', 'n', 'c', 'e'];

const CSS = `
.rlogo,.rlogo *{box-sizing:border-box}
.rlogo{--cycle:5.2s;display:flex;align-items:center;justify-content:center;width:100%}
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

/* ── transport controls: paper pieces that rise one after another ── */
.rl-controls{position:absolute;display:flex;align-items:center;gap:36px;perspective:640px;
  filter:drop-shadow(-7px 9px 6px rgba(42,40,38,.32))}
.rl-ctl{position:relative;opacity:0}
.rl-ctl i{position:absolute;inset:0;display:block}
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
.rl-side{animation:rl-side var(--cycle) cubic-bezier(.22,1,.36,1) infinite both;
  animation-delay:var(--d,0s)}
/* rise from the paper, hold, then get blown outward by the play-fold burst */
@keyframes rl-side{
  0%{opacity:0;transform:translateY(18px) rotateX(58deg)}
  5%{opacity:1;transform:none}
  22%{opacity:1;transform:none;animation-timing-function:cubic-bezier(.5,0,.75,.4)}
  30%{opacity:0;transform:translateX(var(--out,54px)) translateY(10px) rotate3d(.2,1,.3,60deg) scale(.85)}
  100%{opacity:0}
}
.rl-play{width:52px;height:60px;transform-origin:18% 50%;
  animation:rl-playFold var(--cycle) cubic-bezier(.22,1,.36,1) infinite both;
  animation-delay:var(--d,0s)}
.rl-play .rl-fa{clip-path:polygon(0 0,100% 50%,40% 50%)}
.rl-play .rl-fb{clip-path:polygon(0 100%,100% 50%,40% 50%)}
.rl-play .rl-fc{clip-path:polygon(0 0,0 100%,40% 50%)}
/* rise, press down (anticipation), then fold away like a page turning */
@keyframes rl-playFold{
  0%{opacity:0;transform:translateY(18px) rotateX(58deg)}
  5%{opacity:1;transform:none}
  13.5%{opacity:1;transform:none;animation-timing-function:cubic-bezier(.4,0,.6,1)}
  16.5%{opacity:1;transform:scale(.9) translateY(2px);animation-timing-function:cubic-bezier(.55,-.2,.74,.05)}
  24%{opacity:0;transform:rotateY(-116deg) scale(.72)}
  100%{opacity:0}
}

/* ── paper shards: a crackling burst from the fold point ── */
.rl-shards{position:absolute;transform-style:preserve-3d}
.rl-sh{position:absolute;left:-13px;top:-13px;width:26px;height:26px;
  clip-path:polygon(50% 0,100% 100%,0 100%);
  background:linear-gradient(var(--g,135deg),#d6d3c8 0 45%,#8c897f 100%);
  opacity:0;filter:drop-shadow(-3px 5px 4px rgba(42,40,38,.32));
  animation:rl-shard var(--cycle) cubic-bezier(.16,.84,.28,1) infinite both;
  animation-delay:var(--d,0s)}
@keyframes rl-shard{
  0%,23.5%{opacity:0;transform:translate3d(0,2px,0) rotate(0) scale(calc(.12*var(--s,1)));
    filter:drop-shadow(-3px 5px 4px rgba(42,40,38,.32)) blur(0px)}
  26.5%{opacity:1;transform:translate3d(calc(var(--x)*.3),calc(var(--y)*.3),40px)
    rotate3d(var(--rx),var(--ry),1,calc(var(--r)*.35)) scale(var(--s,1))}
  40%{opacity:.95;transform:translate3d(var(--x),var(--y),12px)
    rotate3d(var(--rx),var(--ry),1,var(--r)) scale(calc(.94*var(--s,1)));
    filter:drop-shadow(-3px 5px 4px rgba(42,40,38,.32)) blur(0px)}
  53%{opacity:0;transform:translate3d(calc(var(--x)*1.28),calc(var(--y)*1.28 + 34px),0)
    rotate3d(var(--rx),var(--ry),1,calc(var(--r)*1.5)) scale(calc(.55*var(--s,1)));
    filter:drop-shadow(-3px 5px 4px rgba(42,40,38,.32)) blur(3px)}
  100%{opacity:0}
}

/* ── wordmark: folds up letter by letter, then a sheen travels across ── */
.rl-word{position:absolute;top:50%;left:50%;white-space:nowrap;display:inline-flex;align-items:baseline;
  font:800 clamp(40px,11.5vw,140px)/1 'Manrope',sans-serif;letter-spacing:1px;
  transform:translate(-50%,-50%);perspective:900px;
  filter:drop-shadow(-2px 3px 1.5px rgba(42,40,38,.45)) drop-shadow(-9px 17px 9px rgba(42,40,38,.24))}
/* layer 1 is the sheen (parked off-glyph at 130%; the letter keyframes sweep
   it to -30%), layers 2-4 are the faceted paper. The static .rl-mark shares
   this stack with the sheen permanently parked. */
.rlogo .rl-txt,.rlogo .rl-play-o{
  background:
    linear-gradient(105deg,transparent 0 40%,rgba(255,255,255,.72) 50%,transparent 60%) no-repeat 130% 0/220% 100%,
    repeating-linear-gradient(45deg,rgba(42,40,38,.16) 0 1px,transparent 1px 23px) 0 0/46px 46px,
    repeating-linear-gradient(135deg,rgba(42,40,38,.16) 0 1px,transparent 1px 23px) 0 0/46px 46px,
    conic-gradient(from 45deg,#d8d5ca 0 90deg,#8d8a80 90deg 180deg,#6c685f 180deg 270deg,#9c988c 270deg 360deg) 0 0/46px 46px}
.rlogo .rl-txt{-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}
.rlogo .rl-play-o{display:inline-block;width:1ex;height:1ex;margin:0 .06em;
  -webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath fill='%23fff' fill-rule='evenodd' d='M50 1A49 49 0 1 0 50 99A49 49 0 1 0 50 1Z M40 31L70 50L40 69Z'/%3E%3C/svg%3E") center/contain no-repeat;
  mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath fill='%23fff' fill-rule='evenodd' d='M50 1A49 49 0 1 0 50 99A49 49 0 1 0 50 1Z M40 31L70 50L40 69Z'/%3E%3C/svg%3E") center/contain no-repeat}
.rl-word .rl-l{display:inline-block;opacity:0;transform-origin:50% 100%;
  animation:rl-letter var(--cycle) cubic-bezier(.22,1,.36,1) infinite both;
  animation-delay:calc(var(--i,0)*.055s)}
@keyframes rl-letter{
  0%,29%{opacity:0;transform:translateY(.32em) rotateX(-86deg);
    background-position:130% 0,0 0,0 0,0 0}
  35.5%{opacity:1;transform:translateY(-.015em) rotateX(5deg)}
  38.5%{opacity:1;transform:none;background-position:130% 0,0 0,0 0,0 0}
  52%{background-position:130% 0,0 0,0 0,0 0}
  63%{background-position:-30% 0,0 0,0 0,0 0}
  91.5%{opacity:1;transform:none;background-position:-30% 0,0 0,0 0,0 0;
    animation-timing-function:cubic-bezier(.5,0,.74,.16)}
  97%,100%{opacity:0;transform:translateY(.16em) rotateX(52deg);
    background-position:-30% 0,0 0,0 0,0 0}
}

/* static faceted wordmark (no animation) — for sign-offs / standalone use */
.rl-mark{display:inline-flex;align-items:baseline;white-space:nowrap;
  font:800 clamp(34px,9vw,96px)/1 'Manrope',sans-serif;letter-spacing:1px;
  filter:drop-shadow(-2px 3px 1.5px rgba(42,40,38,.45)) drop-shadow(-9px 17px 9px rgba(42,40,38,.24))}

@media (prefers-reduced-motion:reduce){
  .rlogo .rl-ctl,.rlogo .rl-sh{animation:none;opacity:0}
  .rlogo .rl-word .rl-l{animation:none;opacity:1;transform:none}
}
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
            <div className="rl-ctl rl-side rl-prev" style={{ '--d': '0s', '--out': '-54px' }}>
              <i className="rl-fa" /><i className="rl-fb" /><i className="rl-fc" />
            </div>
            <div className="rl-ctl rl-play" style={{ '--d': '.1s' }}>
              <i className="rl-fa" /><i className="rl-fb" /><i className="rl-fc" />
            </div>
            <div className="rl-ctl rl-side rl-next" style={{ '--d': '.2s', '--out': '54px' }}>
              <i className="rl-fa" /><i className="rl-fb" /><i className="rl-fc" />
            </div>
          </div>

          <div className="rl-shards">
            {SHARDS.map((s, i) => (
              <i key={i} className="rl-sh" style={{
                '--x': `${s.x}px`, '--y': `${s.y}px`, '--r': `${s.r}deg`,
                '--rx': s.rx, '--ry': s.ry, '--g': `${s.g}deg`,
                '--d': `${s.d}s`, '--s': s.s,
              }} />
            ))}
          </div>

          <div className="rl-word">
            {LETTERS.map((ch, i) => (ch
              ? <span key={i} className="rl-l rl-txt" style={{ '--i': i }}>{ch}</span>
              : <span key={i} className="rl-l rl-play-o" style={{ '--i': i }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
