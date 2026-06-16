import React, { useState, useEffect, useRef } from 'react';
import {
  Play, Pause, SkipForward, SkipBack, Volume2, VolumeX,
  Shuffle, Repeat, Laptop, Music, Search, Radio, Heart,
  Power, Sliders, Cpu, Palette, RefreshCw, LogOut,
  Settings, Smartphone, ChevronRight, Waves, Cast,
  MoreHorizontal
} from 'lucide-react';
import { api } from '../api';
import { toast, Toaster } from 'sonner';
import { useResonanceWS } from '../websocket';
import EqualizerControl, { EQ_PRESETS } from '../components/EqualizerControl';
import DspWizard from '../components/DspWizard';
import ThemeSettingsControl from '../components/ThemeSettingsControl';
import TrackSearch from '../components/TrackSearch';

// ─── cookies ─────────────────────────────────────────────────────────────────
const setCookie = (n, v, d = 365) => {
  const e = new Date(); e.setTime(e.getTime() + d * 86400000);
  document.cookie = `${n}=${v}; expires=${e.toUTCString()}; path=/`;
};
const getCookie = (n) => {
  const v = `; ${document.cookie}`, p = v.split(`; ${n}=`);
  return p.length === 2 ? p.pop().split(';').shift() : null;
};
const eraseCookie = (n) => { document.cookie = `${n}=; Max-Age=-99999999; path=/`; };

// ─── style tokens (Apple-inspired) ───────────────────────────────────────────
const S = {
  bg:       '#000000',
  card:     'rgba(28,28,30,0.92)',
  cardBd:   'rgba(255,255,255,0.08)',
  sep:      'rgba(255,255,255,0.1)',
  t1:       '#ffffff',
  t2:       'rgba(255,255,255,0.55)',
  t3:       'rgba(255,255,255,0.3)',
  red:      '#ff453a',
  green:    '#32d74b',
  font:     "-apple-system, BlinkMacSystemFont, 'Helvetica Neue', system-ui, sans-serif",
};

// small helpers
const fmt = (ms) => {
  if (!ms || isNaN(ms)) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
};

// ─── sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, onPress, destructive, chevron = true, icon, badge }) {
  return (
    <button
      onClick={onPress}
      className="w-full flex items-center gap-3 px-4 py-3.5 active:opacity-60 transition-opacity cursor-pointer text-left"
    >
      {icon && (
        <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.07)' }}>
          {icon}
        </span>
      )}
      <span className="flex-1 text-[15px]" style={{ color: destructive ? S.red : S.t1, fontFamily: S.font, letterSpacing: '-0.2px' }}>
        {label}
      </span>
      {badge && (
        <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', color: S.t2, fontFamily: S.font }}>
          {badge}
        </span>
      )}
      {value && <span className="text-[15px]" style={{ color: S.t3, fontFamily: S.font }}>{value}</span>}
      {chevron && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: S.t3 }} />}
    </button>
  );
}

