import React, { useState, useEffect, useRef } from 'react';
import { toast, Toaster } from 'sonner';
import { api } from '../api';
import { useResonanceWS } from '../websocket';
import { Power } from 'lucide-react';

// Subcomponents
import PlayerDisplay from '../components/PlayerDisplay';
import DefinitionsMenu from '../components/DefinitionsMenu';
import EqualizerControl, { EQ_PRESETS } from '../components/EqualizerControl';

export default function Kiosk() {
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
  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [eqPreset, setEqPreset] = useState(() => localStorage.getItem('resonance_eq_preset') || 'Clinical Reference');
  const [eqBands, setEqBands] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('resonance_eq_bands')) || [0, 0, 0, 0, 0];
    } catch {
      return [0, 0, 0, 0, 0];
    }
  });
  const [eqSaturation, setEqSaturation] = useState(() => Number(localStorage.getItem('resonance_eq_saturation')) || 0);
  const [eqNoiseFloor, setEqNoiseFloor] = useState(() => Number(localStorage.getItem('resonance_eq_noise')) || 0);
  const [eqPreAmp, setEqPreAmp] = useState(() => Number(localStorage.getItem('resonance_eq_preamp')) || 0.0);

  const [theme, setTheme] = useState(localStorage.getItem('resonance_theme') || 'amber');
  const lastVolumeChangeTime = useRef(0);
  const volumeApiTimeout = useRef(null);
  const [favoriteStations, setFavoriteStations] = useState([]);

  const [otaProgress, setOtaProgress] = useState([]);
  const [otaPercent, setOtaPercent] = useState(0);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [source, setSource] = useState('spotify'); // 'spotify' | 'local' | 'radio'
  const spotify = source === 'spotify';

  const [radioSearch, setRadioSearch] = useState('');
  const [stationsList, setStationsList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [standby, setStandby] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);

  // UI state variables derived from playbackState
  const currentTrack = playbackState?.track_window?.current_track;
  const isPlaying = playbackState ? !playbackState.paused : false;
  const trackName = currentTrack?.name || 'SYSTEM IDLE';
  const trackArtist = currentTrack?.artists?.map(a => a.name).join(', ') || 'No Source Loaded';

  const handleEqPresetChange = (presetName) => {
    setEqPreset(presetName);
    localStorage.setItem('resonance_eq_preset', presetName);
    const found = EQ_PRESETS.find(p => p.name === presetName);
    if (found) {
      setEqBands(found.bands);
      setEqSaturation(found.saturation);
      setEqNoiseFloor(found.noiseFloor);
      setEqPreAmp(found.preAmp);
      localStorage.setItem('resonance_eq_bands', JSON.stringify(found.bands));
      localStorage.setItem('resonance_eq_saturation', found.saturation);
      localStorage.setItem('resonance_eq_noise', found.noiseFloor);
      localStorage.setItem('resonance_eq_preamp', found.preAmp);
    }
  };

  const handleBandChange = (index, val) => {
    const nextBands = [...eqBands];
    nextBands[index] = val;
    setEqBands(nextBands);
    localStorage.setItem('resonance_eq_bands', JSON.stringify(nextBands));
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
  };

  const handleSaturationChange = (val) => {
    setEqSaturation(val);
    localStorage.setItem('resonance_eq_saturation', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
  };

  const handleNoiseFloorChange = (val) => {
    setEqNoiseFloor(val);
    localStorage.setItem('resonance_eq_noise', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
  };

  const handlePreAmpChange = (val) => {
    setEqPreAmp(val);
    localStorage.setItem('resonance_eq_preamp', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
  };



  async function fetchFavorites() {
    try {
      const favs = await api.getFavoriteRadios();
      setFavoriteStations(favs || []);
    } catch (err) {
      console.warn('Failed to load favorite stations:', err);
    }
  }

  useEffect(() => {
    if (!radioSearch.trim()) {
      setStationsList(favoriteStations);
    }
  }, [radioSearch, favoriteStations]);

  useEffect(() => {
    fetchFavorites();
  }, []);

  function setVolumeWithLock(vol) {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setVolume(vol);
  }

  function setIsMutedWithLock(muted) {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setIsMuted(muted);
  }

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme);
    localStorage.setItem('resonance_theme', newTheme);
  };






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
    setSpotify: (isSpotify) => setSource(prev => isSpotify ? 'spotify' : (prev === 'spotify' ? 'local' : prev)),
    setSource,
    setDevices,
    onRequestSync: () => {
      syncCurrentState();
    },
    isAuthenticated: true,
    isRemote: false,
    setStandby
  });

  const handleToggleStandby = (enabled) => {
    setStandby(enabled);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled } }));
    }
  };

  // Auto-standby idle timer (10 minutes of paused/idle state triggers standby)
  useEffect(() => {
    if (standby || isPlaying) return;

    const idleTimeout = setTimeout(() => {
      console.log('[Kiosk] Auto-standby triggered due to 10 minutes of inactivity');
      handleToggleStandby(true);
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearTimeout(idleTimeout);
  }, [isPlaying, standby]);

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
      setStationsList(favoriteStations.length > 0 ? favoriteStations : DEFAULT_STATIONS);
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

  const handlePlayRadio = async (url, name, favicon) => {
    try {
      await api.localPlayRadio(url, name, favicon);
      if (source !== 'radio') {
        handleToggleSource('radio');
      }
    } catch (err) {
      toast.error(`Failed to play radio: ${err.message}`);
    }
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
  async function fetchDevices() {
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
  }

  // Transfer playback to target device
  const transferPlayback = async (targetId) => {
    try {
      await api.transferPlayback(token, targetId);
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
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      setRepeatState(repeatState);
      toast.error(`Repeat toggle failed: ${err.message}`);
    }
  };

  // Sync state manually from Spotify Web API
  async function syncCurrentState() {
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
  }

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

    if (volumeApiTimeout.current) {
      clearTimeout(volumeApiTimeout.current);
    }

    volumeApiTimeout.current = setTimeout(async () => {
      if (!spotify) {
        try {
          await api.localSetVolume(vol);
        } catch (err) {
          console.error('Local volume error:', err);
        }
        return;
      }
      if (!token) return;
      try {
        await api.setVolume(token, vol);
      } catch (err) {
        console.warn('Spotify volume adjustment warning (no active device or session):', err);
      }
    }, 180);
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

    if (!spotify) {
      try {
        await api.localSetVolume(targetVolume);
      } catch (err) {
        console.error('Local mute error:', err);
      }
      return;
    }

    if (!token) return;
    try {
      await api.setVolume(token, targetVolume);
    } catch (err) {
      console.warn('Spotify volume mute warning:', err);
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
  };

  return (
    <div data-theme={theme} className="w-screen h-screen flex items-center justify-center relative overflow-hidden p-6 select-none font-sans">
      
      {standby && (
        <div className="absolute inset-0 bg-black z-[9999] flex items-center justify-center flex-col animate-fade-in">
          <button
            onClick={() => handleToggleStandby(false)}
            className="group flex flex-col items-center justify-center gap-4 cursor-pointer focus:outline-none transition-all active:scale-95 screensaver-float"
            type="button"
            aria-label="Power on system"
          >
            <div className="w-24 h-24 rounded-full border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] hover:border-white/10 flex items-center justify-center transition-all duration-500 shadow-inner group-hover:scale-105">
              <Power className="h-10 w-10 text-white/10 group-hover:text-white/30 transition-colors duration-500" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/5 group-hover:text-white/15 transition-colors duration-500 font-sans font-extrabold mt-1">
              Tap to Wake
            </span>
          </button>
        </div>
      )}
      
      {/* Subtle retro glowing background spots */}
      <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full theme-bg-glow blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-emerald-950/5 blur-[150px] pointer-events-none" />

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
        <PlayerDisplay
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
          onToggleEqualizer={() => setIsEqualizerOpen(!isEqualizerOpen)}
          source={source}
          radioSearch={radioSearch}
          setRadioSearch={setRadioSearch}
          stationsList={stationsList}
          isSearching={isSearching}
          handleRadioSearch={handleRadioSearch}
          onPlayRadio={handlePlayRadio}
          favoriteStations={favoriteStations}
          onToggleFavoriteRadio={handleToggleFavoriteRadio}
          onToggleStandby={handleToggleStandby}
        />

        {/* Full-Screen Horizontal Equalizer Control Overlay */}
        <div 
          className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
            isEqualizerOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <EqualizerControl
            currentPreset={eqPreset}
            onPresetChange={handleEqPresetChange}
            bands={eqBands}
            onBandChange={handleBandChange}
            saturation={eqSaturation}
            onSaturationChange={handleSaturationChange}
            noiseFloor={eqNoiseFloor}
            onNoiseFloorChange={handleNoiseFloorChange}
            preAmp={eqPreAmp}
            onPreAmpChange={handlePreAmpChange}
            onClose={() => setIsEqualizerOpen(false)}
          />
        </div>

        {/* Full-Screen Horizontal Definitions Menu Overlay */}
        <div 
          className={`absolute inset-0 bg-[#050d1c] border border-zinc-300 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
            isMenuOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          {/* Header & Close Button */}
          <div className="flex justify-between items-center mb-3 select-none shrink-0">
            <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-700">System Configuration Control Panel</h4>
            <button 
              onClick={() => setIsMenuOpen(false)}
              className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg bg-white border border-zinc-250 shadow-sm active:scale-95"
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
              theme={theme}
              onThemeChange={handleThemeChange}
              otaProgress={otaProgress}
              setOtaProgress={setOtaProgress}
              otaPercent={otaPercent}
              setOtaPercent={setOtaPercent}
              source={source}
              onSetSource={(src) => {
                handleToggleSource(src);
                setIsMenuOpen(false);
              }}
              updateStatus={updateStatus}
              setUpdateStatus={setUpdateStatus}
              errorMessage={errorMessage}
              setErrorMessage={setErrorMessage}
            />
          </div>
        </div>
        <Toaster theme="dark" closeButton richColors position="bottom-right" visibleToasts={1} />
      </div>
    </div>
  );
}
