import { useContext } from 'react';
import { Tk } from '../shared';
import TabletSidebar from './TabletSidebar';
import TabletPlayerHero from './TabletPlayerHero';
import TabletNowPlayingRail from './TabletNowPlayingRail';
import LibraryTab from '../LibraryTab';
import SourceTab from '../SourceTab';
import UniversalSearch from '../UniversalSearch';
import SettingsTab from '../SettingsTab';
import MiniPlayer from '../MiniPlayer';
import '../../../remote-tablet.css';

// iPad shell (portrait AND landscape — see remote-tablet.css for the CSS
// Grid/flex that reflow between them, no JS orientation branch anywhere
// here). Same Tk.Provider context as the phone shell in RemoteControl.jsx;
// every tab body below except the Player hero is the exact phone component,
// reused verbatim inside `.rt-content-inner--narrow` rather than rewritten.
//
// Non-player tabs get TWO companions to fill what used to be dead space:
// TabletNowPlayingRail (a persistent right-hand transport + queue glimpse,
// landscape only — `.rt-rail` in remote-tablet.css) and MiniPlayer's dock
// (portrait only, where there's no width left for a third column). They're
// both always mounted; CSS orientation queries pick exactly one per
// orientation, so there's no JS branch to fall out of sync on rotation.
//
// Overlays (queue sheet, DSP wizard, theme settings, voice control, and
// every AlbumInfoSheet/LyricsSheet/Settings sub-panel built on the shared
// `Sheet` component) stay mounted exactly where RemoteControl.jsx already
// renders them — untouched — and pick up the floating-card tablet treatment
// purely through the `body.remote-tablet-mode` CSS scope, since `Sheet`
// portals to `document.body` and can't be reached by a selector scoped to
// this component's own subtree.
export default function TabletShell({ darkMode, setDarkMode, onVoice, tabDirection }) {
  const { C, activeTab, trackName } = useContext(Tk);

  const isPlayerTab = activeTab === 'player';
  const showDock = !isPlayerTab && trackName && trackName !== 'Nothing playing';

  return (
    <div className="remote-tablet-shell" style={{ background: C.bg }}>
      <TabletSidebar darkMode={darkMode} setDarkMode={setDarkMode} onVoice={onVoice} />

      <div className="rt-body">
        <div className="rt-main">
          <div key={activeTab} className={`rt-content-inner ${!isPlayerTab ? 'rt-content-inner--narrow' : ''} animate-tab-${tabDirection}`}>
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

        {!isPlayerTab && (
          <div className="rt-rail" style={{ borderLeft: `0.5px solid ${C.outline}` }}>
            <TabletNowPlayingRail />
          </div>
        )}
      </div>
    </div>
  );
}
