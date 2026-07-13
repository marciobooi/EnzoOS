import { useContext } from 'react';
import { Waves, Power, Sun, Moon, Mic } from 'lucide-react';
import { Tk, NAV_TABS } from '../shared';
import { useI18n } from '../../../i18n';

// iPad counterpart to TopBar + BottomNav combined into one persistent rail —
// the extra width means nav no longer has to compete with content for
// vertical space, and a labeled icon+text rail reads more like a native
// iPad app (Mail, Music.app) than a stretched phone tab bar would.
// Now-playing lives in TabletMiniPlayer's floating dock next to this rail,
// not in the sidebar itself.
export default function TabletSidebar({ darkMode, setDarkMode, onVoice }) {
  const {
    C, btn, card, isConnected, standby, handleToggleStandby, activeTab, setActiveTab,
  } = useContext(Tk);
  const { t } = useI18n();

  return (
    <div className="rt-sidebar" style={{ background: C.bgWhite, borderRight: `0.5px solid ${C.outline}` }}>

      {/* Wordmark + live status — names the app and what state it's in, the
          way the reference layout leads every screen with an identity block
          instead of a bare logo mark. */}
      <div className="flex items-center gap-2.5 w-full px-1">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={card}>
          <Waves className="h-[18px] w-[18px]" style={{ color: C.champagne }} />
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Resonance</p>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${!isConnected ? 'animate-pulse' : ''}`}
              style={{ background: isConnected ? C.champagne : '#f59e0b' }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider truncate"
              style={{ color: C.text3, fontFamily: C.fontLabel }}>
              {isConnected ? (standby ? 'Standby' : 'Connected') : t('net2.reconnecting')}
            </span>
          </span>
        </div>
      </div>


      <nav className="rt-sidebar-nav">
        {NAV_TABS.map(({ id, Icon, labelKey }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
              style={active ? { background: `${C.champagne}18` } : undefined}>
              <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={active ? 2.2 : 1.7}
                style={{ color: active ? C.champagne : C.text3, transition: 'color 0.2s ease' }} />
              <span className="text-[13.5px] font-medium truncate"
                style={{ color: active ? C.champagne : C.text2, fontFamily: C.font }}>
                {t(labelKey)}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="rt-sidebar-footer">
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
