import { useContext } from 'react';
import { Tk } from '../shared';
import TabletSidebar from './TabletSidebar';
import TabletPlayerHero from './TabletPlayerHero';
import TabletNowPlayingRail from './TabletNowPlayingRail';
import TabletSettingsTab from './TabletSettingsTab';
import LibraryTab from '../LibraryTab';
import SourceTab from '../SourceTab';
import UniversalSearch from '../UniversalSearch';
import MiniPlayer from '../MiniPlayer';
import '../../../remote-tablet.css';

// iPad shell (portrait AND landscape — see remote-tablet.css for the CSS
// Grid/flex that reflow between them, no JS orientation branch anywhere
// here). Same Tk.Provider context as the phone shell in RemoteControl.jsx.
//
// Library is the exact phone component, reused verbatim. Search and Source
// are the phone components too, but take an `inline` prop — the one thing
// each still opens as a Sheet (preset-assign, Qobuz/Tidal auth) now swaps
// in as this pane's own content instead of covering it, since "modals that
// don't make sense when there's room to just navigate" was direct
// feedback. Settings is its own tablet-only master-detail component
// (TabletSettingsTab) rather than the phone's Sheet-per-group SettingsTab,
// for the same reason — see that file for how it also folds in the DSP
// wizard and theme settings, which RemoteControl.jsx skips rendering as
// global overlays when isTablet is true.
//
// Non-player tabs get TWO companions to fill what used to be dead space:
// TabletNowPlayingRail (a persistent right-hand transport + queue glimpse,
// landscape only — `.rt-rail` in remote-tablet.css) and MiniPlayer's dock
// (portrait only, where there's no width left for a third column). They're
// both always mounted; CSS orientation queries pick exactly one per
// orientation, so there's no JS branch to fall out of sync on rotation.
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
            {activeTab === 'search'   && <UniversalSearch inline />}
            {activeTab === 'source'   && <SourceTab inline />}
            {activeTab === 'settings' && <TabletSettingsTab />}

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
