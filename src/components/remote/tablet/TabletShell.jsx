import { useContext, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Tk } from '../shared';
import TabletSidebar from './TabletSidebar';
import TabletPlayerHero from './TabletPlayerHero';
import TabletSettingsTab from './TabletSettingsTab';
import TabletPageHeader from './TabletPageHeader';
import TabletMiniPlayer from './TabletMiniPlayer';
import LibraryTab from '../LibraryTab';
import SourceTab from '../SourceTab';
import UniversalSearch from '../UniversalSearch';
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
// The layout is strictly two columns — sidebar + main. Non-player tabs get
// ONE now-playing companion: TabletMiniPlayer inside `.rt-dock`, a card
// FLOATING (position: fixed) at the bottom of the main pane next to the
// nav sidebar, in both orientations. It replaced the old landscape-only
// third-column rail (TabletNowPlayingRail). The dock is rendered as a
// direct child of the shell — NOT inside .rt-content-inner — because the
// tab-switch animation transforms that wrapper, and a transformed ancestor
// becomes the containing block for fixed-position descendants (the card
// would slide with the tab content and anchor to the pane, not the
// viewport).
export default function TabletShell({ darkMode, setDarkMode, onVoice, tabDirection }) {
  const { C, activeTab, trackName, fetchLibraryArtists, libraryLoading, libraryView } = useContext(Tk);

  const isPlayerTab = activeTab === 'player';
  const showDock = !isPlayerTab && trackName && trackName !== 'Nothing playing';
  // Lives here, not inside TabletMiniPlayer: that component unmounts
  // whenever showDock goes false (leaving the player tab, or playback
  // stopping), which would reset a locally-owned collapsed flag on every
  // trip back. Kept here it survives for the rest of the page session —
  // just not across a hard reload, which is an acceptable reset point.
  const [dockCollapsed, setDockCollapsed] = useState(false);
  // Library's own drill-down (Albums by X / Tracks) carries its own
  // back+breadcrumb header — showing the page header above it too would
  // stack two titles, so it steps aside once Library navigates past its
  // top level, the same single-header-at-a-time rule TabletSettingsTab follows.
  const libraryDeep = activeTab === 'library' && libraryView !== 'artists';
  const copy = !libraryDeep ? TAB_COPY[activeTab] : null;

  // 100dvh is unreliable in iPadOS standalone (home-screen/fullscreen) mode —
  // WebKit doesn't always resolve it to the true visible viewport there, which
  // left a strip of the page's own background exposed below the shell with
  // the sidebar/content compressed above it (confirmed live via the
  // /api/system/client-viewport-debug probe: window.innerHeight tracked the
  // real usable height correctly in standalone even when the CSS box did
  // not). Measure it in JS instead and drive the shell's height from that,
  // with 100dvh kept only as the CSS-only fallback for the very first paint
  // before this effect runs.
  useEffect(() => {
    const setVh = () => {
      const h = window.visualViewport?.height || window.innerHeight;
      document.documentElement.style.setProperty('--tablet-vh', `${h}px`);
    };
    setVh();
    window.visualViewport?.addEventListener('resize', setVh);
    window.addEventListener('resize', setVh);
    window.addEventListener('orientationchange', setVh);
    return () => {
      window.visualViewport?.removeEventListener('resize', setVh);
      window.removeEventListener('resize', setVh);
      window.removeEventListener('orientationchange', setVh);
    };
  }, []);

  return (
    <div className="remote-tablet-shell" style={{ background: C.bg }}>
      <TabletSidebar darkMode={darkMode} setDarkMode={setDarkMode} onVoice={onVoice} />

      <div className="rt-body">
        <div className={`rt-main ${isPlayerTab ? 'rt-main--player' : ''}`}>
          <div key={activeTab} className={`rt-content-inner ${isPlayerTab ? 'rt-content-inner--player' : 'rt-content-inner--narrow'} ${showDock ? (dockCollapsed ? 'rt-content-inner--docked-collapsed' : 'rt-content-inner--docked') : ''} animate-tab-${tabDirection}`}>
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
          </div>
        </div>
      </div>

      {showDock && (
        <div className={`rt-dock ${dockCollapsed ? 'rt-dock--collapsed' : ''}`}>
          <TabletMiniPlayer collapsed={dockCollapsed} onToggleCollapse={() => setDockCollapsed(v => !v)} />
        </div>
      )}
    </div>
  );
}
