import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Waves, Smartphone, X } from 'lucide-react';
import { toast } from '../lib/toast';
import { reportError } from '../lib/errors';
import { api } from '../api';
import { useResonanceWS } from '../websocket';
import { EQ_PRESETS } from '../components/EqualizerControl';
import RemoteDspWizard from '../components/remote/RemoteDspWizard';
import RemoteThemeSettings from '../components/remote/RemoteThemeSettings';
import TabletShell from '../components/remote/tablet/TabletShell';
import { useIsTabletViewport } from '../hooks/useTabletViewport';
import '../remote.css';
import { useI18n } from '../i18n';

import { Tk } from '../components/remote/shared';
import TopBar    from '../components/remote/TopBar';
import BottomNav from '../components/remote/BottomNav';
import PlayerTab   from '../components/remote/PlayerTab';
import LibraryTab  from '../components/remote/LibraryTab';
import SourceTab   from '../components/remote/SourceTab';
import UniversalSearch from '../components/remote/UniversalSearch';
import SettingsTab from '../components/remote/SettingsTab';
import MiniPlayer  from '../components/remote/MiniPlayer';
import QueuePanel  from '../components/remote/QueuePanel';
import VoiceControl, { voiceSupported } from '../components/remote/VoiceControl';
import { setCookie, getCookie, eraseCookie } from '../lib/cookies';

const NAV_H = 72;

