import { useState } from 'react';
import { Delete, ArrowBigUp, Check, X } from 'lucide-react';
import { S, cardShadow } from '../../styles/stone';

// ── On-screen keyboard for the kiosk ─────────────────────────────────────────
// The kiosk is a touch-only appliance (no physical keyboard), yet flows like
// Wi-Fi setup need free-text entry. Chromium's --kiosk mode on X11 has no
// built-in OSK, so this renders one in-app: a full-panel overlay sized for
// the 1480×320 landscape screen, styled to the stone design system.
//
// Controlled from outside: `value` + `onChange` bind it to whichever field
// opened it; `onDone` commits (close + keep value), `onClose` cancels the
// editing session (the caller decides whether that reverts the value).
const ALPHA_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

const SYMBOL_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['!', '@', '#', '$', '%', '&', '*', '(', ')', '-'],
  ['_', '=', '+', '/', ':', ';', "'", '"', '?', '.'],
];

export default function OnScreenKeyboard({ value, onChange, onDone, label = '' }) {
  const [shift, setShift] = useState(false);
  const [symbols, setSymbols] = useState(false);

  const type = (ch) => {
    onChange(value + (shift ? ch.toUpperCase() : ch));
    if (shift) setShift(false); // one-shot shift, like phone keyboards
  };
  const backspace = () => onChange(value.slice(0, -1));

  const rows = symbols ? SYMBOL_ROWS : ALPHA_ROWS;

  const keyStyle = {
    background: S.surfaceLo,
    border: `1px solid ${S.border}`,
    color: S.strong,
    boxShadow: cardShadow,
  };
  const actionStyle = {
    background: S.surface,
    border: `1px solid ${S.border}`,
    color: S.muted,
    boxShadow: cardShadow,
  };

  return (
    <div className="absolute inset-0 z-[80] flex flex-col p-3 gap-2 font-sans rounded-3xl"
      style={{ background: S.bg }}>

      {/* Value echo + done */}
      <div className="flex items-center gap-2 shrink-0">
        {label && (
          <span className="text-sm font-light tracking-[0.2em] uppercase shrink-0 px-2" style={{ color: S.label }}>
            {label}
          </span>
        )}
        <div className="flex-grow px-3 py-2 rounded-xl text-base font-semibold truncate min-h-[38px]"
          style={{ background: S.surface, border: `1px solid ${S.track}`, color: S.strong }}>
          {value || <span style={{ color: S.label }}>&nbsp;</span>}
        </div>
        <button onClick={backspace}
          className="px-4 py-2 rounded-xl cursor-pointer transition-all active:scale-95 shrink-0"
          style={actionStyle} aria-label="Backspace">
          <Delete className="w-5 h-5" strokeWidth={1.5} />
        </button>
        <button onClick={onDone}
          className="px-5 py-2 rounded-xl cursor-pointer transition-all active:scale-95 shrink-0 flex items-center gap-1.5 text-sm font-extrabold"
          style={{ background: S.accent, color: S.accentFg, border: 'none' }}>
          <Check className="w-4 h-4" strokeWidth={2} /> DONE
        </button>
      </div>

      {/* Key rows */}
      <div className="flex flex-col gap-1.5 flex-grow min-h-0">
        {rows.map((row, ri) => (
          <div key={ri} className="flex gap-1.5 flex-1 justify-center">
            {/* Shift bookends the last alpha row, mirroring a phone layout */}
            {!symbols && ri === 2 && (
              <button onClick={() => setShift(v => !v)}
                className="rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center"
                style={{ ...actionStyle, flex: '1.4 1 0', ...(shift ? { background: S.accent, color: S.accentFg, border: 'none' } : {}) }}
                aria-label="Shift">
                <ArrowBigUp className="w-5 h-5" strokeWidth={1.5} />
              </button>
            )}
            {row.map(ch => (
              <button key={ch} onClick={() => type(ch)}
                className="rounded-xl cursor-pointer transition-all active:scale-95 text-lg font-semibold flex items-center justify-center"
                style={{ ...keyStyle, flex: '1 1 0' }}>
                {shift && !symbols ? ch.toUpperCase() : ch}
              </button>
            ))}
            {!symbols && ri === 2 && (
              <button onClick={backspace}
                className="rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center"
                style={{ ...actionStyle, flex: '1.4 1 0' }} aria-label="Backspace">
                <Delete className="w-5 h-5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        ))}

        {/* Bottom row: layer toggle, space, cancel */}
        <div className="flex gap-1.5 flex-1">
          <button onClick={() => { setSymbols(v => !v); setShift(false); }}
            className="rounded-xl cursor-pointer transition-all active:scale-95 text-sm font-bold flex items-center justify-center"
            style={{ ...actionStyle, flex: '1.5 1 0' }}>
            {symbols ? 'ABC' : '?123'}
          </button>
          <button onClick={() => type(' ')}
            className="rounded-xl cursor-pointer transition-all active:scale-95"
            style={{ ...keyStyle, flex: '7 1 0' }} aria-label="Space" />
          <button onClick={onDone}
            className="rounded-xl cursor-pointer transition-all active:scale-95 flex items-center justify-center"
            style={{ ...actionStyle, flex: '1.5 1 0' }} aria-label="Close keyboard">
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