function Section({ title, children }) {
  return (
    <div className="mx-4 mb-3">
      {title && (
        <p className="px-1 pb-1.5 text-[12px] font-semibold uppercase tracking-widest" style={{ color: S.t3, fontFamily: S.font }}>
          {title}
        </p>
      )}
      <div className="rounded-[14px] overflow-hidden" style={{ background: S.card, border: `1px solid ${S.cardBd}` }}>
        {React.Children.map(children, (child, i) => (
          <>
            {i > 0 && <div className="ml-4" style={{ height: '0.5px', background: S.sep }} />}
            {child}
          </>
        ))}
      </div>
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────
export default function RemoteControl() {
  const [isAuthenticated, setIsAuthenticated] = useState(getCookie('remote_auth') === 'true');
  const [usernameInput, setUsernameInput]     = useState('');
  const [passwordInput, setPasswordInput]     = useState('');

  const [activeTab, setActiveTab] = useState('player');

  const [radioSearch, setRadioSearch]       = useState('');
  const [stationsList, setStationsList]     = useState([]);
  const [isSearching, setIsSearching]       = useState(false);
  const [favoriteStations, setFavoriteStations] = useState([]);

  const [token, setToken]     = useState('');
  const [devices, setDevices] = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  const [playbackState, setPlaybackState] = useState(null);
  const [shuffleState, setShuffleState]   = useState(false);
  const [repeatState, setRepeatState]     = useState('off');
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [volume, setVolume]               = useState(50);
  const [isMuted, setIsMuted]             = useState(false);

  const [updateStatus, setUpdateStatus] = useState(null);
  const [otaProgress, setOtaProgress]   = useState([]);
  const [otaPercent, setOtaPercent]     = useState(0);

  const [source, setSource]   = useState('spotify');
  const spotify = source === 'spotify';
  const [standby, setStandby]               = useState(false);
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState(true);

  // EQ
  const [isDspWizardOpen, setIsDspWizardOpen] = useState(false);
  const [showEq, setShowEq]                   = useState(false);
  const [dspActive, setDspActive]             = useState(false);
  const [eqPreset, setEqPreset]               = useState(() => localStorage.getItem('resonance_eq_preset') || 'Clinical Reference');
  const [eqBands, setEqBands]                 = useState(() => { try { return JSON.parse(localStorage.getItem('resonance_eq_bands')) || [0,0,0,0,0]; } catch { return [0,0,0,0,0]; } });
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

  // derived
  const currentTrack    = playbackState?.track_window?.current_track;
  const isPlaying       = playbackState ? !playbackState.paused : false;
  const trackName       = currentTrack?.name || 'Nothing playing';
  const trackArtist     = currentTrack?.artists?.map(a => a.name).join(', ') || '';
  const albumImage      = currentTrack?.album?.images?.[0]?.url;
  const activeDevice    = devices.find(d => d.is_active);
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');
  const isCurrentFav    = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;
  const progressPct     = trackDuration ? (trackPosition / trackDuration) * 100 : 0;

  // helpers
  const wakeKiosk = () => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: false } }));
  };
  const requestWSStateSync = () => {
    if (ws.current?.readyState === WebSocket.OPEN)
      ws.current.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
  };

  // theme handlers
  const queueThemeSync = (tc, at, br, vm) => {
    clearTimeout(themeSyncTimeout.current);
    themeSyncTimeout.current = setTimeout(() => sendUpdate('SET_THEME_SETTINGS', { themeColor: tc, activeTheme: at, brightness: br, visualizerMode: vm }), 400);
  };
  const handleThemeColorChange = c => { setTheme(c); localStorage.setItem('resonance_theme', c); sendUpdate('SET_THEME_SETTINGS', { themeColor: c, activeTheme, brightness, visualizerMode }); };
  const handleActiveThemeChange = t => { setActiveTheme(t); localStorage.setItem('resonance_theme_active', t); sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme: t, brightness, visualizerMode }); };
  const handleBrightnessChange = v => { setBrightness(v); localStorage.setItem('resonance_theme_brightness', v); queueThemeSync(theme, activeTheme, v, visualizerMode); };
  const handleVisualizerModeChange = m => { setVisualizerMode(m); localStorage.setItem('resonance_visualizer_mode', m); sendUpdate('SET_THEME_SETTINGS', { themeColor: theme, activeTheme, brightness, visualizerMode: m }); };

  // EQ handlers
  const queueEqSync = (preset, bands, sat, nf, pa) => {
    clearTimeout(eqSyncTimeout.current);
    eqSyncTimeout.current = setTimeout(() => sendUpdate('SET_EQ_SETTINGS', { preset, bands, saturation: sat, noiseFloor: nf, preAmp: pa }), 400);
  };
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
  const handleBandChange = (i, v) => { const n = [...eqBands]; n[i] = v; setEqBands(n); localStorage.setItem('resonance_eq_bands', JSON.stringify(n)); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', n, eqSaturation, eqNoiseFloor, eqPreAmp); };
  const handleSaturationChange = v => { setEqSaturation(v); localStorage.setItem('resonance_eq_saturation', v); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', eqBands, v, eqNoiseFloor, eqPreAmp); };
  const handleNoiseFloorChange = v => { setEqNoiseFloor(v); localStorage.setItem('resonance_eq_noise', v); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', eqBands, eqSaturation, v, eqPreAmp); };
  const handlePreAmpChange = v => { setEqPreAmp(v); localStorage.setItem('resonance_eq_preamp', v); setEqPreset('Custom'); localStorage.setItem('resonance_eq_preset', 'Custom'); queueEqSync('Custom', eqBands, eqSaturation, eqNoiseFloor, v); };

  // effects
  useEffect(() => { api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }, []);
  const hasCheckedSource = useRef(false);
  useEffect(() => { if (source === 'radio' && !hasCheckedSource.current) { setActiveTab('radio'); hasCheckedSource.current = true; } }, [source]);
  useEffect(() => { if (isConnected) { fetchFavorites(); checkUpdates(); } }, [isConnected]);
  useEffect(() => { if (!radioSearch.trim()) setStationsList(favoriteStations); }, [radioSearch, favoriteStations]);
  useEffect(() => {
    if (!spotify || !isAuthenticated || !token) return;
    fetchDevices(); localSync();
    const id = setInterval(() => { fetchDevices(); localSync(); }, 3000);
    return () => clearInterval(id);
  }, [token, isAuthenticated, spotify]);
  useEffect(() => {
    if (isAuthenticated && playbackState && isPlaying) {
      progressInterval.current = setInterval(() => {
        setTrackPosition(p => { if (p + 1000 >= trackDuration) { clearInterval(progressInterval.current); return trackDuration; } return p + 1000; });
      }, 1000);
    } else clearInterval(progressInterval.current);
    return () => clearInterval(progressInterval.current);
  }, [playbackState, isPlaying, trackDuration, isAuthenticated]);

  // data
  const fetchFavorites = async () => { try { setFavoriteStations(await api.getFavoriteRadios() || []); } catch {} };
  const fetchDevices   = async () => { if (!token) return; setIsFetchingDevices(true); try { setDevices((await api.getDevices(token)).devices || []); } catch {} finally { setIsFetchingDevices(false); } };
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
  const checkUpdates = async () => {
    setUpdateStatus('checking');
    try { const d = await api.getUpdateStatus(); setUpdateStatus(d.updateAvailable ? 'available' : 'no-update'); } catch { setUpdateStatus('no-update'); }
  };
  const triggerOtaUpdate = async () => {
    try { setOtaProgress([]); setOtaPercent(0); setUpdateStatus('updating'); localStorage.setItem('resonance_updating', 'true'); await api.triggerUpdate(); } catch { localStorage.removeItem('resonance_updating'); setUpdateStatus('error'); }
  };

  // transport
  const handleToggleSource = src => { setSource(src); sendUpdate('SET_SOURCE', { spotify: src === 'spotify', source: src }); };
  const handleToggleStandby = en => { setStandby(en); if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: en } })); };
  const handlePlayPause = async () => {
    if (!spotify) {
      try {
        if (playbackState ? playbackState.paused : true) { wakeKiosk(); await api.localPlay(); setPlaybackState(p => ({ ...p, paused: false })); }
        else { await api.localPause(); setPlaybackState(p => ({ ...p, paused: true })); }
      } catch (e) { toast.error(e.message); }
      return;
    }
    if (!token) return;
    try {
      if (isPlaying) await api.pause(token);
      else { wakeKiosk(); await api.play(token, activeDevice?.id || resonanceDevice?.id || null); }
      requestWSStateSync();
    } catch (e) { toast.error(e.message); }
  };
  const handleNext = async () => { if (!spotify) { try { await api.localNext(); } catch {} return; } if (!token) return; try { await api.skipNext(token); requestWSStateSync(); } catch {} };
  const handlePrevious = async () => { if (!spotify) { try { await api.localPrevious(); } catch {} return; } if (!token) return; try { await api.skipPrevious(token); requestWSStateSync(); } catch {} };
  const handleShuffle = async () => { if (!spotify || !token) return; const n = !shuffleState; setShuffleState(n); try { await api.setShuffle(token, n); requestWSStateSync(); } catch { setShuffleState(!n); } };
  const handleRepeat = async () => { if (!spotify || !token) return; const n = { off: 'context', context: 'track', track: 'off' }[repeatState] || 'off'; setRepeatState(n); try { await api.setRepeat(token, n); requestWSStateSync(); } catch { setRepeatState(repeatState); } };
  const handleSeek = async e => {
    const ms = parseInt(e.target.value, 10); setTrackPosition(ms);
    if (!spotify) { try { await api.localSeek(`${Math.round((ms / (trackDuration || 1)) * 100)}%`); } catch {} return; }
    if (!token) return; try { await api.seek(token, ms); requestWSStateSync(); } catch {}
  };
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
    if (!token) return; try { await api.setVolume(token, tv); } catch {}
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
  const handlePlayTrack = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, null, [uri]); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { toast.error(e.message); } };
  const handlePlayContext = async uri => { try { await api.play(token, activeDevice?.id || resonanceDevice?.id || null, uri); setActiveTab('player'); setTimeout(() => { localSync(); requestWSStateSync(); }, 800); } catch (e) { toast.error(e.message); } };
  const handleLoginSubmit = e => {
    e.preventDefault();
    if (usernameInput === 'enzo' && passwordInput === 'enzoOS') { setCookie('remote_auth', 'true', 365); setIsAuthenticated(true); } else toast.error('Invalid credentials');
  };
  const handleDeactivateDsp = async () => { try { const c = await api.getDspCalibration() || {}; c[0] = 'eq'; await api.saveDspCalibration(c); setDspActive(false); } catch {} };

  // ── disabled ────────────────────────────────────────────────────────────────
  if (!remoteAccessEnabled) return (
    <div style={{ fontFamily: S.font, background: S.bg }} className="fixed inset-0 flex flex-col items-center justify-center gap-6 p-8 touch-manipulation select-none">
      <div className="w-24 h-24 rounded-[26px] flex items-center justify-center" style={{ background: 'rgba(255,69,58,0.15)', border: '1px solid rgba(255,69,58,0.3)' }}>
        <Smartphone className="h-10 w-10" style={{ color: S.red }} />
      </div>
      <div className="text-center">
        <p className="text-[22px] font-semibold text-white mb-2" style={{ letterSpacing: '-0.3px' }}>Remote Disabled</p>
        <p className="text-[15px]" style={{ color: S.t2, letterSpacing: '-0.2px' }}>Enable it from the kiosk system menu.</p>
      </div>
    </div>
  );

  // ── login ───────────────────────────────────────────────────────────────────
  if (!isAuthenticated) return (
    <>
      <div data-theme={theme} style={{ fontFamily: S.font, background: S.bg }} className="fixed inset-0 flex flex-col items-center justify-center px-6 touch-manipulation select-none overflow-hidden">
        {/* glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, var(--theme-color) 0%, transparent 70%)', opacity: 0.12 }} />

        <div className="w-full max-w-xs z-10 flex flex-col gap-8">
          {/* logo mark */}
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-[22px] flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <Waves className="h-7 w-7" style={{ color: 'var(--theme-color)' }} />
            </div>
            <div className="text-center">
              <p className="text-[28px] font-semibold text-white" style={{ letterSpacing: '-0.5px' }}>Resonance</p>
              <p className="text-[15px] mt-0.5" style={{ color: S.t2 }}>Remote Control</p>
            </div>
          </div>

          {/* form */}
          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-3">
            <input type="text" value={usernameInput} onChange={e => setUsernameInput(e.target.value)} placeholder="Username" required autoCapitalize="none"
              className="w-full rounded-[14px] px-4 py-4 text-[17px] text-white placeholder:text-white/25 focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: S.font, letterSpacing: '-0.2px' }} />
            <input type="password" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} placeholder="Password" required
              className="w-full rounded-[14px] px-4 py-4 text-[17px] text-white placeholder:text-white/25 focus:outline-none transition-colors"
              style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: S.font, letterSpacing: '-0.2px' }} />
            <button type="submit" className="w-full py-4 rounded-full text-[17px] font-semibold text-black active:scale-95 transition-all cursor-pointer mt-1"
              style={{ background: 'var(--theme-color)', fontFamily: S.font, letterSpacing: '-0.2px' }}>
              Sign In
            </button>
          </form>
        </div>
      </div>
      <Toaster theme="dark" closeButton richColors position="bottom-center" visibleToasts={1} />
    </>
  );

  // ── MAIN REMOTE ─────────────────────────────────────────────────────────────
  const NAV_H = 83;

  return (
    <>
      <div
        data-theme={theme}
        style={{ fontFamily: S.font, background: S.bg, paddingTop: 'env(safe-area-inset-top)' }}
        className="fixed inset-0 text-white flex flex-col overflow-hidden touch-manipulation select-none"
      >
        {/* ambient glow from album art */}
        {albumImage && (
          <div className="absolute inset-0 pointer-events-none transition-all duration-1000"
            style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(100px) saturate(3)', opacity: 0.18 }} />
        )}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, transparent 30%, rgba(0,0,0,0.6) 75%, rgba(0,0,0,1) 100%)' }} />

        {/* ── scrollable content ── */}
        <div className="relative z-10 flex-1 overflow-y-auto overscroll-none" style={{ paddingBottom: NAV_H + 8 }}>

          {/* ════════════════════════ PLAYER TAB ════════════════════════════ */}
          {activeTab === 'player' && (
            <div className="flex flex-col items-center px-6 pt-4 gap-0">

              {/* mini header: connection + standby */}
              <div className="w-full flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: isConnected ? 'var(--theme-color)' : S.red, boxShadow: isConnected ? '0 0 6px var(--theme-color)' : 'none' }} />
                  <span className="text-[13px] font-semibold" style={{ color: S.t3, letterSpacing: '-0.1px' }}>
                    {isConnected ? 'Connected' : 'Offline'}
                  </span>
                </div>
                <button onClick={() => handleToggleStandby(!standby)}
                  className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                  style={{ background: standby ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.07)', color: standby ? S.red : S.t2 }}>
                  <Power className="h-4 w-4" />
                </button>
              </div>

              {/* source selector */}
              <div className="flex items-center gap-1.5 mb-8 p-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                {['spotify', 'local', 'radio'].map(src => (
                  <button key={src} onClick={() => handleToggleSource(src)}
                    className="px-5 py-1.5 rounded-full text-[13px] font-semibold transition-all active:scale-95 cursor-pointer"
                    style={source === src
                      ? { background: 'var(--theme-color)', color: '#000', letterSpacing: '-0.1px' }
                      : { color: S.t2, letterSpacing: '-0.1px' }}>
                    {src === 'spotify' ? 'Spotify' : src === 'local' ? 'Local' : 'Radio'}
                  </button>
                ))}
              </div>

              {/* ── artwork ── */}
              <div className="relative mb-8" style={{ width: 'min(68vw, 280px)', aspectRatio: '1' }}>
                {albumImage && (
                  <div className="absolute inset-0 rounded-[2rem] scale-[0.92] blur-3xl -z-10"
                    style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover', opacity: 0.6 }} />
                )}
                <div className="w-full h-full rounded-[2rem] overflow-hidden flex items-center justify-center"
                  style={{ background: 'rgba(40,40,42,0.9)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                  {albumImage
                    ? <img src={albumImage} alt={trackName} className="w-full h-full object-cover pointer-events-none" />
                    : <Music className="h-16 w-16" style={{ color: 'rgba(255,255,255,0.1)' }} />}
                </div>
              </div>

              {/* ── track info ── */}
              <div className="w-full flex items-start justify-between gap-3 mb-5">
                <div className="flex-1 min-w-0">
                  <p className="text-[22px] font-semibold text-white truncate" style={{ letterSpacing: '-0.4px' }}>{trackName}</p>
                  <p className="text-[15px] font-medium truncate mt-0.5" style={{ color: S.t2, letterSpacing: '-0.15px' }}>{trackArtist}</p>
                  {activeDevice && (
                    <div className="flex items-center gap-1 mt-1.5">
                      <Cast className="h-3 w-3 shrink-0" style={{ color: 'var(--theme-color)' }} />
                      <span className="text-[12px] font-medium truncate" style={{ color: 'var(--theme-color)', letterSpacing: '-0.1px' }}>{activeDevice.name}</span>
                    </div>
                  )}
                </div>
                {/* heart */}
                {source === 'radio' && currentTrack?.url ? (
                  <button onClick={() => handleToggleFavRadio({ name: trackName, url: currentTrack.url, favicon: albumImage || '', country: '', tags: '' })}
                    className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer mt-0.5 shrink-0"
                    style={{ color: isCurrentFav ? '#ff453a' : S.t2 }}>
                    <Heart className={`h-6 w-6 ${isCurrentFav ? 'fill-current' : ''}`} />
                  </button>
                ) : (
                  <button onClick={handleShuffle} disabled={spotify ? !token : true}
                    className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer mt-0.5 shrink-0 disabled:opacity-30"
                    style={{ color: shuffleState ? 'var(--theme-color)' : S.t2 }}>
                    <Shuffle className="h-5 w-5" />
                  </button>
                )}
              </div>

              {/* Spotify connect prompt */}
              {spotify && !token && (
                <div className="w-full rounded-2xl p-5 flex flex-col gap-4 mb-4 text-center" style={{ background: S.card, border: `1px solid ${S.cardBd}` }}>
                  <div>
                    <p className="text-[17px] font-semibold text-white mb-1" style={{ letterSpacing: '-0.2px' }}>Connect Spotify</p>
                    <p className="text-[14px]" style={{ color: S.t2 }}>Sign in to sync your playback.</p>
                  </div>
                  <a href="/auth/spotify/login?from=remote"
                    className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold text-black active:scale-95 transition-all"
                    style={{ background: '#1ed760', fontFamily: S.font }}>
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                    Connect with Spotify
                  </a>
                </div>
              )}

              {/* ── progress ── */}
              {source !== 'radio' && (
                <div className="w-full mb-6">
                  <div className="relative h-1 rounded-full mb-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
                    <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${progressPct}%`, background: 'white', transition: 'none' }} />
                    <input type="range" min="0" max={trackDuration || 0} value={trackPosition}
                      onChange={handleSeek} disabled={spotify ? !token || !trackDuration : !trackDuration}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
                  </div>
                  <div className="flex justify-between text-[12px] font-medium" style={{ color: S.t3, letterSpacing: '-0.05px' }}>
                    <span>{fmt(trackPosition)}</span>
                    <span>{fmt(trackDuration)}</span>
                  </div>
                </div>
              )}
              {source === 'radio' && <div className="mb-6" />}

              {/* ── transport controls ── */}
              <div className="w-full flex items-center justify-between mb-8 px-2">
                {/* repeat (left) */}
                {source !== 'radio' ? (
                  <button onClick={handleRepeat} disabled={spotify ? !token : true}
                    className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer disabled:opacity-25"
                    style={{ color: repeatState !== 'off' ? 'var(--theme-color)' : S.t2 }}>
                    <Repeat className="h-5 w-5" />
                  </button>
                ) : <div className="w-12" />}

                {/* prev */}
                {source !== 'radio' ? (
                  <button onClick={handlePrevious} disabled={spotify ? !token : false}
                    className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer disabled:opacity-25"
                    style={{ color: 'white' }}>
                    <SkipBack className="h-7 w-7 fill-current" />
                  </button>
                ) : <div className="w-14" />}

                {/* PLAY / PAUSE — the hero button */}
                <button onClick={handlePlayPause} disabled={spotify ? !token : false}
                  className="w-20 h-20 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer disabled:opacity-35"
                  style={{ background: 'white', boxShadow: '0 0 40px rgba(255,255,255,0.2)' }}>
                  {isPlaying
                    ? <Pause className="h-8 w-8 fill-black text-black" />
                    : <Play className="h-8 w-8 fill-black text-black ml-1" />}
                </button>

                {/* next */}
                {source !== 'radio' ? (
                  <button onClick={handleNext} disabled={spotify ? !token : false}
                    className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer disabled:opacity-25"
                    style={{ color: 'white' }}>
                    <SkipForward className="h-7 w-7 fill-current" />
                  </button>
                ) : (
                  <button onClick={() => setActiveTab('radio')}
                    className="w-14 h-14 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer"
                    style={{ color: 'var(--theme-color)' }}>
                    <Radio className="h-6 w-6" />
                  </button>
                )}

                {/* shuffle (right) */}
                {source !== 'radio' ? (
                  <button onClick={handleShuffle} disabled={spotify ? !token : true}
                    className="w-12 h-12 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer disabled:opacity-25"
                    style={{ color: shuffleState ? 'var(--theme-color)' : S.t2 }}>
                    <Shuffle className="h-5 w-5" />
                  </button>
                ) : <div className="w-12" />}
              </div>

              {/* ── volume ── */}
              <div className="w-full flex items-center gap-3 mb-2">
                <button onClick={handleMuteToggle} className="active:scale-90 transition-all cursor-pointer" style={{ color: S.t3 }}>
                  <VolumeX className="h-4 w-4" />
                </button>
                <div className="relative flex-1 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.2)' }}>
                  <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${isMuted ? 0 : volume}%`, background: 'white', transition: 'none' }} />
                  <input type="range" min="0" max="100" value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange} disabled={spotify ? !token : false}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default" />
                </div>
                <button onClick={() => { setIsMuted(false); setVolume(100); handleVolumeChange({ target: { value: 100 } }); }} className="active:scale-90 transition-all cursor-pointer" style={{ color: S.t3 }}>
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════ RADIO TAB ══════════════════════════════ */}
          {activeTab === 'radio' && (
            <div className="flex flex-col pt-6 pb-2">
              <div className="px-5 mb-5">
                <p className="text-[28px] font-semibold text-white" style={{ letterSpacing: '-0.5px' }}>Web Radio</p>
                <p className="text-[15px] mt-0.5" style={{ color: S.t2 }}>Search and play global streams</p>
              </div>

              {/* search */}
              <div className="px-4 mb-4 flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" style={{ color: S.t3 }} />
                  <input type="text" placeholder="Station, genre, country…" value={radioSearch}
                    onChange={e => setRadioSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRadioSearch()}
                    className="w-full rounded-full pl-10 pr-4 py-3.5 text-[15px] text-white placeholder:text-white/25 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.1)', fontFamily: S.font, letterSpacing: '-0.2px' }} />
                </div>
                <button onClick={handleRadioSearch} disabled={isSearching}
                  className="px-5 py-3.5 rounded-full text-[15px] font-semibold text-black active:scale-95 transition-all cursor-pointer disabled:opacity-50 shrink-0"
                  style={{ background: 'var(--theme-color)', fontFamily: S.font }}>
                  {isSearching ? '…' : 'Go'}
                </button>
              </div>

              {/* section label */}
              <p className="px-6 mb-2 text-[13px] font-semibold uppercase tracking-widest" style={{ color: S.t3 }}>
                {radioSearch.trim() ? `${stationsList.length} Results` : `${favoriteStations.length} Favorites`}
              </p>

              {/* station list */}
              <div className="flex flex-col gap-0 mx-4 rounded-[14px] overflow-hidden" style={{ background: S.card, border: `1px solid ${S.cardBd}` }}>
                {stationsList.length === 0 && (
                  <div className="px-4 py-8 text-center">
                    <Radio className="h-8 w-8 mx-auto mb-3" style={{ color: S.t3 }} />
                    <p className="text-[15px]" style={{ color: S.t2 }}>No favorites yet</p>
                    <p className="text-[13px] mt-1" style={{ color: S.t3 }}>Search for stations above</p>
                  </div>
                )}
                {stationsList.map((station, idx) => {
                  const isFav = favoriteStations.some(s => s.url === station.url);
                  return (
                    <React.Fragment key={`${station.url}-${idx}`}>
                      {idx > 0 && <div className="ml-16" style={{ height: '0.5px', background: S.sep }} />}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(255,255,255,0.06)' }}>
                          {station.favicon
                            ? <img src={station.favicon} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none'; }} />
                            : <Radio className="h-4 w-4" style={{ color: S.t3 }} />}
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={async () => { try { wakeKiosk(); await api.localPlayRadio(station.url, station.name, station.favicon); setSource('radio'); sendUpdate('SET_SOURCE', { spotify: false, source: 'radio' }); setActiveTab('player'); } catch (e) { toast.error(e.message); } }}>
                          <p className="text-[15px] font-medium text-white truncate" style={{ letterSpacing: '-0.15px' }}>{station.name}</p>
                          <p className="text-[12px] truncate" style={{ color: S.t3 }}>{station.country || 'Global'}{station.tags ? ` · ${station.tags.split(',')[0]}` : ''}</p>
                        </div>
                        <button onClick={() => handleToggleFavRadio(station)}
                          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-all cursor-pointer shrink-0"
                          style={{ color: isFav ? '#ff453a' : S.t3 }}>
                          <Heart className={`h-4 w-4 ${isFav ? 'fill-current' : ''}`} />
                        </button>
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══════════════════════ SEARCH TAB (Spotify) ════════════════════ */}
          {activeTab === 'search' && (
            <div className="flex flex-col pt-6 pb-2 px-4 h-full min-h-[60vh]">
              <p className="text-[28px] font-semibold text-white mb-1 px-1" style={{ letterSpacing: '-0.5px' }}>Search</p>
              {token ? (
                <TrackSearch token={token} onPlayTrack={handlePlayTrack} onPlayContext={handlePlayContext} isDrawer={true} />
              ) : (
                <div className="flex flex-col items-center justify-center gap-5 py-16">
                  <Search className="h-12 w-12" style={{ color: 'rgba(255,255,255,0.1)' }} />
                  <div className="text-center">
                    <p className="text-[17px] font-semibold text-white mb-1" style={{ letterSpacing: '-0.2px' }}>Connect Spotify</p>
                    <p className="text-[14px]" style={{ color: S.t2 }}>Sign in to search your music.</p>
                  </div>
                  <a href="/auth/spotify/login?from=remote"
                    className="py-3.5 px-8 rounded-full text-[15px] font-semibold text-black active:scale-95 transition-all cursor-pointer"
                    style={{ background: '#1ed760', fontFamily: S.font }}>
                    Connect Spotify
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ═══════════════════════ MORE TAB ═══════════════════════════════ */}
          {activeTab === 'more' && (
            <div className="flex flex-col pt-6 pb-4">
              <p className="text-[28px] font-semibold text-white mb-6 px-5" style={{ letterSpacing: '-0.5px' }}>More</p>

              {/* Sound */}
              <Section title="Sound">
                <Row label={`Equalizer · ${eqPreset}`} icon={<Sliders className="h-4 w-4" style={{ color: 'var(--theme-color)' }} />}
                  onPress={() => setShowEq(v => !v)} chevron={false}
                  value={showEq ? '▲' : '▼'} />
                {showEq && (
                  <div className="px-0 py-1" style={{ minHeight: 380 }}>
                    <EqualizerControl
                      currentPreset={eqPreset} onPresetChange={handleEqPresetChange}
                      bands={eqBands} onBandChange={handleBandChange}
                      saturation={eqSaturation} onSaturationChange={handleSaturationChange}
                      noiseFloor={eqNoiseFloor} onNoiseFloorChange={handleNoiseFloorChange}
                      preAmp={eqPreAmp} onPreAmpChange={handlePreAmpChange}
                      dspActive={dspActive} onDeactivateDsp={handleDeactivateDsp}
                    />
                  </div>
                )}
                <Row label="Room Calibration" icon={<Cpu className="h-4 w-4" style={{ color: '#ff9f0a' }} />}
                  value={dspActive ? 'Active' : 'Off'}
                  onPress={() => setIsDspWizardOpen(true)} />
              </Section>

              {/* Display */}
              <Section title="Display">
                <Row label="Theme & Appearance" icon={<Palette className="h-4 w-4" style={{ color: '#bf5af2' }} />}
                  onPress={() => setIsThemeSettingsOpen(true)} />
                <Row label="Kiosk Standby" icon={<Power className="h-4 w-4" style={{ color: standby ? S.red : S.t2 }} />}
                  value={standby ? 'On' : 'Off'}
                  onPress={() => handleToggleStandby(!standby)} chevron={false} />
              </Section>

              {/* Spotify */}
              <Section title="Spotify">
                {!token ? (
                  <div className="px-4 py-4">
                    <a href="/auth/spotify/login?from=remote"
                      className="w-full py-3.5 rounded-full flex items-center justify-center gap-2 text-[15px] font-semibold text-black active:scale-95 transition-all"
                      style={{ background: '#1ed760', display: 'flex', fontFamily: S.font }}>
                      <svg viewBox="0 0 24 24" className="h-5 w-5 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                      Connect with Spotify
                    </a>
                  </div>
                ) : (
                  <>
                    <Row label="Connected" value="✓" chevron={false} icon={
                      <svg viewBox="0 0 24 24" className="h-4 w-4" style={{ fill: '#1ed760' }}><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                    } onPress={() => {}} />
                    <Row label="Disconnect" destructive onPress={async () => { try { await fetch('/auth/spotify/logout', { method: 'POST' }); } catch { toast.error('Failed'); } }} />
                  </>
                )}
              </Section>

              {/* Cast devices */}
              {devices.length > 0 && (
                <Section title={`Cast · ${devices.length} Devices`}>
                  {devices.map(d => (
                    <Row key={d.id} label={d.name} value={d.is_active ? 'Active' : ''}
                      icon={<Laptop className="h-4 w-4" style={{ color: d.is_active ? 'var(--theme-color)' : S.t2 }} />}
                      onPress={() => { if (!token) return; api.transferPlayback(token, d.id).then(() => { toast.success('Output transferred'); setTimeout(fetchDevices, 800); requestWSStateSync(); }).catch(e => toast.error(e.message)); }} />
                  ))}
                </Section>
              )}

              {/* System */}
              <Section title="System">
                <Row label="Check for Updates" icon={<RefreshCw className={`h-4 w-4 ${updateStatus === 'checking' ? 'animate-spin' : ''}`} style={{ color: '#30d158' }} />}
                  value={updateStatus === 'no-update' ? 'Up to date' : updateStatus === 'available' ? 'Available!' : updateStatus === 'updating' ? `${otaPercent}%` : ''}
                  onPress={updateStatus === 'available' ? triggerOtaUpdate : checkUpdates}
                  chevron={updateStatus === 'available'} />
                {updateStatus === 'updating' && (
                  <div className="px-4 pb-4">
                    <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                      <div className="h-full rounded-full" style={{ width: `${otaPercent}%`, background: S.green, transition: 'width 0.3s' }} />
                    </div>
                    <div className="mt-2 max-h-16 overflow-y-auto custom-scrollbar">
                      {otaProgress.map((l, i) => <p key={i} className="text-[11px] font-mono" style={{ color: S.t3 }}>{l}</p>)}
                    </div>
                  </div>
                )}
              </Section>

              {/* Account */}
              <Section>
                <Row label="Sign Out" destructive chevron={false}
                  icon={<LogOut className="h-4 w-4" style={{ color: S.red }} />}
                  onPress={() => { eraseCookie('remote_auth'); setIsAuthenticated(false); setActiveTab('player'); }} />
              </Section>
            </div>
          )}
        </div>

        {/* ── Bottom Tab Bar ── */}
        <div className="relative z-10 shrink-0" style={{ height: NAV_H, paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'saturate(180%) blur(20px)', borderTop: '0.5px solid rgba(255,255,255,0.12)' }} />
          <div className="relative flex items-start justify-around pt-2 px-2">
            {[
              { id: 'player', Icon: Music,          label: 'Now Playing' },
              { id: 'search', Icon: Search,          label: 'Search'      },
              { id: 'radio',  Icon: Radio,           label: 'Radio'       },
              { id: 'more',   Icon: MoreHorizontal,  label: 'More'        },
            ].map(({ id, Icon, label }) => {
              const active = activeTab === id;
              return (
                <button key={id} onClick={() => setActiveTab(id)}
                  className="flex flex-col items-center gap-1 py-1 flex-1 cursor-pointer transition-all active:scale-90"
                  style={{ color: active ? 'var(--theme-color)' : S.t3 }}>
                  <Icon className="h-6 w-6" strokeWidth={active ? 2 : 1.5} />
                  <span className="text-[10px] font-medium" style={{ fontFamily: S.font, letterSpacing: '-0.05px' }}>{label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── overlays ── */}
      {isDspWizardOpen && (
        <div className="fixed inset-0 bg-[#050d1c] z-[9999] flex flex-col">
          <DspWizard
            onClose={() => { setIsDspWizardOpen(false); api.getDspCalibration().then(c => setDspActive(c && c[0] === 'dsp')).catch(() => {}); }}
            onCalibrationComplete={active => setDspActive(active)}
          />
        </div>
      )}
      {isThemeSettingsOpen && (
        <div className="fixed inset-0 z-[9999] flex flex-col p-5" style={{ background: '#000', fontFamily: S.font }}>
          <div className="flex justify-between items-center mb-5 shrink-0">
            <p className="text-[22px] font-semibold text-white" style={{ letterSpacing: '-0.3px' }}>Theme</p>
            <button onClick={() => setIsThemeSettingsOpen(false)}
              className="px-4 py-2 rounded-full text-[15px] font-semibold active:scale-95 transition-all cursor-pointer"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--theme-color)' }}>
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

      <Toaster theme="dark" closeButton richColors position="bottom-center" visibleToasts={1} />
    </>
  );
}
