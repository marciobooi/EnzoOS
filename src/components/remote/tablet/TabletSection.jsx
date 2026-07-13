import React, { useContext } from 'react';
import { ChevronRight } from 'lucide-react';
import { Tk } from '../shared';

// Tablet-only Settings section/row — NOT the shared shared.jsx Row/Section
// (phone still uses those, unchanged). Phone's version reads as a compact
// list: tiny uppercase kicker above a thin-shadow card, icon in a small
// squircle, uppercase tracked value/sub text. This is a deliberately
// roomier reskin matching the reference "Definitions" mock: a real
// semibold heading above each card, a stronger ambient shadow so cards
// read as floating rather than flat, a fully circular icon chip, and
// sentence-case descriptive subtext instead of a tracked kicker.
export function TabletSection({ title, children }) {
  const { C, darkMode } = useContext(Tk);
  const kids = React.Children.toArray(children).filter(Boolean);
  const shadow = darkMode
    ? '0 10px 24px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.28)'
    : '0 8px 24px rgba(180,170,150,0.16)';
  return (
    <div className="mb-8">
      {title && (
        <h3 className="text-[19px] font-semibold mb-3" style={{ color: C.text1, letterSpacing: '-0.01em' }}>
          {title}
        </h3>
      )}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: darkMode ? C.containerLow : '#ffffff', border: `0.5px solid ${C.outline}`, boxShadow: shadow }}>
        {kids.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className="ml-[4.25rem]"
                style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
            )}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

export function TabletRow({ label, sub, value, onPress, destructive, chevron = true, icon }) {
  const { C } = useContext(Tk);
  return (
    <button onClick={onPress}
      className="w-full flex items-center gap-4 px-5 py-4 active:opacity-60 transition-opacity cursor-pointer text-left"
      style={{ fontFamily: C.font }}>
      {icon && (
        <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium truncate"
          style={{ color: destructive ? C.error : C.text1 }}>{label}</span>
        {sub && (
          <span className="block text-[13px] mt-0.5 truncate" style={{ color: C.text4 }}>{sub}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="text-[11px] font-semibold uppercase tracking-wider shrink-0"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>{value}</span>
      )}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />}
    </button>
  );
}
