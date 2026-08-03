import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft, Music, Library, Layers, Sliders, Search, Zap, Moon, Coffee, Flame, PartyPopper, Shuffle } from 'lucide-react';

export const Tk = createContext({});

// Shared between BottomNav (phone) and the tablet sidebar — one source of
// truth for tab identity/icon/order so the two shells can't drift apart.
export const NAV_TABS = [
  { id: 'player',   Icon: Music,    labelKey: 'nav.player'   },
  { id: 'library',  Icon: Library,  labelKey: 'nav.library'  },
  { id: 'search',   Icon: Search,   labelKey: 'nav.search'   },
  { id: 'source',   Icon: Layers,   labelKey: 'nav.source'   },
  { id: 'settings', Icon: Sliders,  labelKey: 'nav.settings' },
];

// Full-screen remote sheet — solid background (no dim), header with a back
// button. Portaled to <body> so it escapes the tab-slide transform (a
// transformed ancestor would otherwise trap the fixed element inside the
// content area, leaving the nav/mini-player visible underneath it).
//
// `inline`: tablet callers (SourceTab/UniversalSearch, passed a prop by
// TabletShell) want this to replace their own content in place instead of
// covering the whole screen as a modal — no portal, no fixed positioning,
// just a normal block filling its parent. Phone never sets it, so phone
// behavior is unchanged.
export function Sheet({ C, kicker, title, onBack, children, padded = true, inline = false }) {
  const content = (
    <div className={inline ? 'remote-root h-full flex flex-col' : 'remote-root remote-sheet-in fixed inset-0 z-[9999] flex flex-col'}
      style={inline ? { background: C.bg, fontFamily: C.font } : {
        '--rc-outline': C.outline, '--rc-champagne': C.champagne,
        '--rc-container': C.container, '--rc-bg-white': C.bgWhite,
        background: C.bg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)',
      }}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-4 shrink-0"
        style={{ background: C.bg, borderBottom: `0.5px solid ${C.outline}` }}>
        <button onClick={onBack} aria-label="Back"
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          <ChevronLeft className="h-5 w-5" style={{ color: C.text3 }} />
        </button>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: C.champagne, fontFamily: C.fontLabel }}>{kicker}</p>
          <p className="text-[20px] font-medium truncate"
            style={{ color: C.text1, letterSpacing: '-0.01em' }}>{title}</p>
        </div>
      </div>
      <div className={`flex-1 overflow-y-auto ${padded ? 'p-5' : 'py-4'}`}
        style={{ paddingBottom: `calc(${padded ? '1.25rem' : '1rem'} + env(safe-area-inset-bottom))` }}>{children}</div>
    </div>
  );

  if (inline) return content;

  return createPortal(
    content,
    document.body,
  );
}

// Horizontal slider with the remote's champagne fill + invisible thumb.
// Shared by RemoteEqualizer (saturation/noise/preamp) and
// RemoteThemeSettings (brightness) — was duplicated identically in both
// until AUDIT-2026-08-02.
//
// The invisible <input type="range"> touch target used to be sized to match
// the visual track (h-1.5, i.e. 6px) via `inset-0 h-full` — the 18px thumb
// drawn on top is purely decorative (pointer-events-none), so the ACTUAL
// touch-sensitive area was only 6px tall despite looking much bigger.
// Reported live as "hard to swing, have to precisely place it in the
// circle." -inset-y-5 expands the input 20px above and below the visual
// track (any Tailwind height here still yields ~44-46px total), landing
// close to Apple/Google's ~44px minimum touch-target guidance, while the
// visual track/thumb stay exactly as thin/small as before.
export function RcSlider({ value, min, max, step, onChange, accent, fill }) {
  const { C } = useContext(Tk);
  const pct = ((value - min) / (max - min)) * 100;
  const color = fill || accent || C.champagne;
  return (
    <div className="relative h-1.5 rounded-full" style={{ background: C.container }}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: color }} />
      <div className="absolute w-[18px] h-[18px] rounded-full -translate-x-1/2 -translate-y-1/2 top-1/2 pointer-events-none"
        style={{ left: `${pct}%`, background: '#ffffff', border: `2px solid ${color}`, boxShadow: '0 1px 5px rgba(0,0,0,0.25)' }} />
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="absolute -inset-y-5 inset-x-0 w-full opacity-0 cursor-pointer" />
    </div>
  );
}

