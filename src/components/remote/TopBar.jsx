import { useContext } from 'react';
import { Power, Sun, Moon, Mic } from 'lucide-react';
import { Tk } from './shared';

export default function TopBar({ darkMode, setDarkMode, onVoice }) {
  const { C, btn, isConnected, standby, handleToggleStandby } = useContext(Tk);
  return (
    <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2.5"
      style={{ borderBottom: `0.5px solid ${C.outline}` }}>
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full"
          style={{
            background: isConnected ? C.champagne : C.error,
            boxShadow: isConnected ? `0 0 6px ${C.champagne}90` : 'none',
            transition: 'background 0.4s',
          }} />
        <span className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>
          {isConnected ? 'Resonance' : 'Offline'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {onVoice && (
          <button onClick={onVoice}
            aria-label="Voice control"
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
            style={btn}>
            <Mic className="h-4 w-4" style={{ color: C.champagne }} />
          </button>
        )}
        <button onClick={() => setDarkMode(d => !d)}
          aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
          style={btn}>
          {darkMode
            ? <Sun className="h-4 w-4" style={{ color: C.champagne }} />
            : <Moon className="h-4 w-4" style={{ color: C.primary }} />}
        </button>
        <button onClick={() => handleToggleStandby(!standby)}
          aria-label={standby ? 'Wake kiosk' : 'Set kiosk to standby'}
          className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
          style={{ ...btn, color: standby ? C.error : C.text4 }}>
          <Power className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