// ══════════════════════════════════════════════════════════════════════════════
export default function RemoteControl() {
  const { t } = useI18n();
  // ── dark mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('resonance_remote_dark') === 'true');
  useEffect(() => { localStorage.setItem('resonance_remote_dark', darkMode); }, [darkMode]);

  // iPad gets its own shell (TabletShell) — see src/hooks/useTabletViewport.js
  // for the width threshold.
  const isTablet = useIsTabletViewport();

  // ── design tokens ─────────────────────────────────────────────────────────
  const C = darkMode ? {
    bg: '#0a0f1e', bgWhite: '#0d1628', container: '#1a2540', containerLow: '#111e33',
    primary: '#d4af37', champagne: '#d4af37', text1: '#f0ede8', text2: '#c4b898',
    text3: '#6b7fa0', text4: '#8fa3b8', outline: '#1e2d45', error: '#ff6b6b',
    font: "'Manrope', -apple-system, system-ui, sans-serif",
    fontLabel: "'Hanken Grotesk', -apple-system, system-ui, sans-serif",
  } : {
    bg: '#f9f9f9', bgWhite: '#ffffff', container: '#eeeeee', containerLow: '#f3f3f4',
    primary: '#735c00', champagne: '#d4af37', text1: '#1a1c1c', text2: '#4d4635',
    text3: '#7f7663', text4: '#5d5e5f', outline: '#d0c5af', error: '#ba1a1a',
    font: "'Manrope', -apple-system, system-ui, sans-serif",
    fontLabel: "'Hanken Grotesk', -apple-system, system-ui, sans-serif",
  };

  const card = darkMode ? {
    background: '#0d1628',
    boxShadow: '4px 4px 12px rgba(0,0,0,0.7), -4px -4px 12px rgba(20,40,75,0.4)',
    border: '0.5px solid #1e2d45',
  } : {
    background: '#f9f9f9',
    boxShadow: '4px 4px 10px rgba(0,0,0,0.025), -4px -4px 10px rgba(255,255,255,0.9)',
    border: '0.5px solid #eeeeee',
  };

  const cardWhite = darkMode ? {
    background: '#111827', boxShadow: '0 2px 12px rgba(0,0,0,0.5)', border: '0.5px solid #1e2d45',
  } : {
    background: '#ffffff', boxShadow: '0 2px 12px rgba(0,0,0,0.03)', border: '0.5px solid #eeeeee',
  };

  const btn = darkMode ? {
    background: '#0d1628',
    boxShadow: '4px 4px 8px rgba(0,0,0,0.7), -4px -4px 8px rgba(20,40,75,0.4)',
  } : {
    background: '#f9f9f9',
    boxShadow: '4px 4px 8px rgba(0,0,0,0.04), -4px -4px 8px rgba(255,255,255,1)',
  };

  const btnInset = darkMode ? {
    background: '#0a0f1e',
    boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.7), inset -3px -3px 6px rgba(20,40,75,0.4)',
  } : {
    background: '#f9f9f9',
    boxShadow: 'inset 3px 3px 6px rgba(0,0,0,0.05), inset -3px -3px 6px rgba(255,255,255,0.9)',
  };

  // CSS variables consumed by remote.css — keeps scrollbars, sliders and scrims
  // on the remote palette so the kiosk skin variables can never bleed in.
  const rcVars = {
    '--rc-bg': C.bg, '--rc-bg-white': C.bgWhite, '--rc-container': C.container,
    '--rc-container-low': C.containerLow, '--rc-champagne': C.champagne, '--rc-outline': C.outline,
  };

  // Paint the document itself in the remote's background: if iOS ever
  // letterboxes the standalone app inside the safe area (viewport-fit not
  // honored), the strip outside the page viewport shows the <html>
  // background — without this it's the kiosk's dark navy behind a
  // light-mode remote, a visible band under the bottom nav.
  useEffect(() => {
    const prev = document.documentElement.style.background;
    document.documentElement.style.background = C.bg;
    document.body.style.background = C.bg;
    return () => { document.documentElement.style.background = prev; document.body.style.background = prev; };
  }, [C.bg]);

  // ── auth ──────────────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(!!getCookie('remote_token'));
  const [qrRedeemError, setQrRedeemError]     = useState('');
  const [pairCodeInput, setPairCodeInput]     = useState('');
  const [pairCodeBusy, setPairCodeBusy]       = useState(false);

  // Manual pairing-code fallback: once this remote is added to the iOS home
  // screen, tapping a freshly-scanned QR link gets routed into the installed
  // app at its fixed manifest start_url, silently dropping the ?qr=<token>
  // the scan flow depends on. Typing the code shown alongside the kiosk's QR
  // authenticates via a plain fetch from inside the already-open app instead,
  // so no URL navigation (and nothing for iOS to intercept) is involved.
  const handlePairCodeSubmit = async (e) => {
    e.preventDefault();
    if (!pairCodeInput.trim() || pairCodeBusy) return;
    setPairCodeBusy(true);
    setQrRedeemError('');
    try {
      const r = await fetch('/api/auth/pair-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: pairCodeInput.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.token) {
        setCookie('remote_token', d.token, 365);
        setIsAuthenticated(true);
      } else {
        setQrRedeemError(d.error || 'That code is invalid or has expired — check the kiosk for a fresh one.');
      }
    } catch {
      setQrRedeemError('Could not reach the server.');
    } finally {
      setPairCodeBusy(false);
    }
  };

  // ── nav ───────────────────────────────────────────────────────────────────
  // PWA manifest shortcuts deep-link straight to a tab (/remote?tab=search)
  const [activeTab, setActiveTab] = useState(() => {
    const tab = new URLSearchParams(window.location.search).get('tab');
    return ['player', 'library', 'search', 'source', 'settings'].includes(tab) ? tab : 'player';
  });
  const [tabDirection, setTabDirection] = useState('right');
  const activeTabRef = useRef('player');
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const changeTab = useCallback((newTab) => {
    const TAB_ORDER = ['player', 'library', 'search', 'source', 'settings'];
    const dir = TAB_ORDER.indexOf(newTab) >= TAB_ORDER.indexOf(activeTabRef.current) ? 'right' : 'left';
    setTabDirection(dir);
    setActiveTab(newTab);
  }, []);

  // ── radio ─────────────────────────────────────────────────────────────────
  const [radioSearch, setRadioSearchState]      = useState('');
  // Search RESULTS only (null = no active search). What screens actually render
  // is the derived `stationsList` below — favourites until a search has run.
  // This replaces a useEffect that synced favourites into stationsList whenever
  // the search box emptied: stationsList/radioSearch/favoriteStations are all
  // ctxValue dependencies, so that effect was an avoidable extra render +
  // full-context recompute per keystroke-clear (derived-state audit).
  const [searchStations, setSearchStations]     = useState(null);
  const [isSearching, setIsSearching]           = useState(false);
  const [favoriteStations, setFavoriteStations] = useState([]);

  // ── spotify ───────────────────────────────────────────────────────────────
  const [token, setToken]             = useState('');
  const [devices, setDevices]         = useState([]);
  const [, setIsFetchingDevices] = useState(false);

  // ── playback ──────────────────────────────────────────────────────────────
  const [playbackState, setPlaybackState] = useState(null);
  const [shuffleState, setShuffleState]   = useState(false);
  const [repeatState, setRepeatState]     = useState('off');
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [volume, setVolume]               = useState(50);
  const [isMuted, setIsMuted]             = useState(false);

  // ── OTA ───────────────────────────────────────────────────────────────────
  const [updateStatus, setUpdateStatus] = useState(null);
  const [otaProgress, setOtaProgress]   = useState([]);
  const [otaPercent, setOtaPercent]     = useState(0);

  // ── source / standby ──────────────────────────────────────────────────────
  const [source, setSource]   = useState('spotify');
  const spotify = source === 'spotify';
  const [standby, setStandby] = useState(false);
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState(true);

  // ── EQ / DSP ──────────────────────────────────────────────────────────────
  const [isDspWizardOpen, setIsDspWizardOpen]   = useState(false);
  const [showEq, setShowEq]                     = useState(false);
  const [dspActive, setDspActive]               = useState(false);
  const [pureDirect, setPureDirect]             = useState(false);
  const [eqPreset, setEqPreset]   = useState(() => localStorage.getItem('resonance_eq_preset') || 'Clinical Reference');
  const [eqBands, setEqBands]     = useState(() => { try { return JSON.parse(localStorage.getItem('resonance_eq_bands')) || [0,0,0,0,0]; } catch { return [0,0,0,0,0]; } });
  const [eqSaturation, setEqSaturation] = useState(() => Number(localStorage.getItem('resonance_eq_saturation')) || 0);
  const [eqNoiseFloor, setEqNoiseFloor] = useState(() => Number(localStorage.getItem('resonance_eq_noise')) || 0);
  const [eqPreAmp, setEqPreAmp]         = useState(() => Number(localStorage.getItem('resonance_eq_preamp')) || 0.0);

  // ── theme ─────────────────────────────────────────────────────────────────
  const [theme, setTheme]                   = useState(() => localStorage.getItem('resonance_theme') || 'amber');
  const [activeTheme, setActiveTheme]       = useState(() => localStorage.getItem('resonance_theme_active') || 'dot-matrix');
  const [brightness, setBrightness]         = useState(() => Number(localStorage.getItem('resonance_theme_brightness')) || 100);
  const [visualizerMode, setVisualizerMode] = useState(() => localStorage.getItem('resonance_visualizer_mode') || 'vu');
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);

  // ── library ───────────────────────────────────────────────────────────────
  const [libraryView, setLibraryView]       = useState('artists');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum]   = useState(null);
  const [libraryItems, setLibraryItems]     = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── system ────────────────────────────────────────────────────────────────
  const [systemHealth, setSystemHealth] = useState(null);
  const [services, setServices]         = useState(null);
  const [serviceLoading, setServiceLoading] = useState({});

  // ── sleep timer ───────────────────────────────────────────────────────────
  const [sleepMinutes, setSleepMinutes]   = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [showSleepRow, setShowSleepRow]   = useState(false);

  // ── queue ─────────────────────────────────────────────────────────────────
  const [queueOpen, setQueueOpen]     = useState(false);
  const [queue, setQueue]             = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);

  // ── voice control (push-to-talk) ──────────────────────────────────────────
  const [voiceOpen, setVoiceOpen]     = useState(false);

  // ── unified favorites & live format ───────────────────────────────────────
  const [favorites, setFavorites]     = useState([]);
  const [liveFormat, setLiveFormat]   = useState(null);

  // refs
  const themeSyncTimeout     = useRef(null);
  const prevTrackUriRef      = useRef(null);
  const eqSyncTimeout        = useRef(null);
  const progressInterval     = useRef(null);
  const volumeApiTimeout     = useRef(null);
  const lastVolumeChangeTime = useRef(0);
  const lastNonZeroVolume    = useRef(50);
  const spotifyVolPinned     = useRef(false);
  const hasCheckedSource     = useRef(false);

  // ── websocket ─────────────────────────────────────────────────────────────
  const { isConnected, ws, sendUpdate } = useResonanceWS({
    token, setToken, setPlaybackState, setTrackPosition, setTrackDuration,
    setShuffleState, setRepeatState,
    setVolume:  v => { if (Date.now() - lastVolumeChangeTime.current >= 2500) setVolume(v); },
    setIsMuted: m => { if (Date.now() - lastVolumeChangeTime.current >= 2500) setIsMuted(m); },
    setUpdateStatus, setOtaProgress, setOtaPercent,
    setSpotify: isSpotify => setSource(p => isSpotify ? 'spotify' : (p === 'spotify' ? 'local' : p)),
    setSource, setDevices,
    onRequestSync: () => localSync(),
    isAuthenticated, isRemote: true,
    setStandby, setEqPreset, setEqBands, setEqSaturation, setEqNoiseFloor,
    setEqPreAmp, setDspActive, setPureDirect, setTheme, setActiveTheme, setBrightness,
    setRemoteAccessEnabled, setVisualizerMode,
  });

  // ── derived ───────────────────────────────────────────────────────────────
  const currentTrack    = playbackState?.track_window?.current_track;
  // Only "playing" when there is a real track — an idle Spotify sync can leave a
  // paused:false state with an empty track object, which wrongly showed Pause.
  const isPlaying       = playbackState && currentTrack?.name ? !playbackState.paused : false;
  const trackName       = currentTrack?.name || 'Nothing playing';
  const trackArtist     = currentTrack?.artists?.map(a => a.name).join(', ') || '';
  const albumImage      = currentTrack?.album?.images?.[0]?.url;
  const activeDevice    = devices.find(d => d.is_active);
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');
  const progressPct     = trackDuration ? (trackPosition / trackDuration) * 100 : 0;
  const isCurrentFav    = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;

  // ── helpers ───────────────────────────────────────────────────────────────
  const wakeKiosk = () => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: false } }));
  };
  const requestWSStateSync = () => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
  };

  // ── theme handlers ────────────────────────────────────────────────────────
  const queueThemeSync = (tc, at, br, vm) => { clearTimeout(themeSyncTimeout.current); themeSyncTimeout.current = setTimeout(() => sendUpdate('SET_THEME_SETTINGS', { themeColor: tc, activeTheme: at, brightness: br, visualizerMode: vm }), 400); };
  const handleThemeColorChange     = c => { setTheme(c); localStorage.setItem('resonance_theme', c); sendUpdate('SET_THEME_SETTINGS', { themeColor: c, activeTheme, brightness, visualizerMode }); };
  const handleActiveThemeChange    = t => { setActiveTheme(t); localStorage.setItem('resonance_theme_active', t); sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme: t, brightness, visualizerMode }); };
  const handleBrightnessChange     = v => { setBrightness(v); localStorage.setItem('resonance_theme_brightness', v); queueThemeSync(theme, activeTheme, v, visualizerMode); };
  const handleVisualizerModeChange = m => { setVisualizerMode(m); localStorage.setItem('resonance_visualizer_mode', m); sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme, brightness, visualizerMode: m }); };

  // ── EQ handlers ───────────────────────────────────────────────────────────
  const queueEqSync = (preset, bands, sat, nf, pa) => { clearTimeout(eqSyncTimeout.current); eqSyncTimeout.current = setTimeout(() => sendUpdate('SET_EQ_SETTINGS', { preset, bands, saturation: sat, noiseFloor: nf, preAmp: pa }), 800); };
  const handleEqPresetChange = name => {
    setEqPreset(name); localStorage.setItem('resonance_eq_preset', name);
    const f = EQ_PRESETS.find(p => p.name === name);
    if (f) {
      setEqBands(f.bands); setEqSaturation(f.saturation); setEqNoiseFloor(f.noiseFloor); setEqPreAmp(f.preAmp);
      localStorage.setItem('resonance_eq_bands', JSON.stringify(f.bands));
      localStorage.setItem('resonance_eq_saturation', f.saturation);
      localStorage.setItem('resonance_eq_noise', f.noiseFloor);
      localStorage.setItem('resonance_eq_preamp', f.preAmp);
      sendUpdate('SET_EQ_SETTINGS', { preset: name, bands: f.bands, saturation: f.saturation, noiseFloor: f.noiseFloor, preAmp: f.preAmp });
    }
  };
  const handleBandChange       = (i, v) => { const n = [...eqBands]; n[i] = v; setEqBands(n); localStorage.setItem('resonance_eq_bands', JSON.stringify(n)); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', n, eqSaturation, eqNoiseFloor, eqPreAmp); };
  const handleSaturationChange = v     => { setEqSaturation(v); localStorage.setItem('resonance_eq_saturation', v); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', eqBands, v, eqNoiseFloor, eqPreAmp); };
  const handleNoiseFloorChange = v     => { setEqNoiseFloor(v); localStorage.setItem('resonance_eq_noise', v); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', eqBands, eqSaturation, v, eqPreAmp); };
  const handlePreAmpChange     = v     => { setEqPreAmp(v); localStorage.setItem('resonance_eq_preamp', v); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', eqBands, eqSaturation, eqNoiseFloor, v); };

  // ── effects ───────────────────────────────────────────────────────────────
  useEffect(() => { api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }, []);
  // Live source format for PlayerTab's quality badge (HI-RES / CD QUALITY …).
  // signal-path's `mpd` field is MPD's decoded {rate, bits, channels} — the
  // exact shape PlayerTab expects. setLiveFormat was declared but never
  // called before (AUDIT-2026-07-03.md dead-code pass), so the badge
  // silently never upgraded past its fallback.
  useEffect(() => {
    if (!isAuthenticated) return;
    const poll = async () => {
      try {
        const r = await fetch('/api/player/signal-path');
        if (r.ok) setLiveFormat((await r.json()).mpd || null);
      } catch { /* keep last known value */ }
    };
    poll();
    // Sample rate/DSP path only actually change on a track or source switch,
    // so this doesn't need the sub-10s freshness the Spotify playback poll does.
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [isAuthenticated]);
  useEffect(() => { if (source === 'radio' && !hasCheckedSource.current) { setActiveTab('source'); hasCheckedSource.current = true; } }, [source]);
  useEffect(() => { if (isConnected) { fetchFavorites(); checkUpdates(); } }, [isConnected]);
  // Displayed station list, computed during render — no state sync needed.
  const stationsList = radioSearch.trim() && searchStations ? searchStations : favoriteStations;
  // Clearing the input drops stale search results immediately (event-driven,
  // not an Effect), so retyping doesn't flash the previous query's results.
  const setRadioSearch = (v) => { setRadioSearchState(v); if (!String(v).trim()) setSearchStations(null); };
  // Playback state (/me/player) and the device list (/me/player/devices) used to
  // poll together every 3s. Playback state needs that cadence — Spotify Connect
  // has no push mechanism for third parties, so polling is the only way to
  // notice a track/pause/seek change made from another Spotify client. The
  // device list barely ever changes and only feeds device-transfer UI, which
  // doesn't need sub-10s freshness — split onto its own slower interval instead
  // of doubling every playback-state poll's request count for no visible benefit.
  useEffect(() => {
    if (!spotify || !isAuthenticated || !token) return;
    localSync();
    const stateId = setInterval(localSync, 3000);

    fetchDevices({ silent: true });
    const devicesId = setInterval(() => fetchDevices({ silent: true }), 15000);

    return () => { clearInterval(stateId); clearInterval(devicesId); };
  }, [token, isAuthenticated, spotify]);
  // Allow the Spotify device to be re-pinned to unity next time it becomes active.
  useEffect(() => { if (!spotify) spotifyVolPinned.current = false; }, [spotify]);
  // TEMP DIAGNOSTIC — remove with /api/system/client-viewport-debug once the
  // iOS standalone layout issue is resolved. Reports what the phone actually
  // measures (viewport vs screen, real env(safe-area-inset-*) values,
  // standalone mode or not) to the server journal.
  useEffect(() => {
    if (!isAuthenticated) return;
    const t = setTimeout(() => {
      const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
        || window.navigator.standalone === true;
      const probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);left:0;width:1px;visibility:hidden;pointer-events:none';
      document.body.appendChild(probe);
      const r = probe.getBoundingClientRect();
      const satTop = Math.round(r.top);
      const satBottom = Math.round(window.innerHeight - r.bottom);
      probe.remove();
      fetch('/api/system/client-viewport-debug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          standalone,
          innerW: window.innerWidth, innerH: window.innerHeight,
          screenW: window.screen.width, screenH: window.screen.height,
          visualH: Math.round(window.visualViewport?.height || 0),
          dpr: window.devicePixelRatio,
          satTop, satBottom,
          ua: navigator.userAgent,
        }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [isAuthenticated]);

  // On mount: redeem a ?qr= token from the URL, or validate an existing cookie.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qrToken = params.get('qr');
    if (qrToken) {
      // Remove the token from the URL immediately to avoid sharing/reuse.
      const clean = new URL(window.location.href);
      clean.searchParams.delete('qr');
      window.history.replaceState({}, '', clean.toString());
      fetch('/api/auth/qr-redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: qrToken }),
      }).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (r.ok && d.token) {
          setCookie('remote_token', d.token, 365);
          setIsAuthenticated(true);
        } else {
          setQrRedeemError(d.error || 'QR code expired — scan a fresh one from the kiosk.');
        }
      }).catch(() => setQrRedeemError('Could not reach the server.'));
    } else if (isAuthenticated) {
      fetch('/api/auth/check').then(r => {
        if (r.status === 401) { eraseCookie('remote_token'); setIsAuthenticated(false); }
      }).catch(() => {});
    }
  }, []);
  useEffect(() => {
    if (activeTab === 'library' && libraryItems.length === 0 && libraryView === 'artists') fetchLibraryArtists();
  }, [activeTab]);
  useEffect(() => { if (queueOpen && spotify && token) fetchQueue(); }, [queueOpen]);
  useEffect(() => {
    if (activeTab === 'settings') { fetchSystemHealth(); fetchServices(); }
    // Source tab needs `services` too, for the AirPlay/UPnP/Bluetooth
    // "properly configured" dots — without this it'd stay null until the
    // user happened to visit Settings first.
    if (activeTab === 'source') fetchServices();
  }, [activeTab]);
  useEffect(() => {
    if (isAuthenticated && playbackState && isPlaying) {
      progressInterval.current = setInterval(() => {
        setTrackPosition(p => {
          if (p + 1000 >= trackDuration) { clearInterval(progressInterval.current); return trackDuration; }
          return p + 1000;
        });
      }, 1000);
    } else { clearInterval(progressInterval.current); }
    return () => clearInterval(progressInterval.current);
  }, [playbackState, isPlaying, trackDuration, isAuthenticated]);
  // Keyed on sleepMinutes (only changes when the timer is armed/cleared), NOT
  // sleepRemaining (which the interval itself updates every second) — depending
  // on sleepRemaining would tear down and recreate this setInterval every tick.
  useEffect(() => {
    if (sleepMinutes <= 0) return;
    const id = setInterval(() => {
      setSleepRemaining(r => {
        if (r <= 1) {
          clearInterval(id);
          if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: true } }));
          setSleepMinutes(0); setShowSleepRow(false);
          toast.success('Sleep timer: kiosk standby');
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [sleepMinutes]);

  // Record to play history whenever the track changes
  useEffect(() => {
    if (!trackName || trackName === 'Nothing playing') return;
    const uri = currentTrack?.uri || currentTrack?.url || '';
    if (uri && uri === prevTrackUriRef.current) return;
    prevTrackUriRef.current = uri;
    api.addToHistory({
      source, title: trackName, artist: trackArtist,
      album: currentTrack?.album?.name || '',
      file: currentTrack?.file || uri || '',
      cover: albumImage || '',
    }).catch(() => {});
  }, [trackName, source]);

  // ── data fetchers ─────────────────────────────────────────────────────────
  const fetchFavorites    = async () => {
    try { setFavoriteStations(await api.getFavoriteRadios() || []); } catch {}
    try { setFavorites(await api.getFavorites() || []); } catch {}
  };
  // `silent` skips the isFetchingDevices spinner flag for the background poll
  // (see the effect above) — both it and `devices` are ctxValue dependencies,
  // and this poll almost always finds an unchanged list, so toggling them
  // recomputes that memo and re-renders every remote screen for nothing.
  const fetchDevices      = async ({ silent = false } = {}) => {
    if (!token) return;
    if (!silent) setIsFetchingDevices(true);
    try {
      const next = (await api.getDevices(token)).devices || [];
      setDevices(prev => {
        const same = prev.length === next.length && prev.every((d, i) =>
          d.id === next[i]?.id && d.is_active === next[i]?.is_active && d.name === next[i]?.name);
        return same ? prev : next;
      });
    } catch {} finally { if (!silent) setIsFetchingDevices(false); }
  };
  const fetchSystemHealth = async () => { try { setSystemHealth(await api.getSystemHealth()); } catch {} };
  const fetchServices     = async () => { try { setServices((await api.getServices()).services || {}); } catch {} };

  const fetchQueue = async () => {
    if (!token) return;
    setQueueLoading(true);
    try {
      const data = await api.getSpotifyQueue(token);
      setQueue(data?.queue || []);
    } catch {}
    finally { setQueueLoading(false); }
  };

  const localSync = async () => {
    if (!spotify || !token) return;
    try {
      const s = await api.getPlaybackState(token);
      if (!s) return;
      // trackPosition/trackDuration/shuffleState/repeatState are cheap,
      // page-local state (not ctxValue dependencies) — update unconditionally.
      setTrackPosition(s.progress_ms); setTrackDuration(s.item?.duration_ms || 0);
      setShuffleState(s.shuffle_state); setRepeatState(s.repeat_state);
      // playbackState feeds currentTrack/albumImage/trackName/trackArtist,
      // which ARE ctxValue dependencies every remote screen subscribes to via
      // useContext(Tk) — replacing it with a fresh object on every 3s poll
      // even when nothing changed recomputes that memo and re-renders the
      // whole remote UI for no reason (the same "choking" bug found and
      // fixed on the kiosk side). Only replace it when something a viewer
      // would actually notice changed.
      const prevTrack = playbackState?.track_window?.current_track;
      const nextPaused = !s.is_playing;
      if (!playbackState || prevTrack?.uri !== s.item?.uri || playbackState.paused !== nextPaused) {
        // Volume is intentionally NOT read from Spotify's device here — CamillaDSP is
        // the single master volume stage. The slider is hydrated from /api/status.
        setPlaybackState({ paused: nextPaused, position: s.progress_ms, duration: s.item?.duration_ms || 0, shuffle_state: s.shuffle_state, repeat_state: s.repeat_state, volume, is_muted: isMuted, track_window: { current_track: { uri: s.item?.uri, name: s.item?.name, album: { name: s.item?.album?.name, images: s.item?.album?.images || [] }, artists: s.item?.artists || [] } } });
      }
      // Keep Resonance Connect pinned at 100% on every poll — CamillaDSP is the
      // single gain master. librespot uses VOLUME_CTRL=fixed so this is a safety net.
      if (s.device?.name === 'Resonance Connect' && s.device?.volume_percent !== 100) {
        api.setVolume(token, 100).catch(() => {});
      }
    } catch {}
  };

  const checkUpdates     = async () => { setUpdateStatus('checking'); try { const d = await api.getUpdateStatus(); setUpdateStatus(d.updateAvailable ? 'available' : 'no-update'); } catch { setUpdateStatus('no-update'); } };
  const triggerOtaUpdate = async () => { try { setOtaProgress([]); setOtaPercent(0); setUpdateStatus('updating'); localStorage.setItem('resonance_updating', 'true'); await api.triggerUpdate(); } catch { localStorage.removeItem('resonance_updating'); setUpdateStatus('error'); } };

  // ── library ───────────────────────────────────────────────────────────────
  const fetchLibraryArtists    = async () => { setLibraryLoading(true); try { setLibraryItems((await api.getLibraryArtists()).artists || []); } catch {} setLibraryLoading(false); };
  const fetchLibraryAlbums     = async artist => { setLibraryLoading(true); try { setLibraryItems((await api.getLibraryAlbums(artist)).albums || []); } catch {} setLibraryLoading(false); };
  const fetchLibraryTracks     = async (album, artist) => { setLibraryLoading(true); try { setLibraryItems((await api.getLibraryTracks(album, artist)).tracks || []); } catch {} setLibraryLoading(false); };
  const handleLibraryBack      = () => { if (libraryView === 'tracks') { setLibraryView('albums'); fetchLibraryAlbums(selectedArtist); } else { setLibraryView('artists'); setSelectedArtist(null); fetchLibraryArtists(); } };
  const handleLibraryPlayTrack = async filePath => {
    try { wakeKiosk(); await api.clearQueue(); await api.addToQueue(filePath, true); handleToggleSource('local'); setActiveTab('player'); toast.success('Playing'); }
    catch (e) { reportError(e.message); }
  };

  // ── system handlers ───────────────────────────────────────────────────────
  const handleRestartService  = async name => { setServiceLoading(p => ({ ...p, [name]: true })); try { await api.restartService(name); toast.success(`${name} restarting…`); setTimeout(fetchServices, 3000); } catch (e) { reportError(e.message); } setServiceLoading(p => ({ ...p, [name]: false })); };
  const handleReboot          = async () => { try { await api.rebootSystem(); toast.success(t('settings.rebooting')); } catch (e) { reportError(e.message); } };
  const handleShutdown        = async () => { try { await api.shutdownSystem(); toast.success(t('settings.shuttingDown')); } catch (e) { reportError(e.message); } };
  const handleTransferPlayback = async deviceId => { if (!token) return; try { await api.transferPlayback(token, deviceId); toast.success('Output transferred'); setTimeout(fetchDevices, 800); requestWSStateSync(); } catch (e) { reportError(e.message); } };

  // ── sleep timer ───────────────────────────────────────────────────────────
  const handleSetSleepTimer = minutes => { setSleepMinutes(minutes); setSleepRemaining(minutes * 60); if (!minutes) { setSleepRemaining(0); toast.success('Sleep timer off'); } else toast.success(`Sleep in ${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}`); };

  // ── transport ─────────────────────────────────────────────────────────────
  // Mirrors Kiosk.jsx's handleToggleSource: fire-and-forget stop calls for the
  // OLD source before switching, so the phone remote silences it as instantly
  // as the kiosk touchscreen does instead of waiting on the SET_SOURCE event
  // queue (which left a longer window of audio bleed/overlap between sources).
  const handleToggleSource  = src => {
    switch (source) {
      case 'local':
      case 'radio':
        fetch('/api/player/pause', { method: 'POST' }).catch(() => {});
        break;
      case 'spotify':
        if (token) {
          fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});
        }
        break;
      case 'airplay':
        fetch('/api/player/airplay/stop', { method: 'POST' }).catch(() => {});
        break;
      case 'upnp':
        fetch('/api/player/upnp/stop', { method: 'POST' }).catch(() => {});
        break;
      case 'bluetooth':
        fetch('/api/player/bluetooth/stop', { method: 'POST' }).catch(() => {});
        break;
      default:
        break;
    }
    setSource(src);
    setPlaybackState(null);
    sendUpdate('SET_SOURCE', { spotify: src === 'spotify', source: src });
  };
  const handleToggleStandby = en  => { setStandby(en); if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: en } })); };
  const handleTogglePureDirect = async enabled => {
    try { await fetch('/api/player/pure-direct', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled }) }); setPureDirect(enabled); }
    catch (e) { reportError(e.message); }
  };

  const handlePlayPause = async () => {
    if (!spotify) {
      try { if (playbackState ? playbackState.paused : true) { wakeKiosk(); await api.localPlay(); setPlaybackState(p => ({ ...p, paused: false })); } else { await api.localPause(); setPlaybackState(p => ({ ...p, paused: true })); } } catch (e) { reportError(e.message); }
      return;
    }
    if (!token) return;
    try { if (isPlaying) await api.pause(token); else { wakeKiosk(); await api.play(token, activeDevice?.id || resonanceDevice?.id || null); } requestWSStateSync(); } catch (e) { reportError(e.message); }
  };
  const handleNext     = async () => { if (!spotify) { try { await api.localNext(); } catch {} return; } if (!token) return; try { await api.skipNext(token); requestWSStateSync(); } catch {} };
  const handlePrevious = async () => { if (!spotify) { try { await api.localPrevious(); } catch {} return; } if (!token) return; try { await api.skipPrevious(token); requestWSStateSync(); } catch {} };
  const handleShuffle  = async () => { if (!spotify || !token) return; const n = !shuffleState; setShuffleState(n); try { await api.setShuffle(token, n); requestWSStateSync(); } catch { setShuffleState(!n); } };
  const handleRepeat   = async () => { if (!spotify || !token) return; const n = { off: 'context', context: 'track', track: 'off' }[repeatState] || 'off'; setRepeatState(n); try { await api.setRepeat(token, n); requestWSStateSync(); } catch { setRepeatState(repeatState); } };
  const handleSeek     = async e => { const ms = parseInt(e.target.value, 10); setTrackPosition(ms); if (!spotify) { try { await api.localSeek(`${Math.round((ms / (trackDuration || 1)) * 100)}%`); } catch {} return; } if (!token) return; try { await api.seek(token, ms); requestWSStateSync(); } catch {} };

  // Volume is owned by the CamillaDSP master stage for EVERY source (incl. Spotify),
  // so a single persisted level survives source switches, reboot and wake without
  // the double-attenuation that came from also driving Spotify's device volume.
  // No client-side BROADCAST_STATE here on purpose: handleVolumeChange fires on
  // every onChange tick while dragging (unlike the debounced REST call below),
  // and used to send a full playbackState-replacing broadcast per tick — on
  // other connected screens that meant replacing playbackState (a ctxValue
  // dependency) dozens of times in a couple of seconds during one smooth drag,
  // each cascading a full re-render across the whole remote UI. The server's
  // /api/player/volume route now broadcasts a lightweight SET_VOLUME event
  // itself (once, debounced, decoupled from playbackState), which is
  // sufficient for other screens to reflect the new volume within ~180ms.
  const handleVolumeChange = e => {
    const v = parseInt(e.target.value, 10); setVolume(v); setIsMuted(v === 0); lastVolumeChangeTime.current = Date.now();
    if (v > 0) lastNonZeroVolume.current = v;
    clearTimeout(volumeApiTimeout.current);
    volumeApiTimeout.current = setTimeout(async () => { try { await api.localSetVolume(v); } catch {} }, 180);
  };
  const handleMuteToggle = async () => {
    const m = !isMuted; setIsMuted(m); lastVolumeChangeTime.current = Date.now();
    const tv = m ? 0 : (lastNonZeroVolume.current || 30);
    if (!m) setVolume(tv);
    try { await api.localSetVolume(tv); } catch {}
  };
  const handleToggleFavRadio = async station => {
    const isFav = favoriteStations.some(s => s.url === station.url);
    try { if (isFav) await api.deleteFavoriteRadio(station.url); else await api.addFavoriteRadio({ name: station.name, url: station.url, favicon: station.favicon, country: station.country, tags: station.tags }); fetchFavorites(); } catch (e) { reportError(e.message); }
  };
  const handleToggleFavorite = async ({ source: src, uri, title, artist, album, cover }) => {
    const isFav = favorites.some(f => f.source === src && f.uri === uri);
    try {
      if (isFav) {
        await api.removeFavoriteByUri(src, uri);
        setFavorites(prev => prev.filter(f => !(f.source === src && f.uri === uri)));
      } else {
        const added = await api.addFavorite({ source: src, uri, title, artist, album, cover });
        setFavorites(prev => [...prev, added]);
        toast.success('Added to favorites');
      }
      // Like-sync: mirror the heart into the user's real Spotify library so it
      // shows in the official app too. Fire-and-forget — the local favorites
      // table stays the source of truth even if Spotify is unreachable.
      if (src === 'spotify' && token && uri?.startsWith('spotify:track:')) {
        const trackId = uri.split(':')[2];
        (isFav ? api.removeSavedTrack(token, trackId) : api.saveTrack(token, trackId))
          .catch(err => console.warn('[LikeSync] Spotify library sync failed:', err.message));
      }
    } catch (e) { reportError(e.message); }
  };
  const handleRadioSearch = async () => {
    const q = radioSearch.trim(); if (!q) { setSearchStations(null); return; }
    setIsSearching(true);
    try { const r = await fetch(`/api/player/radio-search?q=${encodeURIComponent(q)}&limit=25`); const d = await r.json(); const f = d.map(s => ({ name: s.name.length > 26 ? s.name.substring(0, 24) + '…' : s.name, url: s.url_resolved || s.url, favicon: s.favicon, country: s.country, tags: s.tags })); if (!f.length) reportError('No stations found.'); else setSearchStations(f); } catch { reportError('Search failed.'); } finally { setIsSearching(false); }
  };
  const handlePlayTrack   = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, null, [uri]); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { reportError(e.message); } };
  const handlePlayContext = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, uri); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { reportError(e.message); } };
  const handleDeactivateDsp = async () => { try { const c = await api.getDspCalibration() || {}; c[0] = 'eq'; await api.saveDspCalibration(c); setDspActive(false); } catch {} };

  // ── context value ─────────────────────────────────────────────────────────
  const ctxValue = useMemo(() => ({
    C, card, cardWhite, btn, btnInset, darkMode,
    activeTab, setActiveTab: changeTab,
    isConnected, ws, sendUpdate,
    standby, handleToggleStandby,
    source, spotify, setSource, handleToggleSource,
    token, isPlaying, trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    playbackState, currentTrack, activeDevice, resonanceDevice, devices,
    albumImage, trackName, trackArtist,
    favoriteStations, isCurrentFav,
    handlePlayPause, handleNext, handlePrevious,
    handleShuffle, handleRepeat, handleSeek,
    handleVolumeChange, handleMuteToggle,
    handleToggleFavRadio, handleToggleFavorite, wakeKiosk, requestWSStateSync,
    favorites, liveFormat,
    handlePlayTrack, handlePlayContext,
    libraryView, selectedArtist, selectedAlbum, libraryItems, libraryLoading,
    handleLibraryBack, handleLibraryPlayTrack,
    fetchLibraryArtists, fetchLibraryAlbums, fetchLibraryTracks,
    setSelectedArtist, setLibraryView, setSelectedAlbum,
    radioSearch, setRadioSearch, stationsList, isSearching,
    handleRadioSearch,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, setDspActive, showEq, setShowEq,
    isDspWizardOpen, setIsDspWizardOpen,
    pureDirect, handleTogglePureDirect,
    handleEqPresetChange, handleBandChange,
    handleSaturationChange, handleNoiseFloorChange, handlePreAmpChange,
    handleDeactivateDsp,
    theme, activeTheme, brightness, visualizerMode,
    isThemeSettingsOpen, setIsThemeSettingsOpen,
    handleThemeColorChange, handleActiveThemeChange,
    handleBrightnessChange, handleVisualizerModeChange,
    sleepMinutes, sleepRemaining, showSleepRow, setShowSleepRow,
    handleSetSleepTimer,
    systemHealth, services, serviceLoading,
    updateStatus, otaProgress, otaPercent,
    handleRestartService, handleReboot, handleShutdown,
    triggerOtaUpdate, checkUpdates, fetchDevices,
    handleTransferPlayback,
    setIsAuthenticated, eraseCookie,
    queueOpen, setQueueOpen, queue, queueLoading, fetchQueue,
    setToken, setPlaybackState, setDevices,
  }), [
    darkMode, activeTab, isConnected, ws, sendUpdate,
    standby, source, spotify, token, isPlaying,
    trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    playbackState, currentTrack, activeDevice, resonanceDevice, devices,
    albumImage, trackName, trackArtist,
    favoriteStations, isCurrentFav, favorites, liveFormat,
    libraryView, selectedArtist, selectedAlbum, libraryItems, libraryLoading,
    radioSearch, stationsList, isSearching,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, isDspWizardOpen, pureDirect,
    theme, activeTheme, brightness, visualizerMode, isThemeSettingsOpen,
    sleepMinutes, sleepRemaining, showSleepRow,
    systemHealth, services, serviceLoading,
    updateStatus, otaProgress, otaPercent,
    queueOpen, queue, queueLoading,
  ]);

  // ══════════════════════════════════════════════════════════════════════════
  // DISABLED
  // ══════════════════════════════════════════════════════════════════════════
  if (!remoteAccessEnabled) return (
    <div style={{ ...rcVars, fontFamily: C.font, background: C.bg, paddingTop: 'calc(2rem + env(safe-area-inset-top))', paddingBottom: 'calc(2rem + env(safe-area-inset-bottom))' }}
      className="remote-root fixed inset-0 flex flex-col items-center justify-center gap-6 p-8 touch-manipulation select-none">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
        <Smartphone className="h-8 w-8" style={{ color: C.error }} />
      </div>
      <div className="text-center">
        <p className="text-[22px] font-medium mb-2" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{t('remoteGate.disabledTitle')}</p>
        <p className="text-[15px]" style={{ color: C.text4 }}>{t('remoteGate.disabledBody')}</p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // SCAN QR — shown when no valid session exists
  // ══════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) return (
    <div style={{ ...rcVars, fontFamily: C.font, background: C.bg, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      className="remote-root fixed inset-0 flex flex-col items-center justify-center px-6 touch-manipulation select-none overflow-hidden">
      <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[320px] h-[320px] rounded-full pointer-events-none"
        style={{ background: `radial-gradient(ellipse, ${C.champagne} 0%, transparent 70%)`, opacity: darkMode ? 0.06 : 0.11 }} />
      <div className="w-full max-w-xs z-10 flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={card}>
            <Waves className="h-9 w-9" style={{ color: C.champagne }} />
          </div>
          <div className="text-center">
            <p className="text-[30px] font-medium" style={{ color: C.text1, letterSpacing: '-0.02em' }}>Resonance</p>
            <p className="text-[11px] uppercase tracking-widest font-semibold mt-1" style={{ color: C.text3, fontFamily: C.fontLabel }}>Remote Control</p>
          </div>
        </div>
        <div className="w-full rounded-2xl p-6 flex flex-col items-center gap-4 text-center" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: C.container, border: `0.5px solid ${C.outline}` }}>
            <Smartphone className="h-7 w-7" style={{ color: C.champagne }} />
          </div>
          <div>
            <p className="text-[17px] font-semibold mb-1" style={{ color: C.text1 }}>{t('remoteGate.scanTitle')}</p>
            <p className="text-[14px] leading-relaxed" style={{ color: C.text3 }}>
              {t('remoteGate.scanBody')}
            </p>
          </div>
          {qrRedeemError && (
            <p className="text-[13px] px-3 py-2 rounded-xl w-full" style={{ color: C.error, background: `${C.error}15`, border: `0.5px solid ${C.error}40` }}>
              {qrRedeemError}
            </p>
          )}
          <div className="w-full pt-2" style={{ borderTop: `0.5px solid ${C.outline}` }}>
            <p className="text-[11px] uppercase tracking-wider pt-3 pb-2" style={{ color: C.text3, fontFamily: C.fontLabel }}>
              Already added to your Home Screen? Enter the code from the kiosk instead
            </p>
            <form onSubmit={handlePairCodeSubmit} className="flex gap-2">
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off"
                maxLength={6} placeholder="000000"
                value={pairCodeInput}
                onChange={e => setPairCodeInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="flex-1 min-w-0 rounded-xl px-3 py-2.5 text-[16px] font-semibold tabular-nums tracking-[0.2em] text-center focus:outline-none"
                style={{ background: C.container, color: C.text1, border: `0.5px solid ${C.outline}` }}
              />
              <button type="submit" disabled={pairCodeInput.length !== 6 || pairCodeBusy}
                className="px-4 rounded-xl text-[13px] font-semibold shrink-0 active:scale-95 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-default"
                style={{ background: C.champagne, color: '#1a1c1c' }}>
                {pairCodeBusy ? '…' : 'Connect'}
              </button>
            </form>
          </div>
        </div>
        <p className="text-[12px] text-center" style={{ color: C.text3 }}>
          {t('remoteGate.noPasswordNote')}
        </p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN REMOTE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Tk.Provider value={ctxValue}>
      <div style={{ ...rcVars, fontFamily: C.font }}>
        {isTablet ? (
          <TabletShell darkMode={darkMode} setDarkMode={setDarkMode} tabDirection={tabDirection}
            onVoice={voiceSupported() ? () => setVoiceOpen(true) : undefined} />
        ) : (
          <div style={{ background: C.bg, paddingTop: 'env(safe-area-inset-top)' }}
            className="h-[100vh] remote-root fixed inset-0 flex flex-col overflow-hidden overflow-y-auto touch-manipulation select-none">

            <TopBar darkMode={darkMode} setDarkMode={setDarkMode}
              onVoice={voiceSupported() ? () => setVoiceOpen(true) : undefined} />

            <div className="flex-1 overflow-y-auto overscroll-none"
              style={{ paddingBottom: `calc(${NAV_H + (activeTab !== 'player' ? 72 : 8)}px + env(safe-area-inset-bottom))` }}>
              <div key={activeTab} className={`animate-tab-${tabDirection}`}>
                {activeTab === 'player'   && <PlayerTab />}
                {activeTab === 'library'  && <LibraryTab />}
                {activeTab === 'search'   && <UniversalSearch />}
                {activeTab === 'source'   && <SourceTab />}
                {activeTab === 'settings' && <SettingsTab />}
              </div>
            </div>

            {activeTab !== 'player' && (
              <div className="absolute left-0 right-0" style={{ bottom: `calc(${NAV_H}px + env(safe-area-inset-bottom))` }}>
                <MiniPlayer />
              </div>
            )}

            <BottomNav navH={NAV_H} />
          </div>
        )}

        {/* ── Overlays ── On tablet, the DSP wizard and theme settings render
             INLINE inside TabletSettingsTab's own content pane instead (see
             TabletShell/TabletSettingsTab) — "modals that don't make sense
             when there's room to just navigate" was direct feedback, so
             these two are suppressed here for tablet rather than also
             floating as cards. QueuePanel similarly has no tablet path here:
             TabletPlayerHero/TabletNowPlayingRail expand the queue in place
             instead of ever setting queueOpen. Voice control stays a
             overlay on both — it's a transient mic-listening state, not
             navigable content. */}
        {!isTablet && isDspWizardOpen && (
          // z above 9999: Settings' own Sheet (Sound → Room Calibration lives
          // inside it) is portaled to document.body at that same z-index, and
          // since portals land after this non-portaled overlay in DOM order,
          // equal z-index meant the still-open Sound sheet painted on top and
          // swallowed clicks — the wizard was there, just hidden underneath.
          <div className="remote-root fixed inset-0 z-[10010] flex flex-col"
            style={{ ...rcVars, background: C.bg, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <RemoteDspWizard
              onClose={() => { setIsDspWizardOpen(false); api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }}
              onCalibrationComplete={active => setDspActive(active)}
              pureDirect={pureDirect}
              onPureDirectChange={handleTogglePureDirect}
            />
          </div>
        )}

        {!isTablet && queueOpen && (
          <QueuePanel
            queue={queue}
            queueLoading={queueLoading}
            onClose={() => setQueueOpen(false)}
          />
        )}

        {voiceOpen && <VoiceControl onClose={() => setVoiceOpen(false)} />}

        {!isTablet && isThemeSettingsOpen && (
          <div className="remote-root fixed inset-0 z-[9999] flex flex-col overflow-y-auto"
            style={{ ...rcVars, background: C.bg, fontFamily: C.font, paddingTop: 'env(safe-area-inset-top)' }}>
            <div className="flex justify-between items-center px-5 pt-4 pb-4 sticky top-0 z-10 shrink-0"
              style={{ background: C.bg, borderBottom: `0.5px solid ${C.outline}` }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5"
                  style={{ color: C.champagne, fontFamily: C.fontLabel }}>Kiosk</p>
                <p className="text-[22px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Theme &amp; Appearance</p>
              </div>
              <button onClick={() => setIsThemeSettingsOpen(false)} aria-label="Close"
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                <X className="h-4 w-4" style={{ color: C.text3 }} />
              </button>
            </div>
            <div className="p-5" style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}>
              <RemoteThemeSettings
                activeTheme={activeTheme} onThemeChange={handleActiveThemeChange}
                themeColor={theme} onColorChange={handleThemeColorChange}
                brightness={brightness} onBrightnessChange={handleBrightnessChange}
                visualizerMode={visualizerMode} onVisualizerModeChange={handleVisualizerModeChange}
              />
            </div>
          </div>
        )}

      </div>
    </Tk.Provider>
  );
}