// Badge label for the active source, shown on the album-art corner badge in
// PlayerTab (phone) and TabletPlayerHero. Was `spotify ? 'Spotify' :
// source === 'radio' ? 'Radio' : 'Local'` in both files — defaulted EVERY
// other source (dj, tidal, qobuz, airplay, upnp, bluetooth) to "Local".
// Reported live: DJ mode showed "LOCAL" on the badge (AUDIT-2026-08-02).
const SOURCE_BADGE_LABELS = {
  spotify: 'Spotify', local: 'Local', radio: 'Radio', dj: 'DJ',
  airplay: 'AirPlay', upnp: 'UPnP', bluetooth: 'Bluetooth',
  tidal: 'Tidal', qobuz: 'Qobuz',
};
export const sourceBadgeLabel = (source) => SOURCE_BADGE_LABELS[source] || 'Local';

// DJ mood cards — ids MUST match server/dj.js's MOOD_IDS exactly (Random is
// the one exception: id null, which is exactly what "no mood pinned" already
// means server-side — server/dj.js's setMood(null) and state.mood's own
// default). Shared by PlayerTab (phone) and TabletPlayerHero (tablet) so the
// two can't drift apart the way RcSlider did before it was deduplicated.
// Mirrors the icon-only version already on the kiosk's own PlayerDisplay.jsx,
// just rendered bigger/labeled here since the remote has the screen space
// for real cards.
//
// AUDIT-2026-08-03: Random used to be an implicit, invisible state — no card
// highlighted at all when mood was null, which on a fresh DJ session (the
// common case — nobody's tapped a mood yet) reads as "nothing loaded /
// broken" rather than "this is a deliberate choice". Reported live: "I start
// dj and no card is highlighted". Making it a selectable card like any other
// means SOMETHING is always highlighted.
export const DJ_MOODS = [
  { id: null,       label: 'Random',   Icon: Shuffle },
  { id: 'hype',     label: 'Hype',     Icon: Zap },
  { id: 'chill',    label: 'Chill',    Icon: Moon },
  { id: 'casual',   label: 'Casual',   Icon: Coffee },
  { id: 'dramatic', label: 'Dramatic', Icon: Flame },
  { id: 'playful',  label: 'Playful',  Icon: PartyPopper },
];

export const fmt = ms => {
  if (!ms || isNaN(ms)) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

export const SpotifyIcon = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style}>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z" />
  </svg>
);

export function Row({ label, sub, value, onPress, destructive, chevron = true, icon, badge }) {
  const { C } = useContext(Tk);
  return (
    <button onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-60 transition-opacity cursor-pointer text-left"
      style={{ fontFamily: C.font }}>
      {icon && (
        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium truncate"
          style={{ color: destructive ? C.error : C.text1 }}>{label}</span>
        {sub && (
          <span className="block text-[11px] mt-0.5 uppercase tracking-widest truncate"
            style={{ color: C.text3, fontFamily: C.fontLabel, fontWeight: 600 }}>{sub}</span>
        )}
      </span>
      {badge && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: C.containerLow, color: C.primary, fontFamily: C.fontLabel, letterSpacing: '0.05em' }}>
          {badge}
        </span>
      )}
      {value !== undefined && (
        <span className="text-[13px] shrink-0 font-semibold"
          style={{ color: C.champagne, fontFamily: C.fontLabel }}>{value}</span>
      )}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />}
    </button>
  );
}

export function Section({ title, children }) {
  const { C, cardWhite } = useContext(Tk);
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <div className="mx-4 mb-4">
      {title && (
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>{title}</p>
      )}
      <div className="rounded-xl overflow-hidden" style={cardWhite}>
        {kids.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className="ml-4"
                style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
            )}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
