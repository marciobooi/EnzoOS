import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Laptop, Music, Search, Radio, Heart,
  Power, Sliders, Cpu, Palette, RefreshCw, LogOut,
  Smartphone, ChevronRight, ChevronLeft, Waves, Cast,
  Library, Timer, User, Disc2, Sun, Moon,
} from 'lucide-react';
import { api } from '../api';
import { toast, Toaster } from 'sonner';
import { useResonanceWS } from '../websocket';
import EqualizerControl, { EQ_PRESETS } from '../components/EqualizerControl';
import DspWizard from '../components/DspWizard';
import ThemeSettingsControl from '../components/ThemeSettingsControl';
import TrackSearch from '../components/TrackSearch';

// ─── cookie helpers ────────────────────────────────────────────────────────────
const setCookie   = (n, v, d = 365) => { const e = new Date(); e.setTime(e.getTime() + d * 86400000); document.cookie = `${n}=${v}; expires=${e.toUTCString()}; path=/`; };
const getCookie   = n => { const v = `; ${document.cookie}`, p = v.split(`; ${n}=`); return p.length === 2 ? p.pop().split(';').shift() : null; };
const eraseCookie = n => { document.cookie = `${n}=; Max-Age=-99999999; path=/`; };

const fmt = ms => { if (!ms || isNaN(ms)) return '0:00'; const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; };

// ─── Spotify icon (SVG) ───────────────────────────────────────────────────────
const SpotifyIcon = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style}>
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z" />
  </svg>
);

// ─── Theme context (carries all design tokens & style helpers) ────────────────
const Tk = createContext({});

// ─── Row list item ────────────────────────────────────────────────────────────
function Row({ label, sub, value, onPress, destructive, chevron = true, icon, badge }) {
  const { C, cardWhite } = useContext(Tk);
  return (
    <button onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-60 transition-opacity cursor-pointer text-left"
      style={{ fontFamily: C.font }}>
      {icon && (
        <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
          {icon}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-medium truncate" style={{ color: destructive ? C.error : C.text1 }}>{label}</span>
        {sub && <span className="block text-[11px] mt-0.5 uppercase tracking-widest truncate" style={{ color: C.text3, fontFamily: C.fontLabel, fontWeight: 600 }}>{sub}</span>}
      </span>
      {badge && (
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: C.containerLow, color: C.primary, fontFamily: C.fontLabel, letterSpacing: '0.05em' }}>
          {badge}
        </span>
      )}
      {value !== undefined && <span className="text-[13px] shrink-0 font-semibold" style={{ color: C.champagne, fontFamily: C.fontLabel }}>{value}</span>}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />}
    </button>
  );
}

// ─── Section group with ghost separators ─────────────────────────────────────
function Section({ title, children }) {
  const { C, cardWhite } = useContext(Tk);
  const kids = React.Children.toArray(children).filter(Boolean);
  return (
    <div className="mx-4 mb-4">
      {title && (
        <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: C.text3, fontFamily: C.fontLabel }}>{title}</p>
      )}
      <div className="rounded-xl overflow-hidden" style={cardWhite}>
        {kids.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && (
              <div className="ml-4" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />
            )}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RemoteControl
