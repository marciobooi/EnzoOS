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
  LogOut
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

  // Connection and token states
  const [token, setToken] = useState('');
  const [devices, setDevices] = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

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

  const [spotify, setSpotify] = useState(true);
  const [daemonUsername, setDaemonUsername] = useState('');
  const [daemonPassword, setDaemonPassword] = useState('');
  const [isSavingDaemonCreds, setIsSavingDaemonCreds] = useState(false);

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

  const handleSaveDaemonCredentials = async (e) => {
    e.preventDefault();
    if (!daemonUsername.trim() || !daemonPassword.trim()) {
      toast.error('Username and password are required.');
      return;
    }
    try {
      setIsSavingDaemonCreds(true);
      await api.setSpotifyCredentials(daemonUsername.trim(), daemonPassword.trim());
      toast.success('Spotify Daemon credentials updated! Restarting service...');
      setDaemonUsername('');
      setDaemonPassword('');
    } catch (err) {
      console.error('Failed to save daemon credentials:', err);
      toast.error(`Failed to update credentials: ${err.message}`);
    } finally {
      setIsSavingDaemonCreds(false);
    }
  };

  const handleToggleSource = () => {
    const nextSpotify = !spotify;
    setSpotify(nextSpotify);
    sendUpdate('SET_SOURCE', { spotify: nextSpotify });
    toast.success(`Source set to: ${nextSpotify ? 'Spotify' : 'Local Media'}`);
  };

  // Derived state
  const currentTrack = playbackState?.track_window?.current_track;
  const isPlaying = playbackState ? !playbackState.paused : false;
  const trackName = currentTrack?.name || 'Ready to Stream';
  const trackArtist = currentTrack?.artists?.map(a => a.name).join(', ') || 'No source active';
  const albumImage = currentTrack?.album?.images?.[0]?.url;

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
    setSpotify,
    setDevices,
    onRequestSync: () => {
      localSync();
    },
    isAuthenticated,
    isRemote: true
  });

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
        console.error('Spotify volume API failed:', err);
        toast.error(`Volume change failed: ${err.message}`);
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

    try {
      await api.setVolume(token, targetVol);
    } catch (err) {
      console.error('Spotify volume mute failed:', err);
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
    setShowSettings(false);
    toast.info('De-authorized Remote connection');
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
        <div className="w-full min-h-screen text-[#f1f3f6] font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden select-none">
          
          {/* Background Ambience Glow */}
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[120%] aspect-square rounded-full bg-gradient-to-b from-[#2e3746]/10 to-transparent blur-3xl pointer-events-none" />

          <div className="w-full max-w-sm bg-[#13161c] border border-white/5 rounded-2xl p-8 shadow-2xl flex flex-col gap-6 z-10">
            <div className="text-center flex flex-col gap-2">
              <h2 className="text-lg font-bold text-white uppercase tracking-[0.2em] drop-shadow-[0_0_15px_rgba(255,255,255,0.08)]">Resonance</h2>
              <p className="text-[10px] font-semibold text-[#ffffff] uppercase tracking-wider">Remote Control Access</p>
            </div>

            <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-[#ffffff] font-bold">Username</label>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter username"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-white/10"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[9px] uppercase tracking-wider text-[#ffffff] font-bold">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-black/40 border border-white/5 rounded-xl px-4 py-3 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:border-white/10"
                  required
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-white text-black font-extrabold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-zinc-200 mt-2"
              >
                Authorize Device
              </button>
            </form>
          </div>
        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-right" />
      </>
    );
  }

  // 2. Render normal remote dashboard if authenticated
    return (
      <>
        <div className="w-full min-h-screen text-[#f1f3f6] font-sans flex flex-col items-center justify-between pb-10 pt-6 px-6 relative overflow-hidden select-none">
          
          {/* Background Ambience Glow */}
          <div className="absolute top-[-20%] left-1/2 -translate-x-1/2 w-[120%] aspect-square rounded-full bg-gradient-to-b from-[#2e3746]/10 to-transparent blur-3xl pointer-events-none" />

          {/* Header */}
          <header className="w-full max-w-md flex items-center justify-between z-10">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="text-[11px] font-bold tracking-[0.2em] text-[#ffffff] uppercase">
                Resonance Control
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={fetchDevices}
                disabled={!token}
                className="p-2 rounded-full hover:bg-white/5 active:scale-90 transition-all text-[#ffffff] hover:text-white cursor-pointer disabled:opacity-35"
                title="Refresh devices"
              >
                <RefreshCw className={`h-4 w-4 ${isFetchingDevices ? 'animate-spin text-white' : ''}`} />
              </button>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 rounded-full hover:bg-white/5 active:scale-90 transition-all text-[#ffffff] hover:text-white cursor-pointer"
              >
                <Settings className="h-4 w-4" />
              </button>
            </div>
          </header>

          {/* Settings / Token Section */}
          {showSettings && (
            <div className="absolute inset-0 bg-[#090b0e]/95 z-20 flex flex-col justify-center items-center p-6 backdrop-blur-md">
              <div className="w-full max-w-sm bg-[#13161c] border border-white/5 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">Control Configuration</h3>
                  <button 
                    onClick={() => setShowSettings(false)}
                    className="text-xs text-[#ffffff] hover:text-white font-bold"
                  >
                    Close
                  </button>
                </div>

                {/* Active Source Toggle */}
                <div className="flex justify-between items-center bg-white/2 border border-white/5 p-3 rounded-xl">
                  <span className="text-[10px] uppercase tracking-wider text-[#ffffff] font-semibold">Active Plugin Source</span>
                  <button
                    onClick={handleToggleSource}
                    className={`px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-all cursor-pointer ${
                      spotify 
                        ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                        : 'bg-amber-500/10 border border-amber-500/30 text-amber-400'
                    }`}
                  >
                    {spotify ? 'Spotify' : 'Local Media'}
                  </button>
                </div>

                {/* Spotify Web Access Keyway */}
                <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-[#ffffff] font-semibold">
                    <span>Spotify Web Access</span>
                    {token ? (
                      <span className="text-[8px] bg-[#1ed760]/10 border border-[#1ed760]/30 text-[#1ed760] px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                        AUTHORIZED
                      </span>
                    ) : (
                      <span className="text-[8px] bg-rose-500/10 border border-rose-500/30 text-rose-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse">
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
                          if (data.success) {
                            toast.success('Disconnected from Spotify');
                          }
                        } catch (err) {
                          toast.error('Logout failed');
                        }
                      }}
                      className="w-full py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 font-bold text-xs uppercase tracking-wider active:scale-95 transition-all cursor-pointer hover:bg-rose-500/20"
                    >
                      Disconnect Spotify Account
                    </button>
                  )}
                </div>

                {/* Spotify Connect pairing instructions */}
                <div className="flex flex-col gap-2 border-t border-white/5 pt-3 text-[10px] leading-relaxed text-[#ffffff]">
                  <span className="text-[10px] uppercase tracking-wider text-[#ffffff] font-semibold">Spotify Connect pairing</span>
                  <div className="p-2.5 rounded bg-black/40 border border-white/5 text-[9px] text-[#ffffff]">
                    To pair your account, just select and play to <strong className="text-white">"Resonance Connect"</strong> once from your official Spotify app (phone or computer) on this network. The daemon will cache your session automatically and allow full control.
                  </div>
                </div>


                <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-[#ffffff] font-semibold">
                    <span>Cast Active Devices</span>
                    <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white">{devices.length} Found</span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {devices.length > 0 ? (
                      devices.map(device => (
                        <button
                          key={device.id}
                          onClick={() => handleCast(device.id)}
                          className={`w-full p-2 rounded-xl border flex items-center justify-between text-left transition-all active:scale-98 cursor-pointer ${
                            device.is_active 
                              ? 'bg-white/5 border-white/10 text-white font-bold' 
                              : 'bg-transparent border-transparent text-[#ffffff] hover:bg-white/2 hover:text-white'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Laptop className="h-3.5 w-3.5 shrink-0" />
                            <span className="text-[11px] truncate max-w-[150px]">{device.name}</span>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <span className="text-[8px] uppercase tracking-wider text-[#ffffff]">
                              {device.is_active ? 'Active' : 'Cast'}
                            </span>
                            <ChevronRight className="h-3 w-3 text-[#ffffff]" />
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="text-[10px] text-zinc-400 italic text-center py-2">No audio players detected on network</div>
                    )}
                  </div>
                </div>
     
                <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
                  <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-[#ffffff] font-semibold">
                    <span>System Updates</span>
                    <span className="text-[8px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white">OTA</span>
                  </div>
                  
                  <div className="flex flex-col gap-2">
                    {updateStatus === null && (
                      <button
                        onClick={checkUpdates}
                        className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider text-white"
                      >
                        Check for Updates
                      </button>
                    )}

                    {updateStatus === 'checking' && (
                      <div className="w-full py-2.5 rounded-xl border border-white/10 bg-white/5 flex justify-center items-center gap-2 text-xs font-bold uppercase tracking-wider text-white">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Checking...
                      </div>
                    )}

                    {updateStatus === 'no-update' && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-500 text-[10px] font-mono leading-normal text-center">
                          ✓ System is up to date
                        </div>
                        <button
                          onClick={checkUpdates}
                          className="w-full py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-[#ffffff] hover:text-white transition-all"
                        >
                          Check Again
                        </button>
                      </div>
                    )}

                    {updateStatus === 'available' && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-500 text-[10px] font-mono leading-normal text-center">
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
                      <div className="p-3 rounded-xl border border-white/10 bg-black/40 flex flex-col gap-3">
                        <div className="flex justify-between items-center text-[10px] text-white font-bold uppercase">
                          <span>Installing</span>
                          <span>{otaPercent}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-white transition-all" style={{ width: `${otaPercent}%` }} />
                        </div>
                        <div className="h-20 overflow-y-auto text-[8px] font-mono text-[#ffffff] flex flex-col gap-0.5 custom-scrollbar">
                          {otaProgress.map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                      </div>
                    )}

                    {updateStatus === 'error' && (
                      <div className="flex flex-col gap-2">
                        <div className="p-3 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-500 text-[10px] font-mono leading-normal text-center">
                          Update Failed
                        </div>
                        <button
                          onClick={checkUpdates}
                          className="w-full py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider text-white"
                        >
                          Retry
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-white/5 pt-4 flex flex-col gap-2">
                  <button
                    onClick={handleRemoteLogout}
                    className="w-full py-2.5 rounded-xl border border-rose-500/20 text-rose-500 bg-rose-500/5 hover:bg-rose-500/10 active:scale-95 transition-all text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>De-authorize Remote</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Main Controller Content */}
          <main className="w-full max-w-md flex-grow flex flex-col justify-center gap-8 z-10 mt-4">
            
            {/* Album Artwork Panel */}
            <div className="w-full flex justify-center">
              <div className="w-[75vw] max-w-[280px] aspect-square rounded-[2rem] bg-[#12151b] border border-white/5 overflow-hidden shadow-[0_25px_60px_-15px_rgba(0,0,0,0.8)] flex items-center justify-center relative group">
                {albumImage ? (
                  <img 
                    src={albumImage} 
                    alt={trackName} 
                    className="w-full h-full object-cover select-none pointer-events-none scale-100 transition-all duration-700" 
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-zinc-700">
                    <Music className="h-12 w-12 stroke-[1.25] text-[#2c3441]" />
                    <span className="text-[9px] uppercase tracking-widest font-extrabold text-[#2c3441]">Resonance</span>
                  </div>
                )}
                
                {/* Ambient artwork shadow/glow under art */}
                {albumImage && (
                  <div 
                    className="absolute inset-0 -z-10 scale-95 opacity-50 blur-2xl transition-all duration-700"
                    style={{ backgroundImage: `url(${albumImage})`, backgroundSize: 'cover' }}
                  />
                )}
              </div>
            </div>

            {/* Track Title and Artist details */}
            <div className="w-full text-center flex flex-col gap-1.5 px-4">
              <h2 className="text-lg font-bold text-white tracking-tight leading-snug truncate">
                {trackName}
              </h2>
              <p className="text-[12px] font-semibold text-[#ffffff] tracking-normal truncate">
                {trackArtist}
              </p>
              {activeDevice && (
                <div className="inline-flex items-center gap-1.5 justify-center mt-1 text-[9px] font-bold text-[#c788ff] uppercase tracking-[0.15em] bg-white/2 border border-white/5 px-2.5 py-1 rounded-full self-center">
                  <Laptop className="h-3 w-3" />
                  <span>Playing on: {activeDevice.name}</span>
                </div>
              )}
            </div>

            {/* Auth status block when token is missing */}
            {spotify && !token && (
              <div className="mx-4 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 text-center flex flex-col gap-3">
                <p className="text-[10px] text-amber-250 font-medium leading-relaxed">
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
            <div className="w-full px-2 flex flex-col gap-2">
              <input
                type="range"
                min="0"
                max={trackDuration}
                value={trackPosition}
                onChange={handleSeek}
                disabled={spotify ? (!token || !trackDuration) : !trackDuration}
                className="w-full h-1 bg-white/5 hover:bg-white/10 rounded-lg appearance-none cursor-pointer accent-white transition-all focus:outline-none"
                style={{
                  background: `linear-gradient(to right, #ffffff 0%, #ffffff ${
                    trackDuration ? (trackPosition / trackDuration) * 100 : 0
                  }%, rgba(255, 255, 255, 0.05) ${
                    trackDuration ? (trackPosition / trackDuration) * 100 : 0
                  }%, rgba(255, 255, 255, 0.05) 100%)`
                }}
              />
              <div className="flex justify-between items-center text-[10px] text-[#ffffff] font-semibold font-mono">
                <span>{formatTime(trackPosition)}</span>
                <span>{formatTime(trackDuration)}</span>
              </div>
            </div>

            {/* Media Playback Controls Row */}
            <div className="w-full flex items-center justify-between px-6">
              <button
                onClick={handleShuffle}
                disabled={spotify ? !token : true}
                className={`p-2 rounded-full transition-all active:scale-90 cursor-pointer disabled:opacity-20 ${
                  shuffleState ? 'text-[#c788ff] drop-shadow-[0_0_8px_rgba(199,136,255,0.4)]' : 'text-[#ffffff] hover:text-white'
                }`}
              >
                <Shuffle className="h-4.5 w-4.5" />
              </button>

              <button
                onClick={handlePrevious}
                disabled={spotify ? !token : false}
                className="p-2.5 rounded-full hover:bg-white/5 text-[#f1f3f6] active:scale-90 transition-all cursor-pointer disabled:opacity-20"
              >
                <SkipBack className="h-5.5 w-5.5 fill-current" />
              </button>

              {/* Large circular Play/Pause Button */}
              <button
                onClick={handlePlayPause}
                disabled={spotify ? !token : false}
                className="h-16 w-16 rounded-full bg-white text-black flex items-center justify-center shadow-lg active:scale-90 transition-all cursor-pointer hover:bg-zinc-150 disabled:opacity-50"
              >
                {isPlaying ? (
                  <Pause className="h-6.5 w-6.5 fill-current text-black" />
                ) : (
                  <Play className="h-6.5 w-6.5 fill-current text-black ml-1" />
                )}
              </button>

              <button
                onClick={handleNext}
                disabled={spotify ? !token : false}
                className="p-2.5 rounded-full hover:bg-white/5 text-[#f1f3f6] active:scale-90 transition-all cursor-pointer disabled:opacity-20"
              >
                <SkipForward className="h-5.5 w-5.5 fill-current" />
              </button>

              <button
                onClick={handleRepeat}
                disabled={spotify ? !token : true}
                className={`p-2 rounded-full transition-all active:scale-90 cursor-pointer disabled:opacity-20 ${
                  repeatState !== 'off' ? 'text-[#c788ff] drop-shadow-[0_0_8px_rgba(199,136,255,0.4)]' : 'text-[#ffffff] hover:text-white'
                }`}
              >
                <Repeat className="h-4.5 w-4.5" />
                {repeatState === 'track' && (
                  <span className="absolute text-[6px] font-extrabold bg-[#c788ff] text-black rounded-full px-0.5 bottom-0 right-0">1</span>
                )}
              </button>
            </div>

          </main>

          {/* Sleek bottom Volume control bar */}
          <footer className="w-full max-w-md z-10 px-4 mt-4">
            <div className="bg-[#12151b] border border-white/5 rounded-2xl px-4 py-3 flex items-center gap-3.5 shadow-xl">
              <button 
                onClick={handleMuteToggle}
                disabled={spotify ? !token : false}
                className="text-[#ffffff] hover:text-white active:scale-90 transition-all cursor-pointer disabled:opacity-25"
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
                className="flex-grow h-1 bg-white/5 hover:bg-white/10 rounded-lg appearance-none cursor-pointer accent-white transition-all focus:outline-none"
                style={{
                  background: `linear-gradient(to right, #ffffff 0%, #ffffff ${
                    isMuted ? 0 : volume
                  }%, rgba(255, 255, 255, 0.05) ${
                    isMuted ? 0 : volume
                  }%, rgba(255, 255, 255, 0.05) 100%)`
                }}
              />
              
              <span className="text-[10px] text-[#ffffff] font-semibold font-mono w-7 text-right">
                {isMuted ? 0 : volume}%
              </span>
            </div>
          </footer>

        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-right" />
      </>
    );
}
