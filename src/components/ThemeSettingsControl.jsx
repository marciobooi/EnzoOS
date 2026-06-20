import React from 'react';
import { Palette, Sun, Monitor, Check } from 'lucide-react';
import { S, cardShadow, swatchRing } from '../styles/stone';

export const THEME_COLORS = [
  { name: 'amber',    value: '#2a2826', label: 'Stone Charcoal' },
  { name: 'emerald',  value: '#1a9e6a', label: 'Classic Green' },
  { name: 'cyan',     value: '#0e9ab8', label: 'Lab Blue'      },
  { name: 'amethyst', value: '#8a4edc', label: 'Laser Purple'  },
  { name: 'ruby',     value: '#d03535', label: 'Neon Red'      },
];

export const SCREEN_THEMES = [
  { id: 'dot-matrix',  name: 'Retro Dot-Matrix', desc: 'Phosphor LED grid matrix simulation'    },
  { id: 'dreamplayer', name: 'Dreamplayer',       desc: 'Neo Glass Retrofuture' },
  { id: 'glassplayer', name: 'Glassplayer',       desc: 'Liquid Glass Retrofuture'               },
  { id: 'minimalist',  name: 'Minimalist',        desc: 'Dynamic 2-column album color'   },
  { id: 'origami',     name: 'Origami',           desc: 'Kindle paper & ink luxury'              },
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
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${S.border}` }}>
            <Palette className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          </div>
          <span className="text-sm font-light tracking-[0.25em] uppercase underline underline-offset-8 decoration-[#2a2826] decoration-1" style={{ color: S.label }}>
            resonance theme &amp; display control
          </span>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
            style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
            CLOSE
          </button>
        )}
      </div>

      {/* ── Grid ────────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-grow overflow-hidden">

        {/* Left — Themes & Colors */}
        <div className="lg:col-span-7 flex flex-col gap-4 overflow-y-auto rounded-xl p-4 stone-scrollbar"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>

          {/* Screen theme cards */}
          <div>
            <span className="text-sm font-light tracking-[0.25em] uppercase block mb-3" style={{ color: S.label }}>
              display screen theme
            </span>
            <div className="grid grid-cols-4 gap-2">
              {SCREEN_THEMES.map(t => (
                <button key={t.id}
                  disabled={t.disabled}
                  onClick={() => onThemeChange?.(t.id)}
                  className={`p-3 rounded-xl flex flex-col justify-between lowed' : 'cursor-pointer active:scale-[0.98]'
                  }`}
                  style={{
                    height: '140px',
                    background: activeTheme === t.id ? S.surface : S.surfaceLo,
                    border: `1.5px solid ${activeTheme === t.id ? S.accent : S.border}`,
                  }}>
                  <div className="flex items-start justify-between">
                    <Monitor className="w-5 h-5 shrink-0" strokeWidth={1}
                      style={{ color: activeTheme === t.id && !t.disabled ? S.accent : S.label }} />
                    {activeTheme === t.id && !t.disabled && (
                      <Check className="w-4 h-4 shrink-0" strokeWidth={1.5} style={{ color: S.accent }} />
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-4 p-2">
                    <div className="text-base font-bold leading-tight"
                      style={{ color: activeTheme === t.id && !t.disabled ? S.strong : S.muted }}>
                      {t.name}
                    </div>
                    <div className="text-sm font-light mt-1 leading-snug" style={{ color: S.label }}>
                      {t.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Accent color palette */}
          <div>
            <span className="text-sm font-light tracking-[0.25em] uppercase block mb-3" style={{ color: S.label }}>
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
                
                  }}>
                  <div className="w-3.5 h-3.5 rounded-full shrink-0"
                    style={{ background: c.value, boxShadow: swatchRing }} />
                  <span className="text-sm"
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
        <div className="lg:col-span-5 rounded-xl p-4 flex flex-col justify-between overflow-y-auto stone-scrollbar"
          style={{ background: S.surface, border: `1px solid ${S.border}` }}>
          <div>
            <div className="flex items-center justify-between mb-3 shrink-0">
              <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
                screen hardware parameters
              </span>
              <Sun className="w-4 h-4" strokeWidth={1} style={{ color: S.label }} />
            </div>

            {/* Brightness */}
            <div className="rounded-xl p-4 shrink-0"
              style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <div className="flex justify-between items-baseline mb-3">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4" strokeWidth={1} style={{ color: S.label }} />
                  <span className="text-sm font-light" style={{ color: S.muted }}>Backlight Brightness</span>
                </div>
                <span className="text-2xl font-black tracking-tight" style={{ color: S.strong }}>
                  {brightness}<span className="text-sm font-normal" style={{ color: S.label }}>%</span>
                </span>
              </div>
              <input type="range" min="10" max="100" step="5" value={brightness}
                onChange={e => onBrightnessChange?.(Number(e.target.value))}
                className="stone-range w-full" />
              <div className="flex justify-between mt-2 select-none">
                <span className="text-sm font-light tracking-widest uppercase" style={{ color: S.label }}>dim</span>
                <span className="text-sm font-light tracking-widest uppercase" style={{ color: S.label }}>full</span>
              </div>
            </div>

            {/* Visualizer mode */}
            <div className="rounded-xl p-4 mt-3 shrink-0"
              style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <span className="text-sm font-light tracking-[0.25em] uppercase block mb-3" style={{ color: S.label }}>
                active player visualizer
              </span>
              <div className="flex gap-2">
                {[
                  { id: 'vu',      label: 'VU Needles' },
                  { id: 'digital', label: '7-Band'     },
                ].map(m => (
                  <button key={m.id}
                    onClick={() => onVisualizerModeChange?.(m.id)}
                    className="flex-1 py-2.5 rounded-xl text-center transition-all cursor-pointer select-none active:scale-95"
                    style={{
                      background: visualizerMode === m.id ? S.accent : S.surfaceLo,
                      border: visualizerMode === m.id ? 'none' : `1px solid ${S.border}`,
                      color: visualizerMode === m.id ? S.accentFg : S.muted,
                      boxShadow: visualizerMode === m.id ? 'none' : cardShadow,
                    }}>
                    <span className="text-sm font-medium">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="pt-3 mt-2 shrink-0" style={{ borderTop: `0.5px solid ${S.border}` }}>
            <p className="text-sm font-light text-center leading-relaxed" style={{ color: S.label }}>
              Backlight dimming applies a software rendering overlay to protect screen lifetime on Waveshare HDMI hardware.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
