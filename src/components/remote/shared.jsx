import React, { createContext, useContext } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, ChevronLeft } from 'lucide-react';

export const Tk = createContext({});

// Full-screen remote sheet — solid background (no dim), header with a back
// button. Portaled to <body> so it escapes the tab-slide transform (a
// transformed ancestor would otherwise trap the fixed element inside the
// content area, leaving the nav/mini-player visible underneath it).
export function Sheet({ C, kicker, title, onBack, children, padded = true }) {
  return createPortal(
    <div className="remote-root remote-sheet-in fixed inset-0 z-[9999] flex flex-col"
      style={{
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
      <div className={`flex-1 overflow-y-auto ${padded ? 'p-5' : 'py-4'}`}>{children}</div>
    </div>,
    document.body,
  );
}

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
