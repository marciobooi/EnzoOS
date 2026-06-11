import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';
import { api } from './api';

// Subcomponents
import AuthGuard from './components/AuthGuard';
import RoseHiFiDisplay from './components/RoseHiFiDisplay';
import TrackSearch from './components/TrackSearch';

export default function App() {
  // Authentication states
  const [token, setToken] = useState(localStorage.getItem('spotify_access_token') || '');
  const [refreshToken, setRefreshToken] = useState(localStorage.getItem('spotify_refresh_token') || '');
  const [manualTokenInput, setManualTokenInput] = useState('');

  // Spotify Player states
  const [player, setPlayer] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [playbackState, setPlaybackState] = useState(null);
  const [isLocalDeviceActive, setIsLocalDeviceActive] = useState(false);
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

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // WebSocket reference
  const ws = useRef(null);
  const isLocalDeviceActiveRef = useRef(isLocalDeviceActive);

  // Keep ref in sync to avoid stale closures inside WebSockets
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

  // Set up Spotify Web Playback SDK
  useEffect(() => {
    if (!token) return;

    if (player) {
      player.disconnect();
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      const newPlayer = new window.Spotify.Player({
        name: 'Resonance Connect (Analog)',
        getOAuthToken: cb => cb(token),
        volume: volume / 100
      });

      newPlayer.addListener('initialization_error', ({ message }) => {
        console.error('Initialization error:', message);
        toast.error(`Player error: ${message}`);
      });
      newPlayer.addListener('authentication_error', ({ message }) => {
        console.error('Authentication error:', message);
        toast.error('Session expired. Please log in or update token.');
        handleLogout();
      });
      newPlayer.addListener('account_error', ({ message }) => {
        console.error('Account error:', message);
        toast.error(`Premium subscription required for browser streaming.`);
      });
      newPlayer.addListener('playback_error', ({ message }) => {
        console.error('Playback error:', message);
      });

      newPlayer.addListener('player_state_changed', state => {
        if (!state) {
          setIsLocalDeviceActive(false);
          setPlaybackState(null);
          return;
        }

        setIsLocalDeviceActive(true);
        setPlaybackState(state);
        setTrackPosition(state.position);
        setTrackDuration(state.duration);

        // Update shuffle and repeat states from local player
        setShuffleState(state.shuffle);
        const repeatMapping = { 0: 'off', 1: 'context', 2: 'track' };
        setRepeatState(repeatMapping[state.repeat_mode] || 'off');

        // Broadcast updated state to all other WebSocket connections
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          const payload = {
            paused: state.paused,
            position: state.position,
            duration: state.duration,
            shuffle_state: state.shuffle,
            repeat_state: repeatMapping[state.repeat_mode] || 'off',
            track_window: {
              current_track: {
                uri: state.track_window.current_track.uri,
                name: state.track_window.current_track.name,
                album: {
                  name: state.track_window.current_track.album.name,
                  images: state.track_window.current_track.album.images
                },
                artists: state.track_window.current_track.artists
              }
            }
          };
          ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload }));
        }
      });

      newPlayer.addListener('ready', ({ device_id }) => {
        console.log('Ready with Device ID:', device_id);
        setDeviceId(device_id);
        setIsLocalDeviceActive(true);
        fetchDevices();
      });

      newPlayer.addListener('not_ready', ({ device_id }) => {
        console.log('Device ID has gone offline:', device_id);
        setIsLocalDeviceActive(false);
      });

      newPlayer.connect();
      setPlayer(newPlayer);
    };

    if (!document.getElementById('spotify-player-sdk')) {
      const script = document.createElement('script');
      script.id = 'spotify-player-sdk';
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    } else if (window.Spotify) {
      window.onSpotifyWebPlaybackSDKReady();
    }

    return () => {
      if (player) {
        player.disconnect();
      }
    };
  }, [token]);

  // Set up WebSocket connection for real-time synchronization
  useEffect(() => {
    if (!token) return;

    let socket;
    let reconnectTimeout;

    const connectWS = () => {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
      socket = new WebSocket(wsUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('[Resonance Client] Connected to WebSocket server');
        socket.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token } }));
      };

      socket.onmessage = (event) => {
        try {
          const { type, payload } = JSON.parse(event.data);

          if (type === 'PLAYBACK_STATE') {
            if (!isLocalDeviceActiveRef.current) {
              setPlaybackState(payload);
              setTrackPosition(payload.position);
              setTrackDuration(payload.duration);
              if (payload.shuffle_state !== undefined) {
                setShuffleState(payload.shuffle_state);
              }
              if (payload.repeat_state !== undefined) {
                setRepeatState(payload.repeat_state);
              }
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

  // Play a searched track on the active device
  const handlePlayTrack = async (trackUri) => {
    try {
      // Use this local player device ID or find the currently active device
      const activeId = deviceId || (devices.find(d => d.is_active)?.id);
      await api.play(token, activeId, null, [trackUri]);
      toast.success('Track loaded successfully.');
      setTimeout(syncCurrentState, 800);
    } catch (err) {
      toast.error(`Play error: ${err.message}`);
    }
  };

  // Playback Control Handlers
  const handlePlayPause = async () => {
    if (!token) return;
    try {
      if (isLocalDeviceActive && player) {
        await player.togglePlay();
      } else {
        if (playbackState?.paused === false) {
          await api.pause(token);
        } else {
          await api.play(token);
        }
      }
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      toast.error(`Action failed: ${err.message}`);
    }
  };

  const handleNext = async () => {
    if (!token) return;
    try {
      if (isLocalDeviceActive && player) {
        await player.nextTrack();
      } else {
        await api.skipNext(token);
      }
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      toast.error(`Skip next failed: ${err.message}`);
    }
  };

  const handlePrevious = async () => {
    if (!token) return;
    try {
      if (isLocalDeviceActive && player) {
        await player.previousTrack();
      } else {
        await api.skipPrevious(token);
      }
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      toast.error(`Skip back failed: ${err.message}`);
    }
  };

  const handleToggleShuffle = async () => {
    if (!token) return;
    const nextShuffle = !shuffleState;
    setShuffleState(nextShuffle);
    try {
      const activeId = deviceId || (devices.find(d => d.is_active)?.id);
      await api.setShuffle(token, nextShuffle, activeId);
      toast.success(`Shuffle ${nextShuffle ? 'activated' : 'deactivated'}`);
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      setShuffleState(!nextShuffle);
      toast.error(`Shuffle toggle failed: ${err.message}`);
    }
  };

  const handleToggleRepeat = async () => {
    if (!token) return;
    const repeatCycle = {
      'off': 'context',
      'context': 'track',
      'track': 'off'
    };
    const nextRepeat = repeatCycle[repeatState] || 'off';
    setRepeatState(nextRepeat);
    try {
      const activeId = deviceId || (devices.find(d => d.is_active)?.id);
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
    if (!token) return;
    try {
      const state = await api.getPlaybackState(token);
      if (state) {
        setPlaybackState({
          paused: !state.is_playing,
          position: state.progress_ms,
          duration: state.item?.duration_ms || 0,
          shuffle_state: state.shuffle_state,
          repeat_state: state.repeat_state,
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
        });
        setTrackPosition(state.progress_ms);
        setTrackDuration(state.item?.duration_ms || 0);
        setShuffleState(state.shuffle_state);
        setRepeatState(state.repeat_state);
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
    try {
      if (isLocalDeviceActive && player) {
        await player.seek(seekMs);
      } else {
        await api.seek(token, seekMs);
      }
    } catch (err) {
      console.error('Seek error:', err);
    }
  };

  // Volume control
  const handleVolumeChange = async (e) => {
    const vol = parseInt(e.target.value, 10);
    setVolume(vol);
    setIsMuted(vol === 0);
    try {
      if (isLocalDeviceActive && player) {
        await player.setVolume(vol / 100);
      } else {
        await api.setVolume(token, vol);
      }
    } catch (err) {
      console.error('Volume adjustment error:', err);
    }
  };

  const handleToggleMute = async () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    const targetVolume = newMuteState ? 0 : volume;
    try {
      if (isLocalDeviceActive && player) {
        await player.setVolume(targetVolume / 100);
      } else {
        await api.setVolume(token, targetVolume);
      }
    } catch (err) {
      console.error('Mute error:', err);
    }
  };

  // Spotify login redirect
  const handleLogin = () => {
    window.location.href = '/api/login';
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
    toast.success('Custom authentication token applied!');
  };

  // Log out / clear authentication
  const handleLogout = () => {
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    setToken('');
    setRefreshToken('');
    setPlaybackState(null);
    setDevices([]);
    setDeviceId('');
    if (ws.current) {
      ws.current.close();
    }
    if (player) {
      player.disconnect();
    }
    setPlayer(null);
    toast.info('Session terminated.');
  };

  // UI state variables
  const currentTrack = playbackState?.track_window?.current_track;
  const isPlaying = playbackState ? !playbackState.paused : false;
  const trackName = currentTrack?.name || 'SYSTEM IDLE';
  const trackArtist = currentTrack?.artists?.map(a => a.name).join(', ') || 'No Source Loaded';

  return (
    <div className="w-screen h-screen bg-[#050505] flex items-center justify-between relative overflow-hidden p-6 select-none font-sans selection:bg-[#ff8e00]/30 selection:text-[#ff8e00]">
      
      {/* Subtle retro glowing background spots */}
      <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full bg-[#ff8e00]/5 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-emerald-950/5 blur-[150px] pointer-events-none" />

      {!token ? (
        <AuthGuard
          manualTokenInput={manualTokenInput}
          setManualTokenInput={setManualTokenInput}
          handleLogin={handleLogin}
          handleApplyManualToken={handleApplyManualToken}
        />
      ) : (
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
          onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
        />
      )}

      {/* SIDE PANEL DRAWER (SEARCH CATALOGUE) */}
      {/* Backdrop overlay */}
      <div 
        onClick={() => setIsSearchOpen(false)}
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
          isSearchOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Drawer Container */}
      <div 
        className={`fixed top-0 right-0 h-full w-[450px] bg-gradient-to-b from-[#22252c] to-[#0f1013] border-l border-[#303643] shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col p-6 font-mono ${
          isSearchOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Close Button Header */}
        <div className="flex justify-end mb-4 select-none shrink-0">
          <button 
            onClick={() => setIsSearchOpen(false)}
            className="text-zinc-500 hover:text-white transition-colors cursor-pointer text-[10px] font-extrabold font-mono px-3.5 py-1.5 rounded-lg bg-zinc-950 border border-zinc-900 active:scale-95"
          >
            CLOSE [X]
          </button>
        </div>

        {/* Drawer Scrollable Content */}
        <div className="flex-grow overflow-y-auto">
          {token && (
            <TrackSearch
              token={token}
              onPlayTrack={(uri) => {
                handlePlayTrack(uri);
                setIsSearchOpen(false);
              }}
              isDrawer={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
