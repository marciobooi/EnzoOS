import { useMemo } from 'react';
import { Palette, Sun, Monitor, Check } from 'lucide-react';
import { S, cardShadow, swatchRing } from '../styles/stone';
import { useI18n } from '../i18n';

// `name`/`id`/`value` stay stable (used as DB keys / CSS data attributes) —
// only display text (`label`/`name`/`desc`) is translated. Exported as
// functions (not static arrays) because WelcomeWizard.jsx and
// RemoteThemeSettings.jsx share this same data with their own useI18n().
export function getThemeColors(t) {
  return [
    { name: 'amber',    value: '#2a2826', label: t('theme.colors.amber') },
    { name: 'emerald',  value: '#1a9e6a', label: t('theme.colors.emerald') },
    { name: 'cyan',     value: '#0e9ab8', label: t('theme.colors.cyan') },
    { name: 'amethyst', value: '#8a4edc', label: t('theme.colors.amethyst') },
    { name: 'ruby',     value: '#d03535', label: t('theme.colors.ruby') },
  ];
}

export function getScreenThemes(t) {
  return [
    { id: 'dot-matrix',  name: t('theme.screens.dot-matrix.name'),  desc: t('theme.screens.dot-matrix.desc') },
    { id: 'dreamplayer', name: t('theme.screens.dreamplayer.name'), desc: t('theme.screens.dreamplayer.desc') },
    { id: 'glassplayer', name: t('theme.screens.glassplayer.name'), desc: t('theme.screens.glassplayer.desc') },
    { id: 'minimalist',  name: t('theme.screens.minimalist.name'),  desc: t('theme.screens.minimalist.desc') },
    { id: 'origami',     name: t('theme.screens.origami.name'),     desc: t('theme.screens.origami.desc') },
    { id: 'sterling',    name: t('theme.screens.sterling.name'),    desc: t('theme.screens.sterling.desc') },
    { id: 'brutalist',   name: t('theme.screens.brutalist.name'),   desc: t('theme.screens.brutalist.desc') },
    { id: 'cassette',    name: t('theme.screens.cassette.name'),    desc: t('theme.screens.cassette.desc') },
  ];
}

// Backwards-compat default (English) for any stray static import.
export const THEME_COLORS = getThemeColors((k) => k.split('.').pop());
export const SCREEN_THEMES = getScreenThemes((k) => k.split('.').pop());

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
  const { t } = useI18n();
  const themeColors = useMemo(() => getThemeColors(t), [t]);
  const screenThemes = useMemo(() => getScreenThemes(t), [t]);

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
            {t('theme.headerTitle')}
          </span>
        </div>
        {onClose && (
          <button onClick={onClose}
            className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
            style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
            {t('theme.close')}
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
              {t('theme.displayScreenTheme')}
            </span>
            <div className="grid grid-cols-4 gap-2">
              {screenThemes.map(s => (
                <button key={s.id}
                  disabled={s.disabled}
                  onClick={() => onThemeChange?.(s.id)}
                  className={`p-3 rounded-xl flex flex-col justify-between ${
                    s.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-[0.98]'
                  }`}
                  style={{
                    height: '140px',
                    background: activeTheme === s.id ? S.surface : S.surfaceLo,
                    border: `1.5px solid ${activeTheme === s.id ? S.accent : S.border}`,
                  }}>
                  <div className="flex items-start justify-between">
                    <Monitor className="w-5 h-5 shrink-0" strokeWidth={1}
                      style={{ color: activeTheme === s.id && !s.disabled ? S.accent : S.label }} />
                    {activeTheme === s.id && !s.disabled && (
                      <Check className="w-4 h-4 shrink-0" strokeWidth={1.5} style={{ color: S.accent }} />
                    )}
                  </div>
                  <div className="mt-2 flex flex-col gap-4 p-2">
                    <div className="text-base font-bold leading-tight"
                      style={{ color: activeTheme === s.id && !s.disabled ? S.strong : S.muted }}>
                      {s.name}
                    </div>
                    <div className="text-sm font-light mt-1 leading-snug" style={{ color: S.label }}>
                      {s.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Accent color palette */}
          <div>
            <span className="text-sm font-light tracking-[0.25em] uppercase block mb-3" style={{ color: S.label }}>
              {t('theme.matrixEmissionColor')}
            </span>
            <div className="flex flex-wrap gap-2">
              {themeColors.map(c => (
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
                {t('theme.screenHardware')}
              </span>
              <Sun className="w-4 h-4" strokeWidth={1} style={{ color: S.label }} />
            </div>

            {/* Brightness */}
            <div className="rounded-xl p-4 shrink-0"
              style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <div className="flex justify-between items-baseline mb-3">
                <div className="flex items-center gap-2">
                  <Sun className="w-4 h-4" strokeWidth={1} style={{ color: S.label }} />
                  <span className="text-sm font-light" style={{ color: S.muted }}>{t('theme.backlightBrightness')}</span>
                </div>
                <span className="text-2xl font-black tracking-tight" style={{ color: S.strong }}>
                  {brightness}<span className="text-sm font-normal" style={{ color: S.label }}>%</span>
                </span>
              </div>
              <input type="range" min="10" max="100" step="5" value={brightness}
                onChange={e => onBrightnessChange?.(Number(e.target.value))}
                className="stone-range w-full" />
              <div className="flex justify-between mt-2 select-none">
                <span className="text-sm font-light tracking-widest uppercase" style={{ color: S.label }}>{t('theme.dim')}</span>
                <span className="text-sm font-light tracking-widest uppercase" style={{ color: S.label }}>{t('theme.full')}</span>
              </div>
            </div>

            {/* Visualizer mode */}
            <div className="rounded-xl p-4 mt-3 shrink-0"
              style={{ background: S.bg, border: `1px solid ${S.track}` }}>
              <span className="text-sm font-light tracking-[0.25em] uppercase block mb-3" style={{ color: S.label }}>
                {t('theme.activeVisualizer')}
              </span>
              <div className="flex gap-2">
                {[
                  { id: 'vu',      label: t('theme.vuNeedles') },
                  { id: 'digital', label: t('theme.sevenBand') },
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
              {t('theme.dimmingDisclaimer')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
