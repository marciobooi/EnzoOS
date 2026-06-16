import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Laptop, Music, RefreshCw, Settings,
  ChevronRight, LogOut, Radio, Heart, Power, Sliders,
  Cpu, Palette, Smartphone, Search, Waves, Cast
} from 'lucide-react';
import { api } from '../api';
import { toast, Toaster } from 'sonner';
import { useResonanceWS } from '../websocket';
import EqualizerControl, { EQ_PRESETS } from '../components/EqualizerControl';
import DspWizard from '../components/DspWizard';
import ThemeSettingsControl from '../components/ThemeSettingsControl';
import TrackSearch from '../components/TrackSearch';

// ─── cookie helpers ───────────────────────────────────────────────────────────
const setCookie = (name, value, days = 365) => {
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value}; expires=${date.toUTCString()}; path=/`;
};
const getCookie = (name) => {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
};
const eraseCookie = (name) => {
  document.cookie = `${name}=; Max-Age=-99999999; path=/`;
};

export default function RemoteControl() {
  // Auth
  const [isAuthenticated, setIsAuthenticated]   = useState(getCookie('remote_auth') === 'true');
  const [usernameInput, setUsernameInput]        = useState('');
  const [passwordInput, setPasswordInput]        = useState('');

  // Nav
  const [activeTab, setActiveTab] = useState('player');

  // Radio
  const [radioSearch, setRadioSearch]     = useState('');
  const [stationsList, setStationsList]   = useState([]);
  const [isSearching, setIsSearching]     = useState(false);
  const [favoriteStations, setFavoriteStations] = useState([]);

  // Spotify
  const [token, setToken]       = useState('');
  const [devices, setDevices]   = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  // Playback
  const [playbackState, setPlaybackState] = useState(null);
  const [shuffleState, setShuffleState]   = useState(false);
  const [repeatState, setRepeatState]     = useState('off');
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [volume, setVolume]               = useState(50);
  const [isMuted, setIsMuted]             = useState(false);

  // OTA
  const [updateStatus, setUpdateStatus]   = useState(null);
  const [localCommit, setLocalCommit]     = useState('');
  const [remoteCommit, setRemoteCommit]   = useState('');
  const [otaProgress, setOtaProgress]     = useState([]);
  const [otaPercent, setOtaPercent]       = useState(0);

  // Source / misc
  const [source, setSource]             = useState('spotify');
  const spotify = source === 'spotify';
  const [standby, setStandby]           = useState(false);
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState(true);

  // EQ
  const [isDspWizardOpen, setIsDspWizardOpen] = useState(false);
  const [dspActive, setDspActive]             = useState(false);
  const [eqPreset, setEqPreset]               = useState(() => localStorage.getItem('resonance_eq_preset') || 'Clinical Reference');
  const [eqBands, setEqBands]                 = useState(() => {
    try { return JSON.parse(localStorage.getItem('resonance_eq_bands')) || [0,0,0,0,0]; } catch { return [0,0,0,0,0]; }
  });
  const [eqSaturation, setEqSaturation]       = useState(() => Number(localStorage.getItem('resonance_eq_saturation')) || 0);
  const [eqNoiseFloor, setEqNoiseFloor]       = useState(() => Number(localStorage.getItem('resonance_eq_noise')) || 0);
  const [eqPreAmp, setEqPreAmp]               = useState(() => Number(localStorage.getItem('resonance_eq_preamp')) || 0.0);

  // Theme
  const [theme, setTheme]                   = useState(() => localStorage.getItem('resonance_theme') || 'amber');
  const [activeTheme, setActiveTheme]       = useState(() => localStorage.getItem('resonance_theme_active') || 'dot-matrix');
  const [brightness, setBrightness]         = useState(() => Number(localStorage.getItem('resonance_theme_brightness')) || 100);
  const [visualizerMode, setVisualizerMode] = useState(() => localStorage.getItem('resonance_visualizer_mode') || 'vu');
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);

  const themeSyncTimeout = useRef(null);
  const eqSyncTimeout    = useRef(null);
  const progressInterval = useRef(null);
  const volumeApiTimeout = useRef(null);
  const lastVolumeChangeTime = useRef(0);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const { isConnected, ws, sendUpdate } = useResonanceWS({
    token, setToken, setPlaybackState, setTrackPosition, setTrackDuration,
    setShuffleState, setRepeatState,
    setVolume:   (v) => { if (Date.now() - lastVolumeChangeTime.current >= 2500) setVolume(v); },
    setIsMuted:  (m) => { if (Date.now() - lastVolumeChangeTime.current >= 2500) setIsMuted(m); },
    setUpdateStatus, setOtaProgress, setOtaPercent,
    setSpotify: (isSpotify) => setSource(prev => isSpotify ? 'spotify' : (prev === 'spotify' ? 'local' : prev)),
    setSource, setDevices,
    onRequestSync: () => localSync(),
    isAuthenticated, isRemote: true,
    setStandby, setEqPreset, setEqBands, setEqSaturation, setEqNoiseFloor,
    setEqPreAmp, setDspActive, setTheme, setActiveTheme, setBrightness,
    setRemoteAccessEnabled, setVisualizerMode,
  });

  // ── derived ───────────────────────────────────────────────────────────────
  const currentTrack   = playbackState?.track_window?.current_track;
  const isPlaying      = playbackState ? !playbackState.paused : false;
  const trackName      = currentTrack?.name  || 'Ready to Stream';
  const trackArtist    = currentTrack?.artists?.map(a => a.name).join(', ') || 'No source active';
  const albumImage     = currentTrack?.album?.images?.[0]?.url;
  const activeDevice   = devices.find(d => d.is_active);
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');
  const isCurrentFavorite = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;

  // ── helpers ───────────────────────────────────────────────────────────────
  const wakeKiosk = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: false } }));
    }
  };
  const requestWSStateSync = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
    }
  };
  const formatTime = (ms) => {
    if (!ms || isNaN(ms)) return '0:00';
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
  };

  // ── theme sync ────────────────────────────────────────────────────────────
  const queueThemeSync = (tc, at, br, vm) => {
    clearTimeout(themeSyncTimeout.current);
    themeSyncTimeout.current = setTimeout(() =>
      sendUpdate('SET_THEME_SETTINGS', { themeColor: tc, activeTheme: at, brightness: br, visualizerMode: vm }), 400);
  };
  const handleThemeColorChange = (c) => {
    setTheme(c); localStorage.setItem('resonance_theme', c);
    sendUpdate('SET_THEME_SETTINGS', { themeColor: c, activeTheme, brightness, visualizerMode });
  };
  const handleActiveThemeChange = (t) => {
    setActiveTheme(t); localStorage.setItem('resonance_theme_active', t);
    sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme: t, brightness, visualizerMode });
  };
  const handleBrightnessChange = (v) => {
    setBrightness(v); localStorage.setItem('resonance_theme_brightness', v);
    queueThemeSync(theme, activeTheme, v, visualizerMode);
  };
  const handleVisualizerModeChange = (m) => {
    setVisualizerMode(m); localStorage.setItem('resonance_visualizer_mode', m);
    sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme, brightness, visualizerMode: m });
  };

  // ── EQ sync ───────────────────────────────────────────────────────────────
  const queueEqSync = (preset, nextBands, sat, nf, pa) => {
    clearTimeout(eqSyncTimeout.current);
    eqSyncTimeout.current = setTimeout(() =>
      sendUpdate('SET_EQ_SETTINGS', { preset, bands: nextBands, saturation: sat, noiseFloor: nf, preAmp: pa }), 400);
  };
  const handleEqPresetChange = (name) => {
    setEqPreset(name); localStorage.setItem('resonance_eq_preset', name);
    const found = EQ_PRESETS.find(p => p.name === name);
    if (found) {
      setEqBands(found.bands); setEqSaturation(found.saturation);
      setEqNoiseFloor(found.noiseFloor); setEqPreAmp(found.preAmp);
      localStorage.setItem('resonance_eq_bands', JSON.stringify(found.bands));
      localStorage.setItem('resonance_eq_saturation', found.saturation);
      localStorage.setItem('resonance_eq_noise', found.noiseFloor);
      localStorage.setItem('resonance_eq_preamp', found.preAmp);
      sendUpdate('SET_EQ_SETTINGS', { preset: name, bands: found.bands, saturation: found.saturation, noiseFloor: found.noiseFloor, preAmp: found.preAmp });
    }
  };
  const handleBandChange = (i, v) => {
    const next = [...eqBands]; next[i] = v; setEqBands(next);
    localStorage.setItem('resonance_eq_bands', JSON.stringify(next));
    setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', next, eqSaturation, eqNoiseFloor, eqPreAmp);
  };
  const handleSaturationChange = (v) => {
    setEqSaturation(v); localStorage.setItem('resonance_eq_saturation', v);
    setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, v, eqNoiseFloor, eqPreAmp);
  };
  const handleNoiseFloorChange = (v) => {
    setEqNoiseFloor(v); localStorage.setItem('resonance_eq_noise', v);
    setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, eqSaturation, v, eqPreAmp);
  };
  const handlePreAmpChange = (v) => {
    setEqPreAmp(v); localStorage.setItem('resonance_eq_preamp', v);
    setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, eqSaturation, eqNoiseFloor, v);
  };

  // ── effects ───────────────────────────────────────────────────────────────
  useEffect(() => {
    api.getDspCalibration().then(cal => setDspActive(cal && cal[0] === 'dsp')).catch(() => {});
  }, []);

  const hasCheckedInitialSource = useRef(false);
  useEffect(() => {
    if (source === 'radio' && !hasCheckedInitialSource.current) {
      setActiveTab('radio'); hasCheckedInitialSource.current = true;
    }
  }, [source]);

  useEffect(() => {
    if (isConnected) { fetchFavorites(); checkUpdates(); }
  }, [isConnected]);

  useEffect(() => {
    if (!radioSearch.trim()) setStationsList(favoriteStations);
  }, [radioSearch, favoriteStations]);

  useEffect(() => {
    if (!spotify || !isAuthenticated || !token) return;
    fetchDevices(); localSync();
    const id = setInterval(() => { fetchDevices(); localSync(); }, 3000);
    return () => clearInterval(id);
  }, [token, isAuthenticated, spotify]);

  useEffect(() => {
    if (isAuthenticated && playbackState && isPlaying) {
      progressInterval.current = setInterval(() => {
        setTrackPosition(prev => {
          if (prev + 1000 >= trackDuration) { clearInterval(progressInterval.current); return trackDuration; }
          return prev + 1000;
        });
      }, 1000);
    } else {
      clearInterval(progressInterval.current);
    }
    return () => clearInterval(progressInterval.current);
  }, [playbackState, isPlaying, trackDuration, isAuthenticated]);

  // ── data fetchers ─────────────────────────────────────────────────────────
  const fetchFavorites = async () => {
    try { setFavoriteStations(await api.getFavoriteRadios() || []); } catch {}
  };
  const fetchDevices = async () => {
    if (!token) return;
    setIsFetchingDevices(true);
    try { setDevices((await api.getDevices(token)).devices || []); } catch {} finally { setIsFetchingDevices(false); }
  };
  const localSync = async () => {
    if (!spotify || !token) return;
    try {
      const state = await api.getPlaybackState(token);
      if (!state) return;
      setPlaybackState({
        paused: !state.is_playing, position: state.progress_ms,
        duration: state.item?.duration_ms || 0,
        shuffle_state: state.shuffle_state, repeat_state: state.repeat_state,
        volume: state.device?.volume_percent ?? volume,
        is_muted: state.device?.volume_percent !== undefined ? state.device.volume_percent === 0 : isMuted,
        track_window: { current_track: { uri: state.item?.uri, name: state.item?.name, album: { name: state.item?.album?.name, images: state.item?.album?.images || [] }, artists: state.item?.artists || [] } }
      });
      setTrackPosition(state.progress_ms);
      setTrackDuration(state.item?.duration_ms || 0);
      setShuffleState(state.shuffle_state); setRepeatState(state.repeat_state);
      if (state.device?.volume_percent !== undefined && Date.now() - lastVolumeChangeTime.current >= 2500) {
        setVolume(state.device.volume_percent);
        setIsMuted(state.device.volume_percent === 0);
      }
    } catch {}
  };
  const checkUpdates = async () => {
    try {
      setUpdateStatus('checking');
      const data = await api.getUpdateStatus();
      setUpdateStatus(data.updateAvailable ? 'available' : 'no-update');
      setLocalCommit(data.localCommit || ''); setRemoteCommit(data.remoteCommit || '');
    } catch { setUpdateStatus('no-update'); }
  };
  const triggerOtaUpdate = async () => {
    try {
      setOtaProgress([]); setOtaPercent(0); setUpdateStatus('updating');
      localStorage.setItem('resonance_updating', 'true');
      await api.triggerUpdate();
    } catch (err) {
      localStorage.removeItem('resonance_updating');
      setUpdateStatus('error');
    }
  };

  // ── transport handlers ────────────────────────────────────────────────────
  const handleToggleSource = (src) => {
    setSource(src);
    sendUpdate('SET_SOURCE', { spotify: src === 'spotify', source: src });
  };
  const handleToggleStandby = (enabled) => {
    setStandby(enabled);
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled } }));
  };
  const handlePlayPause = async () => {
    if (!spotify) {
      try {
        const isPaused = playbackState ? playbackState.paused : true;
        if (isPaused) { wakeKiosk(); await api.localPlay(); setPlaybackState(p => ({ ...p, paused: false })); }
        else           {              await api.localPause(); setPlaybackState(p => ({ ...p, paused: true })); }
      } catch (err) { toast.error(`Control failed: ${err.message}`); }
      return;
    }
    if (!token) return;
    try {
      if (isPlaying) { await api.pause(token); }
      else { wakeKiosk(); await api.play(token, activeDevice?.id || resonanceDevice?.id || null); }
      requestWSStateSync();
    } catch (err) { toast.error(`Control failed: ${err.message}`); }
  };
  const handleNext = async () => {
    if (!spotify) { try { await api.localNext(); } catch (err) { toast.error(err.message); } return; }
    if (!token) return;
    try { await api.skipNext(token); requestWSStateSync(); } catch (err) { toast.error(err.message); }
  };
  const handlePrevious = async () => {
    if (!spotify) { try { await api.localPrevious(); } catch (err) { toast.error(err.message); } return; }
    if (!token) return;
    try { await api.skipPrevious(token); requestWSStateSync(); } catch (err) { toast.error(err.message); }
  };
  const handleShuffle = async () => {
    if (!spotify || !token) return;
    const next = !shuffleState; setShuffleState(next);
    try { await api.setShuffle(token, next); requestWSStateSync(); } catch { setShuffleState(!next); }
  };
  const handleRepeat = async () => {
    if (!spotify || !token) return;
    const next = { off: 'context', context: 'track', track: 'off' }[repeatState] || 'off';
    setRepeatState(next);
    try { await api.setRepeat(token, next); requestWSStateSync(); } catch { setRepeatState(repeatState); }
  };
  const handleSeek = async (e) => {
    const ms = parseInt(e.target.value, 10); setTrackPosition(ms);
    if (!spotify) { try { await api.localSeek(`${Math.round((ms / (trackDuration || 1)) * 100)}%`); } catch {} return; }
    if (!token) return;
    try { await api.seek(token, ms); requestWSStateSync(); } catch {}
  };
  const handleVolumeChange = (e) => {
    const v = parseInt(e.target.value, 10); setVolume(v); setIsMuted(v === 0);
    lastVolumeChangeTime.current = Date.now();
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload: { ...playbackState, volume: v, is_muted: v === 0 } }));
    clearTimeout(volumeApiTimeout.current);
    volumeApiTimeout.current = setTimeout(async () => {
      if (!spotify) { try { await api.localSetVolume(v); } catch {} return; }
      if (!token) return;
      try { await api.setVolume(token, v); } catch {}
    }, 180);
  };
  const handleMuteToggle = async () => {
    const m = !isMuted; setIsMuted(m); lastVolumeChangeTime.current = Date.now();
    const tv = m ? 0 : (volume || 50);
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload: { ...playbackState, volume: tv, is_muted: m } }));
    if (!spotify) { try { await api.localSetVolume(tv); } catch {} return; }
    if (!token) return;
    try { await api.setVolume(token, tv); } catch {}
  };
  const handleCast = async (deviceId) => {
    try { await api.transferPlayback(token, deviceId); toast.success('Output transferred.'); setTimeout(fetchDevices, 800); requestWSStateSync(); } catch (err) { toast.error(err.message); }
  };
  const handleToggleFavoriteRadio = async (station) => {
    const isFav = favoriteStations.some(s => s.url === station.url);
    try {
      if (isFav) await api.deleteFavoriteRadio(station.url);
      else await api.addFavoriteRadio({ name: station.name, url: station.url, favicon: station.favicon, country: station.country, tags: station.tags });
      fetchFavorites();
    } catch (err) { toast.error(err.message); }
  };
  const handleRadioSearch = async () => {
    const q = radioSearch.trim();
    if (!q) { setStationsList(favoriteStations); return; }
    setIsSearching(true);
    try {
      const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(q)}?limit=25&hidebroken=true`);
      const data = await res.json();
      const formatted = data.map(s => ({ name: s.name.length > 22 ? s.name.substring(0,20)+'...' : s.name, url: s.url_resolved || s.url, favicon: s.favicon, country: s.country, tags: s.tags }));
      if (!formatted.length) toast.error('No stations found.');
      else setStationsList(formatted);
    } catch { toast.error('Search failed.'); } finally { setIsSearching(false); }
  };
  const handlePlayTrack = async (uri) => {
    try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, null, [uri]); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (err) { toast.error(err.message); }
  };
  const handlePlayContext = async (uri) => {
    try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, uri); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (err) { toast.error(err.message); }
  };
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (usernameInput === 'enzo' && passwordInput === 'enzoOS') {
      setCookie('remote_auth', 'true', 365); setIsAuthenticated(true); toast.success('Access Authorized');
    } else { toast.error('Invalid credentials'); }
  };
  const handleRemoteLogout = () => { eraseCookie('remote_auth'); setIsAuthenticated(false); setActiveTab('player'); };
  const handleDeactivateDsp = async () => {
    try { const cal = await api.getDspCalibration() || {}; cal[0] = 'eq'; await api.saveDspCalibration(cal); setDspActive(false); } catch {}
  };

  // ── disabled screen ───────────────────────────────────────────────────────
  if (!remoteAccessEnabled) {
    return (
      <div className="fixed inset-0 bg-[#080c14] text-white flex flex-col items-center justify-center p-8 font-sans touch-manipulation select-none">
        <div className="w-20 h-20 rounded-3xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-6">
          <Smartphone className="h-9 w-9" />
        </div>
        <h1 className="text-xs font-extrabold uppercase tracking-[0.3em] text-white mb-3">Remote Disabled</h1>
        <p className="text-[10px] text-white/30 font-mono text-center max-w-xs leading-relaxed">
          Enable remote control from the kiosk system menu.
        </p>
      </div>
    );
  }

  // ── login screen ──────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <>
        <div data-theme={theme} className="fixed inset-0 bg-[#080c14] text-white font-sans flex flex-col items-center justify-center p-6 touch-manipulation select-none overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[50vh] rounded-full opacity-10 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse, var(--theme-color) 0%, transparent 70%)' }} />

          <div className="w-full max-w-sm z-10 flex flex-col items-center gap-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center border"
                style={{ background: 'var(--theme-color-dim)', borderColor: 'var(--theme-color-glow)' }}>
                <Waves className="h-6 w-6" style={{ color: 'var(--theme-color)' }} />
              </div>
              <div className="text-center">
                <h1 className="text-sm font-extrabold tracking-[0.3em] uppercase text-white">Resonance</h1>
                <p className="text-[9px] text-white/30 uppercase tracking-[0.2em] font-mono mt-0.5">Remote Access</p>
              </div>
            </div>

            <form onSubmit={handleLoginSubmit} className="w-full flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold font-mono">Username</label>
                <input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Enter username" required
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-4 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-[var(--theme-color)]/40 transition-colors" />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-[0.2em] text-white/30 font-bold font-mono">Password</label>
                <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="••••••••" required
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-4 text-sm text-white placeholder:text-white/15 focus:outline-none focus:border-[var(--theme-color)]/40 transition-colors" />
              </div>
              <button type="submit"
                className="w-full py-4 rounded-2xl font-extrabold text-xs uppercase tracking-[0.2em] active:scale-95 transition-all cursor-pointer mt-1 text-black"
                style={{ background: 'var(--theme-color)' }}>
                Authorize
              </button>
            </form>
          </div>
        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-center" visibleToasts={1} />
      </>
    );
  }

  // ── main remote ───────────────────────────────────────────────────────────
  const progressPct = trackDuration ? (trackPosition / trackDuration) * 100 : 0;

  return (
    <>
      <div
        data-theme={theme}
        className="fixed inset-0 bg-[#080c14] text-white font-sans flex flex-col overflow-hidden touch-manipulation select-none"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* ── ambient art glow ── */}
        {albumImage && (
          <div className="absolute inset-0 pointer-events-none transition-all duration-1000"
            style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(90px) saturate(2.5)', opacity: 0.12 }} />
        )}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(8,12,20,0.5) 0%, transparent 40%, rgba(8,12,20,0.7) 70%, rgba(8,12,20,1) 100%)' }} />

        {/* ── header ── */}
        <header className="relative z-10 flex items-center justify-between px-5 pt-3 pb-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-1.5 h-1.5 rounded-full transition-all ${isConnected ? 'animate-pulse' : ''}`}
              style={{ background: isConnected ? 'var(--theme-color)' : '#ef4444', boxShadow: isConnected ? '0 0 8px var(--theme-color)' : 'none' }} />
            <span className="text-[11px] font-extrabold tracking-[0.25em] uppercase text-white/50">Resonance</span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => handleToggleStandby(!standby)}
              className={`p-2.5 rounded-full transition-all active:scale-90 cursor-pointer ${standby ? 'text-red-400' : 'text-white/30 hover:text-white/60'}`}
              style={standby ? { background: 'rgba(239,68,68,0.1)' } : { background: 'rgba(255,255,255,0.04)' }}>
              <Power className="h-4 w-4" />
            </button>
            <button onClick={() => { fetchDevices(); localSync(); }}
              className="p-2.5 rounded-full text-white/30 hover:text-white/60 active:scale-90 transition-all cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.04)' }}>
              <RefreshCw className={`h-4 w-4 ${isFetchingDevices ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* ── source pills ── */}
        <div className="relative z-10 flex items-center justify-center gap-2 px-5 pb-2 shrink-0">
          {['spotify', 'local', 'radio'].map(src => (
            <button key={src} onClick={() => handleToggleSource(src)}
              className="px-5 py-1.5 rounded-full text-[9px] font-bold uppercase tracking-[0.15em] transition-all active:scale-95 cursor-pointer"
              style={source === src
                ? { background: 'var(--theme-color)', color: '#000' }
                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)' }}>
              {src === 'spotify' ? 'Spotify' : src === 'local' ? 'Local' : 'Radio'}
            </button>
          ))}
        </div>

        {/* ── main scrollable area ── */}
        <main className="relative z-10 flex-1 overflow-y-auto overscroll-none min-h-0">

          {/* ── PLAYER TAB ── */}
          {activeTab === 'player' && (
            <div className="flex flex-col items-center px-6 pt-2 gap-5">

              {/* Album art */}
              <div className="relative mt-1" style={{ width: 'min(56vw, 230px)', aspectRatio: '1' }}>
                {albumImage && (
                  <div className="absolute inset-0 rounded-[2rem] scale-90 blur-2xl"
                    style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', opacity: 0.5 }} />
                )}
                <div className="relative w-full h-full rounded-[2rem] overflow-hidden border flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                  {albumImage
                    ? <img src={albumImage} alt={trackName} className="w-full h-full object-cover pointer-events-none" />
                    : <div className="flex flex-col items-center gap-2" style={{ color: 'rgba(255,255,255,0.15)' }}>
                        <Music className="h-12 w-12 stroke-[1]" />
                        <span className="text-[8px] uppercase tracking-widest font-extrabold">Resonance</span>
                      </div>
                  }
                </div>
              </div>

              {/* Track info */}
              <div className="w-full text-center flex flex-col gap-1 px-2">
                <h2 className="text-[1.05rem] font-bold text-white leading-tight truncate">{trackName}</h2>
                <p className="text-[11px] font-medium truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{trackArtist}</p>
                {activeDevice && (
                  <div className="flex items-center justify-center gap-1.5 mt-1">
                    <Cast className="h-2.5 w-2.5" style={{ color: 'var(--theme-color)' }} />
                    <span className="text-[8px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--theme-color)' }}>{activeDevice.name}</span>
                  </div>
                )}
              </div>

              {/* Spotify auth prompt */}
              {spotify && !token && (
                <div className="w-full p-4 rounded-2xl border flex flex-col gap-3 text-center"
                  style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}>
                  <p className="text-[10px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    Connect Spotify to sync playback
                  </p>
                  <a href="/auth/spotify/login?from=remote"
                    className="w-full py-3 px-3 rounded-xl flex items-center justify-center gap-2 text-xs text-black font-extrabold uppercase tracking-wider active:scale-95 transition-all"
                    style={{ background: '#1ed760' }}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                    Login with Spotify
                  </a>
                </div>
              )}

              {/* Progress bar */}
              {source !== 'radio' && (
                <div className="w-full flex flex-col gap-1.5">
                  <div className="relative h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full transition-none" style={{ width: `${progressPct}%`, background: 'var(--theme-color)' }} />
                    <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
                      onChange={handleSeek}
                      disabled={spotify ? (!token || !trackDuration) : !trackDuration}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.25)' }}>
                    <span>{formatTime(trackPosition)}</span>
                    <span>{formatTime(trackDuration)}</span>
                  </div>
                </div>
              )}

              {/* Transport controls */}
              <div className="w-full flex items-center justify-between px-1 pb-2">
                {/* shuffle / heart */}
                {source !== 'radio' ? (
                  <button onClick={handleShuffle} disabled={spotify ? !token : true}
                    className="p-2.5 rounded-full transition-all active:scale-90 cursor-pointer disabled:opacity-20"
                    style={{ color: shuffleState ? 'var(--theme-color)' : 'rgba(255,255,255,0.3)' }}>
                    <Shuffle className="h-4 w-4" />
                  </button>
                ) : currentTrack?.url ? (
                  <button onClick={() => handleToggleFavoriteRadio({ name: trackName, url: currentTrack.url, favicon: albumImage || '', country: '', tags: '' })}
                    className="p-2.5 rounded-full transition-all active:scale-90 cursor-pointer"
                    style={{ color: isCurrentFavorite ? '#fb7185' : 'rgba(255,255,255,0.3)' }}>
                    <Heart className={`h-4 w-4 ${isCurrentFavorite ? 'fill-current' : ''}`} />
                  </button>
                ) : <div className="w-10" />}

                {/* prev */}
                {source !== 'radio' ? (
                  <button onClick={handlePrevious} disabled={spotify ? !token : false}
                    className="p-2.5 transition-all active:scale-90 cursor-pointer disabled:opacity-20"
                    style={{ color: 'rgba(255,255,255,0.65)' }}>
                    <SkipBack className="h-6 w-6 fill-current" />
                  </button>
                ) : <div className="w-10" />}

                {/* play/pause */}
                <button onClick={handlePlayPause} disabled={spotify ? !token : false}
                  className="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-90 cursor-pointer disabled:opacity-40"
                  style={{ background: 'var(--theme-color)', boxShadow: '0 0 32px var(--theme-color-glow)' }}>
                  {isPlaying
                    ? <Pause className="h-6 w-6 fill-black text-black" />
                    : <Play className="h-6 w-6 fill-black text-black ml-0.5" />}
                </button>

                {/* next */}
                {source !== 'radio' ? (
                  <button onClick={handleNext} disabled={spotify ? !token : false}
                    className="p-2.5 transition-all active:scale-90 cursor-pointer disabled:opacity-20"
                    style={{ color: 'rgba(255,255,255,0.65)' }}>
                    <SkipForward className="h-6 w-6 fill-current" />
                  </button>
                ) : <div className="w-10" />}

                {/* repeat / radio shortcut */}
                {source !== 'radio' ? (
                  <button onClick={handleRepeat} disabled={spotify ? !token : true}
                    className="p-2.5 rounded-full transition-all active:scale-90 cursor-pointer disabled:opacity-20"
                    style={{ color: repeatState !== 'off' ? 'var(--theme-color)' : 'rgba(255,255,255,0.3)' }}>
                    <Repeat className="h-4 w-4" />
                  </button>
                ) : (
                  <button onClick={() => setActiveTab('radio')} className="p-2.5 rounded-full active:scale-90 cursor-pointer" style={{ color: 'var(--theme-color)' }}>
                    <Radio className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── RADIO TAB ── */}
          {activeTab === 'radio' && (
            <div className="flex flex-col gap-4 px-5 pt-3 pb-2">
              <div>
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Web Radio</h3>
                <p className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Tune into global streams</p>
              </div>

              <div className="flex gap-2">
                <input type="text" placeholder="Search stations..." value={radioSearch}
                  onChange={e => setRadioSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleRadioSearch()}
                  className="flex-grow rounded-xl px-3.5 py-3 text-xs text-white placeholder:text-white/20 focus:outline-none transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }} />
                <button onClick={handleRadioSearch} disabled={isSearching}
                  className="px-4 py-3 rounded-xl text-black font-extrabold text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--theme-color)' }}>
                  {isSearching ? '…' : 'Search'}
                </button>
              </div>

              <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-bold px-1" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <span>{radioSearch.trim() ? 'Results' : 'Favorites'}</span>
                <span>{stationsList.length}</span>
              </div>

              <div className="flex flex-col gap-2 overflow-y-auto custom-scrollbar">
                {stationsList.map((station, idx) => {
                  const isFav = favoriteStations.some(s => s.url === station.url);
                  return (
                    <div key={`${station.url}-${idx}`} className="w-full rounded-2xl flex items-center justify-between px-3.5 py-3 transition-all"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <button className="flex items-center gap-3 min-w-0 flex-grow text-left cursor-pointer bg-transparent border-none p-0 outline-none"
                        onClick={async () => { try { wakeKiosk(); await api.localPlayRadio(station.url, station.name, station.favicon); setSource('radio'); sendUpdate('SET_SOURCE', { spotify: false, source: 'radio' }); } catch (err) { toast.error(err.message); } }}>
                        <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 relative"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          {station.favicon
                            ? <img src={station.favicon} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                            : null}
                          <Radio className="w-3.5 h-3.5 absolute" style={{ color: 'rgba(255,255,255,0.2)', zIndex: -1 }} />
                        </div>
                        <div className="min-w-0">
                          <span className="block text-[11px] font-bold text-white truncate">{station.name}</span>
                          <span className="block text-[8px] font-mono uppercase tracking-wider truncate" style={{ color: 'rgba(255,255,255,0.3)' }}>
                            {station.country || 'Global'}{station.tags ? ` • ${station.tags.split(',')[0]}` : ''}
                          </span>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <button onClick={e => { e.stopPropagation(); handleToggleFavoriteRadio(station); }}
                          className="p-2 rounded-full transition-colors cursor-pointer"
                          style={{ color: isFav ? '#fb7185' : 'rgba(255,255,255,0.25)' }}>
                          <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                        <button
                          onClick={async () => { try { wakeKiosk(); await api.localPlayRadio(station.url, station.name, station.favicon); setSource('radio'); sendUpdate('SET_SOURCE', { spotify: false, source: 'radio' }); } catch (err) { toast.error(err.message); } }}
                          className="text-[8px] px-2.5 py-1 rounded-lg font-extrabold uppercase tracking-wider transition-all cursor-pointer"
                          style={{ background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}>
                          PLAY
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── SEARCH TAB ── */}
          {activeTab === 'search' && (
            <div className="flex flex-col px-5 pt-3 h-full min-h-0" style={{ flex: '1 1 0' }}>
              {token ? (
                <TrackSearch token={token} onPlayTrack={handlePlayTrack} onPlayContext={handlePlayContext} isDrawer={true} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-5 py-16">
                  <Search className="h-10 w-10" style={{ color: 'rgba(255,255,255,0.1)' }} />
                  <p className="text-[11px] text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    Connect Spotify to search and play music.
                  </p>
                  <a href="/auth/spotify/login?from=remote"
                    className="py-3 px-6 rounded-xl text-xs text-black font-extrabold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                    style={{ background: '#1ed760' }}>
                    Login with Spotify
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ── EQ TAB ── */}
          {activeTab === 'eq' && (
            <div className="flex flex-col gap-4 px-5 pt-3 pb-2" style={{ minHeight: '420px' }}>
              <div className="flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Sound Tuning</h3>
                  <p className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Equalizer & DSP</p>
                </div>
                <button onClick={() => setIsDspWizardOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl font-extrabold text-[9px] uppercase tracking-wider active:scale-95 transition-all cursor-pointer border"
                  style={{ background: 'rgba(255,255,255,0.06)', borderColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}>
                  <Cpu className="h-3 w-3 animate-pulse" style={{ color: 'var(--theme-color)' }} />
                  Calibrate
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <EqualizerControl
                  currentPreset={eqPreset} onPresetChange={handleEqPresetChange}
                  bands={eqBands} onBandChange={handleBandChange}
                  saturation={eqSaturation} onSaturationChange={handleSaturationChange}
                  noiseFloor={eqNoiseFloor} onNoiseFloorChange={handleNoiseFloorChange}
                  preAmp={eqPreAmp} onPreAmpChange={handlePreAmpChange}
                  dspActive={dspActive} onDeactivateDsp={handleDeactivateDsp}
                />
              </div>
            </div>
          )}

          {/* ── SETTINGS TAB ── */}
          {activeTab === 'settings' && (
            <div className="flex flex-col gap-3 px-5 pt-3 pb-4">
              <div className="mb-1">
                <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">Settings</h3>
                <p className="text-[9px] uppercase tracking-wider font-bold mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>Device & system configuration</p>
              </div>

              {/* Spotify Auth */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Spotify</span>
                  {token
                    ? <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider" style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399', border: '1px solid rgba(16,185,129,0.2)' }}>Authorized</span>
                    : <span className="text-[8px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>Required</span>}
                </div>
                {!token ? (
                  <a href="/auth/spotify/login?from=remote"
                    className="w-full py-3 rounded-xl flex items-center justify-center gap-2 text-xs text-black font-extrabold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                    style={{ background: '#1ed760' }}>
                    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                    Login with Spotify
                  </a>
                ) : (
                  <button onClick={async () => { try { await fetch('/auth/spotify/logout', { method: 'POST' }); } catch { toast.error('Logout failed'); } }}
                    className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                    style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>
                    Disconnect Spotify
                  </button>
                )}
                <p className="text-[9px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.25)' }}>
                  To pair, select <strong className="text-white/50">"Resonance Connect"</strong> from your Spotify app on this network.
                </p>
              </div>

              {/* Cast devices */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Cast Devices</span>
                  <span className="text-[8px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>{devices.length} found</span>
                </div>
                <div className="flex flex-col gap-1.5 max-h-36 overflow-y-auto custom-scrollbar">
                  {devices.length > 0 ? devices.map(d => (
                    <button key={d.id} onClick={() => handleCast(d.id)}
                      className="w-full p-2.5 rounded-xl flex items-center justify-between text-left transition-all active:scale-98 cursor-pointer"
                      style={d.is_active
                        ? { background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }
                        : { background: 'transparent', border: '1px solid transparent' }}>
                      <div className="flex items-center gap-2">
                        <Laptop className="h-3.5 w-3.5 shrink-0" style={{ color: d.is_active ? 'var(--theme-color)' : 'rgba(255,255,255,0.3)' }} />
                        <span className="text-[11px] truncate max-w-[160px]" style={{ color: d.is_active ? 'white' : 'rgba(255,255,255,0.45)' }}>{d.name}</span>
                      </div>
                      <span className="text-[8px] uppercase tracking-wider" style={{ color: d.is_active ? 'var(--theme-color)' : 'rgba(255,255,255,0.25)' }}>
                        {d.is_active ? 'Active' : 'Cast →'}
                      </span>
                    </button>
                  )) : (
                    <p className="text-[10px] text-center py-2 italic" style={{ color: 'rgba(255,255,255,0.2)' }}>No devices found</p>
                  )}
                </div>
              </div>

              {/* Appearance */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>Appearance</span>
                <button onClick={() => setIsThemeSettingsOpen(true)}
                  className="w-full py-3 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all border"
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.7)' }}>
                  <Palette className="h-4 w-4" style={{ color: 'var(--theme-color)' }} />
                  Theme & Display
                </button>
              </div>

              {/* OTA updates */}
              <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.5)' }}>System Updates</span>
                  <span className="text-[8px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.08)' }}>OTA</span>
                </div>
                {updateStatus === null && (
                  <button onClick={checkUpdates} className="w-full py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.5)' }}>
                    Check for Updates
                  </button>
                )}
                {updateStatus === 'checking' && (
                  <div className="flex justify-center items-center gap-2 py-2 text-xs font-bold uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Checking...
                  </div>
                )}
                {updateStatus === 'no-update' && (
                  <div className="flex flex-col gap-2">
                    <div className="p-2.5 rounded-xl text-center text-[10px] font-mono" style={{ background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.15)', color: '#34d399' }}>✓ System up to date</div>
                    <button onClick={checkUpdates} className="text-xs font-bold uppercase tracking-wider py-1 cursor-pointer transition-all" style={{ color: 'rgba(255,255,255,0.25)' }}>Check Again</button>
                  </div>
                )}
                {updateStatus === 'available' && (
                  <div className="flex flex-col gap-2">
                    <div className="p-2.5 rounded-xl text-center text-[10px] font-mono" style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.15)', color: '#fbbf24' }}>⚠ Update Available</div>
                    <button onClick={triggerOtaUpdate} className="w-full py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer text-black" style={{ background: '#f59e0b' }}>
                      Install Update
                    </button>
                  </div>
                )}
                {updateStatus === 'updating' && (
                  <div className="flex flex-col gap-3 p-2.5 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex justify-between items-center text-[10px] font-bold uppercase" style={{ color: 'rgba(255,255,255,0.6)' }}>
                      <span>Installing</span><span style={{ color: 'var(--theme-color)' }}>{otaPercent}%</span>
                    </div>
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all" style={{ width: `${otaPercent}%`, background: 'var(--theme-color)' }} />
                    </div>
                    <div className="h-20 overflow-y-auto text-[8px] font-mono flex flex-col gap-0.5 custom-scrollbar" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {otaProgress.map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                  </div>
                )}
                {updateStatus === 'error' && (
                  <div className="flex flex-col gap-2">
                    <div className="p-2.5 rounded-xl text-center text-[10px] font-mono" style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', color: '#f87171' }}>Update failed</div>
                    <button onClick={checkUpdates} className="w-full py-2 rounded-xl font-bold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.5)' }}>
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Logout */}
              <button onClick={handleRemoteLogout}
                className="w-full py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer active:scale-95 transition-all mt-1"
                style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.13)', color: '#f87171' }}>
                <LogOut className="h-4 w-4" />
                De-authorize Remote
              </button>
            </div>
          )}
        </main>

        {/* ── footer: volume + nav ── */}
        <footer className="relative z-10 flex flex-col gap-2 px-4 pt-2 pb-3 shrink-0">
          {/* Volume */}
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <button onClick={handleMuteToggle} disabled={spotify ? !token : false}
              className="transition-all active:scale-90 cursor-pointer disabled:opacity-25"
              style={{ color: 'rgba(255,255,255,0.4)' }}>
              {isMuted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <div className="relative flex-grow h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${isMuted ? 0 : volume}%`, background: 'var(--theme-color)', transition: 'none' }} />
              <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                disabled={spotify ? !token : false}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
            </div>
            <span className="text-[10px] font-mono w-7 text-right" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {isMuted ? 0 : volume}
            </span>
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-around rounded-2xl px-1 py-1"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', backdropFilter: 'blur(20px)' }}>
            {[
              { id: 'player',   Icon: Music,    label: 'Player'   },
              { id: 'search',   Icon: Search,   label: 'Search'   },
              { id: 'radio',    Icon: Radio,    label: 'Radio'    },
              { id: 'eq',       Icon: Sliders,  label: 'EQ'       },
              { id: 'settings', Icon: Settings, label: 'Settings' },
            ].map(({ id, Icon, label }) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className="flex flex-col items-center gap-1 py-2 flex-1 cursor-pointer transition-all active:scale-90"
                style={activeTab === id ? { color: 'var(--theme-color)' } : { color: 'rgba(255,255,255,0.25)' }}>
                <Icon className="h-4 w-4" />
                <span className="text-[7px] uppercase tracking-wider font-extrabold">{label}</span>
                {activeTab === id && (
                  <span className="w-3 h-0.5 rounded-full" style={{ background: 'var(--theme-color)' }} />
                )}
              </button>
            ))}
          </div>
        </footer>
      </div>

      {/* ── overlays ── */}
      {isDspWizardOpen && (
        <div className="fixed inset-0 bg-[#050d1c] z-[9999] flex flex-col">
          <DspWizard
            onClose={() => { setIsDspWizardOpen(false); api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }}
            onCalibrationComplete={(active) => setDspActive(active)}
          />
        </div>
      )}
      {isThemeSettingsOpen && (
        <div className="fixed inset-0 bg-[#050d1c] z-[9999] flex flex-col p-4">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <span className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'rgba(255,255,255,0.4)' }}>Theme Settings</span>
            <button onClick={() => setIsThemeSettingsOpen(false)}
              className="text-[10px] font-extrabold px-3.5 py-1.5 rounded-lg cursor-pointer active:scale-95 transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
              CLOSE ✕
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

      <Toaster theme="dark" closeButton richColors position="bottom-center" visibleToasts={1} />
    </>
  );
}
