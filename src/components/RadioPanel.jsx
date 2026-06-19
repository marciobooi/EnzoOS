import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Radio } from 'lucide-react';
import { S, cardShadow } from '../styles/stone';

const COUNTRIES = [
  { code: 'AT', name: 'Austria',        flag: '🇦🇹' },
  { code: 'AU', name: 'Australia',      flag: '🇦🇺' },
  { code: 'BE', name: 'Belgium',        flag: '🇧🇪' },
  { code: 'BR', name: 'Brazil',         flag: '🇧🇷' },
  { code: 'CA', name: 'Canada',         flag: '🇨🇦' },
  { code: 'CH', name: 'Switzerland',    flag: '🇨🇭' },
  { code: 'DE', name: 'Germany',        flag: '🇩🇪' },
  { code: 'DK', name: 'Denmark',        flag: '🇩🇰' },
  { code: 'ES', name: 'Spain',          flag: '🇪🇸' },
  { code: 'FI', name: 'Finland',        flag: '🇫🇮' },
  { code: 'FR', name: 'France',         flag: '🇫🇷' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IE', name: 'Ireland',        flag: '🇮🇪' },
  { code: 'IT', name: 'Italy',          flag: '🇮🇹' },
  { code: 'JP', name: 'Japan',          flag: '🇯🇵' },
  { code: 'NL', name: 'Netherlands',    flag: '🇳🇱' },
  { code: 'NO', name: 'Norway',         flag: '🇳🇴' },
  { code: 'NZ', name: 'New Zealand',    flag: '🇳🇿' },
  { code: 'PL', name: 'Poland',         flag: '🇵🇱' },
  { code: 'PT', name: 'Portugal',       flag: '🇵🇹' },
  { code: 'SE', name: 'Sweden',         flag: '🇸🇪' },
  { code: 'US', name: 'United States',  flag: '🇺🇸' },
];

// ── Station avatar — favicon with Stone fallback ───────────────────────────
function StationAvatar({ station, size = 38 }) {
  const [failed, setFailed] = useState(false);
  const initials = station.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '??';
  return (
    <div className="rounded-xl overflow-hidden flex items-center justify-center shrink-0"
      style={{
        width: size, height: size, minWidth: size,
        background: S.surface,
        border: `1px solid ${S.border}`,
        boxShadow: cardShadow,
      }}>
      {station.favicon && !failed
        ? <img src={station.favicon} alt="" className="w-full h-full object-cover"
            onError={() => setFailed(true)} />
        : <span className="font-extrabold tracking-tighter" style={{ fontSize: Math.max(9, size * 0.3), color: S.accent }}>
            {initials}
          </span>
      }
    </div>
  );
}

// ── Country picker — Stone flag grid ───────────────────────────────────────
function CountryPicker({ value, onChange, fullHeight = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = COUNTRIES.find(c => c.name === value);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  return (
    <div className={`relative flex-grow ${fullHeight ? 'h-full' : ''}`} ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center gap-2 rounded-xl px-3 py-2 cursor-pointer transition-all focus:outline-none ${fullHeight ? 'h-full' : ''}`}
        style={{
          background: S.surface,
          border: `1px solid ${open ? S.accent : S.border}`,
          boxShadow: cardShadow,
        }}
      >
        {selected
          ? <>
              <span style={{ fontSize: 15, lineHeight: 1 }}>{selected.flag}</span>
              <span className="text-xs font-medium flex-1 text-left truncate" style={{ color: S.strong }}>
                {selected.name}
              </span>
            </>
          : <span className="text-xs font-light flex-1 text-left" style={{ color: S.label }}>
              Select country…
            </span>
        }
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
          style={{ color: S.muted }} />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 rounded-xl overflow-hidden"
          style={{
            background: S.bg,
            border: `1px solid ${S.border}`,
            boxShadow: `0 8px 24px rgba(42,40,38,0.18)`,
          }}>
          <div className="grid grid-cols-6 gap-1 p-2 max-h-[160px] overflow-y-auto stone-scrollbar">
            {COUNTRIES.map(c => (
              <button key={c.code}
                onClick={() => { onChange(c.name); setOpen(false); }}
                className="group flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer"
                style={{
                  background: value === c.name ? S.surface : S.surfaceLo,
                  border: `1px solid ${value === c.name ? S.accent : S.border}`,
                  boxShadow: cardShadow,
                }}>
                <span className="text-xl transition-transform duration-150 group-hover:scale-110">{c.flag}</span>
                <span className="font-mono font-medium uppercase tracking-wider transition-colors"
                  style={{ fontSize: 7, color: value === c.name ? S.accent : S.label }}>
                  {c.code}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Frequency band — warm analogue tuner, drag needle to tune ──────────────
function FrequencyBand({ stations, onPlay, favoriteStations = [] }) {
  const [needleIdx, setNeedleIdx]   = useState(null);
  const [playedIdx, setPlayedIdx]   = useState(null);
  const isDragging = useRef(false);
  const bandRef    = useRef(null);

  const activeIdx      = needleIdx ?? playedIdx;
  const displayStation = activeIdx !== null ? stations[activeIdx] ?? null : null;

  const getIdxFromX = useCallback((clientX) => {
    if (!bandRef.current || stations.length === 0) return null;
    const rect = bandRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(x * (stations.length - 1));
  }, [stations.length]);

  const handlePointerDown = (e) => {
    isDragging.current = true;
    bandRef.current?.setPointerCapture(e.pointerId);
    const idx = getIdxFromX(e.clientX);
    if (idx !== null) setNeedleIdx(idx);
  };
  const handlePointerMove = (e) => {
    if (!isDragging.current) return;
    const idx = getIdxFromX(e.clientX);
    if (idx !== null) setNeedleIdx(idx);
  };
  const handlePointerUp = () => {
    isDragging.current = false;
    if (needleIdx !== null && stations[needleIdx]) {
      setPlayedIdx(needleIdx);
      onPlay(stations[needleIdx]);
    }
    setNeedleIdx(null);
  };

  const needlePct  = activeIdx !== null && stations.length > 1
    ? (activeIdx / (stations.length - 1)) * 100 : null;
  const tooltipPct = needleIdx !== null && stations.length > 1
    ? (needleIdx / (stations.length - 1)) * 100 : null;

  useEffect(() => { setNeedleIdx(null); setPlayedIdx(null); }, [stations]);

  return (
    <div className="mt-2 shrink-0 radio-container">
      <div className="relative">

        {/* Tooltip — follows needle drag */}
        {tooltipPct !== null && displayStation && (
          <div className="absolute pointer-events-none"
            style={{ left: `${tooltipPct}%`, bottom: 'calc(100% + 7px)', transform: 'translateX(-50%)', zIndex: 20 }}>
            <div style={{
              background: S.accent,
              border: `1px solid ${S.accent}`,
              borderRadius: 8,
              padding: '5px 10px',
              whiteSpace: 'nowrap',
              boxShadow: `0 4px 16px rgba(42,40,38,0.22)`,
            }}>
              <p style={{ fontSize: 9, color: S.accentFg, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.3 }}>
                {displayStation.name}
              </p>
              {displayStation.country && (
                <p style={{ fontSize: 7, color: `${S.accentFg}99`, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>
                  {displayStation.country}
                </p>
              )}
            </div>
            <div style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${S.accent}` }} />
          </div>
        )}

        {/* FM scale labels */}
        <div className="flex justify-between px-0.5 mb-0.5">
          {['88', '92', '96', '100', '104', '108'].map(l => (
            <span key={l} className="font-mono" style={{ fontSize: 7, color: S.label, letterSpacing: '0.02em' }}>{l}</span>
          ))}
        </div>

        {/* Tuner body — warm stone analogue panel */}
        <div
          ref={bandRef}
          className="relative rounded-xl overflow-hidden cursor-pointer select-none touch-none"
          style={{
            height: 64,
            background: S.surfaceLo,
            border: `1px solid ${S.border}`,
            boxShadow: `inset 0 2px 8px rgba(42,40,38,0.10), inset 0 -1px 3px rgba(42,40,38,0.05), ${cardShadow}`,
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Subtle warm horizontal striping */}
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(42,40,38,0.035) 3px, rgba(42,40,38,0.035) 4px)`,
            zIndex: 3,
          }} />

          {/* Center groove */}
          <div className="absolute inset-x-0 pointer-events-none" style={{
            top: '50%', height: 1,
            background: `linear-gradient(90deg, transparent, ${S.borderHi} 10%, ${S.border} 50%, ${S.borderHi} 90%, transparent)`,
            transform: 'translateY(-50%)', zIndex: 1,
          }} />

          {/* Needle bloom */}
          {needlePct !== null && (
            <div className="absolute inset-y-0 pointer-events-none" style={{
              left: `${needlePct}%`, width: 80,
              transform: 'translateX(-50%)',
              background: S.accent, opacity: 0.07, filter: 'blur(12px)',
            }} />
          )}

          {/* Station ticks */}
          {stations.map((_, i) => {
            const pct     = stations.length > 1 ? (i / (stations.length - 1)) * 100 : 50;
            const isAct   = i === activeIdx;
            const isMajor = i % Math.max(1, Math.floor(stations.length / 10)) === 0;
            const dist    = activeIdx !== null ? Math.abs(i - activeIdx) : Infinity;
            return (
              <div key={i} className="absolute pointer-events-none" style={{
                left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)',
                width:  isAct ? 2 : 1,
                height: isAct ? 44 : isMajor ? 24 : 12,
                background: isAct ? S.accent
                  : dist === 1 ? S.muted
                  : dist === 2 ? S.label
                  : isMajor    ? S.track
                  : S.border,
                borderRadius: 2,
                boxShadow: isAct ? `0 0 4px rgba(42,40,38,0.4)` : 'none',
                zIndex: isAct ? 4 : 1,
                transition: isAct ? 'none' : 'background 0.06s',
              }} />
            );
          })}

          {/* Needle — charcoal triangle cap + stem */}
          {needlePct !== null && (
            <>
              <div className="absolute pointer-events-none" style={{
                top: 0, left: `${needlePct}%`, transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
                borderTop: `7px solid ${S.accent}`, zIndex: 6,
              }} />
              <div className="absolute pointer-events-none" style={{
                left: `${needlePct}%`, top: 7, bottom: 2,
                transform: 'translateX(-50%)', width: 1.5,
                background: `linear-gradient(180deg, ${S.accent} 0%, ${S.accent} 80%, transparent 100%)`,
                zIndex: 5,
              }} />
            </>
          )}
        </div>

        {/* Bottom ruler */}
        <div className="flex justify-between mt-0.5 px-0.5">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} style={{
              width: i % 5 === 0 ? 1.5 : 1,
              height: i % 5 === 0 ? 5 : 3,
              background: i % 5 === 0 ? S.track : S.border,
              borderRadius: 1,
            }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Empty tuner (before country scan) ──────────────────────────────────────
function EmptyBand() {
  return (
    <div className="mt-2 shrink-0 radio-container">
      <div className="flex justify-between px-0.5 mb-0.5">
        {['88', '92', '96', '100', '104', '108'].map(l => (
          <span key={l} className="font-mono" style={{ fontSize: 7, color: S.label }}>{l}</span>
        ))}
      </div>
      <div className="relative rounded-xl overflow-hidden" style={{
        height: 64,
        background: S.surfaceLo,
        border: `1px solid ${S.border}`,
        opacity: 0.55,
        boxShadow: cardShadow,
      }}>
        <div className="absolute inset-x-0" style={{ top: '50%', height: 1, background: S.border, transform: 'translateY(-50%)' }} />
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="absolute" style={{
            left: `${(i / 19) * 100}%`, top: '50%',
            transform: 'translate(-50%, -50%)',
            width: 1, height: i % 4 === 0 ? 20 : 10,
            background: S.track, borderRadius: 1,
          }} />
        ))}
      </div>
      <div className="flex justify-between mt-0.5 px-0.5">
        {Array.from({ length: 21 }).map((_, i) => (
          <div key={i} style={{
            width: i % 5 === 0 ? 1.5 : 1,
            height: i % 5 === 0 ? 5 : 3,
            background: i % 5 === 0 ? S.track : S.border,
            borderRadius: 1,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── Wide variants for the overlay (taller band, more space) ───────────────
function FrequencyBandWide({ stations, onPlay, favoriteStations = [] }) {
  const [needleIdx, setNeedleIdx]   = useState(null);
  const [playedIdx, setPlayedIdx]   = useState(null);
  const isDragging = useRef(false);
  const bandRef    = useRef(null);
  const activeIdx      = needleIdx ?? playedIdx;
  const displayStation = activeIdx !== null ? stations[activeIdx] ?? null : null;

  const getIdxFromX = useCallback((clientX) => {
    if (!bandRef.current || stations.length === 0) return null;
    const rect = bandRef.current.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (stations.length - 1));
  }, [stations.length]);

  const handlePointerDown = (e) => { isDragging.current = true; bandRef.current?.setPointerCapture(e.pointerId); const idx = getIdxFromX(e.clientX); if (idx !== null) setNeedleIdx(idx); };
  const handlePointerMove = (e) => { if (!isDragging.current) return; const idx = getIdxFromX(e.clientX); if (idx !== null) setNeedleIdx(idx); };
  const handlePointerUp   = () => { isDragging.current = false; if (needleIdx !== null && stations[needleIdx]) { setPlayedIdx(needleIdx); onPlay(stations[needleIdx]); } setNeedleIdx(null); };

  const needlePct  = activeIdx !== null && stations.length > 1 ? (activeIdx / (stations.length - 1)) * 100 : null;
  const tooltipPct = needleIdx !== null && stations.length > 1 ? (needleIdx / (stations.length - 1)) * 100 : null;
  useEffect(() => { setNeedleIdx(null); setPlayedIdx(null); }, [stations]);

  return (
    <div className="w-full">
      <div className="relative">
        {tooltipPct !== null && displayStation && (
          <div className="absolute pointer-events-none" style={{ left: `${tooltipPct}%`, bottom: 'calc(100% + 8px)', transform: 'translateX(-50%)', zIndex: 20 }}>
            <div style={{ background: S.accent, borderRadius: 8, padding: '6px 12px', whiteSpace: 'nowrap', boxShadow: `0 4px 16px rgba(42,40,38,0.22)` }}>
              <p style={{ fontSize: 10, color: S.accentFg, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.3 }}>{displayStation.name}</p>
              {displayStation.country && <p style={{ fontSize: 8, color: `${S.accentFg}99`, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>{displayStation.country}</p>}
            </div>
            <div style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderTop: `5px solid ${S.accent}` }} />
          </div>
        )}
        <div className="flex justify-between px-0.5 mb-1">
          {['88', '92', '96', '100', '104', '108'].map(l => (
            <span key={l} className="font-mono" style={{ fontSize: 8, color: S.label, letterSpacing: '0.04em' }}>{l} MHz</span>
          ))}
        </div>
        <div ref={bandRef} className="relative rounded-xl overflow-hidden cursor-pointer select-none touch-none"
          style={{ height: 50, background: S.surfaceLo, border: `1px solid ${S.border}`, boxShadow: `inset 0 2px 10px rgba(42,40,38,0.10), inset 0 -1px 4px rgba(42,40,38,0.05), ${cardShadow}` }}
          onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp} onPointerCancel={handlePointerUp}>
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(42,40,38,0.03) 3px, rgba(42,40,38,0.03) 4px)`, zIndex: 3 }} />
          <div className="absolute inset-x-0 pointer-events-none" style={{ top: '50%', height: 1, background: `linear-gradient(90deg, transparent, ${S.borderHi} 10%, ${S.border} 50%, ${S.borderHi} 90%, transparent)`, transform: 'translateY(-50%)', zIndex: 1 }} />
          {needlePct !== null && <div className="absolute inset-y-0 pointer-events-none" style={{ left: `${needlePct}%`, width: 80, transform: 'translateX(-50%)', background: S.accent, opacity: 0.07, filter: 'blur(12px)' }} />}
          {stations.map((_, i) => {
            const pct = stations.length > 1 ? (i / (stations.length - 1)) * 100 : 50;
            const isAct = i === activeIdx;
            const isMajor = i % Math.max(1, Math.floor(stations.length / 10)) === 0;
            const dist = activeIdx !== null ? Math.abs(i - activeIdx) : Infinity;
            return <div key={i} className="absolute pointer-events-none" style={{ left: `${pct}%`, top: '50%', transform: 'translate(-50%, -50%)', width: isAct ? 2 : 1, height: isAct ? 72 : isMajor ? 36 : 18, background: isAct ? S.accent : dist === 1 ? S.muted : dist === 2 ? S.label : isMajor ? S.track : S.border, borderRadius: 2, boxShadow: isAct ? `0 0 4px rgba(42,40,38,0.4)` : 'none', zIndex: isAct ? 4 : 1, transition: isAct ? 'none' : 'background 0.06s' }} />;
          })}
          {needlePct !== null && <>
            <div className="absolute pointer-events-none" style={{ top: 0, left: `${needlePct}%`, transform: 'translateX(-50%)', width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: `9px solid ${S.accent}`, zIndex: 6 }} />
            <div className="absolute pointer-events-none" style={{ left: `${needlePct}%`, top: 9, bottom: 2, transform: 'translateX(-50%)', width: 2, background: `linear-gradient(180deg, ${S.accent} 0%, ${S.accent} 80%, transparent 100%)`, zIndex: 5 }} />
          </>}
        </div>
        <div className="flex justify-between mt-1 px-0.5">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} style={{ width: i % 5 === 0 ? 1.5 : 1, height: i % 5 === 0 ? 6 : 3, background: i % 5 === 0 ? S.track : S.border, borderRadius: 1 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyBandWide() {
  return (
    <div className="w-full">
      <div className="flex justify-between px-0.5 mb-1">
        {['88', '92', '96', '100', '104', '108'].map(l => (
          <span key={l} className="font-mono" style={{ fontSize: 8, color: S.border, letterSpacing: '0.04em' }}>{l} MHz</span>
        ))}
      </div>
      <div className="relative rounded-xl overflow-hidden flex items-center justify-center"
        style={{ height: 50, background: S.surfaceLo, border: `1px solid ${S.border}`, boxShadow: cardShadow }}>
        {/* Subtle center groove only */}
        <div className="absolute inset-x-0 pointer-events-none"
          style={{ top: '50%', height: 1, background: `linear-gradient(90deg, transparent, ${S.border} 20%, ${S.border} 80%, transparent)`, transform: 'translateY(-50%)' }} />
        <p className="text-sm font-light tracking-wide relative z-10" style={{ color: S.label }}>
          Select a country to scan stations
        </p>
      </div>
      <div className="flex justify-between mt-1 px-0.5">
        {Array.from({ length: 21 }).map((_, i) => (
          <div key={i} style={{ width: i % 5 === 0 ? 1.5 : 1, height: i % 5 === 0 ? 6 : 3, background: S.border, borderRadius: 1 }} />
        ))}
      </div>
    </div>
  );
}

// ── Main export — full-overlay radio search panel ─────────────────────────
export default function RadioPanel({
  onToggleSource,
  onClose,
  radioCountry,
  setRadioCountry,
  stationsList,
  isSearching,
  handleRadioByCountry,
  onPlayRadio,
  favoriteStations = [],
  onToggleFavoriteRadio,
}) {
  useEffect(() => {
    if (radioCountry) handleRadioByCountry(radioCountry);
  }, [radioCountry]);

  return (
    <div className="rounded-2xl p-5 h-full flex flex-col justify-between font-sans overflow-hidden"
      style={{ background: S.bg, border: `1px solid ${S.borderHi}` }}>

      {/* ── Header — mirrors ThemeSettingsControl / EqualizerControl ── */}
      <div className="flex items-center justify-between mb-1 shrink-0"
        style={{ borderBottom: `1px solid ${S.border}` }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
            style={{ border: `1px solid ${S.border}` }}>
            <Radio className="w-3.5 h-3.5" strokeWidth={1} style={{ color: S.label }} />
          </div>
          <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
            web radio station search
          </span>
        </div>
        <button onClick={onClose}
          className="cursor-pointer px-4 py-1.5 rounded-full transition-all active:scale-95 active:opacity-80 text-sm font-extrabold"
          style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
          CLOSE
        </button>
      </div>

      {/* ── Row 1: shared label row, then content row — guarantees alignment ── */}
      <div className="shrink-0 mb-3">

        {/* Labels — same grid, same row, same height */}
        <div className="grid grid-cols-12 gap-3 mb-2">
          <div className="col-span-5">
            <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
              select country
            </span>
          </div>
          <div className="col-span-7 flex items-center justify-between">
            <span className="text-sm font-light tracking-[0.25em] uppercase" style={{ color: S.label }}>
              saved stations
            </span>
            {favoriteStations.length > 0 && (
              <span className="text-sm font-light tabular-nums" style={{ color: S.label }}>
                {favoriteStations.length}
              </span>
            )}
          </div>
        </div>

        {/* Content — same grid, inputs start at identical y */}
        <div className="grid grid-cols-12 gap-3 items-stretch">

          {/* Country picker */}
          <div className="col-span-5 flex gap-2 items-stretch">
            <CountryPicker value={radioCountry} onChange={setRadioCountry} fullHeight />
            {isSearching && (
              <span className="flex items-end gap-0.5 h-3 shrink-0">
                {[0.6, 1, 0.7].map((h, i) => (
                  <span key={i} className="w-0.5 rounded-full animate-pulse"
                    style={{ height: `${Math.round(h * 12)}px`, background: S.accent, animationDelay: `${i * 120}ms` }} />
                ))}
              </span>
            )}
          </div>

          {/* Saved stations — horizontal scroll */}
          <div className="col-span-7 rounded-xl p-2 overflow-x-auto stone-scrollbar"
            style={{ background: S.surface, border: `1px solid ${S.border}` }}>
            {favoriteStations.length > 0 ? (
              <div className="flex gap-2 h-full items-center" style={{ minWidth: 'max-content' }}>
                {favoriteStations.map((station, idx) => (
                  <button
                    key={`${station.url}-${idx}`}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all cursor-pointer active:scale-[0.99] shrink-0"
                    style={{ background: S.surfaceLo, border: `1px solid ${S.border}`, boxShadow: cardShadow }}
                    onClick={() => { onPlayRadio(station.url, station.name, station.favicon); onClose(); }}
                  >
                    <StationAvatar station={station} size={24} />
                    <p className="text-sm font-medium truncate leading-tight" style={{ color: S.strong, maxWidth: 110 }}>
                      {station.name}
                    </p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm font-light flex items-center h-full px-1" style={{ color: S.label }}>
                No saved stations yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: frequency band — full width ── */}
      <div className="flex flex-col flex-grow min-h-0 rounded-xl p-1"
        style={{ background: S.surface, border: `1px solid ${S.border}` }}>
        <span className="text-xs font-light tracking-[0.25em] uppercase mb-1 shrink-0" style={{ color: S.label }}>
          frequency band
          {stationsList.length > 0 && (
            <span className="normal-case tracking-normal ml-2 text-sm font-light" style={{ color: S.label }}>
              — drag needle to tune · {stationsList.length} stations
            </span>
          )}
        </span>
        <div className="flex-grow flex flex-col justify-center">
          {stationsList.length > 0
            ? <FrequencyBandWide
                stations={stationsList}
                onPlay={(station) => { onPlayRadio(station.url, station.name, station.favicon); onClose(); }}
                favoriteStations={favoriteStations}
              />
            : <EmptyBandWide />
          }
        </div>
      </div>
    </div>
  );
}
