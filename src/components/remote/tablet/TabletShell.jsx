import { useContext } from 'react';
import { Tk } from '../shared';
import TabletSidebar from './TabletSidebar';
import TabletPlayerHero from './TabletPlayerHero';
import LibraryTab from '../LibraryTab';
import SourceTab from '../SourceTab';
import UniversalSearch from '../UniversalSearch';
import SettingsTab from '../SettingsTab';
import MiniPlayer from '../MiniPlayer';
import '../../../remote-tablet.css';

// iPad shell (portrait AND landscape — see remote-tablet.css for the CSS
// Grid that reorders the hero between them). Same Tk.Provider context as the
// phone shell in RemoteControl.jsx; every tab body below except the Player
// hero is the exact phone component, just given more breathing room by the
// `.rt-content-inner--narrow` wrapper instead of being rewritten. Overlays
// (queue sheet, DSP wizard, theme settings, voice control, and every
// AlbumInfoSheet/LyricsSheet/Settings sub-panel built on the shared `Sheet`
// component) stay mounted exactly where RemoteControl.jsx already renders
// them — untouched — and pick up the floating-card tablet treatment purely
// through the `body.remote-tablet-mode` CSS scope, since `Sheet` portals to
// `document.body` and can't be reached by a selector scoped to this
// component's own subtree.
export default function TabletShell({ darkMode, setDarkMode, onVoice, tabDirection }) {
  const { C, activeTab, trackName } = useContext(Tk);

  const showDock = activeTab !== 'player' && trackName && trackName !== 'Nothing playing';

  return (
    <div className="remote-tablet-shell" style={{ background: C.bg }}>
      <TabletSidebar darkMode={darkMode} setDarkMode={setDarkMode} onVoice={onVoice} />

      <div className="rt-content">
        <div key={activeTab} className={`rt-content-inner ${activeTab !== 'player' ? 'rt-content-inner--narrow' : ''} animate-tab-${tabDirection}`}>
          {activeTab === 'player'   && <TabletPlayerHero />}
          {activeTab === 'library'  && <LibraryTab />}
          {activeTab === 'search'   && <UniversalSearch />}
          {activeTab === 'source'   && <SourceTab />}
          {activeTab === 'settings' && <SettingsTab />}

          {showDock && (
            <div className="rt-dock">
              <MiniPlayer />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
