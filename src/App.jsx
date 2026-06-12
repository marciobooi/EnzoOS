import React, { useState, useEffect, useRef } from 'react';
import { toast, Toaster } from 'sonner';
import { LogOut, Terminal } from 'lucide-react';
import { api } from './api';
import { useResonanceWS } from './websocket';

// Subcomponents
import RoseHiFiDisplay from './components/RoseHiFiDisplay';
import DefinitionsMenu from './components/DefinitionsMenu';
import RemoteControl from './components/RemoteControl';

export default function App() {
  // Authentication state (server-managed, synchronized via WebSocket)
  const [token, setToken] = useState('');

  // Spotify Player states
  const [playbackState, setPlaybackState] = useState(null);
  const [shuffleState, setShuffleState] = useState(false);
  const [repeatState, setRepeatState] = useState('off');

  // Spotify Connect device list states
  const [devices, setDevices] = useState([]);
  const [isFetchingDevices, setIsFetchingDevices] = useState(false);

  // Seek bar states
  const [trackPosition, setTrackPosition] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const progressInterval = useRef(null);

  // Volume state (0 - 100)
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('resonance_theme') || 'amber');
  const lastVolumeChangeTime = useRef(0);

  const setVolumeWithLock = (vol) => {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setVolume(vol);
  };

  const setIsMutedWithLock = (muted) => {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setIsMuted(muted);
  };

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('resonance_theme', newTheme);
  };

  const [otaProgress, setOtaProgress] = useState([]);
  const [otaPercent, setOtaPercent] = useState(0);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [spotify, setSpotify] = useState(true);

  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);

  // Set up periodic device list and state fetching
  useEffect(() => {
    if (!token) return;

    fetchDevices();
    syncCurrentState();

    // Poll every 8 seconds to track devices and playback state
    const pollIntervalId = setInterval(() => {
      fetchDevices();
      syncCurrentState();
    }, 8000);

    return () => clearInterval(pollIntervalId);
  }, [token]);

  // Connect to the centralized WebSocket hook
  const { ws, sendUpdate } = useResonanceWS({
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
      syncCurrentState();
    },
    isAuthenticated: true,
    isRemote: false
  });

  const handleToggleSource = () => {
    const nextSpotify = !spotify;
    setSpotify(nextSpotify);
    sendUpdate('SET_SOURCE', { spotify: nextSpotify });
    toast.success(`Source set to: ${nextSpotify ? 'Spotify' : 'Local Media'}`);
  };

  useEffect(() => {
    const handleResize = () => {
      // Skip if window dimensions haven't been reported yet (Chromium startup race)
      if (window.innerWidth === 0 || window.innerHeight === 0) return;

      // Calculate target scale based on 1400x320 design dimensions
      const containerWidth = window.innerWidth - 48;
      const containerHeight = window.innerHeight - 48;

      const scaleX = containerWidth / 1400;
      const scaleY = containerHeight / 320;

      // Clamp to a safe minimum so we never get a zero or negative scale
      const targetScale = Math.max(0.1, Math.min(scaleX, scaleY));
      setScale(targetScale);
    };

    window.addEventListener('resize', handleResize);
    // Delay the initial calculation to let Chromium finish painting the window
    const initialTimer = setTimeout(handleResize, 100);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(initialTimer);
    };
  }, []);

  // Derived Librespot states
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');
  const resonanceDeviceId = resonanceDevice?.id || '';
  const isLocalDeviceActive = resonanceDevice?.is_active || false;

  const isLocalDeviceActiveRef = useRef(isLocalDeviceActive);
  useEffect(() => {
    isLocalDeviceActiveRef.current = isLocalDeviceActive;
  }, [isLocalDeviceActive]);

  // Track position slider polling (runs while music is playing)
  useEffect(() => {
    if (playbackState && !playbackState.paused) {
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
  }, [playbackState, trackDuration]);

  // Refresh Spotify Connect devices list
  const fetchDevices = async () => {
    if (!token) return;
    try {
      setIsFetchingDevices(true);
      const data = await api.getDevices(token);
      setDevices(data.devices || []);
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      setIsFetchingDevices(false);
    }
  };

  // Transfer playback to target device
  const transferPlayback = async (targetId) => {
    try {
      await api.transferPlayback(token, targetId);
      toast.success('Audio route cast successfully.');
      setTimeout(fetchDevices, 500);
    } catch (err) {
      toast.error(`Transfer error: ${err.message}`);
    }
  };

  // Route audio to local Librespot device
  const handleTransferToLocal = async () => {
    if (resonanceDeviceId) {
      await transferPlayback(resonanceDeviceId);
    } else {
      toast.error('Resonance Connect device not detected on Spotify network. Try starting the daemon.');
      fetchDevices();
    }
  };

  // Play a searched track on the active device
  const handlePlayTrack = async (trackUri) => {
    try {
      const activeId = resonanceDeviceId || (devices.find(d => d.is_active)?.id);
      await api.play(token, activeId, null, [trackUri]);
      toast.success('Track loaded successfully.');
      setTimeout(syncCurrentState, 800);
    } catch (err) {
      toast.error(`Play error: ${err.message}`);
    }
  };

  // Playback Control Handlers
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
      if (playbackState?.paused === false) {
        await api.pause(token);
      } else {
        const targetId = isLocalDeviceActive ? null : resonanceDeviceId;
        await api.play(token, targetId);
      }
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      toast.error(`Action failed: ${err.message}`);
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
      setTimeout(syncCurrentState, 500);
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
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      toast.error(`Skip back failed: ${err.message}`);
    }
  };

  const handleToggleShuffle = async () => {
    if (!spotify) return;
    if (!token) return;
    const nextShuffle = !shuffleState;
    setShuffleState(nextShuffle);
    try {
      const activeId = resonanceDeviceId || (devices.find(d => d.is_active)?.id);
      await api.setShuffle(token, nextShuffle, activeId);
      toast.success(`Shuffle ${nextShuffle ? 'activated' : 'deactivated'}`);
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      setShuffleState(!nextShuffle);
      toast.error(`Shuffle toggle failed: ${err.message}`);
    }
  };

  const handleToggleRepeat = async () => {
    if (!spotify) return;
    if (!token) return;
    const repeatCycle = {
      'off': 'context',
      'context': 'track',
      'track': 'off'
    };
    const nextRepeat = repeatCycle[repeatState] || 'off';
    setRepeatState(nextRepeat);
    try {
      const activeId = resonanceDeviceId || (devices.find(d => d.is_active)?.id);
      await api.setRepeat(token, nextRepeat, activeId);
      toast.success(`Repeat mode set to: ${nextRepeat}`);
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      setRepeatState(repeatState);
      toast.error(`Repeat toggle failed: ${err.message}`);
    }
  };

  // Sync state manually from Spotify Web API
  const syncCurrentState = async () => {
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
        if (state.device && state.device.volume_percent !== undefined) {
          if (Date.now() - lastVolumeChangeTime.current >= 2500) {
            setVolume(state.device.volume_percent);
            setIsMuted(state.device.volume_percent === 0);
          }
        }

        // Broadcast current state to other connected clients via WebSocket
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload: newState }));
        }
      }
      fetchDevices();
    } catch (err) {
      console.warn('Could not sync remote state:', err);
    }
  };



  // Manual Seek
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
    try {
      await api.seek(token, seekMs);
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  // Volume control
  const handleVolumeChange = async (e) => {
    const vol = parseInt(e.target.value, 10);
    setVolume(vol);
    setIsMuted(vol === 0);
    lastVolumeChangeTime.current = Date.now();

    // Broadcast volume update immediately over WS for instant remote response
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'BROADCAST_STATE',
        payload: {
          ...playbackState,
          volume: vol,
          is_muted: vol === 0
        }
      }));
    }

    if (!spotify) {
      try {
        await api.localSetVolume(vol);
      } catch (err) {
        console.error('Local volume error:', err);
      }
      return;
    }
    try {
      await api.setVolume(token, vol);
    } catch (err) {
      console.error('Volume adjustment error:', err);
      toast.error(`Volume change failed: ${err.message}`);
    }
  };

  const handleToggleMute = async () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    lastVolumeChangeTime.current = Date.now();
    const targetVolume = newMuteState ? 0 : volume;

    // Broadcast mute update immediately over WS
    sendUpdate('BROADCAST_STATE', {
      ...playbackState,
      volume: targetVolume,
      is_muted: newMuteState
    });

    try {
      await api.setVolume(token, targetVolume);
    } catch (err) {
      console.error('Mute error:', err);
    }
  };


  // Log out / disconnect Spotify
  const handleLogout = async () => {
    try {
      await fetch('/auth/spotify/logout', { method: 'POST' });
    } catch (_) {}
    setToken('');
    setPlaybackState(null);
    setDevices([]);
    sendUpdate('CLEAR_TOKEN');
    toast.info('Spotify disconnected.');
  };

  // Pathname routing check for standalone mobile remote view
  if (window.location.pathname === '/remote') {
    return <RemoteControl />;
  }

  // UI state variables
  const currentTrack = playbackState?.track_window?.current_track;
  const isPlaying = playbackState ? !playbackState.paused : false;
  const trackName = currentTrack?.name || 'SYSTEM IDLE';
  const trackArtist = currentTrack?.artists?.map(a => a.name).join(', ') || 'No Source Loaded';

  return (
    <div data-theme={theme} className="w-screen h-screen bg-[#050505] flex items-center justify-center relative overflow-hidden p-6 select-none font-sans">
      <div 
        ref={containerRef}
        className="music-player-container"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          width: '1400px',
          height: '320px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative'
        }}
      >
        <RoseHiFiDisplay
          isPlaying={isPlaying}
          isLocalDeviceActive={isLocalDeviceActive}
          trackName={trackName}
          trackArtist={trackArtist}
          trackPosition={trackPosition}
          trackDuration={trackDuration}
          volume={volume}
          isMuted={isMuted}
          shuffleState={shuffleState}
          repeatState={repeatState}
          handlePrevious={handlePrevious}
          handlePlayPause={handlePlayPause}
          handleNext={handleNext}
          handleSeek={handleSeek}
          handleVolumeChange={handleVolumeChange}
          handleToggleMute={handleToggleMute}
          handleToggleShuffle={handleToggleShuffle}
          handleToggleRepeat={handleToggleRepeat}
          playbackState={playbackState}
          onToggleMenu={() => setIsMenuOpen(!isMenuOpen)}
          onTransferPlayback={handleTransferToLocal}
          hasToken={!!token}
          spotify={spotify}
          onToggleSource={handleToggleSource}
        />

        {/* Full-Screen Horizontal Definitions Menu Overlay */}
        <div 
          className={`absolute inset-0 bg-gradient-to-b from-[#181a20] to-[#0a0b0d] border border-[#262b35] rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-mono ${
            isMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          {/* Header & Close Button */}
          <div className="flex justify-between items-center mb-3 select-none shrink-0">
            <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] theme-text">System Configuration Control Panel</h4>
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="text-zinc-500 hover:text-white transition-colors cursor-pointer text-[10px] font-extrabold font-mono px-3.5 py-1 rounded-lg bg-zinc-950 border border-zinc-900 active:scale-95"
            >
              CLOSE [X]
            </button>
          </div>

          {/* Horizontally Scrollable Content */}
          <div className="flex-grow overflow-x-auto overflow-y-hidden custom-scrollbar">
            <DefinitionsMenu
              token={token}
              handleLogout={handleLogout}
              devices={devices}
              isFetchingDevices={isFetchingDevices}
              onTransferPlayback={transferPlayback}
              onRefreshDevices={fetchDevices}
              onPlayTrack={(uri) => {
                handlePlayTrack(uri);
                setIsMenuOpen(false);
              }}
              theme={theme}
              onThemeChange={handleThemeChange}
              otaProgress={otaProgress}
              setOtaProgress={setOtaProgress}
              otaPercent={otaPercent}
              setOtaPercent={setOtaPercent}
              spotify={spotify}
              onToggleSource={handleToggleSource}
              updateStatus={updateStatus}
              setUpdateStatus={setUpdateStatus}
              errorMessage={errorMessage}
              setErrorMessage={setErrorMessage}
            />
          </div>
        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-right" />
      </div>
    </div>
  );
}
