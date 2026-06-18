import React from 'react';
import { Palette, Sun, Monitor, X, Check } from 'lucide-react';
import { S, cardShadow, swatchRing } from '../styles/stone';

export const THEME_COLORS = [
  { name: 'amber',    value: '#f59e0b', label: 'Vintage Amber' },
  { name: 'emerald',  value: '#10b981', label: 'Classic Green' },
  { name: 'cyan',     value: '#06b6d4', label: 'Lab Blue'      },
  { name: 'amethyst', value: '#a855f7', label: 'Laser Purple'  },
  { name: 'ruby',     value: '#ef4444', label: 'Neon Red'      },
];

export const SCREEN_THEMES = [
  { id: 'dot-matrix',  name: 'Retro Dot-Matrix',     desc: 'Phosphor LED grid matrix simulation'       },
  { id: 'dreamplayer', name: 'Dreamplayer',           desc: 'Neo Glass Retrofuture — square buttons'    },
  { id: 'glassplayer', name: 'Glassplayer',           desc: 'Liquid Glass Retrofuture'                  },
  { id: 'minimalist',  name: 'Minimalist',            desc: 'Dynamic 2-column album color console'      },
  { id: 'neon-glow',   name: 'Cyberpunk Neon',        desc: 'Vibrant neon tube display mode',   disabled: true },
  { id: 'vfd-chamber', name: 'VFD Vacuum Tube',       desc: 'Vacuum fluorescent display styling', disabled: true },
];

