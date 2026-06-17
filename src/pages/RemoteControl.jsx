import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Waves, Smartphone } from 'lucide-react';
import { toast } from '../lib/toast';
import { api } from '../api';
import { useResonanceWS } from '../websocket';
import { EQ_PRESETS } from '../components/EqualizerControl';
import DspWizard from '../components/DspWizard';
import ThemeSettingsControl from '../components/ThemeSettingsControl';

import { Tk } from '../components/remote/shared';
import TopBar    from '../components/remote/TopBar';
import BottomNav from '../components/remote/BottomNav';
import PlayerTab   from '../components/remote/PlayerTab';
import LibraryTab  from '../components/remote/LibraryTab';
import SourceTab   from '../components/remote/SourceTab';
import SettingsTab from '../components/remote/SettingsTab';
import MiniPlayer  from '../components/remote/MiniPlayer';
import QueuePanel  from '../components/remote/QueuePanel';

// ─── cookie helpers ───────────────────────────────────────────────────────────
const setCookie   = (n, v, d = 365) => { const e = new Date(); e.setTime(e.getTime() + d * 86400000); document.cookie = `${n}=${v}; expires=${e.toUTCString()}; path=/`; };
const getCookie   = n => { const v = `; ${document.cookie}`, p = v.split(`; ${n}=`); return p.length === 2 ? p.pop().split(';').shift() : null; };
const eraseCookie = n => { document.cookie = `${n}=; Max-Age=-99999999; path=/`; };

const NAV_H = 72;

