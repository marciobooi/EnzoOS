import { useContext } from 'react';
import { Waves, Power, Sun, Moon, Mic } from 'lucide-react';
import { Tk, NAV_TABS } from '../shared';
import { useI18n } from '../../../i18n';

// iPad counterpart to TopBar + BottomNav combined into one persistent rail —
// the extra width means nav no longer has to compete with content for
// vertical space, and a vertical icon+label stack reads more like a native
// iPad app (Music.app, Spotify) than a stretched phone tab bar would.
export default function TabletSidebar({ darkMode, setDarkMode, onVoice }) {
  const { C, btn, card, isConnected, standby, handleToggleStandby, activeTab, setActiveTab } = useContext(Tk);
  const { t } = useI18n();

  return (
    <div className="rt-sidebar" style={{ background: C.bgWhite, borderRight: `0.5px solid ${C.outline}` }}>
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={card}>
        <Waves className="h-5 w-5" style={{ color: C.champagne }} />
      </div>

      <nav className="rt-sidebar-nav">
        {NAV_TABS.map(({ id, Icon, labelKey }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className="w-full flex flex-col items-center gap-1.5 py-3 rounded-2xl cursor-pointer active:scale-95 transition-all"
              style={active ? { background: `${C.champagne}18` } : undefined}>
              <Icon className="h-5 w-5" strokeWidth={active ? 2.2 : 1.7}
                style={{ color: active ? C.champagne : C.text3, transition: 'color 0.2s ease' }} />
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em]"
                style={{ color: active ? C.champagne : C.text3, fontFamily: C.fontLabel }}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="rt-sidebar-footer">
        <span className={`w-2 h-2 rounded-full ${!isConnected ? 'animate-pulse' : ''}`}
          title={isConnected ? 'Resonance' : t('net2.reconnecting')}
          style={{
            background: isConnected ? C.champagne : '#f59e0b',
            boxShadow: isConnected ? `0 0 6px ${C.champagne}90` : '0 0 6px #f59e0b90',
            transition: 'background 0.4s',
          }} />
        {onVoice && (
          <button onClick={onVoice} aria-label="Voice control"
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
