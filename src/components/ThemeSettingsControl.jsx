import React from 'react';
import { Palette, Sun, Monitor, X, Check } from 'lucide-react';

export const THEME_COLORS = [
  { name: 'amber', value: '#f59e0b', label: 'Vintage Amber' },
  { name: 'emerald', value: '#10b981', label: 'Classic Green' },
  { name: 'cyan', value: '#06b6d4', label: 'Lab Blue' },
  { name: 'amethyst', value: '#a855f7', label: 'Laser Purple' },
  { name: 'ruby', value: '#ef4444', label: 'Neon Red' }
];

export const SCREEN_THEMES = [
  { id: 'dot-matrix', name: 'Retro Dot-Matrix', desc: 'Phosphor LED grid matrix simulation' },
  { id: 'dreamplayer', name: 'Dreamplayer Theme', desc: 'Neo Glass Retrofuture (Square Buttons)' },
  { id: 'glassplayer', name: 'Glassplayer Theme', desc: 'Liquid Glass Retrofuture Theme' },
  { id: 'neon-glow', name: 'Cyberpunk Neon (Future)', desc: 'Vibrant neon tube display mode', disabled: true },
  { id: 'vfd-chamber', name: 'VFD Vacuum Tube (Future)', desc: 'Vacuum fluorescent display styling', disabled: true }
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
  onClose
}) {
  return (
    <div className="bg-[#0b0f19] border border-white/10 rounded-2xl p-5 relative overflow-hidden h-full flex flex-col justify-between text-zinc-100 font-sans shadow-2xl">
      {/* Glossy sheen */}
      <div className="absolute inset-0 pointer-events-none opacity-30 bg-gradient-to-tr from-transparent via-white/5 to-white/10" />

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[var(--theme-color)]" />
          <span className="font-sans font-extrabold text-[10px] tracking-[0.2em] text-zinc-100 uppercase">
            RESONANCE THEME & DISPLAY CONTROL
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors cursor-pointer p-0.5"
            title="Close Theme Settings"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch flex-grow overflow-hidden">
        {/* Left Side: Themes & Colors */}
        <div className="lg:col-span-7 flex flex-col justify-between gap-4 overflow-y-auto pr-1">
          {/* Themes Selector */}
          <div>
            <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider block mb-2">
              DISPLAY SCREEN THEME
            </span>
            <div className="flex flex-col gap-2">
              {SCREEN_THEMES.map((t) => (
                <button
                  key={t.id}
                  disabled={t.disabled}
                  onClick={() => onThemeChange && onThemeChange(t.id)}
                  className={`w-full p-3 rounded-xl border text-left flex items-start justify-between transition-all select-none ${
                    t.disabled 
                      ? 'opacity-40 cursor-not-allowed border-white/5 bg-black/20'
                      : activeTheme === t.id
                        ? 'border-[var(--theme-color)] bg-[var(--theme-color)]/5 cursor-pointer'
                        : 'border-white/10 bg-zinc-900/60 hover:bg-zinc-800/80 cursor-pointer'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <Monitor className={`w-4 h-4 mt-0.5 ${activeTheme === t.id && !t.disabled ? 'text-[var(--theme-color)]' : 'text-zinc-500'}`} />
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-100">
                        {t.name}
                      </div>
                      <div className="text-[9px] text-zinc-400 font-sans mt-0.5 leading-normal">
                        {t.desc}
                      </div>
                    </div>
                  </div>
                  {activeTheme === t.id && !t.disabled && (
                    <Check className="w-4 h-4 text-[var(--theme-color)]" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Color palette */}
          <div>
            <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider block mb-2">
              MATRIX LIGHT EMISSION COLOR
            </span>
            <div className="flex flex-wrap gap-2.5">
              {THEME_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => onColorChange && onColorChange(c.name)}
                  className={`px-3 py-2 rounded-xl border flex items-center gap-2 transition-all cursor-pointer select-none active:scale-95 ${
                    themeColor === c.name
                      ? 'border-white/20 bg-white/5 shadow-md'
                      : 'border-white/10 bg-zinc-900/40 hover:bg-zinc-800/40'
                  }`}
                >
                  <div 
                    className="w-3.5 h-3.5 rounded-full border border-black/30 shadow-inner shrink-0" 
                    style={{ backgroundColor: c.value }} 
                  />
                  <span className={`font-mono text-[10px] ${themeColor === c.name ? 'text-white font-bold' : 'text-zinc-400'}`}>
                    {c.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Side: Brightness & Performance */}
        <div className="lg:col-span-5 bg-zinc-950/60 border border-white/5 rounded-xl p-4 flex flex-col justify-between overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-2 shrink-0">
              <span className="font-mono text-[9px] text-zinc-400 tracking-wider">
                SCREEN HARDWARE PARAMETERS
              </span>
              <Sun className="w-3.5 h-3.5 text-amber-500" />
            </div>

            {/* Brightness slider */}
            <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 mt-1.5 shrink-0">
              <div className="flex justify-between items-center text-[9.5px] mb-1 font-sans">
                <span className="font-mono text-zinc-300 flex items-center gap-1.5">
                  <Sun className="w-3 h-3 text-zinc-400" /> Backlight Brightness
                </span>
                <span className="font-mono text-[var(--theme-color)] font-bold">{brightness}%</span>
              </div>
              <input
                type="range"
                min="10"
                max="100"
                step="5"
                value={brightness}
                onChange={(e) => onBrightnessChange && onBrightnessChange(Number(e.target.value))}
                className="w-full accent-[var(--theme-color)] h-1 bg-zinc-800 rounded-full appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-[7.5px] text-zinc-500 font-mono mt-0.5 select-none">
                <span>10% (Dim)</span>
                <span>100% (Full Power)</span>
              </div>
            </div>

            {/* Visualizer Mode Selection */}
            <div className="bg-zinc-900/40 border border-white/5 rounded-xl p-3 mt-3 shrink-0">
              <span className="font-mono text-[9px] text-zinc-400 uppercase tracking-wider block mb-2 font-bold">
                ACTIVE PLAYER VISUALIZER
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => onVisualizerModeChange && onVisualizerModeChange('vu')}
                  className={`flex-1 py-1.5 rounded-xl border text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer text-center select-none active:scale-95 ${
                    visualizerMode === 'vu'
                      ? 'border-[var(--theme-color)] bg-[var(--theme-color)]/5 text-white'
                      : 'border-white/10 bg-zinc-900/40 hover:bg-zinc-800/40 text-zinc-400'
                  }`}
                >
                  VU Needles
                </button>
                <button
                  onClick={() => onVisualizerModeChange && onVisualizerModeChange('digital')}
                  className={`flex-1 py-1.5 rounded-xl border text-[9px] uppercase font-bold tracking-wider transition-all cursor-pointer text-center select-none active:scale-95 ${
                    visualizerMode === 'digital'
                      ? 'border-[var(--theme-color)] bg-[var(--theme-color)]/5 text-white'
                      : 'border-white/10 bg-zinc-900/40 hover:bg-zinc-800/40 text-zinc-400'
                  }`}
                >
                  7-Band Digital
                </button>
              </div>
            </div>
          </div>

          <div className="border-t border-white/5 pt-2 mt-2 shrink-0">
            <p className="font-mono text-[7.5px] text-center text-zinc-500 leading-normal">
              Backlight dimming applies a software rendering overlay to protect screen lifetime on Waveshare HDMI hardware. Refresh rate is maintained at standard sync depth.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
