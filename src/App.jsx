import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { LogOut, Terminal } from 'lucide-react';
import { api } from './api';

// Subcomponents
import RoseHiFiDisplay from './components/RoseHiFiDisplay';
import DefinitionsMenu from './components/DefinitionsMenu';
import RemoteControl from './components/RemoteControl';

export default function App() {
  // Authentication states
  const [token, setToken] = useState(localStorage.getItem('spotify_access_token') || '');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('spotify_refresh_token') || '');
  const [manualTokenInput, setManualTokenInput] = useState('');

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

  const handleToggleSource = () => {
    const nextSpotify = !spotify;
    setSpotify(nextSpotify);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'SET_SOURCE', payload: { spotify: nextSpotify } }));
    }
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

  // WebSocket reference
  const ws = useRef(null);
  // Stable ref to syncCurrentState — prevents stale closure in WS onmessage handler
  const syncCurrentStateRef = useRef(null);

  // Derived Librespot states
  const resonanceDevice = devices.find(d => d.name === 'Resonance Connect');
  const resonanceDeviceId = resonanceDevice?.id || '';
  const isLocalDeviceActive = resonanceDevice?.is_active || false;

  const isLocalDeviceActiveRef = useRef(isLocalDeviceActive);
  useEffect(() => {
    isLocalDeviceActiveRef.current = isLocalDeviceActive;
  }, [isLocalDeviceActive]);

  // Extract tokens from URL if arriving from Spotify redirect callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessTokenUrl = params.get('access_token');
    const refreshTokenUrl = params.get('refresh_token');

    if (accessTokenUrl) {
      localStorage.setItem('spotify_access_token', accessTokenUrl);
      setToken(accessTokenUrl);
      toast.success('Spotify Authenticated successfully!');
    }
    if (refreshTokenUrl) {
      localStorage.setItem('spotify_refresh_token', refreshTokenUrl);
      setRefreshToken(refreshTokenUrl);
    }

    // Clean URL query params to preserve security
    if (accessTokenUrl || refreshTokenUrl) {
      const url = new URL(window.location.href);
      url.search = '';
      window.history.replaceState({}, document.title, url.toString());
    }
  }, []);
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

  // Set up WebSocket connection for real-time synchronization
  useEffect(() => {
    let socket;
    let reconnectTimeout;

    const connectWS = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('[Resonance Client] Connected to WebSocket server');
        if (token) {
          socket.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token } }));
        }
      };

      socket.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);

          if (type === 'PLAYBACK_STATE') {
            setPlaybackState(payload);
            setTrackPosition(payload.position);
            setTrackDuration(payload.duration);
            if (payload.shuffle_state !== undefined) {
              setShuffleState(payload.shuffle_state);
            }
            if (payload.repeat_state !== undefined) {
              setRepeatState(payload.repeat_state);
            }
            if (payload.volume !== undefined) {
              setVolume(payload.volume);
            }
            if (payload.is_muted !== undefined) {
              setIsMuted(payload.is_muted);
            }
          }

          if (type === 'REQUEST_SYNC') {
            console.log('[Resonance Client] Received sync request, syncing local state');
            // Use the ref so we always call the latest version (avoids stale closure)
            if (syncCurrentStateRef.current) {
              syncCurrentStateRef.current();
            }
          }

          if (type === 'UPDATE_PROGRESS') {
            setUpdateStatus('updating');
            setOtaProgress(prev => [...prev, payload.text].slice(-30));
            if (payload.percent !== undefined && payload.percent !== null) {
              setOtaPercent(payload.percent);
            }
          }

          if (type === 'SET_SOURCE') {
            setSpotify(payload.spotify);
          }

          if (type === 'SET_TOKEN') {
            const newToken = payload.token;
            if (newToken && newToken !== localStorage.getItem('spotify_access_token')) {
              localStorage.setItem('spotify_access_token', newToken);
              setToken(newToken);
              toast.success('System authentication token synchronized!');
            }
          }

          if (type === 'CLEAR_TOKEN') {
            if (localStorage.getItem('spotify_access_token')) {
              localStorage.removeItem('spotify_access_token');
              localStorage.removeItem('spotify_refresh_token');
              setToken('');
              setRefreshToken('');
              setPlaybackState(null);
              setDevices([]);
              toast.info('System token cleared.');
            }
          }

          if (type === 'ERROR') {
            console.warn('[Resonance Client] Server WS reported error:', payload.message);
          }
        } catch (err) {
          console.error('[Resonance Client] Error parsing WS message:', err);
        }
      };

      socket.onclose = (e) => {
        console.log('[Resonance Client] WebSocket disconnected. Reconnecting in 3s...', e.reason);
        reconnectTimeout = setTimeout(connectWS, 3000);
      };

      socket.onerror = (err) => {
        console.error('[Resonance Client] WebSocket error:', err);
        socket.close();
      };
    };

    connectWS();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socket) {
        socket.close();
      }
      ws.current = null;
    };
  }, []);

  // Send token to WebSocket server when it changes locally
  useEffect(() => {
    if (token && ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token } }));
    }
  }, [token]);

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
          setVolume(state.device.volume_percent);
          setIsMuted(state.device.volume_percent === 0);
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

  // Keep the ref always pointing to the latest syncCurrentState so the WS
  // closure (which captures nothing from the render cycle) can still call it safely
  useEffect(() => {
    syncCurrentStateRef.current = syncCurrentState;
  });

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
    const targetVolume = newMuteState ? 0 : volume;

    // Broadcast mute update immediately over WS
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'BROADCAST_STATE',
        payload: {
          ...playbackState,
          volume: targetVolume,
          is_muted: newMuteState
        }
      }));
    }

    try {
      await api.setVolume(token, targetVolume);
    } catch (err) {
      console.error('Mute error:', err);
    }
  };


  // Set manual token fallback
  const handleApplyManualToken = (e) => {
    e.preventDefault();
    if (!manualTokenInput.trim()) {
      toast.error('Token cannot be empty');
      return;
    }
    localStorage.setItem('spotify_access_token', manualTokenInput.trim());
    setToken(manualTokenInput.trim());
    setManualTokenInput('');
    setIsMenuOpen(false);
    toast.success('Custom authentication token applied!');
  };

  // Log out / disconnect Spotify
  const handleLogout = async () => {
    try {
      await fetch('/auth/spotify/logout', { method: 'POST' });
    } catch (_) {}
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    setToken('');
    setRefreshToken('');
    setPlaybackState(null);
    setDevices([]);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'CLEAR_TOKEN' }));
    }
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
      
      {/* Subtle retro glowing background spots */}
      <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full theme-bg-glow blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-emerald-950/5 blur-[150px] pointer-events-none" />

      <div 
        ref={containerRef}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          width: '1400px',
          height: '320px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
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
      </div>

      {/* SIDE PANEL DRAWER (SYSTEM DEFINITIONS MENU) */}
      {/* Backdrop overlay */}
      <div 
        onClick={() => setIsMenuOpen(false)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isMenuOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer Container */}
      <div 
        className={`fixed top-0 right-0 h-full w-[450px] bg-gradient-to-b from-[#22252c] to-[#0f1013] border-l border-[#303643] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col p-6 font-mono ${
          isMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close Button Header */}
        <div className="flex justify-end mb-4 select-none shrink-0">
          <button 
            onClick={() => setIsMenuOpen(false)}
            className="text-zinc-500 hover:text-white transition-colors cursor-pointer text-[10px] font-extrabold font-mono px-3.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-900 active:scale-95"
          >
            CLOSE [X]
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-grow overflow-y-auto">
          <DefinitionsMenu
            token={token}
            manualTokenInput={manualTokenInput}
            setManualTokenInput={setManualTokenInput}
            handleApplyManualToken={handleApplyManualToken}
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
    </div>
  );
}
