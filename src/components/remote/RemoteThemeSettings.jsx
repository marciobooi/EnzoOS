import React, { useContext, useMemo } from 'react';
import { Monitor, Check, Sun } from 'lucide-react';
import { Tk } from './shared';
import { getThemeColors, getScreenThemes } from '../ThemeSettingsControl';
import { useI18n } from '../../i18n';

// ─── horizontal slider with the remote's champagne fill + invisible thumb ────
function RcSlider({ value, min, max, step, onChange }) {
  const { C } = useContext(Tk);
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="relative h-1.5 rounded-full" style={{ background: C.container }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: C.champagne }} />
      <div className="absolute w-[18px] h-[18px] rounded-full -translate-x-1/2 -translate-y-1/2 top-1/2"
        style={{ left: `${pct}%`, background: '#ffffff', border: `2px solid ${C.champagne}`, boxShadow: '0 1px 5px rgba(0,0,0,0.25)' }} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
    </div>
  );
}

function Group({ title, children }) {
  const { C } = useContext(Tk);
  return (
    <div className="mb-5">
      <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: C.text3, fontFamily: C.fontLabel }}>{title}</p>
      {children}
    </div>
  );
}

export default function RemoteThemeSettings({
  activeTheme = 'dot-matrix', onThemeChange,
  themeColor = 'amber', onColorChange,
  brightness = 100, onBrightnessChange,
  visualizerMode = 'vu', onVisualizerModeChange,
}) {
  const { C, card, cardWhite, btnInset } = useContext(Tk);
  const { t } = useI18n();
  const themeColors = useMemo(() => getThemeColors(t), [t]);
  const screenThemes = useMemo(() => getScreenThemes(t), [t]);

  return (
    <div style={{ fontFamily: C.font }}>

      {/* ── Screen theme ─────────────────────────────────────────────────── */}
      <Group title={t('theme.remoteDisplayScreen')}>
        <div className="grid grid-cols-2 gap-3">
          {screenThemes.map(s => {
            const active = activeTheme === s.id;
            return (
              <button key={s.id} disabled={s.disabled} onClick={() => onThemeChange?.(s.id)}
                className="p-4 rounded-xl flex flex-col text-left active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40"
                style={active ? { ...btnInset, border: `1px solid ${C.champagne}55` } : { ...card }}>
                <div className="flex items-start justify-between mb-3">
                  <Monitor className="h-5 w-5" style={{ color: active ? C.champagne : C.text4 }} />
                  {active && <Check className="h-4 w-4" style={{ color: C.champagne }} />}
                </div>
                <span className="text-[14px] font-semibold leading-tight"
                  style={{ color: active ? C.text1 : C.text2 }}>{s.name}</span>
                <span className="text-[11px] mt-1 leading-snug" style={{ color: C.text3 }}>{s.desc}</span>
              </button>
            );
          })}
        </div>
      </Group>

      {/* ── Accent colour ────────────────────────────────────────────────── */}
      <Group title={t('theme.remoteMatrixColor')}>
        <div className="rounded-xl p-2 flex flex-col gap-1" style={cardWhite}>
          {themeColors.map(c => {
            const active = themeColor === c.name;
            return (
              <button key={c.name} onClick={() => onColorChange?.(c.name)}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg active:opacity-70 transition-all cursor-pointer text-left"
                style={active ? { background: C.containerLow } : {}}>
                <span className="w-5 h-5 rounded-full shrink-0"
                  style={{ background: c.value, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.15)' }} />
                <span className="flex-1 text-[14px]" style={{ color: active ? C.text1 : C.text2, fontWeight: active ? 600 : 400 }}>
                  {c.label}
                </span>
                {active && <Check className="h-4 w-4 shrink-0" style={{ color: C.champagne }} />}
              </button>
            );
          })}
        </div>
      </Group>

      {/* ── Brightness ───────────────────────────────────────────────────── */}
      <Group title={t('theme.remoteScreenHardware')}>
        <div className="rounded-xl p-4" style={cardWhite}>
          <div className="flex justify-between items-center mb-3">
            <span className="text-[13px] flex items-center gap-1.5" style={{ color: C.text4 }}>
              <Sun className="h-3.5 w-3.5" style={{ color: C.champagne }} /> {t('theme.backlightBrightness')}
            </span>
            <span className="text-[16px] font-bold tabular-nums" style={{ color: C.text1 }}>
              {brightness}<span className="text-[11px] font-normal" style={{ color: C.text3 }}>%</span>
            </span>
          </div>
          <RcSlider value={brightness} min={10} max={100} step={5} onChange={onBrightnessChange} />
          <div className="flex justify-between mt-2 select-none">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: C.text3 }}>{t('theme.dim')}</span>
            <span className="text-[10px] uppercase tracking-widest" style={{ color: C.text3 }}>{t('theme.full')}</span>
          </div>
        </div>
      </Group>

      {/* ── Visualizer ───────────────────────────────────────────────────── */}
      <Group title={t('theme.remotePlayerVisualizer')}>
        <div className="flex gap-2">
          {[{ id: 'vu', label: t('theme.vuNeedles') }, { id: 'digital', label: t('theme.sevenBand') }].map(m => {
            const active = visualizerMode === m.id;
            return (
              <button key={m.id} onClick={() => onVisualizerModeChange?.(m.id)}
                className="flex-1 py-3 rounded-xl text-center active:scale-95 transition-all cursor-pointer"
                style={active
                  ? { background: C.champagne, color: '#1a1c1c' }
                  : { ...card, color: C.text4 }}>
                <span className="text-[13px] font-semibold">{m.label}</span>
              </button>
            );
          })}
        </div>
      </Group>

      <p className="text-[11px] text-center leading-relaxed px-2 pb-2" style={{ color: C.text3 }}>
        {t('theme.remoteDimmingDisclaimer')}
      </p>
    </div>
  );
}
