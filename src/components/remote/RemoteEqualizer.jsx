import React, { useContext } from 'react';
import { RotateCcw, Flame, AudioLines, Sparkles, Sliders, Cpu } from 'lucide-react';
import { Tk } from './shared';
import { EQ_PRESETS } from '../EqualizerControl';

const BAND_LABELS = ['60', '250', '1k', '4k', '16k'];

// Parameter accent colours — kept meaningful, but muted to the remote palette.
const ACCENT = {
  sat:   '#c8841c', // warmth / saturation
  noise: '#0e9ab8', // clarity / noise floor
};

// ─── horizontal slider with the remote's champagne fill + invisible thumb ────
function RcSlider({ value, min, max, step, onChange, accent, fill }) {
  const { C } = useContext(Tk);
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="relative h-1.5 rounded-full" style={{ background: C.container }}>
      <div className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct}%`, background: fill || accent || C.champagne }} />
      <div className="absolute w-[18px] h-[18px] rounded-full -translate-x-1/2 -translate-y-1/2 top-1/2"
        style={{ left: `${pct}%`, background: '#ffffff', border: `2px solid ${fill || accent || C.champagne}`, boxShadow: '0 1px 5px rgba(0,0,0,0.25)' }} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
    </div>
  );
}

export default function RemoteEqualizer({
  currentPreset, onPresetChange,
  bands, onBandChange,
  saturation, onSaturationChange,
  noiseFloor, onNoiseFloorChange,
  preAmp, onPreAmpChange,
  dspActive, onDeactivateDsp,
  pureDirect = false, onDisablePureDirect,
}) {
  const { C, card, cardWhite } = useContext(Tk);

  // ── Pure Direct takeover — flat pipeline, EQ bypassed entirely ──
  if (pureDirect) {
    return (
      <div className="mx-4 mb-2 rounded-xl p-5 flex flex-col items-center text-center gap-3"
        style={{ ...cardWhite }}>
        <span className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: 'rgba(14,154,184,0.12)', border: '1px solid rgba(14,154,184,0.35)' }}>
          <AudioLines className="h-5 w-5" style={{ color: '#0e9ab8' }} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>Pure Direct Active</p>
        <p className="text-[14px] leading-relaxed" style={{ color: C.text4 }}>
          The signal path is flat — no EQ or DSP is applied. Parameters are
          preserved and resume when Pure Direct is disabled.
        </p>
        <button onClick={onDisablePureDirect}
          className="mt-1 px-5 py-2.5 rounded-full text-[13px] font-semibold active:scale-95 transition-all cursor-pointer"
          style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.font }}>
          Use Manual EQ
        </button>
      </div>
    );
  }

  // ── Room-correction takeover — manual EQ is bypassed while DSP is active ──
  if (dspActive) {
    return (
      <div className="mx-4 mb-2 rounded-xl p-5 flex flex-col items-center text-center gap-3"
        style={{ ...cardWhite }}>
        <span className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{ background: `${ACCENT.sat}18`, border: `0.5px solid ${ACCENT.sat}55` }}>
          <Cpu className="h-5 w-5" style={{ color: ACCENT.sat }} />
        </span>
        <p className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>Room Correction Active</p>
        <p className="text-[14px] leading-relaxed" style={{ color: C.text4 }}>
          The parametric equaliser is bypassed while room calibration is running,
          to avoid phase distortion.
        </p>
        <button onClick={onDeactivateDsp}
          className="mt-1 px-5 py-2.5 rounded-full text-[13px] font-semibold active:scale-95 transition-all cursor-pointer"
          style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.font }}>
          Use Manual EQ
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 pb-4 pt-1 flex flex-col gap-3" style={{ fontFamily: C.font }}>

      {/* preset selector + reset */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <select value={currentPreset} onChange={e => onPresetChange(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-[14px] font-medium focus:outline-none appearance-none cursor-pointer"
            style={{ ...card, color: C.text1, fontFamily: C.font }}>
            {EQ_PRESETS.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
            {currentPreset === 'Custom' && <option value="Custom">Custom</option>}
          </select>
          <svg className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: C.text3 }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
        <button onClick={() => onPresetChange('Clinical Reference')}
          className="w-11 h-11 rounded-xl flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
          style={{ ...card, color: C.text3 }} aria-label="Reset equaliser">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>

      {/* 5-band parametric */}
      <div className="rounded-xl p-4" style={cardWhite}>
        <div className="flex items-center gap-2 mb-3">
          <Sliders className="h-3.5 w-3.5" style={{ color: C.champagne }} />
          <span className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: C.text3, fontFamily: C.fontLabel }}>5-Band Parametric</span>
        </div>
        <div className="flex justify-around items-end" style={{ height: 150 }}>
          {(bands || [0, 0, 0, 0, 0]).map((rawVal, i) => {
            const val = Number(rawVal) || 0;
            const fillPct = ((val + 12) / 24) * 100;
            return (
              <div key={i} className="flex flex-col items-center justify-end h-full w-12">
                <span className="text-[12px] font-bold tabular-nums mb-1.5" style={{ color: C.champagne }}>
                  {val > 0 ? `+${val}` : val}
                </span>
                <div className="relative w-9 flex-1 flex items-center justify-center">
                  {/* track */}
                  <div className="absolute left-1/2 -translate-x-1/2 w-1.5 h-full rounded-full"
                    style={{ background: C.container }}>
                    <div className="absolute bottom-0 w-full rounded-full"
                      style={{ height: `${fillPct}%`, background: C.champagne }} />
                    <div className="absolute left-1/2 w-[18px] h-[18px] rounded-full -translate-x-1/2 translate-y-1/2"
                      style={{ bottom: `${fillPct}%`, background: '#ffffff', border: `2px solid ${C.champagne}`, boxShadow: '0 1px 5px rgba(0,0,0,0.3)' }} />
                  </div>
                  <input type="range" min="-12" max="12" step="1" value={val}
                    onChange={e => onBandChange(i, Number(e.target.value))}
                    className="remote-range-vertical absolute inset-0 opacity-0 z-10" />
                </div>
                <span className="text-[10px] font-semibold mt-1.5 uppercase tracking-wide select-none"
                  style={{ color: C.text3, fontFamily: C.fontLabel }}>{BAND_LABELS[i]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* tube / valve parameters */}
      <div className="rounded-xl p-4 flex flex-col gap-4" style={cardWhite}>
        {/* Saturation */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[13px] flex items-center gap-1.5" style={{ color: C.text4 }}>
              <Flame className="h-3.5 w-3.5" style={{ color: ACCENT.sat }} /> Saturation
            </span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: ACCENT.sat }}>
              {saturation}<span className="text-[11px] font-normal" style={{ color: C.text3 }}>/10</span>
            </span>
          </div>
          <RcSlider value={saturation} min={0} max={10} step={1} onChange={onSaturationChange} fill={ACCENT.sat} />
        </div>

        {/* Noise Floor */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[13px] flex items-center gap-1.5" style={{ color: C.text4 }}>
              <AudioLines className="h-3.5 w-3.5" style={{ color: ACCENT.noise }} /> Noise Floor
            </span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: ACCENT.noise }}>
              {noiseFloor}<span className="text-[11px] font-normal" style={{ color: C.text3 }}>/10</span>
            </span>
          </div>
          <RcSlider value={noiseFloor} min={0} max={10} step={1} onChange={onNoiseFloorChange} fill={ACCENT.noise} />
        </div>

        {/* Pre-Amp */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-[13px] flex items-center gap-1.5" style={{ color: C.text4 }}>
              <Sparkles className="h-3.5 w-3.5" style={{ color: C.champagne }} /> Pre-Amp
            </span>
            <span className="text-[14px] font-bold tabular-nums" style={{ color: C.champagne }}>
              {Number(preAmp) > 0 ? `+${Number(preAmp).toFixed(1)}` : Number(preAmp).toFixed(1)}
              <span className="text-[11px] font-normal" style={{ color: C.text3 }}> dB</span>
            </span>
          </div>
          <RcSlider value={preAmp} min={-6} max={6} step={0.5} onChange={onPreAmpChange} />
        </div>
      </div>
    </div>
  );
}
