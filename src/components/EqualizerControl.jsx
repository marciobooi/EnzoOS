import { Sliders, RotateCcw, Flame, AudioLines, Sparkles } from 'lucide-react';
import { S, cardShadow } from '../styles/stone';

// Bands map to fixed filters server-side: Lowshelf@60Hz, Peaking@250Hz/1kHz/4kHz,
// Highshelf@16kHz (see generateCamillaConfig in server/player.js) — these gains
// are the *actual* applied curve now, not just a display value, so they're kept
// deliberately restrained (mostly ±1-3dB, one ±5dB shelf) with cuts alongside
// boosts rather than one-directional "boost everything" moves. preAmp is left
// at 0 for every preset: auto-headroom already computes the exact attenuation
// needed to keep each curve's peak at unity, so a hand-tuned trim on top would
// only add clip risk or waste headroom for no audible benefit.
export const EQ_PRESETS = [
  // Flat — reference monitoring, no coloration.
  { name: 'Clinical Reference', bands: [0, 0, 0, 0, 0],   saturation: 0, noiseFloor: 0, preAmp: 0.0 },
  // Gentle low lift, upper-mid/treble eased back — classic tube/tape smoothing
  // without burying detail. Moderate 2nd/3rd-harmonic saturation for glow.
  { name: 'Warm Valve',         bands: [2, 1, 0, -2, -2], saturation: 6, noiseFloor: 2, preAmp: 0.0 },
  // Sub-bass lift paired with a 250Hz cut so the extra low end stays punchy
  // instead of turning muddy/boomy; a small 4kHz nudge keeps the mix from
  // getting buried under the added bass.
  { name: 'Bass Boost',         bands: [5, -2, 0, 1, 0],  saturation: 5, noiseFloor: 1, preAmp: 0.0 },
  // Declutter the boxy low-mids, lift vocal fundamental + consonant presence,
  // gentle air on top — no saturation, kept clean for speech/vocals.
  { name: 'Vocal Clarity',      bands: [-1, -2, 2, 3, 1], saturation: 0, noiseFloor: 0, preAmp: 0.0 },
  // Slight bass foundation, small 1kHz scoop to open up perceived space,
  // extended treble shelf for air/sparkle, subtle shimmer via saturation.
  { name: 'Hi-Fi Spatial',      bands: [2, 0, -1, 1, 3],  saturation: 3, noiseFloor: 1, preAmp: 0.0 },
  // Concert venue simulation. The name is a server-side key: when
  // eq_settings.preset === 'On Stage', generateCamillaConfig (see
  // server/camilla-config.js) additionally builds a spatial pipeline —
  // cross-fed damped early reflections for venue depth plus mid/side stage
  // widening — on top of this tonal curve. The bands here stay restrained
  // (PA-style low-end weight, 250Hz kept clean so the added reflections
  // don't turn muddy, presence + air on top); touching any slider drops to
  // 'Custom', which switches the spatial stage off — by design, since the
  // sliders can't represent it.
  { name: 'On Stage',           bands: [2, -1, 0, 1, 2],  saturation: 3, noiseFloor: 0, preAmp: 0.0 },
];

const BAND_LABELS = ['60 Hz', '250 Hz', '1 kHz', '4 kHz', '16 kHz'];

// Accent colors per parameter — meaningful color coding kept in stone context
const A = {
  sat:    '#c8841c', // amber  — warmth / saturation
  noise:  '#0e9ab8', // teal   — clarity / noise floor
  preamp: S.accent,  // charcoal — gain / pre-amp
};