// ══════════════════════════════════════════════════════════════════════════════
export default function RemoteControl() {
  // ── dark mode ─────────────────────────────────────────────────────────────
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('resonance_remote_dark') === 'true');
  useEffect(() => { localStorage.setItem('resonance_remote_dark', darkMode); }, [darkMode]);

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

  // ── auth ──────────────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(getCookie('remote_auth') === 'true');
  const [usernameInput, setUsernameInput]     = useState('');
  const [passwordInput, setPasswordInput]     = useState('');

  // ── nav ───────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('player');
  const [tabDirection, setTabDirection] = useState('right');
  const activeTabRef = useRef('player');
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  const changeTab = useCallback((newTab) => {
    const TAB_ORDER = ['player', 'library', 'source', 'settings'];
    const dir = TAB_ORDER.indexOf(newTab) >= TAB_ORDER.indexOf(activeTabRef.current) ? 'right' : 'left';
    setTabDirection(dir);
    setActiveTab(newTab);
  }, []);

  // ── radio ─────────────────────────────────────────────────────────────────
  const [radioSearch, setRadioSearch]           = useState('');
  const [stationsList, setStationsList]         = useState([]);
  const [isSearching, setIsSearching]           = useState(false);
  const [favoriteStations, setFavoriteStations] = useState([]);

  // ── spotify ───────────────────────────────────────────────────────────────
  const [token, setToken]             = useState('');
  const [devices, setDevices]         = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

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

  // refs
  const themeSyncTimeout     = useRef(null);
  const eqSyncTimeout        = useRef(null);
  const progressInterval     = useRef(null);
  const volumeApiTimeout     = useRef(null);
  const lastVolumeChangeTime = useRef(0);
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
    setEqPreAmp, setDspActive, setTheme, setActiveTheme, setBrightness,
    setRemoteAccessEnabled, setVisualizerMode,
  });

  // ── derived ───────────────────────────────────────────────────────────────
  const currentTrack    = playbackState?.track_window?.current_track;
  const isPlaying       = playbackState ? !playbackState.paused : false;
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

  // ── effects ───────────────────────────────────────────────────────────────
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
  useEffect(() => { if (queueOpen && spotify && token) fetchQueue(); }, [queueOpen]);
  useEffect(() => {
    if (activeTab === 'settings') { fetchSystemHealth(); fetchServices(); }
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

  // ── data fetchers ─────────────────────────────────────────────────────────
  const fetchFavorites    = async () => { try { setFavoriteStations(await api.getFavoriteRadios() || []); } catch {} };
  const fetchDevices      = async () => { if (!token) return; setIsFetchingDevices(true); try { setDevices((await api.getDevices(token)).devices || []); } catch {} finally { setIsFetchingDevices(false); } };
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
      setPlaybackState({ paused: !s.is_playing, position: s.progress_ms, duration: s.item?.duration_ms || 0, shuffle_state: s.shuffle_state, repeat_state: s.repeat_state, volume: s.device?.volume_percent ?? volume, is_muted: s.device?.volume_percent === 0, track_window: { current_track: { uri: s.item?.uri, name: s.item?.name, album: { name: s.item?.album?.name, images: s.item?.album?.images || [] }, artists: s.item?.artists || [] } } });
      setTrackPosition(s.progress_ms); setTrackDuration(s.item?.duration_ms || 0);
      setShuffleState(s.shuffle_state); setRepeatState(s.repeat_state);
      if (s.device?.volume_percent !== undefined && Date.now() - lastVolumeChangeTime.current >= 2500) { setVolume(s.device.volume_percent); setIsMuted(s.device.volume_percent === 0); }
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
    catch (e) { toast.error(e.message); }
  };

  // ── system handlers ───────────────────────────────────────────────────────
  const handleRestartService  = async name => { setServiceLoading(p => ({ ...p, [name]: true })); try { await api.restartService(name); toast.success(`${name} restarting…`); setTimeout(fetchServices, 3000); } catch (e) { toast.error(e.message); } setServiceLoading(p => ({ ...p, [name]: false })); };
  const handleReboot          = async () => { try { await api.rebootSystem(); toast.success('Rebooting kiosk…'); } catch (e) { toast.error(e.message); } };
  const handleShutdown        = async () => { try { await api.shutdownSystem(); toast.success('Shutting down…'); } catch (e) { toast.error(e.message); } };
  const handleTransferPlayback = async deviceId => { if (!token) return; try { await api.transferPlayback(token, deviceId); toast.success('Output transferred'); setTimeout(fetchDevices, 800); requestWSStateSync(); } catch (e) { toast.error(e.message); } };

  // ── sleep timer ───────────────────────────────────────────────────────────
  const handleSetSleepTimer = minutes => { setSleepMinutes(minutes); setSleepRemaining(minutes * 60); if (!minutes) { setSleepRemaining(0); toast.success('Sleep timer off'); } else toast.success(`Sleep in ${minutes < 60 ? `${minutes}m` : `${minutes / 60}h`}`); };

  // ── transport ─────────────────────────────────────────────────────────────
  const handleToggleSource  = src => { setSource(src); setPlaybackState(null); sendUpdate('SET_SOURCE', { spotify: src === 'spotify', source: src }); };
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
    try { const r = await fetch(`/api/player/radio-search?q=${encodeURIComponent(q)}&limit=25`); const d = await r.json(); const f = d.map(s => ({ name: s.name.length > 26 ? s.name.substring(0, 24) + '…' : s.name, url: s.url_resolved || s.url, favicon: s.favicon, country: s.country, tags: s.tags })); if (!f.length) toast.error('No stations found.'); else setStationsList(f); } catch { toast.error('Search failed.'); } finally { setIsSearching(false); }
  };
  const handlePlayTrack   = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, null, [uri]); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { toast.error(e.message); } };
  const handlePlayContext = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, uri); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { toast.error(e.message); } };
  const handleLoginSubmit = e => { e.preventDefault(); if (usernameInput === 'enzo' && passwordInput === 'enzoOS') { setCookie('remote_auth', 'true', 365); setIsAuthenticated(true); } else toast.error('Invalid credentials'); };
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
    handleToggleFavRadio, wakeKiosk, requestWSStateSync,
    handlePlayTrack, handlePlayContext,
    libraryView, selectedArtist, selectedAlbum, libraryItems, libraryLoading,
    handleLibraryBack, handleLibraryPlayTrack,
    fetchLibraryArtists, fetchLibraryAlbums, fetchLibraryTracks,
    setSelectedArtist, setLibraryView, setSelectedAlbum,
    radioSearch, setRadioSearch, stationsList, isSearching,
    handleRadioSearch,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, setShowEq,
    isDspWizardOpen, setIsDspWizardOpen,
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
    queueOpen, setQueueOpen, queue, queueLoading,
  }), [
    darkMode, activeTab, isConnected, ws, sendUpdate,
    standby, source, spotify, token, isPlaying,
    trackPosition, trackDuration, progressPct,
    volume, isMuted, shuffleState, repeatState,
    playbackState, currentTrack, activeDevice, resonanceDevice, devices,
    albumImage, trackName, trackArtist,
    favoriteStations, isCurrentFav,
    libraryView, selectedArtist, selectedAlbum, libraryItems, libraryLoading,
    radioSearch, stationsList, isSearching,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    dspActive, showEq, isDspWizardOpen,
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
    </>
  );

  // ══════════════════════════════════════════════════════════════════════════
  // MAIN REMOTE
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <Tk.Provider value={ctxValue}>
      <>
        <div style={{ fontFamily: C.font, background: C.bg, paddingTop: 'env(safe-area-inset-top)' }}
          className="fixed inset-0 flex flex-col overflow-hidden touch-manipulation select-none">

          <TopBar darkMode={darkMode} setDarkMode={setDarkMode} />

          <div className="flex-1 overflow-y-auto overscroll-none" style={{ paddingBottom: NAV_H + 8 }}>
            <div key={activeTab} className={`animate-tab-${tabDirection}`}>
              {activeTab === 'player'   && <PlayerTab />}
              {activeTab === 'library'  && <LibraryTab />}
              {activeTab === 'source'   && <SourceTab />}
              {activeTab === 'settings' && <SettingsTab />}
            </div>
            {activeTab !== 'player' && <MiniPlayer />}
          </div>

          <BottomNav navH={NAV_H} />
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

        {queueOpen && (
          <QueuePanel
            queue={queue}
            queueLoading={queueLoading}
            onClose={() => setQueueOpen(false)}
          />
        )}

        {isThemeSettingsOpen && (
          <div className="fixed inset-0 z-[9999] flex flex-col p-5 overflow-auto"
            style={{ background: darkMode ? '#0a0f1e' : '#f9f9f9', fontFamily: C.font }}>
            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-0.5"
                  style={{ color: C.champagne, fontFamily: C.fontLabel }}>Kiosk</p>
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

      </>
    </Tk.Provider>
  );
}
