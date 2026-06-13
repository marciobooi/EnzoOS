import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Volume2, 
  VolumeX, 
  Shuffle, 
  Repeat, 
  Laptop, 
  Wifi, 
  WifiOff, 
  Music, 
  RefreshCw,
  Settings,
  ChevronRight,
  LogOut,
  Radio,
  Heart,
  Power
} from 'lucide-react';
import { api } from '../api';
import { toast, Toaster } from 'sonner';
import { useResonanceWS } from '../websocket';

// Helper utilities for managing cookies
const setCookie = (name, value, days = 365) => {
  const date = new Date();
  date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
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
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(getCookie('remote_auth') === 'true');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState('player'); // 'player', 'radio', 'settings'

  // Web Radio states
  const [radioSearch, setRadioSearch] = useState('');
  const [stationsList, setStationsList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Connection and token states
  const [token, setToken] = useState('');
  const [devices, setDevices] = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  // Playback states
  const [playbackState, setPlaybackState] = useState(null);
  const [shuffleState, setShuffleState] = useState(false);
  const [repeatState, setRepeatState] = useState('off');
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);

  // OTA states
  const [updateStatus, setUpdateStatus] = useState(null);
  const [localCommit, setLocalCommit] = useState('');
  const [remoteCommit, setRemoteCommit] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [otaProgress, setOtaProgress] = useState([]);
  const [otaPercent, setOtaPercent] = useState(0);

  const [source, setSource] = useState('spotify'); // 'spotify' | 'local' | 'radio'
  const spotify = source === 'spotify';
  const [daemonUsername, setDaemonUsername] = useState('');
  const [daemonPassword, setDaemonPassword] = useState('');
  const [isSavingDaemonCreds, setIsSavingDaemonCreds] = useState(false);
  const [standby, setStandby] = useState(false);

  const hasCheckedInitialSource = useRef(false);
  useEffect(() => {
    if (source === 'radio' && !hasCheckedInitialSource.current) {
      setActiveTab('radio');
      hasCheckedInitialSource.current = true;
    }
  }, [source]);

  const progressInterval = useRef(null);
  const volumeApiTimeout = useRef(null);
  const lastVolumeChangeTime = useRef(0);

  const setVolumeWithLock = (vol) => {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setVolume(vol);
  };

  const setIsMutedWithLock = (muted) => {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setIsMuted(muted);
  };

  const [favoriteStations, setFavoriteStations] = useState([]);

  const fetchFavorites = async () => {
    try {
      const favs = await api.getFavoriteRadios();
      setFavoriteStations(favs || []);
    } catch (err) {
      console.warn('Failed to load favorite stations on remote:', err);
    }
  };

  useEffect(() => {
    if (!radioSearch.trim()) {
      setStationsList(favoriteStations);
    }
  }, [radioSearch, favoriteStations]);

  useEffect(() => {
    fetchFavorites();
  }, []);

  const handleToggleFavoriteRadio = async (station) => {
    const isFavorite = favoriteStations.some(s => s.url === station.url);
    try {
      if (isFavorite) {
        await api.deleteFavoriteRadio(station.url);
      } else {
        await api.addFavoriteRadio({
          name: station.name,
          url: station.url,
          favicon: station.favicon,
          country: station.country,
          tags: station.tags
        });
      }
      await fetchFavorites();
    } catch (err) {
      toast.error(`Favorite operation failed: ${err.message}`);
    }
  };

  const handleRadioSearch = async () => {
    const query = radioSearch.trim();
    if (!query) {
      setStationsList(favoriteStations);
      return;
    }
    try {
      setIsSearching(true);
      const res = await fetch(`https://de1.api.radio-browser.info/json/stations/byname/${encodeURIComponent(query)}?limit=25&hidebroken=true`);
      const data = await res.json();
      const formatted = data.map(s => ({
        name: s.name.length > 22 ? s.name.substring(0, 20) + '...' : s.name,
        url: s.url_resolved || s.url,
        favicon: s.favicon,
        country: s.country,
        tags: s.tags
      }));
      if (formatted.length === 0) {
        toast.error('No stations found.');
      } else {
        setStationsList(formatted);
      }
    } catch (err) {
      toast.error('Failed to search stations.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSaveDaemonCredentials = async (e) => {
    e.preventDefault();
    setIsSavingDaemonCreds(true);
    try {
      const res = await fetch('/api/spotify/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: daemonUsername, password: daemonPassword })
      });
      const data = await res.json();
      if (data.success) {
        toast.success('Spotify daemon credentials updated successfully.');
      } else {
        toast.error(data.error || 'Failed to update credentials.');
      }
    } catch (err) {
      toast.error('Failed to update credentials.');
    } finally {
      setIsSavingDaemonCreds(false);
    }
  };

  const handleToggleSource = (targetSource) => {
    let nextSource = targetSource;
    if (!targetSource || typeof targetSource !== 'string') {
      nextSource = source === 'spotify' ? 'local' : (source === 'local' ? 'radio' : 'spotify');
    }
    setSource(nextSource);
    const isSpotify = nextSource === 'spotify';
    setSpotify(isSpotify);
    sendUpdate('SET_SOURCE', { spotify: isSpotify, source: nextSource });
    
    const sourceNames = { spotify: 'Spotify', local: 'Local Media', radio: 'Web Radio' };
  };



  // Derived state
  const currentTrack = playbackState?.track_window?.current_track;
  const isPlaying = playbackState ? !playbackState.paused : false;
  const trackName = currentTrack?.name || 'Ready to Stream';
  const trackArtist = currentTrack?.artists?.map(a => a.name).join(', ') || 'No source active';
  const albumImage = currentTrack?.album?.images?.[0]?.url;
  const isCurrentFavorite = currentTrack?.url ? favoriteStations.some(s => s.url === currentTrack.url) : false;

  // Active Device Info
  const activeDevice = devices.find(d => d.is_active);
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');

  // Connect to the centralized WebSocket hook
  const { isConnected, ws, sendUpdate } = useResonanceWS({
    token,
    setToken,
    setPlaybackState,
    setTrackPosition,
    setTrackDuration,
    setShuffleState,
    setRepeatState,
    setVolume: setVolumeWithLock,
    setIsMuted: setIsMutedWithLock,
    setUpdateStatus,
    setOtaProgress,
    setOtaPercent,
    setSpotify: (isSpotify) => setSource(prev => isSpotify ? 'spotify' : (prev === 'spotify' ? 'local' : prev)),
    setSource,
    setDevices,
    onRequestSync: () => {
      localSync();
    },
    isAuthenticated,
    isRemote: true,
    setStandby
  });

  const handleToggleStandby = (enabled) => {
    setStandby(enabled);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled } }));
    }
  };

  // Poll devices & state from Spotify Web API
  useEffect(() => {
    if (!spotify) return;
    if (!isAuthenticated || !token) return;

    fetchDevices();
    localSync();

    const intervalId = setInterval(() => {
      fetchDevices();
      localSync();
    }, 10000);

    return () => clearInterval(intervalId);
  }, [token, isAuthenticated, spotify]);

  // Track progress position bar
  useEffect(() => {
    if (isAuthenticated && playbackState && isPlaying) {
      progressInterval.current = setInterval(() => {
        setTrackPosition(prev => {
          if (prev + 1000 >= trackDuration) {
            clearInterval(progressInterval.current);
            return trackDuration;
          }
          return prev + 1000;
        });
      }, 1000);
    } else {
      clearInterval(progressInterval.current);
    }

    return () => clearInterval(progressInterval.current);
  }, [playbackState, isPlaying, trackDuration, isAuthenticated]);

  // Spotify Operations
  const localSync = async () => {
    if (!spotify) return;
    if (!token) return;
    try {
      const state = await api.getPlaybackState(token);
      if (state) {
        const newState = {
          paused: !state.is_playing,
          position: state.progress_ms,
          duration: state.item?.duration_ms || 0,
          shuffle_state: state.shuffle_state,
          repeat_state: state.repeat_state,
          volume: state.device?.volume_percent !== undefined ? state.device.volume_percent : volume,
          is_muted: state.device?.volume_percent !== undefined ? (state.device.volume_percent === 0) : isMuted,
          track_window: {
            current_track: {
              uri: state.item?.uri,
              name: state.item?.name,
              album: {
                name: state.item?.album?.name,
                images: state.item?.album?.images || []
              },
              artists: state.item?.artists || []
            }
          }
        };
        setPlaybackState(newState);
        setTrackPosition(state.progress_ms);
        setTrackDuration(state.item?.duration_ms || 0);
        setShuffleState(state.shuffle_state);
        setRepeatState(state.repeat_state);
        if (state.device?.volume_percent !== undefined) {
          if (Date.now() - lastVolumeChangeTime.current >= 2500) {
            setVolume(state.device.volume_percent);
            setIsMuted(state.device.volume_percent === 0);
          }
        }
      }
    } catch (err) {
      console.warn('Local state fetch failed:', err);
    }
  };

  const checkUpdates = async () => {
    try {
      setUpdateStatus('checking');
      const data = await api.getUpdateStatus();
      if (data.updateAvailable) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('no-update');
      }
      setLocalCommit(data.localCommit || '');
      setRemoteCommit(data.remoteCommit || '');
    } catch (err) {
      console.error('[OTA] Failed to check for system updates:', err);
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Failed to check updates.');
    }
  };

  const triggerOtaUpdate = async () => {
    try {
      setOtaProgress([]);
      setOtaPercent(0);
      setUpdateStatus('updating');
      await api.triggerUpdate();
    } catch (err) {
      console.error('[OTA] Failed to trigger update installation:', err);
      setUpdateStatus('error');
      setErrorMessage(err.message || 'Failed to start update.');
    }
  };

  const fetchDevices = async () => {
    if (!token) return;
    try {
      setIsFetchingDevices(true);
      const data = await api.getDevices(token);
      setDevices(data.devices || []);
    } catch (err) {
      console.error('Error fetching cast devices:', err);
    } finally {
      setIsFetchingDevices(false);
    }
  };

  const requestWSStateSync = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
    }
  };

  const handlePlayPause = async () => {
    if (!spotify) {
      try {
        const isPaused = playbackState ? playbackState.paused : true;
        if (isPaused) {
          await api.localPlay();
          setPlaybackState(prev => ({ ...prev, paused: false }));
        } else {
          await api.localPause();
          setPlaybackState(prev => ({ ...prev, paused: true }));
        }
      } catch (err) {
        toast.error(`Local action failed: ${err.message}`);
      }
      return;
    }
    if (!token) return;
    try {
      if (isPlaying) {
        await api.pause(token);
      } else {
        const targetId = activeDevice?.id || resonanceDevice?.id || null;
        await api.play(token, targetId);
      }
      requestWSStateSync();
    } catch (err) {
      toast.error(`Control failed: ${err.message}`);
    }
  };

  const handleNext = async () => {
    if (!spotify) {
      try {
        await api.localNext();
      } catch (err) {
        toast.error(`Local skip failed: ${err.message}`);
      }
      return;
    }
    if (!token) return;
    try {
      await api.skipNext(token);
      requestWSStateSync();
    } catch (err) {
      toast.error(`Skip next failed: ${err.message}`);
    }
  };

  const handlePrevious = async () => {
    if (!spotify) {
      try {
        await api.localPrevious();
      } catch (err) {
        toast.error(`Local back failed: ${err.message}`);
      }
      return;
    }
    if (!token) return;
    try {
      await api.skipPrevious(token);
      requestWSStateSync();
    } catch (err) {
      toast.error(`Skip previous failed: ${err.message}`);
    }
  };

  const handleShuffle = async () => {
    if (!spotify) return;
    if (!token) return;
    const nextShuffle = !shuffleState;
    setShuffleState(nextShuffle);
    try {
      await api.setShuffle(token, nextShuffle);
      requestWSStateSync();
    } catch (err) {
      setShuffleState(!nextShuffle);
      toast.error(`Shuffle failed: ${err.message}`);
    }
  };

  const handleRepeat = async () => {
    if (!spotify) return;
    if (!token) return;
    const cycles = { 'off': 'context', 'context': 'track', 'track': 'off' };
    const nextRepeat = cycles[repeatState] || 'off';
    setRepeatState(nextRepeat);
    try {
      await api.setRepeat(token, nextRepeat);
      requestWSStateSync();
    } catch (err) {
      setRepeatState(repeatState);
      toast.error(`Repeat failed: ${err.message}`);
    }
  };

  const handleSeek = async (e) => {
    const seekMs = parseInt(e.target.value, 10);
    setTrackPosition(seekMs);
    if (!spotify) {
      try {
        const percent = trackDuration ? Math.round((seekMs / trackDuration) * 100) : 0;
        await api.localSeek(`${percent}%`);
      } catch (err) {
        console.error('Local seek error:', err);
      }
      return;
    }
    if (!token) return;
    try {
      await api.seek(token, seekMs);
      requestWSStateSync();
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  // Instant volume changes synchronized via WebSocket
  const handleVolumeChange = (e) => {
    const newVol = parseInt(e.target.value, 10);
    setVolume(newVol);
    setIsMuted(newVol === 0);
    lastVolumeChangeTime.current = Date.now();

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'BROADCAST_STATE',
        payload: {
          ...playbackState,
          volume: newVol,
          is_muted: newVol === 0
        }
      }));
    }

    if (volumeApiTimeout.current) {
      clearTimeout(volumeApiTimeout.current);
    }

    volumeApiTimeout.current = setTimeout(async () => {
      if (!spotify) {
        try {
          await api.localSetVolume(newVol);
        } catch (err) {
          console.error('Local volume failed:', err);
        }
        return;
      }
      if (!token) return;
      try {
        await api.setVolume(token, newVol);
      } catch (err) {
        console.warn('Spotify volume API warning (no active session):', err);
      }
    }, 180);
  };

  const handleMuteToggle = async () => {
    const newMute = !isMuted;
    setIsMuted(newMute);
    lastVolumeChangeTime.current = Date.now();
    const targetVol = newMute ? 0 : (volume || 50);

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'BROADCAST_STATE',
        payload: {
          ...playbackState,
          volume: targetVol,
          is_muted: newMute
        }
      }));
    }

    if (!spotify) {
      try {
        await api.localSetVolume(targetVol);
      } catch (err) {
        console.error('Local volume mute failed:', err);
      }
      return;
    }

    if (!token) return;
    try {
      await api.setVolume(token, targetVol);
    } catch (err) {
      console.warn('Spotify volume mute warning:', err);
    }
  };

  const handleCast = async (deviceId) => {
    try {
      await api.transferPlayback(token, deviceId);
      toast.success('Casting output target transferred.');
      setTimeout(fetchDevices, 800);
      requestWSStateSync();
    } catch (err) {
      toast.error(`Cast failed: ${err.message}`);
    }
  };



  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (usernameInput === 'enzo' && passwordInput === 'enzoOS') {
      setCookie('remote_auth', 'true', 365);
      setIsAuthenticated(true);
      toast.success('Access Authorized');
    } else {
      toast.error('Invalid credentials');
    }
  };

  const handleRemoteLogout = () => {
    eraseCookie('remote_auth');
    setIsAuthenticated(false);
    setActiveTab('player');
  };

  const formatTime = (ms) => {
    if (!ms || isNaN(ms)) return '0:00';
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // 1. Render Login Form if not authorized
  if (!isAuthenticated) {
    return (
      <>
        <div className="w-full min-h-screen text-zinc-800 font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
          
          {/* Background Ambience Glow */}
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[120%] aspect-square rounded-full bg-gradient-to-b from-zinc-100 to-transparent blur-3xl pointer-events-none" />

          <div className="w-full max-w-sm bg-white border border-zinc-100 rounded-2xl p-8 shadow-2xl flex flex-col gap-6 z-10">
            <div className="text-center flex flex-col gap-2">
              <h2 className="text-lg font-bold text-zinc-900 uppercase tracking-[0.2em] drop-shadow-[0_0_15px_rgba(0,0,0,0.02)]">Resonance</h2>
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">Remote Control Access</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold">Username</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter username"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-300"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-300"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-zinc-900 text-white font-extrabold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-zinc-800 mt-2"
              >
                Authorize Device
              </button>
            </form>
          </div>
        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-right" visibleToasts={1} />
      </>
    );
  }

  // 2. Render normal remote dashboard if authenticated
    return (
      <>
        {standby && (
          <div className="absolute inset-0 bg-black z-[9999] flex items-center justify-center flex-col animate-fade-in">
            <button
              onClick={() => handleToggleStandby(false)}
              className="group flex flex-col items-center justify-center gap-4 cursor-pointer focus:outline-none transition-all active:scale-95 screensaver-float"
              type="button"
              aria-label="Power on system"
            >
              <div className="w-20 h-20 rounded-full border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 flex items-center justify-center transition-all duration-500 shadow-inner group-hover:scale-105">
                <Power className="h-8 w-8 text-white/10 group-hover:text-white/30 transition-colors duration-500" />
              </div>
              <span className="text-[9px] uppercase tracking-[0.25em] text-white/5 group-hover:text-white/15 transition-colors duration-500 font-sans font-extrabold mt-1">
                Tap to Wake System
              </span>
            </button>
          </div>
        )}
        <div className="w-full min-h-screen text-zinc-800 font-sans flex flex-col items-center justify-between pb-6 pt-6 px-6 relative overflow-hidden select-none">
          
          {/* Background Ambience Glow */}
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[120%] aspect-square rounded-full bg-gradient-to-b from-zinc-100 to-transparent blur-3xl pointer-events-none" />

          {/* Header */}
          <header className="w-full max-w-md flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-bold tracking-[0.2em] text-zinc-800 uppercase">
                Resonance Control
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleToggleStandby(!standby)}
                className={`p-2 rounded-full hover:bg-zinc-100 active:scale-90 transition-all cursor-pointer ${
                  standby ? 'text-rose-500 bg-rose-50' : 'text-zinc-500 hover:text-zinc-900'
                }`}
                title={standby ? 'Wake up' : 'Standby'}
              >
                <Power className="h-4 w-4" />
              </button>
              <button 
                onClick={fetchDevices}
                disabled={!token}
                className="p-2 rounded-full hover:bg-zinc-100 active:scale-90 transition-all text-zinc-500 hover:text-zinc-900 cursor-pointer disabled:opacity-35"
                title="Refresh devices"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingDevices ? 'animate-spin text-zinc-900' : ''}`} />
              </button>
            </div>
          </header>

          {/* Main Content Area (Tab Swapping) */}
          <main className="w-full max-w-md flex-grow flex flex-col justify-center gap-6 z-10 mt-4 overflow-y-auto max-h-[calc(100vh-190px)] custom-scrollbar pb-2">
            
            {/* TAB 1: PLAYER */}
            {activeTab === 'player' && (
              <div className="flex flex-col gap-6 w-full justify-center">
                {/* Album Artwork Panel */}
                <div className="w-full flex justify-center">
                  <div className="w-[60vw] max-w-[240px] aspect-square rounded-[2rem] bg-white border border-zinc-100 overflow-hidden shadow-lg flex items-center justify-center relative group">
                    {albumImage ? (
                      <img 
                        src={albumImage} 
                        alt={trackName} 
                        className="w-full h-full object-cover select-none pointer-events-none scale-100 transition-all duration-700" 
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-zinc-400">
                        <Music className="h-10 w-10 stroke-[1.25] text-zinc-350" />
                        <span className="text-[8px] uppercase tracking-widest font-extrabold text-zinc-350">Resonance</span>
                      </div>
                    )}
                    
                    {/* Ambient artwork shadow/glow under art */}
                    {albumImage && (
                      <div 
                        className="absolute inset-0 -z-10 scale-95 opacity-20 blur-2xl transition-all duration-700"
                        style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover' }}
                      />
                    )}
                  </div>
                </div>

                {/* Track Title and Artist details */}
                <div className="w-full text-center flex flex-col gap-1 px-4">
                  <h2 className="text-base font-bold text-zinc-900 tracking-tight leading-snug truncate">
                    {trackName}
                  </h2>
                  <p className="text-[11px] font-semibold text-zinc-500 tracking-normal truncate">
                    {trackArtist}
                  </p>
                  {activeDevice && (
                    <div className="inline-flex items-center gap-1 justify-center mt-1 text-[8px] font-bold text-zinc-650 uppercase tracking-[0.15em] bg-zinc-50 border border-zinc-200 px-2.5 py-0.5 rounded-full self-center">
                      <Laptop className="h-2.5 w-2.5" />
                      <span>Playing on: {activeDevice.name}</span>
                    </div>
                  )}
                </div>

                {/* Auth status block when token is missing */}
                {spotify && !token && (
                  <div className="mx-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-center flex flex-col gap-3">
                    <p className="text-[10px] text-amber-600 font-medium leading-relaxed">
                      Resonance is not authenticated to Spotify. Connect your account to synchronize playback.
                    </p>
                    <a
                      href="/auth/spotify/login?from=remote"
                      className="w-full py-2.5 px-3 rounded-xl bg-[#1ed760] hover:bg-[#1fdf64] active:scale-95 text-xs text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 no-underline"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                      Login with Spotify
                    </a>
                  </div>
                )}

                {/* Position / Progress Bar Slider */}
                {source !== 'radio' && (
                  <div className="w-full px-2 flex flex-col gap-1.5">
                    <input
                      type="range"
                      min="0"
                      max={trackDuration}
                      value={trackPosition}
                      onChange={handleSeek}
                      disabled={spotify ? (!token || !trackDuration) : !trackDuration}
                      className="w-full h-1 bg-zinc-200 hover:bg-zinc-300 rounded-lg appearance-none cursor-pointer accent-zinc-900 transition-all focus:outline-none"
                      style={{
                        background: `linear-gradient(to right, #18181b 0%, #18181b ${
                          trackDuration ? (trackPosition / trackDuration) * 100 : 0
                        }%, rgba(0, 0, 0, 0.06) ${
                          trackDuration ? (trackPosition / trackDuration) * 100 : 0
                        }%, rgba(0, 0, 0, 0.06) 100%)`
                      }}
                    />
                    <div className="flex justify-between items-center text-[10px] text-zinc-500 font-semibold font-mono">
                      <span>{formatTime(trackPosition)}</span>
                      <span>{formatTime(trackDuration)}</span>
                    </div>
                  </div>
                )}

                {/* Media Playback Controls Row */}
                <div className="w-full flex items-center justify-between px-6 mt-1">
                  {source !== 'radio' ? (
                    <button
                      onClick={handleShuffle}
                      disabled={spotify ? !token : true}
                      className={`p-2 rounded-full transition-all active:scale-90 cursor-pointer disabled:opacity-20 ${
                        shuffleState ? 'text-zinc-800 font-bold drop-shadow-[0_0_8px_rgba(0,0,0,0.1)]' : 'text-zinc-400 hover:text-zinc-700'
                      }`}
                    >
                      <Shuffle className="h-4 w-4" />
                    </button>
                  ) : currentTrack?.url ? (
                    <button
                      onClick={() => handleToggleFavoriteRadio({
                        name: trackName,
                        url: currentTrack.url,
                        favicon: albumImage || '',
                        country: '',
                        tags: ''
                      })}
                      className={`p-2 rounded-full transition-all active:scale-90 cursor-pointer ${
                        isCurrentFavorite ? 'text-rose-500 font-bold drop-shadow-[0_0_8px_rgba(251,113,133,0.2)]' : 'text-zinc-400 hover:text-zinc-700'
                      }`}
                      title={isCurrentFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Heart className={`h-5 w-5 ${isCurrentFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                    </button>
                  ) : (
                    <div className="w-8" />
                  )}

                  {source !== 'radio' ? (
                    <button
                      onClick={handlePrevious}
                      disabled={spotify ? !token : false}
                      className="p-2 rounded-full hover:bg-zinc-100 text-zinc-700 active:scale-90 transition-all cursor-pointer disabled:opacity-20"
                    >
                      <SkipBack className="h-5 w-5 fill-current" />
                    </button>
                  ) : (
                    <div className="w-8" />
                  )}

                  {/* Large circular Play/Pause Button */}
                  <button
                    onClick={handlePlayPause}
                    disabled={spotify ? !token : false}
                    className="h-14 w-14 rounded-full bg-zinc-900 text-white flex items-center justify-center shadow-lg active:scale-90 transition-all cursor-pointer hover:bg-zinc-800 disabled:opacity-50"
                  >
                    {isPlaying ? (
                      <Pause className="h-5 w-5 fill-current text-white" />
                    ) : (
                      <Play className="h-5 w-5 fill-current text-white ml-0.5" />
                    )}
                  </button>

                  {source !== 'radio' ? (
                    <button
                      onClick={handleNext}
                      disabled={spotify ? !token : false}
                      className="p-2 rounded-full hover:bg-zinc-100 text-zinc-700 active:scale-90 transition-all cursor-pointer disabled:opacity-20"
                    >
                      <SkipForward className="h-5 w-5 fill-current" />
                    </button>
                  ) : (
                    <div className="w-8" />
                  )}

                  {source !== 'radio' ? (
                    <button
                      onClick={handleRepeat}
                      disabled={spotify ? !token : true}
                      className={`p-2 rounded-full transition-all active:scale-90 cursor-pointer disabled:opacity-20 ${
                        repeatState !== 'off' ? 'text-zinc-800 font-bold drop-shadow-[0_0_8px_rgba(0,0,0,0.1)]' : 'text-zinc-400 hover:text-zinc-700'
                      }`}
                    >
                      <Repeat className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveTab('radio')}
                      className="p-2 rounded-full transition-all active:scale-90 cursor-pointer text-zinc-400 hover:text-zinc-700"
                      title="Search web radio"
                    >
                      <Radio className="h-5 w-5 text-amber-500" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* TAB 2: WEB RADIO */}
            {activeTab === 'radio' && (
              <div className="w-full flex flex-col gap-4 text-left px-1">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-extrabold text-zinc-900 uppercase tracking-wider">Web Radio Search</h3>
                  <p className="text-[9px] text-zinc-400 uppercase tracking-wider font-extrabold">Tune into global streams</p>
                </div>

                {/* Search field */}
                <div className="flex gap-2 w-full">
                  <input
                    type="text"
                    placeholder="Search (e.g. Jazz, BBC, Lofi)..."
                    value={radioSearch}
                    onChange={(e) => setRadioSearch(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        handleRadioSearch();
                      }
                    }}
                    className="flex-grow bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs text-zinc-800 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-300"
                  />
                  <button
                    onClick={handleRadioSearch}
                    disabled={isSearching}
                    className="px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                  >
                    {isSearching ? '...' : 'Search'}
                  </button>
                </div>

                {/* List label: "FAVORITE STATIONS" or "SEARCH RESULTS" */}
                <div className="flex justify-between items-center text-[9px] uppercase tracking-wider font-extrabold text-zinc-400 px-1 mt-1">
                  <span>{radioSearch.trim() ? 'Search Results' : 'Favorite Stations'}</span>
                  <span>({stationsList.length})</span>
                </div>

                {/* Stations Results List */}
                <div className="flex flex-col gap-2 overflow-y-auto max-h-[calc(100vh-270px)] pr-1 custom-scrollbar">
                  {stationsList.map((station, idx) => {
                    const isFavorite = favoriteStations.some(s => s.url === station.url);
                    return (
                      <div
                        key={`${station.url}-${idx}`}
                        className="w-full p-3.5 rounded-2xl bg-white border border-zinc-100 hover:border-zinc-300 text-left flex items-center justify-between transition-all shadow-sm hover:shadow group"
                      >
                        <button
                          onClick={async () => {
                            try {
                              await api.localPlayRadio(station.url, station.name, station.favicon);
                              if (spotify) {
                                setSpotify(false);
                                sendUpdate('SET_SOURCE', { spotify: false });
                              }
                            } catch (err) {
                              toast.error(`Failed to play radio: ${err.message}`);
                            }
                          }}
                          className="flex items-center gap-3 min-w-0 flex-grow text-left cursor-pointer bg-transparent border-none p-0 outline-none"
                        >
                          <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-150 shrink-0 overflow-hidden relative">
                            {station.favicon ? (
                              <img 
                                src={station.favicon} 
                                alt="" 
                                className="w-full h-full object-cover"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                            ) : null}
                            <Radio className="w-3.5 h-3.5 text-zinc-650 shrink-0 absolute" style={{ zIndex: -1 }} />
                          </div>
                          <div className="min-w-0 flex flex-col">
                            <span className="text-[11px] font-bold text-zinc-800 truncate">{station.name}</span>
                            <span className="text-[8px] font-mono text-zinc-400 tracking-wider uppercase truncate">
                              {station.country ? `${station.country}` : 'Global'}{station.tags ? ` • ${station.tags.split(',')[0]}` : ''}
                            </span>
                          </div>
                        </button>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavoriteRadio(station);
                            }}
                            className="p-2 rounded-full hover:bg-zinc-50 text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
                          >
                            <Heart className={`w-3.5 h-3.5 ${isFavorite ? 'text-rose-500 fill-rose-500' : ''}`} />
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await api.localPlayRadio(station.url, station.name, station.favicon);
                                if (spotify) {
                                  setSpotify(false);
                                  sendUpdate('SET_SOURCE', { spotify: false });
                                }
                              } catch (err) {
                                toast.error(`Failed to play radio: ${err.message}`);
                              }
                            }}
                            className="text-[8px] bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded font-extrabold text-zinc-600 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all uppercase tracking-wider cursor-pointer"
                          >
                            PLAY
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: SETTINGS */}
            {activeTab === 'settings' && (
              <div className="w-full flex flex-col gap-4 text-left px-1">
                <div className="flex flex-col gap-0.5">
                  <h3 className="text-sm font-extrabold text-zinc-950 uppercase tracking-wider">Control Configuration</h3>
                  <p className="text-[9px] text-zinc-400 uppercase tracking-wider font-extrabold">Device and cast parameters</p>
                </div>

                {/* Active Source Toggle */}
                <div className="flex flex-col gap-2 bg-zinc-50 border border-zinc-100 p-3 rounded-xl">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-700 font-semibold">Active Plugin Source</span>
                  <div className="grid grid-cols-3 gap-2">
                    {['spotify', 'local', 'radio'].map(src => (
                      <button
                        key={src}
                        onClick={() => handleToggleSource(src)}
                        className={`py-2 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer border text-center ${
                          source === src 
                            ? 'bg-zinc-900 border-zinc-950 text-white' 
                            : 'bg-white border-zinc-200 text-zinc-650 hover:bg-zinc-50'
                        }`}
                      >
                        {src === 'spotify' ? 'Spotify' : (src === 'local' ? 'Local' : 'Radio')}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Spotify Web Access Keyway */}
                <div className="flex flex-col gap-2 bg-zinc-50/50 border border-zinc-100 p-3 rounded-xl">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-zinc-700 font-semibold">
                    <span>Spotify Web Access</span>
                    {token ? (
                      <span className="text-[8px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-650 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        AUTHORIZED
                      </span>
                    ) : (
                      <span className="text-[8px] bg-rose-500/10 border border-rose-500/30 text-rose-650 px-2 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
                        REQUIRED
                      </span>
                    )}
                  </div>
                  
                  {!token ? (
                    <a
                      href="/auth/spotify/login?from=remote"
                      className="w-full py-2.5 px-3 rounded-xl bg-[#1ed760] hover:bg-[#1fdf64] active:scale-95 text-xs text-black font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 no-underline"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-black shrink-0"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424a.622.622 0 01-.857.207c-2.348-1.435-5.304-1.76-8.785-.964a.622.622 0 01-.277-1.215c3.809-.87 7.077-.496 9.712 1.115a.622.622 0 01.207.857zm1.223-2.722a.779.779 0 01-1.07.257c-2.687-1.652-6.785-2.131-9.965-1.166a.78.78 0 01-.973-.519.781.781 0 01.519-.972c3.632-1.102 8.147-.568 11.233 1.33a.779.779 0 01.256 1.07zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71a.935.935 0 11-.543-1.79c3.533-1.072 9.404-.866 13.115 1.338a.936.936 0 01-.955 1.609z"/></svg>
                      Login with Spotify
                    </a>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch('/auth/spotify/logout', { method: 'POST' });
                          const data = await res.json();
                        } catch (err) {
                          toast.error('Logout failed');
                        }
                      }}
                      className="w-full py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 font-bold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-rose-500/20 animate-none"
                    >
                      Disconnect Spotify Account
                    </button>
                  )}
                </div>

                {/* Spotify Connect pairing instructions */}
                <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-zinc-50 border border-zinc-100 text-[9px] text-zinc-600">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-700 font-bold">Spotify Connect pairing</span>
                  <p className="leading-relaxed">
                    To pair your account, just select and play to <strong className="text-zinc-900">"Resonance Connect"</strong> once from your official Spotify app on this network.
                  </p>
                </div>

                {/* Cast Active Devices */}
                <div className="border border-zinc-100 p-3 rounded-xl bg-zinc-50/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-zinc-700 font-semibold">
                    <span>Cast Active Devices</span>
                    <span className="text-[8px] bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-zinc-700">{devices.length} Found</span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {devices.length > 0 ? (
                      devices.map(device => (
                        <button
                          key={device.id}
                          onClick={() => handleCast(device.id)}
                          className={`w-full p-2 rounded-xl border flex items-center justify-between text-left transition-all active:scale-98 cursor-pointer ${
                            device.is_active 
                              ? 'bg-white border-zinc-300 text-zinc-900 font-bold' 
                              : 'bg-transparent border-transparent text-zinc-500 hover:bg-zinc-150 hover:text-zinc-900'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Laptop className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-[11px] truncate max-w-[150px]">{device.name}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[8px] uppercase tracking-wider text-zinc-500">
                              {device.is_active ? 'Active' : 'Cast'}
                            </span>
                            <ChevronRight className="h-3 w-3 text-zinc-500" />
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-[10px] text-zinc-400 italic text-center py-2">No audio players detected on network</div>
                    )}
                  </div>
                </div>
     
                {/* System Updates */}
                <div className="border border-zinc-100 p-3 rounded-xl bg-zinc-50/50 flex flex-col gap-2">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-zinc-700 font-semibold">
                    <span>System Updates</span>
                    <span className="text-[8px] bg-zinc-100 border border-zinc-200 px-1.5 py-0.5 rounded text-zinc-700">OTA</span>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {updateStatus === null && (
                      <button
                        onClick={checkUpdates}
                        className="w-full py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider text-zinc-700"
                      >
                        Check for Updates
                      </button>
                    )}

                    {updateStatus === 'checking' && (
                      <div className="w-full py-2.5 rounded-xl border border-zinc-200 bg-white flex justify-center items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-700">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Checking...
                      </div>
                    )}

                    {updateStatus === 'no-update' && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-600 text-[10px] font-mono leading-normal text-center">
                          ✓ System is up to date
                        </div>
                        <button
                          onClick={checkUpdates}
                          className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-zinc-500 hover:text-zinc-800 transition-all"
                        >
                          Check Again
                        </button>
                      </div>
                    )}

                    {updateStatus === 'available' && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-600 text-[10px] font-mono leading-normal text-center">
                          ⚠️ Update Available
                        </div>
                        <button
                          onClick={triggerOtaUpdate}
                          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider text-black"
                        >
                          Install Update
                        </button>
                      </div>
                    )}

                    {updateStatus === 'updating' && (
                      <div className="p-3 rounded-xl border border-zinc-200 bg-white flex flex-col gap-3">
                        <div className="flex justify-between items-center text-[10px] text-zinc-900 font-bold uppercase">
                          <span>Installing</span>
                          <span>{otaPercent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-200 rounded-full overflow-hidden">
                          <div className="h-full bg-zinc-900 transition-all" style={{ width: `${otaPercent}%` }} />
                        </div>
                        <div className="h-20 overflow-y-auto text-[8px] font-mono text-zinc-600 flex flex-col gap-0.5 custom-scrollbar">
                          {otaProgress.map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                      </div>
                    )}

                    {updateStatus === 'error' && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-600 text-[10px] font-mono leading-normal text-center">
                          Update Failed
                        </div>
                        <button
                          onClick={checkUpdates}
                          className="w-full py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-50 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider text-zinc-700"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2">
                  <button
                    onClick={handleRemoteLogout}
                    className="w-full py-2.5 rounded-xl border border-rose-500/20 text-rose-600 bg-rose-500/5 hover:bg-rose-500/10 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>De-authorize Remote</span>
                  </button>
                </div>
              </div>
            )}

          </main>

          {/* Sleek bottom Volume control bar and Footer Tabs stacked */}
          <footer className="w-full max-w-md z-10 px-2 mt-4 flex flex-col gap-3">
            {/* Volume bar */}
            <div className="bg-white border border-zinc-100 rounded-2xl px-4 py-3 flex items-center gap-3.5 shadow-lg">
              <button 
                onClick={handleMuteToggle}
                disabled={spotify ? !token : false}
                className="text-zinc-500 hover:text-zinc-800 active:scale-90 transition-all cursor-pointer disabled:opacity-25"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
              
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                disabled={spotify ? !token : false}
                className="flex-grow h-1 bg-zinc-200 hover:bg-zinc-300 rounded-lg appearance-none cursor-pointer accent-zinc-900 transition-all focus:outline-none"
                style={{
                  background: `linear-gradient(to right, #18181b 0%, #18181b ${
                    isMuted ? 0 : volume
                  }%, rgba(0, 0, 0, 0.06) ${
                    isMuted ? 0 : volume
                  }%, rgba(0, 0, 0, 0.06) 100%)`
                }}
              />
              
              <span className="text-[10px] text-zinc-600 font-semibold font-mono w-7 text-right">
                {isMuted ? 0 : volume}%
              </span>
            </div>

            {/* Premium navigation bar */}
            <div className="bg-white/95 backdrop-blur-md rounded-2xl px-2 py-1.5 flex justify-around items-center shadow-lg">
              <button
                onClick={() => setActiveTab('player')}
                className={`flex flex-col items-center justify-center py-1 flex-1 cursor-pointer transition-all active:scale-95 ${
                  activeTab === 'player' ? 'text-zinc-900 font-bold' : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <Music className="h-4 w-4 mb-0.5" />
                <span className="text-[8px] uppercase tracking-wider font-extrabold font-sans">Player</span>
              </button>

              <button
                onClick={() => setActiveTab('radio')}
                className={`flex flex-col items-center justify-center py-1 flex-1 cursor-pointer transition-all active:scale-95 ${
                  activeTab === 'radio' ? 'text-zinc-900 font-bold' : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <Radio className="h-4 w-4 mb-0.5" />
                <span className="text-[8px] uppercase tracking-wider font-extrabold font-sans">Radio</span>
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`flex flex-col items-center justify-center py-1 flex-1 cursor-pointer transition-all active:scale-95 ${
                  activeTab === 'settings' ? 'text-zinc-900 font-bold' : 'text-zinc-400 hover:text-zinc-700'
                }`}
              >
                <Settings className="h-4 w-4 mb-0.5" />
                <span className="text-[8px] uppercase tracking-wider font-extrabold font-sans">Settings</span>
              </button>
            </div>
          </footer>

        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-right" visibleToasts={1} />
      </>
    );
}