// ══════════════════════════════════════════════════════════════════════════════
export default function RemoteControl() {
  // ── dark mode (persisted) ──────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('resonance_remote_dark') === 'true');
  useEffect(() => { localStorage.setItem('resonance_remote_dark', darkMode); }, [darkMode]);

  // ── design tokens ──────────────────────────────────────────────────────────
  const C = darkMode ? {
    bg:           '#0a0f1e',
    bgWhite:      '#0d1628',
    container:    '#1a2540',
    containerLow: '#111e33',
    primary:      '#d4af37',
    champagne:    '#d4af37',
    text1:        '#f0ede8',
    text2:        '#c4b898',
    text3:        '#6b7fa0',
    text4:        '#8fa3b8',
    outline:      '#1e2d45',
    error:        '#ff6b6b',
    font:         "'Manrope', -apple-system, system-ui, sans-serif",
    fontLabel:    "'Hanken Grotesk', -apple-system, system-ui, sans-serif",
  } : {
    bg:           '#f9f9f9',
    bgWhite:      '#ffffff',
    container:    '#eeeeee',
    containerLow: '#f3f3f4',
    primary:      '#735c00',
    champagne:    '#d4af37',
    text1:        '#1a1c1c',
    text2:        '#4d4635',
    text3:        '#7f7663',
    text4:        '#5d5e5f',
    outline:      '#d0c5af',
    error:        '#ba1a1a',
    font:         "'Manrope', -apple-system, system-ui, sans-serif",
    fontLabel:    "'Hanken Grotesk', -apple-system, system-ui, sans-serif",
  };

  // machined neomorphic styles
  const card = darkMode ? {
    background: '#0d1628',
    boxShadow:  '4px 4px 12px rgba(0,0,0,0.7), -4px -4px 12px rgba(20,40,75,0.4)',
    border:     '0.5px solid #1e2d45',
  } : {
    background: '#f9f9f9',
    boxShadow:  '4px 4px 10px rgba(0,0,0,0.025), -4px -4px 10px rgba(255,255,255,0.9)',
    border:     '0.5px solid #eeeeee',
  };

  const cardWhite = darkMode ? {
    background: '#111827',
    boxShadow:  '0 2px 12px rgba(0,0,0,0.5)',
    border:     '0.5px solid #1e2d45',
  } : {
    background: '#ffffff',
    boxShadow:  '0 2px 12px rgba(0,0,0,0.03)',
    border:     '0.5px solid #eeeeee',
  };

  const btn = darkMode ? {
    background: '#0d1628',
    boxShadow:  '4px 4px 8px rgba(0,0,0,0.7), -4px -4px 8px rgba(20,40,75,0.4)',
  } : {
    background: '#f9f9f9',
    boxShadow:  '4px 4px 8px rgba(0,0,0,0.04), -4px -4px 8px rgba(255,255,255,1)',
  };

  const btnInset = darkMode ? {
    background: '#0a0f1e',
    boxShadow:  'inset 3px 3px 6px rgba(0,0,0,0.7), inset -3px -3px 6px rgba(20,40,75,0.4)',
  } : {
    background: '#f9f9f9',
    boxShadow:  'inset 3px 3px 6px rgba(0,0,0,0.05), inset -3px -3px 6px rgba(255,255,255,0.9)',
  };

  // ── auth ───────────────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(getCookie('remote_auth') === 'true');
  const [usernameInput, setUsernameInput]     = useState('');
  const [passwordInput, setPasswordInput]     = useState('');

  // ── nav ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('player');

  // ── radio ──────────────────────────────────────────────────────────────────
  const [radioSearch, setRadioSearch]           = useState('');
  const [stationsList, setStationsList]         = useState([]);
  const [isSearching, setIsSearching]           = useState(false);
  const [favoriteStations, setFavoriteStations] = useState([]);

  // ── spotify ────────────────────────────────────────────────────────────────
  const [token, setToken]             = useState('');
  const [devices, setDevices]         = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  // ── playback ───────────────────────────────────────────────────────────────
  const [playbackState, setPlaybackState] = useState(null);
  const [shuffleState, setShuffleState]   = useState(false);
  const [repeatState, setRepeatState]     = useState('off');
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [volume, setVolume]               = useState(50);
  const [isMuted, setIsMuted]             = useState(false);

  // ── OTA ────────────────────────────────────────────────────────────────────
  const [updateStatus, setUpdateStatus] = useState(null);
  const [otaProgress, setOtaProgress]   = useState([]);
  const [otaPercent, setOtaPercent]     = useState(0);

  // ── source / standby ───────────────────────────────────────────────────────
  const [source, setSource]   = useState('spotify');
  const spotify = source === 'spotify';
  const [standby, setStandby] = useState(false);
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState(true);

  // ── EQ / DSP ───────────────────────────────────────────────────────────────
  const [isDspWizardOpen, setIsDspWizardOpen] = useState(false);
  const [showEq, setShowEq]                   = useState(false);
  const [dspActive, setDspActive]             = useState(false);
  const [eqPreset, setEqPreset]               = useState(() => localStorage.getItem('resonance_eq_preset') || 'Clinical Reference');
  const [eqBands, setEqBands]                 = useState(() => { try { return JSON.parse(localStorage.getItem('resonance_eq_bands')) || [0,0,0,0,0]; } catch { return [0,0,0,0,0]; } });
  const [eqSaturation, setEqSaturation]       = useState(() => Number(localStorage.getItem('resonance_eq_saturation')) || 0);
  const [eqNoiseFloor, setEqNoiseFloor]       = useState(() => Number(localStorage.getItem('resonance_eq_noise')) || 0);
  const [eqPreAmp, setEqPreAmp]               = useState(() => Number(localStorage.getItem('resonance_eq_preamp')) || 0.0);

  // ── theme ──────────────────────────────────────────────────────────────────
  const [theme, setTheme]                   = useState(() => localStorage.getItem('resonance_theme') || 'amber');
  const [activeTheme, setActiveTheme]       = useState(() => localStorage.getItem('resonance_theme_active') || 'dot-matrix');
  const [brightness, setBrightness]         = useState(() => Number(localStorage.getItem('resonance_theme_brightness')) || 100);
  const [visualizerMode, setVisualizerMode] = useState(() => localStorage.getItem('resonance_visualizer_mode') || 'vu');
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);

  // ── library ────────────────────────────────────────────────────────────────
  const [libraryView, setLibraryView]       = useState('artists');
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum]   = useState(null);
  const [libraryItems, setLibraryItems]     = useState([]);
  const [libraryLoading, setLibraryLoading] = useState(false);

  // ── system ─────────────────────────────────────────────────────────────────
  const [systemHealth, setSystemHealth]     = useState(null);
  const [services, setServices]             = useState(null);
  const [serviceLoading, setServiceLoading] = useState({});

  // ── sleep timer ────────────────────────────────────────────────────────────
  const [sleepMinutes, setSleepMinutes]     = useState(0);
  const [sleepRemaining, setSleepRemaining] = useState(0);
  const [showSleepRow, setShowSleepRow]     = useState(false);

  // refs
  const themeSyncTimeout     = useRef(null);
  const eqSyncTimeout        = useRef(null);
  const progressInterval     = useRef(null);
  const volumeApiTimeout     = useRef(null);
  const lastVolumeChangeTime = useRef(0);
  const hasCheckedSource     = useRef(false);

  // ── websocket ──────────────────────────────────────────────────────────────
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
    setEqPreAmp, setDspActive, setTheme, setActiveTheme, setBrightness,
    setRemoteAccessEnabled, setVisualizerMode,
  });

  // ── derived ────────────────────────────────────────────────────────────────
  const currentTrack    = playbackState?.track_window?.current_track;
  const isPlaying       = playbackState ? !playbackState.paused : false;
  const trackName       = currentTrack?.name || 'Nothing playing';
  const trackArtist     = currentTrack?.artists?.map(a => a.name).join(', ') || '';
  const albumImage      = currentTrack?.album?.images?.[0]?.url;
  const activeDevice    = devices.find(d => d.is_active);
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');
  const progressPct     = trackDuration ? (trackPosition / trackDuration) * 100 : 0;
  const isCurrentFav    = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;

  // ── helpers ────────────────────────────────────────────────────────────────
  const wakeKiosk = () => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: false } }));
  };
  const requestWSStateSync = () => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
  };

  // ── theme handlers ─────────────────────────────────────────────────────────
  const queueThemeSync = (tc, at, br, vm) => { clearTimeout(themeSyncTimeout.current); themeSyncTimeout.current = setTimeout(() => sendUpdate('SET_THEME_SETTINGS', { themeColor: tc, activeTheme: at, brightness: br, visualizerMode: vm }), 400); };
  const handleThemeColorChange     = c => { setTheme(c); localStorage.setItem('resonance_theme', c); sendUpdate('SET_THEME_SETTINGS', { themeColor: c, activeTheme, brightness, visualizerMode }); };
  const handleActiveThemeChange    = t => { setActiveTheme(t); localStorage.setItem('resonance_theme_active', t); sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme: t, brightness, visualizerMode }); };
  const handleBrightnessChange     = v => { setBrightness(v); localStorage.setItem('resonance_theme_brightness', v); queueThemeSync(theme, activeTheme, v, visualizerMode); };
  const handleVisualizerModeChange = m => { setVisualizerMode(m); localStorage.setItem('resonance_visualizer_mode', m); sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme, brightness, visualizerMode: m }); };

  // ── EQ handlers ────────────────────────────────────────────────────────────
  const queueEqSync = (preset, bands, sat, nf, pa) => { clearTimeout(eqSyncTimeout.current); eqSyncTimeout.current = setTimeout(() => sendUpdate('SET_EQ_SETTINGS', { preset, bands, saturation: sat, noiseFloor: nf, preAmp: pa }), 400); };
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

  // ── effects ────────────────────────────────────────────────────────────────
  useEffect(() => { api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }, []);
  useEffect(() => { if (source === 'radio' && !hasCheckedSource.current) { setActiveTab('source'); hasCheckedSource.current = true; } }, [source]);
  useEffect(() => { if (isConnected) { fetchFavorites(); checkUpdates(); } }, [isConnected]);
  useEffect(() => { if (!radioSearch.trim()) setStationsList(favoriteStations); }, [radioSearch, favoriteStations]);
  useEffect(() => {
    if (!spotify || !isAuthenticated || !token) return;
    fetchDevices(); localSync();
    const id = setInterval(() => { fetchDevices(); localSync(); }, 3000);
    return () => clearInterval(id);
  }, [token, isAuthenticated, spotify]);
  useEffect(() => {
    if (activeTab === 'library' && libraryItems.length === 0 && libraryView === 'artists') fetchLibraryArtists();
  }, [activeTab]);
  useEffect(() => {
    if (activeTab === 'settings') { fetchSystemHealth(); fetchServices(); }
  }, [activeTab]);
  useEffect(() => {
    if (isAuthenticated && playbackState && isPlaying) {
      progressInterval.current = setInterval(() => {
        setTrackPosition(p => { if (p + 1000 >= trackDuration) { clearInterval(progressInterval.current); return trackDuration; } return p + 1000; });
      }, 1000);
    } else { clearInterval(progressInterval.current); }
    return () => clearInterval(progressInterval.current);
  }, [playbackState, isPlaying, trackDuration, isAuthenticated]);
  useEffect(() => {
    if (sleepRemaining <= 0) return;
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
  }, [sleepRemaining]);

  // ── data fetchers ──────────────────────────────────────────────────────────
  const fetchFavorites    = async () => { try { setFavoriteStations(await api.getFavoriteRadios() || []); } catch {} };
  const fetchDevices      = async () => { if (!token) return; setIsFetchingDevices(true); try { setDevices((await api.getDevices(token)).devices || []); } catch {} finally { setIsFetchingDevices(false); } };
  const fetchSystemHealth = async () => { try { setSystemHealth(await api.getSystemHealth()); } catch {} };
  const fetchServices     = async () => { try { setServices((await api.getServices()).services || {}); } catch {} };

  const localSync = async () => {
    if (!spotify || !token) return;
    try {
      const s = await api.getPlaybackState(token);
      if (!s) return;
      setPlaybackState({ paused: !s.is_playing, position: s.progress_ms, duration: s.item?.duration_ms || 0, shuffle_state: s.shuffle_state, repeat_state: s.repeat_state, volume: s.device?.volume_percent ?? volume, is_muted: s.device?.volume_percent === 0, track_window: { current_track: { uri: s.item?.uri, name: s.item?.name, album: { name: s.item?.album?.name, images: s.item?.album?.images || [] }, artists: s.item?.artists || [] } } });
      setTrackPosition(s.progress_ms); setTrackDuration(s.item?.duration_ms || 0);
      setShuffleState(s.shuffle_state); setRepeatState(s.repeat_state);
      if (s.device?.volume_percent !== undefined && Date.now() - lastVolumeChangeTime.current >= 2500) { setVolume(s.device.volume_percent); setIsMuted(s.device.volume_percent === 0); }
    } catch {}
  };

  const checkUpdates     = async () => { setUpdateStatus('checking'); try { const d = await api.getUpdateStatus(); setUpdateStatus(d.updateAvailable ? 'available' : 'no-update'); } catch { setUpdateStatus('no-update'); } };
  const triggerOtaUpdate = async () => { try { setOtaProgress([]); setOtaPercent(0); setUpdateStatus('updating'); localStorage.setItem('resonance_updating', 'true'); await api.triggerUpdate(); } catch { localStorage.removeItem('resonance_updating'); setUpdateStatus('error'); } };

  // ── library ────────────────────────────────────────────────────────────────
  const fetchLibraryArtists    = async () => { setLibraryLoading(true); try { setLibraryItems((await api.getLibraryArtists()).artists || []); } catch {} setLibraryLoading(false); };
  const fetchLibraryAlbums     = async artist => { setLibraryLoading(true); try { setLibraryItems((await api.getLibraryAlbums(artist)).albums || []); } catch {} setLibraryLoading(false); };
  const fetchLibraryTracks     = async (album, artist) => { setLibraryLoading(true); try { setLibraryItems((await api.getLibraryTracks(album, artist)).tracks || []); } catch {} setLibraryLoading(false); };
  const handleLibraryBack      = () => { if (libraryView === 'tracks') { setLibraryView('albums'); fetchLibraryAlbums(selectedArtist); } else { setLibraryView('artists'); setSelectedArtist(null); fetchLibraryArtists(); } };
  const handleLibraryPlayTrack = async filePath => {
    try { wakeKiosk(); await api.clearQueue(); await api.addToQueue(filePath, true); handleToggleSource('local'); setActiveTab('player'); toast.success('Playing'); }
    catch (e) { toast.error(e.message); }
  };

  // ── system handlers ────────────────────────────────────────────────────────
  const handleRestartService = async name => { setServiceLoading(p => ({ ...p, [name]: true })); try { await api.restartService(name); toast.success(`${name} restarting…`); setTimeout(fetchServices, 3000); } catch (e) { toast.error(e.message); } setServiceLoading(p => ({ ...p, [name]: false })); };
  const handleReboot   = async () => { try { await api.rebootSystem(); toast.success('Rebooting kiosk…'); } catch (e) { toast.error(e.message); } };
  const handleShutdown = async () => { try { await api.shutdownSystem(); toast.success('Shutting down…'); } catch (e) { toast.error(e.message); } };

  // ── sleep timer ────────────────────────────────────────────────────────────
  const handleSetSleepTimer = minutes => { setSleepMinutes(minutes); setSleepRemaining(minutes * 60); if (!minutes) { setSleepRemaining(0); toast.success('Sleep timer off'); } else toast.success(`Sleep in ${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}`); };

  // ── transport ──────────────────────────────────────────────────────────────
  const handleToggleSource  = src => { setSource(src); sendUpdate('SET_SOURCE', { spotify: src === 'spotify', source: src }); };
  const handleToggleStandby = en  => { setStandby(en); if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: en } })); };

  const handlePlayPause = async () => {
    if (!spotify) {
      try { if (playbackState ? playbackState.paused : true) { wakeKiosk(); await api.localPlay(); setPlaybackState(p => ({ ...p, paused: false })); } else { await api.localPause(); setPlaybackState(p => ({ ...p, paused: true })); } } catch (e) { toast.error(e.message); }
      return;
    }
    if (!token) return;
    try { if (isPlaying) await api.pause(token); else { wakeKiosk(); await api.play(token, activeDevice?.id || resonanceDevice?.id || null); } requestWSStateSync(); } catch (e) { toast.error(e.message); }
  };
  const handleNext     = async () => { if (!spotify) { try { await api.localNext(); } catch {} return; } if (!token) return; try { await api.skipNext(token); requestWSStateSync(); } catch {} };
  const handlePrevious = async () => { if (!spotify) { try { await api.localPrevious(); } catch {} return; } if (!token) return; try { await api.skipPrevious(token); requestWSStateSync(); } catch {} };
  const handleShuffle  = async () => { if (!spotify || !token) return; const n = !shuffleState; setShuffleState(n); try { await api.setShuffle(token, n); requestWSStateSync(); } catch { setShuffleState(!n); } };
  const handleRepeat   = async () => { if (!spotify || !token) return; const n = { off: 'context', context: 'track', track: 'off' }[repeatState] || 'off'; setRepeatState(n); try { await api.setRepeat(token, n); requestWSStateSync(); } catch { setRepeatState(repeatState); } };
  const handleSeek     = async e => { const ms = parseInt(e.target.value, 10); setTrackPosition(ms); if (!spotify) { try { await api.localSeek(`${Math.round((ms / (trackDuration || 1)) * 100)}%`); } catch {} return; } if (!token) return; try { await api.seek(token, ms); requestWSStateSync(); } catch {} };

  const handleVolumeChange = e => {
    const v = parseInt(e.target.value, 10); setVolume(v); setIsMuted(v === 0); lastVolumeChangeTime.current = Date.now();
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload: { ...playbackState, volume: v, is_muted: v === 0 } }));
    clearTimeout(volumeApiTimeout.current);
    volumeApiTimeout.current = setTimeout(async () => { if (!spotify) { try { await api.localSetVolume(v); } catch {} return; } if (!token) return; try { await api.setVolume(token, v); } catch {}; }, 180);
  };
  const handleMuteToggle = async () => {
    const m = !isMuted; setIsMuted(m); lastVolumeChangeTime.current = Date.now();
    const tv = m ? 0 : (volume || 50);
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload: { ...playbackState, volume: tv, is_muted: m } }));
    if (!spotify) { try { await api.localSetVolume(tv); } catch {} return; }
    if (!token) return; try { await api.setVolume(token, tv); } catch {};
  };

  const handleToggleFavRadio = async station => {
    const isFav = favoriteStations.some(s => s.url === station.url);
    try { if (isFav) await api.deleteFavoriteRadio(station.url); else await api.addFavoriteRadio({ name: station.name, url: station.url, favicon: station.favicon, country: station.country, tags: station.tags }); fetchFavorites(); } catch (e) { toast.error(e.message); }
  };
  const handleRadioSearch = async () => {
    const q = radioSearch.trim(); if (!q) { setStationsList(favoriteStations); return; }
    setIsSearching(true);
    try { const r = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(q)}?limit=25&hidebroken=true`); const d = await r.json(); const f = d.map(s => ({ name: s.name.length > 26 ? s.name.substring(0, 24) + '…' : s.name, url: s.url_resolved || s.url, favicon: s.favicon, country: s.country, tags: s.tags })); if (!f.length) toast.error('No stations found.'); else setStationsList(f); } catch { toast.error('Search failed.'); } finally { setIsSearching(false); }
  };
  const handlePlayTrack   = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, null, [uri]); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { toast.error(e.message); } };
  const handlePlayContext = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, uri); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { toast.error(e.message); } };
  const handleLoginSubmit = e => { e.preventDefault(); if (usernameInput === 'enzo' && passwordInput === 'enzoOS') { setCookie('remote_auth', 'true', 365); setIsAuthenticated(true); } else toast.error('Invalid credentials'); };
  const handleDeactivateDsp = async () => { try { const c = await api.getDspCalibration() || {}; c[0] = 'eq'; await api.saveDspCalibration(c); setDspActive(false); } catch {} };

  const NAV_H = 72;

  // ══════════════════════════════════════════════════════════════════════════
  // DISABLED
  // ══════════════════════════════════════════════════════════════════════════
  if (!remoteAccessEnabled) return (
    <div style={{ fontFamily: C.font, background: C.bg }} className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8 touch-manipulation select-none">
      <div className="w-20 h-20 rounded-3xl flex items-center justify-center" style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
        <Smartphone className="h-8 w-8" style={{ color: C.error }} />
      </div>
      <div className="text-center">
        <p className="text-[22px] font-medium mb-2" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Remote Disabled</p>
        <p className="text-[15px]" style={{ color: C.text4 }}>Enable it from the kiosk system menu.</p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN
  // ══════════════════════════════════════════════════════════════════════════
  if (!isAuthenticated) return (
    <>
      <div style={{ fontFamily: C.font, background: C.bg }} className="fixed inset-0 flex flex-col items-center justify-center px-6 touch-manipulation select-none overflow-hidden">
        <div className="absolute top-[-80px] left-1/2 -translate-x-1/2 w-[320px] h-[320px] rounded-full pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${C.champagne} 0%, transparent 70%)`, opacity: darkMode ? 0.06 : 0.11 }} />
        <div className="w-full max-w-xs z-10 flex flex-col gap-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-3xl flex items-center justify-center" style={card}>
              <Waves className="h-7 w-7" style={{ color: C.champagne }} />
            </div>
            <div className="text-center">
              <p className="text-[30px] font-medium" style={{ color: C.text1, letterSpacing: '-0.02em' }}>Resonance</p>
              <p className="text-[11px] uppercase tracking-widest font-semibold mt-1" style={{ color: C.text3, fontFamily: C.fontLabel }}>Remote Control</p>
            </div>
          </div>
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3">
            <input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Username" required autoCapitalize="none"
              className="w-full rounded-xl px-4 py-4 text-[16px] focus:outline-none"
              style={{ ...card, color: C.text1, fontFamily: C.font }} />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" required
              className="w-full rounded-xl px-4 py-4 text-[16px] focus:outline-none"
              style={{ ...card, color: C.text1, fontFamily: C.font }} />
            <button type="submit" className="w-full py-4 rounded-full text-[16px] font-semibold active:scale-95 transition-all cursor-pointer mt-1"
              style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.font, letterSpacing: '-0.01em', boxShadow: `0 4px 24px ${C.champagne}50` }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
      <Toaster theme={darkMode ? 'dark' : 'light'} closeButton richColors position="bottom-center" visibleToasts={1} />
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN REMOTE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Tk.Provider value={{ C, card, cardWhite, btn, btnInset }}>
      <>
        <div style={{ fontFamily: C.font, background: C.bg, paddingTop: 'env(safe-area-inset-top)' }}
          className="fixed inset-0 flex flex-col overflow-hidden touch-manipulation select-none">

          {/* ── Top bar ── */}
          <div className="shrink-0 flex items-center justify-between px-5 pt-3 pb-2.5"
            style={{ borderBottom: `0.5px solid ${C.outline}` }}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: isConnected ? C.champagne : C.error, boxShadow: isConnected ? `0 0 6px ${C.champagne}90` : 'none', transition: 'background 0.4s' }} />
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                {isConnected ? 'Resonance' : 'Offline'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDarkMode(d => !d)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                style={btn}>
                {darkMode
                  ? <Sun className="h-3.5 w-3.5" style={{ color: C.champagne }} />
                  : <Moon className="h-3.5 w-3.5" style={{ color: C.primary }} />}
              </button>
              <button onClick={() => handleToggleStandby(!standby)}
                className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                style={{ ...btn, color: standby ? C.error : C.text4 }}>
                <Power className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* ── Scroll area ── */}
          <div className="flex-1 overflow-y-auto overscroll-none" style={{ paddingBottom: NAV_H + 8 }}>

            {/* ════════ PLAYER TAB ════════ */}
            {activeTab === 'player' && (
              <div className="flex flex-col px-5 pt-5">

                {/* album art */}
                <div className="relative mb-5 mx-auto" style={{ width: '100%', maxWidth: 280, aspectRatio: '1 / 1' }}>
                  {albumImage && (
                    <div className="absolute inset-0 rounded-[28px] -z-10 scale-[0.88] blur-2xl"
                      style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', opacity: darkMode ? 0.22 : 0.14 }} />
                  )}
                  <div className="w-full h-full rounded-[28px] overflow-hidden flex items-center justify-center"
                    style={{ ...card, boxShadow: darkMode ? '0 24px 48px rgba(0,0,0,0.8), 4px 4px 12px rgba(0,0,0,0.7), -4px -4px 12px rgba(20,40,75,0.4)' : '0 24px 48px rgba(0,0,0,0.07), 4px 4px 10px rgba(0,0,0,0.025), -4px -4px 10px rgba(255,255,255,0.9)' }}>
                    {albumImage
                      ? <img src={albumImage} alt={trackName} className="w-full h-full object-cover" draggable={false} />
                      : <div className="flex flex-col items-center gap-3 p-8 text-center">
                          <Music className="h-14 w-14" style={{ color: C.outline }} />
                          <span className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: C.text3, fontFamily: C.fontLabel }}>Nothing Playing</span>
                        </div>
                    }
                  </div>
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full flex items-center gap-1.5" style={cardWhite}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.champagne }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                      {spotify ? 'Spotify' : source === 'radio' ? 'Radio' : 'Local'}
                    </span>
                  </div>
                </div>

                {/* track info */}
                <div className="text-center mb-5">
                  <h2 className="text-[22px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>{trackName}</h2>
                  <p className="text-[15px] mt-1 truncate" style={{ color: C.text4 }}>
                    {trackArtist}
                    {activeDevice && <span style={{ color: C.champagne }}> · {activeDevice.name}</span>}
                  </p>
                  {source === 'radio' && currentTrack?.url && (
                    <button onClick={() => handleToggleFavRadio({ name: trackName, url: currentTrack.url, favicon: albumImage || '', country: '', tags: '' })}
                      className="mt-2.5 active:scale-90 transition-all cursor-pointer"
                      style={{ color: isCurrentFav ? C.error : C.outline }}>
                      <Heart className={`h-5 w-5 ${isCurrentFav ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </div>

                {/* Spotify connect */}
                {spotify && !token && (
                  <div className="rounded-xl p-5 flex flex-col gap-4 mb-5 text-center" style={cardWhite}>
                    <div>
                      <p className="text-[17px] font-medium" style={{ color: C.text1 }}>Connect Spotify</p>
                      <p className="text-[14px] mt-1" style={{ color: C.text4 }}>Sign in to control playback.</p>
                    </div>
                    <a href="/auth/spotify/login?from=remote"
                      className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
                      style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
                      <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
                      Connect with Spotify
                    </a>
                  </div>
                )}

                {/* progress */}
                {source !== 'radio' && (
                  <div className="mb-5">
                    <div className="relative h-1 rounded-full mb-2" style={{ background: C.container }}>
                      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%`, background: C.champagne }} />
                      <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
                        onChange={handleSeek} disabled={spotify ? !token || !trackDuration : !trackDuration}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
                    </div>
                    <div className="flex justify-between text-[11px] font-semibold" style={{ color: C.text3, fontFamily: C.fontLabel, letterSpacing: '0.04em' }}>
                      <span>{fmt(trackPosition)}</span>
                      <span>{fmt(trackDuration)}</span>
                    </div>
                  </div>
                )}
                {source === 'radio' && <div className="mb-5" />}

                {/* transport */}
                <div className="flex items-center justify-between mb-6 px-1">
                  {source !== 'radio' ? (
                    <button onClick={handleRepeat} disabled={spotify ? !token : true}
                      className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
                      style={{ ...btn, color: repeatState !== 'off' ? C.champagne : C.text4 }}>
                      <Repeat className="h-4 w-4" />
                    </button>
                  ) : <div className="w-11" />}

                  {source !== 'radio' ? (
                    <button onClick={handlePrevious} disabled={spotify ? !token : false}
                      className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
                      style={{ ...btn, color: C.text1, width: 52, height: 52 }}>
                      <SkipBack className="h-6 w-6 fill-current" />
                    </button>
                  ) : <div style={{ width: 52 }} />}

                  {/* hero play/pause */}
                  <button onClick={handlePlayPause} disabled={spotify ? !token : false}
                    className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-25 transition-all active:scale-95"
                    style={{ width: 80, height: 80, ...(isPlaying ? btnInset : { ...btn, boxShadow: darkMode ? '6px 6px 14px rgba(0,0,0,0.8), -6px -6px 14px rgba(20,40,75,0.5)' : '6px 6px 14px rgba(0,0,0,0.05), -6px -6px 14px rgba(255,255,255,1)' }) }}>
                    {isPlaying
                      ? <Pause className="h-8 w-8" style={{ fill: C.champagne, color: C.champagne }} />
                      : <Play className="h-8 w-8 ml-1" style={{ fill: C.champagne, color: C.champagne }} />}
                  </button>

                  {source !== 'radio' ? (
                    <button onClick={handleNext} disabled={spotify ? !token : false}
                      className="rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
                      style={{ ...btn, color: C.text1, width: 52, height: 52 }}>
                      <SkipForward className="h-6 w-6 fill-current" />
                    </button>
                  ) : (
                    <button onClick={() => setActiveTab('source')}
                      className="rounded-full flex items-center justify-center cursor-pointer active:scale-90 transition-all"
                      style={{ ...btn, color: C.champagne, width: 52, height: 52 }}>
                      <Radio className="h-5 w-5" />
                    </button>
                  )}

                  {source !== 'radio' ? (
                    <button onClick={handleShuffle} disabled={spotify ? !token : true}
                      className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-20 active:scale-90 transition-all"
                      style={{ ...btn, color: shuffleState ? C.champagne : C.text4 }}>
                      <Shuffle className="h-4 w-4" />
                    </button>
                  ) : <div className="w-11" />}
                </div>

                {/* volume */}
                <div className="flex items-center gap-3">
                  <button onClick={handleMuteToggle} style={{ color: C.text3 }} className="active:scale-90 transition-all cursor-pointer shrink-0">
                    <VolumeX className="h-4 w-4" />
                  </button>
                  <div className="relative flex-1 h-1 rounded-full" style={{ background: C.container }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${isMuted ? 0 : volume}%`, background: C.champagne }} />
                    <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange} disabled={spotify ? !token : false}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
                  </div>
                  <button style={{ color: C.text3 }} className="active:scale-90 transition-all cursor-pointer shrink-0"
                    onClick={() => { setIsMuted(false); handleVolumeChange({ target: { value: 100 } }); }}>
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ════════ LIBRARY TAB ════════ */}
            {activeTab === 'library' && (
              <div className="flex flex-col pt-5 pb-2">
                <div className="flex items-center gap-3 px-5 mb-5">
                  {libraryView !== 'artists' && (
                    <button onClick={handleLibraryBack}
                      className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
                      style={btn}>
                      <ChevronLeft className="h-5 w-5" style={{ color: C.text4 }} />
                    </button>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: C.champagne, fontFamily: C.fontLabel }}>
                      {libraryView === 'artists' ? 'My Music' : libraryView === 'albums' ? 'Albums by' : 'Tracks on'}
                    </p>
                    <h2 className="text-[24px] font-medium truncate" style={{ color: C.text1, letterSpacing: '-0.01em' }}>
                      {libraryView === 'artists' ? 'Library' : libraryView === 'albums' ? selectedArtist : selectedAlbum || 'Tracks'}
                    </h2>
                  </div>
                  <button onClick={libraryView === 'artists' ? fetchLibraryArtists : libraryView === 'albums' ? () => fetchLibraryAlbums(selectedArtist) : () => fetchLibraryTracks(selectedAlbum, selectedArtist)}
                    className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
                    style={btn}>
                    <RefreshCw className={`h-4 w-4 ${libraryLoading ? 'animate-spin' : ''}`} style={{ color: C.champagne }} />
                  </button>
                </div>

                {spotify && token && libraryView === 'artists' && (
                  <div className="px-4 mb-6">
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: C.text3, fontFamily: C.fontLabel }}>Spotify Search</p>
                    <div className="rounded-xl overflow-hidden" style={cardWhite}>
                      <TrackSearch token={token} onPlayTrack={handlePlayTrack} onPlayContext={handlePlayContext} isDrawer={true} />
                    </div>
                  </div>
                )}

                <div className="px-4">
                  {libraryView === 'artists' && (
                    <p className="text-[11px] font-semibold uppercase tracking-widest mb-3 px-1" style={{ color: C.text3, fontFamily: C.fontLabel }}>Local Library</p>
                  )}
                  {libraryLoading ? (
                    <div className="flex justify-center py-12">
                      <div className="w-7 h-7 rounded-full border-2 animate-spin" style={{ borderColor: C.container, borderTopColor: C.champagne }} />
                    </div>
                  ) : libraryItems.length === 0 ? (
                    <div className="flex flex-col items-center gap-4 py-12 text-center">
                      <Library className="h-10 w-10" style={{ color: C.outline }} />
                      <div>
                        <p className="text-[17px] font-medium mb-1" style={{ color: C.text1 }}>No Music Found</p>
                        <p className="text-[13px]" style={{ color: C.text4 }}>Add music to your MPD library.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl overflow-hidden" style={cardWhite}>
                      {libraryItems.map((item, idx) => {
                        const isTrack = libraryView === 'tracks';
                        const displayName = isTrack ? item.split('/').pop().replace(/\.[^.]+$/, '') : item;
                        const IconEl = libraryView === 'artists' ? User : libraryView === 'albums' ? Disc2 : Music;
                        return (
                          <React.Fragment key={`${item}-${idx}`}>
                            {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                            <button
                              className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-60 transition-opacity cursor-pointer text-left"
                              onClick={() => {
                                if (libraryView === 'artists') { setSelectedArtist(item); setLibraryView('albums'); fetchLibraryAlbums(item); }
                                else if (libraryView === 'albums') { setSelectedAlbum(item); setLibraryView('tracks'); fetchLibraryTracks(item, selectedArtist); }
                                else { handleLibraryPlayTrack(item); }
                              }}>
                              <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                                style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                                <IconEl className="h-4 w-4" style={{ color: isTrack ? C.text4 : C.champagne }} />
                              </span>
                              <span className="flex-1 text-[15px] font-medium truncate" style={{ color: C.text1 }}>{displayName}</span>
                              {!isTrack
                                ? <ChevronRight className="h-4 w-4 shrink-0" style={{ color: C.outline }} />
                                : <Play className="h-3.5 w-3.5 shrink-0" style={{ color: C.outline }} />}
                            </button>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════════ SOURCE TAB ════════ */}
            {activeTab === 'source' && (
              <div className="flex flex-col pt-5 pb-2">
                <div className="px-5 mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.champagne, fontFamily: C.fontLabel }}>Signal Chain</p>
                  <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Source</h2>
                </div>

                <div className="px-4 grid grid-cols-3 gap-3 mb-6">
                  {[
                    { id: 'spotify', label: 'Spotify', Icon: () => <SpotifyIcon className="h-6 w-6" style={{ fill: source === 'spotify' ? '#1ed760' : C.text4 }} /> },
                    { id: 'local',   label: 'Local',   Icon: () => <Music className="h-6 w-6" style={{ color: source === 'local' ? C.champagne : C.text4 }} /> },
                    { id: 'radio',   label: 'Radio',   Icon: () => <Radio className="h-6 w-6" style={{ color: source === 'radio' ? C.champagne : C.text4 }} /> },
                  ].map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => handleToggleSource(id)}
                      className="flex flex-col items-center justify-center gap-3 py-5 rounded-xl active:scale-95 transition-all cursor-pointer"
                      style={source === id ? { ...btnInset, border: `0.5px solid ${C.champagne}40` } : { ...card }}>
                      <Icon />
                      <span className="text-[11px] font-semibold uppercase tracking-wider"
                        style={{ color: source === id ? C.champagne : C.text4, fontFamily: C.fontLabel }}>
                        {label}
                      </span>
                    </button>
                  ))}
                </div>

                <div className="px-5 mb-3">
                  <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>Web Radio</p>
                </div>
                <div className="px-4 flex gap-2 mb-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: C.text3 }} />
                    <input type="text" placeholder="Station or genre…" value={radioSearch}
                      onChange={e => setRadioSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRadioSearch()}
                      className="w-full rounded-xl pl-10 pr-4 py-3 text-[15px] focus:outline-none"
                      style={{ ...card, color: C.text1, fontFamily: C.font }} />
                  </div>
                  <button onClick={handleRadioSearch} disabled={isSearching}
                    className="px-5 py-3 rounded-xl text-[14px] font-semibold active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                    style={{ background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }}>
                    {isSearching ? '…' : 'Go'}
                  </button>
                </div>
                <p className="px-6 mb-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                  {radioSearch.trim() ? `${stationsList.length} results` : `${favoriteStations.length} favorites`}
                </p>
                <div className="mx-4 rounded-xl overflow-hidden" style={cardWhite}>
                  {stationsList.length === 0 && (
                    <div className="px-4 py-8 text-center">
                      <Radio className="h-8 w-8 mx-auto mb-3" style={{ color: C.outline }} />
                      <p className="text-[15px] font-medium" style={{ color: C.text1 }}>No favorites yet</p>
                      <p className="text-[13px] mt-1" style={{ color: C.text4 }}>Search for stations above</p>
                    </div>
                  )}
                  {stationsList.map((station, idx) => {
                    const isFav = favoriteStations.some(s => s.url === station.url);
                    return (
                      <React.Fragment key={`${station.url}-${idx}`}>
                        {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: `linear-gradient(90deg, transparent 0%, ${C.outline} 15%, ${C.outline} 85%, transparent 100%)` }} />}
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                            style={{ background: C.containerLow, border: `0.5px solid ${C.outline}` }}>
                            {station.favicon
                              ? <img src={station.favicon} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display = 'none'; }} />
                              : <Radio className="h-4 w-4" style={{ color: C.text3 }} />}
                          </div>
                          <div className="flex-1 min-w-0 cursor-pointer"
                            onClick={async () => { try { wakeKiosk(); await api.localPlayRadio(station.url, station.name, station.favicon); setSource('radio'); sendUpdate('SET_SOURCE', { spotify: false, source: 'radio' }); setActiveTab('player'); } catch (e) { toast.error(e.message); } }}>
                            <p className="text-[15px] font-medium truncate" style={{ color: C.text1 }}>{station.name}</p>
                            <p className="text-[12px] truncate" style={{ color: C.text3, fontFamily: C.fontLabel }}>
                              {station.country || 'Global'}{station.tags ? ` · ${station.tags.split(',')[0]}` : ''}
                            </p>
                          </div>
                          <button onClick={() => handleToggleFavRadio(station)}
                            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
                            style={{ color: isFav ? C.error : C.outline }}>
                            <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                          </button>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ════════ SETTINGS TAB ════════ */}
            {activeTab === 'settings' && (
              <div className="flex flex-col pt-5 pb-4">
                <div className="px-5 mb-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest mb-1" style={{ color: C.champagne, fontFamily: C.fontLabel }}>Configuration</p>
                  <h2 className="text-[24px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Settings</h2>
                </div>

                {/* signal monitor */}
                <div className="mx-4 mb-4 rounded-xl overflow-hidden relative" style={{ ...cardWhite, height: 68 }}>
                  <span className="absolute top-3 left-4 text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>Signal Monitor</span>
                  <div className="absolute inset-x-4 bottom-3 flex items-end gap-px" style={{ height: 28 }}>
                    {Array.from({ length: 24 }).map((_, i) => {
                      const h = 30 + Math.sin(i * 0.7) * 20 + Math.cos(i * 1.3) * 15;
                      return (
                        <div key={i} className="flex-1 rounded-sm" style={{ height: `${h}%`, background: C.champagne, opacity: 0.5 + (i % 3) * 0.1 }} />
                      );
                    })}
                  </div>
                </div>

                {/* sound */}
                <Section title="Sound">
                  <Row label={`Equalizer · ${eqPreset}`}
                    icon={<Sliders className="h-4 w-4" style={{ color: C.champagne }} />}
                    onPress={() => setShowEq(v => !v)} chevron={false} value={showEq ? '▲' : '▼'} />
                  {showEq && (
                    <div style={{ minHeight: 380 }}>
                      <EqualizerControl
                        currentPreset={eqPreset} onPresetChange={handleEqPresetChange}
                        bands={eqBands} onBandChange={handleBandChange}
                        saturation={eqSaturation} onSaturationChange={handleSaturationChange}
                        noiseFloor={eqNoiseFloor} onNoiseFloorChange={handleNoiseFloorChange}
                        preAmp={eqPreAmp} onPreAmpChange={handlePreAmpChange}
                        dspActive={dspActive} onDeactivateDsp={handleDeactivateDsp}
                        light={!darkMode}
                      />
                    </div>
                  )}
                  <Row label="Room Calibration"
                    icon={<Cpu className="h-4 w-4" style={{ color: '#f59e0b' }} />}
                    value={dspActive ? 'Active' : 'Off'}
                    onPress={() => setIsDspWizardOpen(true)} />
                  <Row
                    label={sleepRemaining > 0 ? `Sleep · ${Math.floor(sleepRemaining / 60)}:${(sleepRemaining % 60).toString().padStart(2, '0')}` : 'Sleep Timer'}
                    icon={<Timer className="h-4 w-4" style={{ color: sleepRemaining > 0 ? C.champagne : C.text4 }} />}
                    value={sleepMinutes ? (sleepMinutes < 60 ? `${sleepMinutes}m` : `${sleepMinutes / 60}h`) : 'Off'}
                    chevron={false}
                    onPress={() => setShowSleepRow(v => !v)} />
                  {showSleepRow && (
                    <div className="px-4 pb-4 flex gap-2 flex-wrap">
                      {[0, 15, 30, 60, 120].map(m => (
                        <button key={m} onClick={() => { handleSetSleepTimer(m); setShowSleepRow(false); }}
                          className="px-4 py-2 rounded-full text-[12px] font-semibold active:scale-95 transition-all cursor-pointer"
                          style={sleepMinutes === m
                            ? { background: C.champagne, color: '#1a1c1c', fontFamily: C.fontLabel }
                            : { ...card, color: C.text4, fontFamily: C.fontLabel }}>
                          {m === 0 ? 'Off' : m < 60 ? `${m}m` : `${m / 60}h`}
                        </button>
                      ))}
                    </div>
                  )}
                </Section>

                {/* display */}
                <Section title="Display">
                  <Row label="Theme & Appearance"
                    icon={<Palette className="h-4 w-4" style={{ color: '#8b5cf6' }} />}
                    onPress={() => setIsThemeSettingsOpen(true)} />
                  <Row label="Kiosk Standby"
                    icon={<Power className="h-4 w-4" style={{ color: standby ? C.error : C.text4 }} />}
                    value={standby ? 'On' : 'Off'} chevron={false}
                    onPress={() => handleToggleStandby(!standby)} />
                </Section>

                {/* spotify */}
                <Section title="Spotify">
                  {!token ? (
                    <div className="px-4 py-4">
                      <a href="/auth/spotify/login?from=remote"
                        className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[14px] font-semibold active:scale-95 transition-all"
                        style={{ background: '#1ed760', color: '#000', display: 'flex', fontFamily: C.font }}>
                        <SpotifyIcon className="h-5 w-5 fill-black shrink-0" />
                        Connect with Spotify
                      </a>
                    </div>
                  ) : (
                    <>
                      <Row label="Connected" value="✓" chevron={false}
                        icon={<SpotifyIcon className="h-4 w-4" style={{ fill: '#1ed760' }} />}
                        onPress={() => {}} />
                      <Row label="Disconnect" destructive
                        icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
                        onPress={async () => { try { await fetch('/auth/spotify/logout', { method: 'POST' }); toast.success('Disconnected'); } catch { toast.error('Failed'); } }} />
                    </>
                  )}
                </Section>

                {/* cast devices */}
                {devices.length > 0 && (
                  <Section title={`Cast · ${devices.length} device${devices.length !== 1 ? 's' : ''}`}>
                    {devices.map(d => (
                      <Row key={d.id} label={d.name} value={d.is_active ? 'Active' : ''}
                        icon={<Laptop className="h-4 w-4" style={{ color: d.is_active ? C.champagne : C.text4 }} />}
                        onPress={() => { if (!token) return; api.transferPlayback(token, d.id).then(() => { toast.success('Output transferred'); setTimeout(fetchDevices, 800); requestWSStateSync(); }).catch(e => toast.error(e.message)); }} />
                    ))}
                  </Section>
                )}

                {/* services */}
                <Section title="Services">
                  {[
                    { id: 'mpd',        label: 'MPD',        icon: <Music className="h-4 w-4" style={{ color: C.text4 }} /> },
                    { id: 'camilladsp', label: 'CamillaDSP', icon: <Sliders className="h-4 w-4" style={{ color: C.text4 }} /> },
                    { id: 'raspotify',  label: 'Raspotify',  icon: <SpotifyIcon className="h-4 w-4" style={{ fill: C.text4 }} /> },
                  ].map(svc => {
                    const status   = services?.[svc.id];
                    const isActive = status === 'active';
                    return (
                      <Row key={svc.id} label={svc.label}
                        icon={(
                          <span className="relative">
                            {svc.icon}
                            <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full border"
                              style={{ background: services ? (isActive ? '#22c55e' : C.error) : C.outline, borderColor: darkMode ? '#111827' : '#ffffff' }} />
                          </span>
                        )}
                        value={serviceLoading[svc.id] ? 'restarting…' : (status || '…')}
                        chevron={false}
                        onPress={() => handleRestartService(svc.id)} />
                    );
                  })}
                </Section>

                {/* health */}
                {systemHealth && (
                  <div className="mx-4 mb-4 rounded-xl p-4 flex justify-around" style={cardWhite}>
                    {[
                      { label: 'CPU',   value: `${systemHealth.cpuTemp}°C`    },
                      { label: 'RAM',   value: `${systemHealth.ramLoad}%`      },
                      { label: 'Wi-Fi', value: `${systemHealth.wifiSignal}dBm` },
                    ].map(m => (
                      <div key={m.label} className="flex flex-col items-center gap-1">
                        <span className="text-[19px] font-medium" style={{ color: C.text1 }}>{m.value}</span>
                        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: C.text3, fontFamily: C.fontLabel }}>{m.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* system */}
                <Section title="System">
                  <Row
                    label={updateStatus === 'updating' ? `Updating · ${otaPercent}%` : 'Check for Updates'}
                    icon={<RefreshCw className={`h-4 w-4 ${updateStatus === 'checking' || updateStatus === 'updating' ? 'animate-spin' : ''}`} style={{ color: '#22c55e' }} />}
                    value={updateStatus === 'no-update' ? 'Up to date' : updateStatus === 'available' ? 'Available!' : ''}
                    onPress={updateStatus === 'available' ? triggerOtaUpdate : checkUpdates}
                    chevron={updateStatus === 'available'} />
                  {updateStatus === 'updating' && (
                    <div className="px-4 pb-4">
                      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: C.container }}>
                        <div className="h-full rounded-full" style={{ width: `${otaPercent}%`, background: '#22c55e', transition: 'width 0.3s' }} />
                      </div>
                      <div className="mt-2 max-h-16 overflow-y-auto">
                        {otaProgress.map((l, i) => <p key={i} className="text-[11px] font-mono" style={{ color: C.text3 }}>{l}</p>)}
                      </div>
                    </div>
                  )}
                  <Row label="Reboot Kiosk"
                    icon={<RefreshCw className="h-4 w-4" style={{ color: '#f59e0b' }} />}
                    onPress={handleReboot} />
                  <Row label="Shut Down" destructive
                    icon={<Power className="h-4 w-4" style={{ color: C.error }} />}
                    onPress={handleShutdown} />
                </Section>

                {/* account */}
                <Section>
                  <Row label="Sign Out" destructive chevron={false}
                    icon={<LogOut className="h-4 w-4" style={{ color: C.error }} />}
                    onPress={() => { eraseCookie('remote_auth'); setIsAuthenticated(false); setActiveTab('player'); }} />
                </Section>
              </div>
            )}
          </div>

          {/* ── Bottom tab bar ── */}
          <div className="relative shrink-0 z-10" style={{ height: NAV_H, paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="absolute inset-0 rounded-t-2xl"
              style={{ background: darkMode ? 'rgba(10,15,30,0.93)' : 'rgba(249,249,249,0.93)', backdropFilter: 'saturate(180%) blur(32px)', borderTop: `0.5px solid ${C.outline}`, boxShadow: darkMode ? '0 -4px 20px rgba(0,0,0,0.5)' : '0 -4px 20px rgba(0,0,0,0.04)' }} />
            <div className="relative flex items-start justify-around pt-3 px-2">
              {[
                { id: 'player',   Icon: Music,    label: 'Now Playing' },
                { id: 'library',  Icon: Library,  label: 'Library'     },
                { id: 'source',   Icon: Radio,    label: 'Source'      },
                { id: 'settings', Icon: Sliders,  label: 'Settings'    },
              ].map(({ id, Icon, label }) => {
                const active = activeTab === id;
                return (
                  <button key={id} onClick={() => setActiveTab(id)}
                    className="flex flex-col items-center gap-1 py-1 flex-1 cursor-pointer transition-all active:scale-90">
                    <Icon className="h-5 w-5" strokeWidth={active ? 2 : 1.5}
                      style={{ color: active ? C.champagne : C.text3 }} />
                    <span className="text-[10px] font-semibold uppercase tracking-widest"
                      style={{ color: active ? C.champagne : C.text3, fontFamily: C.fontLabel }}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Overlays ── */}
        {isDspWizardOpen && (
          <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: darkMode ? '#0a0f1e' : '#f9f9f9' }}>
            <DspWizard
              onClose={() => { setIsDspWizardOpen(false); api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }}
              onCalibrationComplete={active => setDspActive(active)}
            />
          </div>
        )}

        {isThemeSettingsOpen && (
          <div className="fixed inset-0 z-[9999] flex flex-col p-5 overflow-auto" style={{ background: darkMode ? '#0a0f1e' : '#f9f9f9', fontFamily: C.font }}>
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5" style={{ color: C.champagne, fontFamily: C.fontLabel }}>Kiosk</p>
                <p className="text-[22px] font-medium" style={{ color: C.text1, letterSpacing: '-0.01em' }}>Theme</p>
              </div>
              <button onClick={() => setIsThemeSettingsOpen(false)}
                className="px-4 py-2 rounded-full text-[14px] font-semibold active:scale-95 transition-all cursor-pointer"
                style={{ background: C.containerLow, color: C.champagne, fontFamily: C.fontLabel }}>
                Done
              </button>
            </div>
            <div className="flex-grow min-h-0">
              <ThemeSettingsControl
                activeTheme={activeTheme} onThemeChange={handleActiveThemeChange}
                themeColor={theme} onColorChange={handleThemeColorChange}
                brightness={brightness} onBrightnessChange={handleBrightnessChange}
                visualizerMode={visualizerMode} onVisualizerModeChange={handleVisualizerModeChange}
              />
            </div>
          </div>
        )}

        <Toaster theme={darkMode ? 'dark' : 'light'} closeButton richColors position="bottom-center" visibleToasts={1} />
      </>
    </Tk.Provider>
  );
}