export default function EqualizerControl({
  currentPreset, onPresetChange,
  bands, onBandChange,
  saturation, onSaturationChange,
  noiseFloor, onNoiseFloorChange,
  preAmp, onPreAmpChange,
  onClose, dspActive, onDeactivateDsp,
  pureDirect = false, onDisablePureDirect,
}) {
  const handleReset = () => onPresetChange('Clinical Reference');

  return (
    <div className="rounded-2xl p-5 relative overflow-hidden h-full flex flex-col justify-between font-sans"
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}>

      {/* ── Pure Direct Overlay — EQ bypassed while flat pipeline is active ── */}
      {pureDirect && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center p-6 text-center rounded-2xl"
          style={{ background: `${S.bg}f5`, backdropFilter: 'blur(4px)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'rgba(14,154,184,0.12)', border: '1px solid rgba(14,154,184,0.35)' }}>
            <AudioLines className="h-6 w-6" style={{ color: '#0e9ab8' }} strokeWidth={1} />
          </div>
          <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>
            pure direct active
          </p>
          <h3 className="text-base font-bold mb-2" style={{ color: S.strong }}>EQ Bypassed</h3>
          <p className="text-sm font-light max-w-sm leading-relaxed mb-5" style={{ color: S.muted }}>
            Pure Direct mode is active. The signal path is flat — no EQ or DSP processing is applied. All parameters are preserved and will resume when Pure Direct is disabled.
          </p>
          <div className="flex gap-3 w-full max-w-xs">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              Keep Pure Direct
            </button>
            <button onClick={onDisablePureDirect}
              className="flex-1 py-2.5 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              Use Manual EQ
            </button>
          </div>
        </div>
      )}

      {/* ── DSP Active Overlay ────────────────────────────────────────────── */}
      {dspActive && (
        <div className="absolute inset-0 z-[110] flex flex-col items-center justify-center p-6 text-center rounded-2xl"
          style={{ background: `${S.bg}f5`, backdropFilter: 'blur(4px)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3"
            style={{ background: `${A.sat}18`, border: `1px solid ${A.sat}50` }}>
            <Sliders className="h-6 w-6" style={{ color: A.sat }} strokeWidth={1} />
          </div>
          <p className="text-sm font-light tracking-[0.25em] uppercase mb-1" style={{ color: S.label }}>
            room correction active
          </p>
          <h3 className="text-base font-bold mb-2" style={{ color: S.strong }}>Manual EQ Bypassed</h3>
          <p className="text-sm font-light max-w-sm leading-relaxed mb-5" style={{ color: S.muted }}>
            Room acoustic calibration is active. The parametric equalizer is bypassed to prevent phase distortion.
          </p>
          <div className="flex gap-3 w-full max-w-xs">
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, color: S.muted, boxShadow: cardShadow }}>
              Keep DSP
            </button>
            <button onClick={onDeactivateDsp}
              className="flex-1 py-2.5 rounded-xl text-sm font-extrabold transition-all active:scale-95 cursor-pointer"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              Use Manual EQ
            </button>
          </div>
        </div>
      )}


      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 mb-3 shrink-0"
        style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${S.border}` }}>
            <Sliders className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          </div>
          <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
            resonance frequency schemes
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleReset}
            className="flex items-center gap-1.5 text-sm font-light transition-colors cursor-pointer"
            style={{ color: S.muted }}>
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={1} />
            Reset
          </button>
          {onClose && (
            <button onClick={onClose}
              className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
              style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
              CLOSE
            </button>
          )}
        </div>
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch flex-grow overflow-hidden">

        {/* Left — preset + tube params */}
        <div className="lg:col-span-4 flex flex-col gap-4 overflow-y-auto stone-scrollbar">

          {/* Preset selector */}
          <div>
            <span className="text-sm font-light tracking-[0.25em] uppercase block mb-2" style={{ color: S.label }}>
              pre-stage valve preset
            </span>
            <div className="relative">
              <select
                value={currentPreset}
                onChange={e => onPresetChange(e.target.value)}
                className="w-full rounded-xl px-4 py-3 text-sm font-medium focus:outline-none cursor-pointer appearance-none transition-all"
                style={{
                  background: S.surface,
                  border: `1px solid ${S.border}`,
                  color: S.strong,
                  boxShadow: cardShadow,
                }}>
                {EQ_PRESETS.map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
                {currentPreset === 'Custom' && (
                  <option value="Custom">Custom Settings</option>
                )}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                  style={{ color: S.muted }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          </div>

          {/* Tube parameters */}
          <div className="flex flex-col gap-4 rounded-xl p-4 flex-grow"
            style={{ background: S.surface, border: `1px solid ${S.border}` }}>

            {/* Saturation */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-sm font-light flex items-center gap-1.5" style={{ color: S.muted }}>
                  <Flame className="w-3.5 h-3.5" strokeWidth={1} style={{ color: A.sat }} />
                  Saturation
                </span>
                <span className="text-base font-bold tabular-nums" style={{ color: A.sat }}>
                  {saturation}<span className="text-sm font-normal" style={{ color: S.label }}>/10</span>
                </span>
              </div>
              <input type="range" min="0" max="10" step="1" value={saturation}
                onChange={e => onSaturationChange(Number(e.target.value))}
                className="stone-range w-full"
                style={{ '--stone-range-accent': A.sat, accentColor: A.sat, background: S.track }} />
            </div>

            {/* Noise Floor */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-sm font-light flex items-center gap-1.5" style={{ color: S.muted }}>
                  <AudioLines className="w-3.5 h-3.5" strokeWidth={1} style={{ color: A.noise }} />
                  Noise Floor
                </span>
                <span className="text-base font-bold tabular-nums" style={{ color: A.noise }}>
                  {noiseFloor}<span className="text-sm font-normal" style={{ color: S.label }}>/10</span>
                </span>
              </div>
              <input type="range" min="0" max="10" step="1" value={noiseFloor}
                onChange={e => onNoiseFloorChange(Number(e.target.value))}
                className="stone-range w-full"
                style={{ accentColor: A.noise, background: S.track }} />
            </div>

            {/* Pre-Amp */}
            <div>
              <div className="flex justify-between items-baseline mb-2">
                <span className="text-sm font-light flex items-center gap-1.5" style={{ color: S.muted }}>
                  <Sparkles className="w-3.5 h-3.5" strokeWidth={1} style={{ color: A.preamp }} />
                  Pre-Amp
                </span>
                <span className="text-base font-bold tabular-nums" style={{ color: A.preamp }}>
                  {Number(preAmp) > 0 ? `+${Number(preAmp).toFixed(1)}` : Number(preAmp).toFixed(1)}
                  <span className="text-sm font-normal" style={{ color: S.label }}> dB</span>
                </span>
              </div>
              <input type="range" min="-6" max="6" step="0.5" value={preAmp}
                onChange={e => onPreAmpChange(Number(e.target.value))}
                className="stone-range w-full"
                style={{ accentColor: A.preamp, background: S.track }} />
            </div>
          </div>
        </div>

        {/* Right — 5-band EQ */}
        <div className="lg:col-span-8 rounded-xl p-4 flex flex-col justify-between overflow-hidden"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>

          <div className="flex items-center justify-between mb-2 shrink-0">
            <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
              5-band parametric valve equalisation
              <span className="normal-case tracking-normal ml-1.5 text-sm font-light" style={{ color: S.label }}>
                (peaking biquad · 44.1kHz)
              </span>
            </span>
            <div className="flex gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: S.accent }} />
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: S.track }} />
            </div>
          </div>

          <div className="flex justify-around items-end h-[110px] pb-1 relative">
            {/* Guide lines */}
            <div className="absolute left-0 right-0 top-0 border-t" style={{ borderColor: S.border }} />
            <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 border-t border-dashed" style={{ borderColor: S.track }} />
            <div className="absolute left-0 right-0 bottom-0 border-t" style={{ borderColor: S.border }} />

            {(bands || [0,0,0,0,0]).map((rawVal, index) => {
              const val = Number(rawVal) || 0;
              const fillPct = ((val + 12) / 24) * 100;
              return (
                <div key={index} className="flex flex-col items-center h-full relative z-10 w-12 justify-end">
                  <span className="text-sm font-bold tabular-nums mb-1" style={{ color: S.accent }}>
                    {val > 0 ? `+${val}` : val}
                  </span>

                  <div className="relative w-10 h-[65px] flex items-center justify-center">
                    {/* Track */}
                    <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-full rounded-full pointer-events-none"
                      style={{ background: S.track }}>
                      {/* Fill */}
                      <div className="absolute bottom-0 w-full rounded-full"
                        style={{ height: `${fillPct}%`, background: `linear-gradient(to top, ${S.accent}99, ${S.accent})` }} />
                      {/* Thumb */}
                      <div className="absolute left-1/2 w-3.5 h-3.5 rounded-full"
                        style={{
                          bottom: `${fillPct}%`,
                          transform: 'translate(-50%, 50%)',
                          background: S.bg,
                          border: `2px solid ${S.accent}`,
                          boxShadow: `0 1px 4px rgba(42,40,38,0.25)`,
                        }} />
                    </div>
                    {/* Invisible range input */}
                    <input type="range" min="-12" max="12" step="1" value={val}
                      style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
                      onChange={e => onBandChange(index, Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-row-resize z-20" />
                  </div>

                  <span className="text-sm font-light mt-1.5 uppercase select-none" style={{ color: S.label }}>
                    {BAND_LABELS[index]}
                  </span>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