export default function ThemeSettingsControl({
  activeTheme = 'dot-matrix',
  onThemeChange,
  themeColor = 'amber',
  onColorChange,
  brightness = 100,
  onBrightnessChange,
  visualizerMode = 'vu',
  onVisualizerModeChange,
  onClose,
}) {
  return (
    <div className="rounded-2xl p-5 h-full flex flex-col justify-between font-sans overflow-hidden"
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pb-3 mb-3 shrink-0"
        style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          <span className="text-[7px] font-light tracking-[0.4em] uppercase" style={{ color: S.label }}>
            resonance theme &amp; display control
          </span>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="cursor-pointer px-3 py-1 rounded-full transition-all active:scale-95 text-[8px] font-light tracking-wide"
            style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
            close
          </button>
        )}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-grow overflow-hidden">

        {/* Left — Themes & Colors */}
        <div className="lg:col-span-7 flex flex-col gap-4 overflow-y-auto pr-1 stone-scrollbar">

          {/* Screen theme selector */}
          <div>
            <span className="text-[7px] font-light tracking-[0.4em] uppercase block mb-2" style={{ color: S.label }}>
              display screen theme
            </span>
            <div className="flex flex-col gap-1.5">
              {SCREEN_THEMES.map(t => (
                <button key={t.id}
                  disabled={t.disabled}
                  onClick={() => onThemeChange?.(t.id)}
                  className={`w-full p-3 rounded-xl text-left flex items-start justify-between transition-all select-none ${
                    t.disabled ? 'opacity-35 cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'
                  }`}
                  style={{
                    background: activeTheme === t.id ? S.surface : S.surfaceLo,
                    border: `1px solid ${activeTheme === t.id ? S.accent : S.border}`,
                    boxShadow: activeTheme === t.id ? cardShadow : 'none',
                  }}>
                  <div className="flex items-start gap-2.5">
                    <Monitor className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1}
                      style={{ color: activeTheme === t.id && !t.disabled ? S.accent : S.label }} />
                    <div>
                      <div className="text-[11px] font-bold leading-tight"
                        style={{ color: activeTheme === t.id && !t.disabled ? S.strong : S.muted }}>
                        {t.name}
                      </div>
                      <div className="text-[8px] font-light mt-0.5 leading-normal" style={{ color: S.muted }}>
                        {t.desc}
                      </div>
                    </div>
                  </div>
                  {activeTheme === t.id && !t.disabled && (
                    <Check className="w-4 h-4 shrink-0 mt-0.5" strokeWidth={1.5} style={{ color: S.accent }} />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Accent color palette */}
          <div>
            <span className="text-[7px] font-light tracking-[0.4em] uppercase block mb-2" style={{ color: S.label }}>
              matrix light emission color
            </span>
            <div className="flex flex-wrap gap-2">
              {THEME_COLORS.map(c => (
                <button key={c.name}
                  onClick={() => onColorChange?.(c.name)}
                  className="px-3 py-2 rounded-xl flex items-center gap-2 transition-all cursor-pointer select-none active:scale-95"
                  style={{
                    background: themeColor === c.name ? S.surface : S.surfaceLo,
                    border: `1px solid ${themeColor === c.name ? S.borderHi : S.border}`,
                    boxShadow: themeColor === c.name ? cardShadow : 'none',
                  }}>
                  <div className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: c.value, boxShadow: swatchRing }} />
                  <span className="text-[9px]"
                    style={{ color: themeColor === c.name ? S.strong : S.muted,
                             fontWeight: themeColor === c.name ? 700 : 400 }}>
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — Hardware parameters */}
        <div className="lg:col-span-5 rounded-xl p-4 flex flex-col justify-between overflow-hidden"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-[7px] font-light tracking-[0.4em] uppercase" style={{ color: S.label }}>
                screen hardware parameters
              </span>
              <Sun className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
            </div>

            {/* Brightness */}
            <div className="rounded-xl p-3 shrink-0"
              style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <div className="flex justify-between items-baseline mb-2">
                <div className="flex items-center gap-1.5">
                  <Sun className="w-3 h-3" strokeWidth={1} style={{ color: S.label }} />
                  <span className="text-[8px] font-light tracking-wide" style={{ color: S.muted }}>
                    Backlight Brightness
                  </span>
                </div>
                <span className="text-[13px] font-black tracking-tight" style={{ color: S.strong }}>
                  {brightness}<span className="text-[9px] font-normal" style={{ color: S.label }}>%</span>
                </span>
              </div>
              <input type="range" min="10" max="100" step="5" value={brightness}
                onChange={e => onBrightnessChange?.(Number(e.target.value))}
                className="w-full h-0.5 rounded-full appearance-none cursor-pointer"
                style={{ background: S.track, accentColor: S.accent }} />
              <div className="flex justify-between mt-1.5 select-none">
                <span className="text-[7px] font-light tracking-[0.3em] uppercase" style={{ color: S.label }}>dim</span>
                <span className="text-[7px] font-light tracking-[0.3em] uppercase" style={{ color: S.label }}>full</span>
              </div>
            </div>

            {/* Visualizer mode */}
            <div className="rounded-xl p-3 mt-3 shrink-0"
              style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <span className="text-[7px] font-light tracking-[0.4em] uppercase block mb-2.5" style={{ color: S.label }}>
                active player visualizer
              </span>
              <div className="flex gap-2">
                {[
                  { id: 'vu',      label: 'VU Needles' },
                  { id: 'digital', label: '7-Band'     },
                ].map(m => (
                  <button key={m.id}
                    onClick={() => onVisualizerModeChange?.(m.id)}
                    className="flex-1 py-2 rounded-xl text-center transition-all cursor-pointer select-none active:scale-95"
                    style={{
                      background: visualizerMode === m.id ? S.accent : S.surfaceLo,
                      border: visualizerMode === m.id ? 'none' : `1px solid ${S.border}`,
                      color: visualizerMode === m.id ? S.accentFg : S.muted,
                    }}>
                    <span className="text-[9px] font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-2 mt-2 shrink-0" style={{ borderTop: `0.5px solid ${S.border}` }}>
            <p className="text-[7px] font-light text-center leading-relaxed" style={{ color: S.label }}>
              Backlight dimming applies a software rendering overlay to protect screen lifetime on Waveshare HDMI hardware.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
