import { useContext } from 'react';
import { RefreshCw } from 'lucide-react';
import { Tk } from '../shared';
import TabletSidebar from './TabletSidebar';
import TabletPlayerHero from './TabletPlayerHero';
import TabletNowPlayingRail from './TabletNowPlayingRail';
import TabletSettingsTab from './TabletSettingsTab';
import TabletPageHeader from './TabletPageHeader';
import LibraryTab from '../LibraryTab';
import SourceTab from '../SourceTab';
import UniversalSearch from '../UniversalSearch';
import MiniPlayer from '../MiniPlayer';
import '../../../remote-tablet.css';

// Page headers for the tabs that borrow phone components verbatim — title
// and a short description in the "Global Radio / Discover stations, genres,
// and live broadcasts" register the reference layout uses everywhere.
// Player and Settings aren't here: the hero's art+track-name IS its header,
// and TabletSettingsTab (tablet-only, no phone component to keep in sync
// with) renders its own via the same TabletPageHeader directly.
const TAB_COPY = {
  library: { title: 'Library', subtitle: 'Browse your artists, albums, and saved favorites.' },
  search:  { title: 'Search',  subtitle: 'Find tracks, albums, stations, and artists across every connected source.' },
  source:  { title: 'Source',  subtitle: 'Choose where playback is coming from.' },
};

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
  const { C, activeTab, trackName, fetchLibraryArtists, libraryLoading, libraryView } = useContext(Tk);

  const isPlayerTab = activeTab === 'player';
  const showDock = !isPlayerTab && trackName && trackName !== 'Nothing playing';
  // Library's own drill-down (Albums by X / Tracks) carries its own
  // back+breadcrumb header — showing the page header above it too would
  // stack two titles, so it steps aside once Library navigates past its
  // top level, the same single-header-at-a-time rule TabletSettingsTab follows.
  const libraryDeep = activeTab === 'library' && libraryView !== 'artists';
  const copy = !libraryDeep ? TAB_COPY[activeTab] : null;

  return (
    <div className="remote-tablet-shell" style={{ background: C.bg }}>
      <TabletSidebar darkMode={darkMode} setDarkMode={setDarkMode} onVoice={onVoice} />

      <div className="rt-body">
        <div className={`rt-main ${isPlayerTab ? 'rt-main--player' : ''}`}>
          <div key={activeTab} className={`rt-content-inner ${isPlayerTab ? 'rt-content-inner--player' : 'rt-content-inner--narrow'} animate-tab-${tabDirection}`}>
            {copy && (
              <TabletPageHeader title={copy.title} subtitle={copy.subtitle}
                action={activeTab === 'library' ? (
                  <button onClick={fetchLibraryArtists} aria-label="Refresh library"
                    className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                    style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                    <RefreshCw className={`h-4 w-4 ${libraryLoading ? 'animate-spin' : ''}`} style={{ color: C.champagne }} />
                  </button>
                ) : undefined} />
            )}
            {activeTab === 'player'   && <TabletPlayerHero />}
            {activeTab === 'library'  && <LibraryTab inline />}
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
