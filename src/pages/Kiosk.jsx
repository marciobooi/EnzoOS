import React, { useState, useEffect, useRef } from 'react';
import { toast, Toaster } from 'sonner';
import { api } from '../api';
import { useResonanceWS } from '../websocket';
import { Power, Search } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

// Subcomponents
import PlayerDisplay from '../components/PlayerDisplay';
import DefinitionsMenu from '../components/DefinitionsMenu';
import EqualizerControl, { EQ_PRESETS } from '../components/EqualizerControl';
import DspWizard from '../components/DspWizard';
import ThemeSettingsControl from '../components/ThemeSettingsControl';
import TrackSearch from '../components/TrackSearch';

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
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
  const [activeTheme, setActiveTheme] = useState(() => localStorage.getItem('resonance_theme_active') || 'dot-matrix');
  const [brightness, setBrightness] = useState(() => Number(localStorage.getItem('resonance_theme_brightness')) || 100);
  const [visualizerMode, setVisualizerMode] = useState(() => localStorage.getItem('resonance_visualizer_mode') || 'vu');
  const [isThemeSettingsOpen, setIsThemeSettingsOpen] = useState(false);
  const [remoteAccessEnabled, setRemoteAccessEnabled] = useState(true);
  const [isRemoteAccessOpen, setIsRemoteAccessOpen] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState('');

  const themeSyncTimeout = useRef(null);
  const queueThemeSync = (themeColor, activeThemeVal, brightnessVal, visualizerModeVal) => {
    if (themeSyncTimeout.current) clearTimeout(themeSyncTimeout.current);
    themeSyncTimeout.current = setTimeout(() => {
      sendUpdate('SET_THEME_SETTINGS', {
        themeColor,
        activeTheme: activeThemeVal,
        brightness: brightnessVal,
        visualizerMode: visualizerModeVal
      });
    }, 400);
  };

  const handleThemeColorChange = (newColor) => {
    setTheme(newColor);
    localStorage.setItem('resonance_theme', newColor);
    sendUpdate('SET_THEME_SETTINGS', {
      themeColor: newColor,
      activeTheme,
      brightness,
      visualizerMode
    });
  };

  const handleActiveThemeChange = (newTheme) => {
    setActiveTheme(newTheme);
    localStorage.setItem('resonance_theme_active', newTheme);
    sendUpdate('SET_THEME_SETTINGS', {
      themeColor: theme,
      activeTheme: newTheme,
      brightness,
      visualizerMode
    });
  };

  const handleBrightnessChange = (newVal) => {
    setBrightness(newVal);
    localStorage.setItem('resonance_theme_brightness', newVal);
    queueThemeSync(theme, activeTheme, newVal, visualizerMode);
  };

  const handleVisualizerModeChange = (mode) => {
    setVisualizerMode(mode);
    localStorage.setItem('resonance_visualizer_mode', mode);
    sendUpdate('SET_THEME_SETTINGS', {
      themeColor: theme,
      activeTheme,
      brightness,
      visualizerMode: mode
    });
  };

  const lastVolumeChangeTime = useRef(0);
  const volumeApiTimeout = useRef(null);
  const [favoriteStations, setFavoriteStations] = useState([]);

  const [otaProgress, setOtaProgress] = useState([]);
  const [otaPercent, setOtaPercent] = useState(0);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [source, setSource] = useState('spotify'); // 'spotify' | 'local' | 'radio'
  const spotify = source === 'spotify';

  const [radioCountry, setRadioCountry] = useState('');
  const [stationsList, setStationsList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [standby, setStandby] = useState(false);
  const [transitionScreen, setTransitionScreen] = useState(null); // 'welcome' | 'goodbye' | null
  const [isDspWizardOpen, setIsDspWizardOpen] = useState(false);
  const [dspActive, setDspActive] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);

  // UI state variables derived from playbackState
  const currentTrack = playbackState?.track_window?.current_track;
  const isPlaying = playbackState ? !playbackState.paused : false;
  const trackName = currentTrack?.name || 'SYSTEM IDLE';
  const trackArtist = currentTrack?.artists?.map(a => a.name).join(', ') || 'No Source Loaded';
  const albumImage = currentTrack?.album?.images?.[0]?.url || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=300&auto=format&fit=crop';

  const eqSyncTimeout = useRef(null);
  const queueEqSync = (presetName, nextBands, saturation, noiseFloor, preAmp) => {
    if (eqSyncTimeout.current) clearTimeout(eqSyncTimeout.current);
    eqSyncTimeout.current = setTimeout(() => {
      sendUpdate('SET_EQ_SETTINGS', {
        preset: presetName,
        bands: nextBands,
        saturation,
        noiseFloor,
        preAmp
      });
    }, 400);
  };

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

      // Sync preset change immediately
      sendUpdate('SET_EQ_SETTINGS', {
        preset: presetName,
        bands: found.bands,
        saturation: found.saturation,
        noiseFloor: found.noiseFloor,
        preAmp: found.preAmp
      });
    }
  };

  const handleBandChange = (index, val) => {
    const nextBands = [...eqBands];
    nextBands[index] = val;
    setEqBands(nextBands);
    localStorage.setItem('resonance_eq_bands', JSON.stringify(nextBands));
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', nextBands, eqSaturation, eqNoiseFloor, eqPreAmp);
  };

  const handleSaturationChange = (val) => {
    setEqSaturation(val);
    localStorage.setItem('resonance_eq_saturation', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, val, eqNoiseFloor, eqPreAmp);
  };

  const handleNoiseFloorChange = (val) => {
    setEqNoiseFloor(val);
    localStorage.setItem('resonance_eq_noise', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, eqSaturation, val, eqPreAmp);
  };

  const handlePreAmpChange = (val) => {
    setEqPreAmp(val);
    localStorage.setItem('resonance_eq_preamp', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, eqSaturation, eqNoiseFloor, val);
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
    if (!radioCountry) setStationsList([]);
  }, [radioCountry]);



  useEffect(() => {
    async function loadDspStatus() {
      try {
        const calibration = await api.getDspCalibration();
        if (calibration && calibration[0] === 'dsp') {
          setDspActive(true);
        } else {
          setDspActive(false);
        }
      } catch (err) {
        console.warn('Failed to load initial DSP active state:', err);
      }
    }
    loadDspStatus();
  }, []);

  async function handleDeactivateDsp() {
    try {
      const calibration = await api.getDspCalibration() || {};
      calibration[0] = 'eq';
      await api.saveDspCalibration(calibration);
      setDspActive(false);
    } catch (err) {
      console.warn('Failed to change audio processing mode:', err);
    }
  }

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

    // Poll every 3 seconds to track devices and playback state
    const pollIntervalId = setInterval(() => {
      fetchDevices();
      syncCurrentState();
    }, 3000);

    return () => clearInterval(pollIntervalId);
  }, [token]);

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
      syncCurrentState();
    },
    isAuthenticated: true,
    isRemote: false,
    setStandby,
    setEqPreset,
    setEqBands,
    setEqSaturation,
    setEqNoiseFloor,
    setEqPreAmp,
    setDspActive,
    setTheme,
    setActiveTheme,
    setBrightness,
    setRemoteAccessEnabled,
    onAudioLevels: (payload) => {
      window.dispatchEvent(new CustomEvent('resonance-audio-levels', { detail: payload }));
    },
    setVisualizerMode,
  });

  const checkUpdates = async () => {
    try {
      setUpdateStatus('checking');
      const data = await api.getUpdateStatus();
      if (data.updateAvailable) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('no-update');
      }
    } catch (err) {
      console.warn('Auto update check failed, defaulting to up-to-date status:', err);
      setUpdateStatus('no-update');
    }
  };

  useEffect(() => {
    if (isConnected) {
      fetchFavorites();
      checkUpdates();
    }
  }, [isConnected]);

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return 'Good Morning';
    if (h >= 12 && h < 17) return 'Good Afternoon';
    if (h >= 17 && h < 21) return 'Good Evening';
    return 'Good Night';
  };

  const handleToggleStandby = (enabled) => {
    if (transitionScreen) return;
    if (enabled) {
      setTransitionScreen('goodbye');
      setTimeout(() => {
        setTransitionScreen(null);
        setStandby(true);
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: true } }));
        }
      }, 2200);
    } else {
      setStandby(false);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: false } }));
      }
      setTransitionScreen('welcome');
      setTimeout(() => setTransitionScreen(null), 2800);
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

  const handleRadioByCountry = async (country) => {
    if (!country) { setStationsList([]); return; }
    try {
      setIsSearching(true);
      const res = await fetch(`https://de1.api.radio-browser.info/json/stations/bycountry/${encodeURIComponent(country)}?limit=60&hidebroken=true&order=votes`);
      const data = await res.json();
      const formatted = data.map(s => ({
        name: s.name.length > 22 ? s.name.substring(0, 20) + '...' : s.name,
        url: s.url_resolved || s.url,
        favicon: s.favicon,
        country: s.country,
        tags: s.tags,
      }));
      if (formatted.length === 0) toast.error('No stations found.');
      else setStationsList(formatted);
    } catch { toast.error('Failed to scan stations.'); }
    finally { setIsSearching(false); }
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

  // Liquid Glass Interaction Layer for Glassplayer and Dreamplayer Themes
  useEffect(() => {
    if (activeTheme !== 'glassplayer' && activeTheme !== 'dreamplayer') return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const root = document.documentElement;
    const screenEl = containerRef.current;
    if (!screenEl) return;

    let pointerX = 50;
    let pointerY = 50;
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;
    let rafId = null;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const updatePointer = (event) => {
      const rect = screenEl.getBoundingClientRect();
      const x = clamp(event.clientX - rect.left, 0, rect.width);
      const y = clamp(event.clientY - rect.top, 0, rect.height);

      pointerX = (x / rect.width) * 100;
      pointerY = (y / rect.height) * 100;

      targetTiltX = ((pointerY - 50) / 50) * -1.15;
      targetTiltY = ((pointerX - 50) / 50) * 1.45;

      root.style.setProperty('--pointer-x', `${pointerX.toFixed(2)}%`);
      root.style.setProperty('--pointer-y', `${pointerY.toFixed(2)}%`);
      root.style.setProperty('--pointer-x-raw', pointerX.toFixed(2));
      root.style.setProperty('--pointer-y-raw', pointerY.toFixed(2));

      if (!rafId) rafId = requestAnimationFrame(animateGlass);
    };

    const animateGlass = () => {
      currentTiltX += (targetTiltX - currentTiltX) * 0.08;
      currentTiltY += (targetTiltY - currentTiltY) * 0.08;

      screenEl.style.setProperty('--tilt-x', `${currentTiltX.toFixed(3)}deg`);
      screenEl.style.setProperty('--tilt-y', `${currentTiltY.toFixed(3)}deg`);

      const albumShiftX = ((pointerX - 50) / 50) * 5;
      const albumShiftY = ((pointerY - 50) / 50) * 4;
      const albumCol = screenEl.querySelector('.album-column');
      if (albumCol) {
        albumCol.style.setProperty('--album-shift-x', `${albumShiftX.toFixed(2)}px`);
        albumCol.style.setProperty('--album-shift-y', `${albumShiftY.toFixed(2)}px`);
      }

      if (Math.abs(targetTiltX - currentTiltX) > 0.01 || Math.abs(targetTiltY - currentTiltY) > 0.01) {
        rafId = requestAnimationFrame(animateGlass);
      } else {
        rafId = null;
      }
    };

    const resetPointer = () => {
      pointerX = 50;
      pointerY = 50;
      targetTiltX = 0;
      targetTiltY = 0;

      root.style.setProperty('--pointer-x', '50%');
      root.style.setProperty('--pointer-y', '50%');
      root.style.setProperty('--pointer-x-raw', '50');
      root.style.setProperty('--pointer-y-raw', '50');

      const buttons = [...screenEl.querySelectorAll('.icon-button')];
      buttons.forEach((button) => {
        button.style.setProperty('--button-x', '50%');
        button.style.setProperty('--button-y', '18%');
        button.style.transform = '';
      });

      const albumCol = screenEl.querySelector('.album-column');
      if (albumCol) {
        albumCol.style.setProperty('--album-shift-x', '0px');
        albumCol.style.setProperty('--album-shift-y', '0px');
      }

      if (!rafId) rafId = requestAnimationFrame(animateGlass);
    };

    const updateButtonLens = (event) => {
      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * 100;
      const y = ((event.clientY - rect.top) / rect.height) * 100;

      button.style.setProperty('--button-x', `${clamp(x, 0, 100).toFixed(1)}%`);
      button.style.setProperty('--button-y', `${clamp(y, 0, 100).toFixed(1)}%`);

      const moveX = ((x - 50) / 50) * 3.5;
      const moveY = ((y - 50) / 50) * 3.5;
      button.style.transform = `translate(${moveX.toFixed(2)}px, ${moveY.toFixed(2)}px) scale(1.035)`;
    };

    const resetButtonLens = (event) => {
      const button = event.currentTarget;
      button.style.setProperty('--button-x', '50%');
      button.style.setProperty('--button-y', '18%');
      button.style.transform = '';
    };

    screenEl.addEventListener('pointermove', updatePointer, { passive: true });
    screenEl.addEventListener('pointerleave', resetPointer, { passive: true });

    // Initial binding
    const buttons = [...screenEl.querySelectorAll('.icon-button')];
    buttons.forEach((button) => {
      button.style.setProperty('--button-x', '50%');
      button.style.setProperty('--button-y', '18%');
      button.addEventListener('pointermove', updateButtonLens, { passive: true });
      button.addEventListener('pointerleave', resetButtonLens, { passive: true });
    });

    // Cleanup listeners
    return () => {
      screenEl.removeEventListener('pointermove', updatePointer);
      screenEl.removeEventListener('pointerleave', resetPointer);
      buttons.forEach((button) => {
        button.removeEventListener('pointermove', updateButtonLens);
        button.removeEventListener('pointerleave', resetButtonLens);
      });
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [activeTheme, isMenuOpen, isEqualizerOpen, source]);

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
      setIsSearchOpen(false);
      setTimeout(syncCurrentState, 800);
    } catch (err) {
      toast.error(`Play error: ${err.message}`);
    }
  };

  // Play an album or playlist context on the active device
  const handlePlayContext = async (contextUri) => {
    try {
      const activeId = resonanceDeviceId || (devices.find(d => d.is_active)?.id);
      await api.play(token, activeId, contextUri);
      setIsSearchOpen(false);
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
    <div 
      data-theme={theme} 
      data-active-theme={activeTheme} 
      className="w-screen h-screen flex items-center justify-center relative overflow-hidden p-6 select-none font-sans"
      style={{ '--album-art-url': `url(${albumImage})` }}
    >
      
      {/* Dynamic Album Art Blur Canvas for Premium Glass Themes */}
      <div className="album-bg-blur" />
      
      {standby && (
        <div className="absolute inset-0 bg-black z-[9999] flex items-center justify-center flex-col animate-fade-in">
          <button
            onClick={() => handleToggleStandby(false)}
            className="group flex flex-col items-center justify-center gap-4 cursor-pointer focus:outline-none transition-all active:scale-95 screensaver-float"
            type="button"
            aria-label="Power on system"
          >
            <div className="w-24 h-24 rounded-full border border-white/20 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/35 flex items-center justify-center transition-all duration-500 shadow-inner group-hover:scale-105">
              <Power className="h-10 w-10 text-white/40 group-hover:text-white/70 transition-colors duration-500" />
            </div>
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/30 group-hover:text-white/55 transition-colors duration-500 font-sans font-extrabold mt-1">
              Tap to Wake
            </span>
          </button>
        </div>
      )}

      {transitionScreen === 'welcome' && (
        <div className="absolute inset-0 bg-black z-[9998] flex items-center justify-center pointer-events-none select-none animate-kiosk-welcome">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="text-[9px] font-mono uppercase tracking-[0.55em] text-white/20">Resonance HiFi</div>
            <div className="text-[3.8rem] font-black text-white tracking-tight leading-none">{getGreeting()}</div>
            <div className="w-10 h-px bg-white/12" />
            <div className="text-[9px] font-mono uppercase tracking-[0.3em] text-white/18">Enjoy the music</div>
          </div>
        </div>
      )}

      {transitionScreen === 'goodbye' && (
        <div className="absolute inset-0 bg-black z-[9998] flex items-center justify-center pointer-events-none select-none animate-kiosk-goodbye">
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="text-[3.8rem] font-black text-white tracking-tight leading-none">See you soon</div>
            <div className="w-10 h-px bg-white/12" />
            <div className="text-[9px] font-mono uppercase tracking-[0.55em] text-white/20">Resonance HiFi</div>
          </div>
        </div>
      )}
      
      {/* Subtle retro glowing background spots */}
      <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full theme-bg-glow blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full bg-emerald-950/5 blur-[150px] pointer-events-none" />

      <div 
        ref={containerRef}
        className="music-player-container"
        style={{
          '--scale-kiosk': scale,
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
          theme={theme}
          activeTheme={activeTheme}
          visualizerMode={visualizerMode}
          onVisualizerModeChange={handleVisualizerModeChange}
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
          onToggleSearch={() => setIsSearchOpen(!isSearchOpen)}
          source={source}
          radioCountry={radioCountry}
          setRadioCountry={setRadioCountry}
          stationsList={stationsList}
          isSearching={isSearching}
          handleRadioByCountry={handleRadioByCountry}
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
            dspActive={dspActive}
            onDeactivateDsp={handleDeactivateDsp}
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
              onThemeChange={handleThemeColorChange}
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
              onOpenDspWizard={() => {
                setIsDspWizardOpen(true);
                setIsMenuOpen(false);
              }}
              onOpenThemeSettings={() => {
                setIsThemeSettingsOpen(true);
                setIsMenuOpen(false);
              }}
              remoteAccessEnabled={remoteAccessEnabled}
              onToggleRemoteAccess={(enabled) => {
                setRemoteAccessEnabled(enabled);
                sendUpdate('SET_REMOTE_ACCESS', { enabled });
              }}
              onOpenRemoteAccess={async () => {
                setIsMenuOpen(false);
                try {
                  const r = await fetch('/api/system/lan-url');
                  const d = await r.json();
                  setRemoteUrl(d.url);
                } catch {
                  setRemoteUrl(`http://${window.location.hostname}:5000/remote`);
                }
                setIsRemoteAccessOpen(true);
              }}
            />
          </div>
        </div>

        {/* Full-Screen Spotify Search & Browse Overlay */}
        <div 
          className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
            isSearchOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex justify-between items-center mb-3 select-none shrink-0">
            <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-700 flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              Spotify Search & Browse
            </h4>
            <button 
              onClick={() => setIsSearchOpen(false)}
              className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg bg-white border border-zinc-250 shadow-sm active:scale-95"
            >
              CLOSE [X]
            </button>
          </div>
          <div className="flex-grow min-h-0 overflow-hidden">
            <TrackSearch
              token={token}
              onPlayTrack={handlePlayTrack}
              onPlayContext={handlePlayContext}
              isDrawer={false}
            />
          </div>
        </div>

        {/* Full-Screen Theme Settings Overlay */}
        <div 
          className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
            isThemeSettingsOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <ThemeSettingsControl
            activeTheme={activeTheme}
            onThemeChange={handleActiveThemeChange}
            themeColor={theme}
            onColorChange={handleThemeColorChange}
            brightness={brightness}
            onBrightnessChange={handleBrightnessChange}
            visualizerMode={visualizerMode}
            onVisualizerModeChange={handleVisualizerModeChange}
            onClose={() => setIsThemeSettingsOpen(false)}
          />
        </div>

        {/* Full-Screen Remote Access Panel Overlay */}
        <div
          className={`absolute inset-0 bg-[#0b0f19] border border-white/10 rounded-3xl shadow-2xl z-[60] transform transition-all duration-300 ease-in-out flex flex-col p-5 font-sans ${
            isRemoteAccessOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <div className="flex justify-between items-center mb-4 select-none shrink-0">
            <h4 className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-zinc-400">Remote Access Panel</h4>
            <button
              onClick={() => setIsRemoteAccessOpen(false)}
              className="text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer text-[10px] font-extrabold font-sans px-3.5 py-1 rounded-lg bg-white border border-zinc-250 shadow-sm active:scale-95"
            >
              CLOSE [X]
            </button>
          </div>

          <div className="flex-grow flex flex-row gap-8 items-center min-h-0">
            {/* Left: status + enable/disable */}
            <div className="flex flex-col gap-4 shrink-0 w-52">
              <div className="flex items-center gap-2.5">
                <div className={`w-2 h-2 rounded-full shrink-0 ${remoteAccessEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-zinc-200">
                  {remoteAccessEnabled ? 'Access Enabled' : 'Access Disabled'}
                </span>
              </div>
              <p className="text-[9px] text-zinc-500 leading-relaxed">
                Allow mobile devices on the same network to connect and control this player.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { setRemoteAccessEnabled(true); sendUpdate('SET_REMOTE_ACCESS', { enabled: true }); }}
                  className={`py-2.5 px-4 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                    remoteAccessEnabled
                      ? 'bg-[var(--theme-color)] text-black shadow-[0_0_12px_var(--theme-color-glow)]'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  Enable Remote
                </button>
                <button
                  onClick={() => { setRemoteAccessEnabled(false); sendUpdate('SET_REMOTE_ACCESS', { enabled: false }); }}
                  className={`py-2.5 px-4 rounded-xl text-[10px] font-extrabold uppercase tracking-widest transition-all active:scale-95 cursor-pointer ${
                    !remoteAccessEnabled
                      ? 'bg-red-500/80 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                  }`}
                >
                  Disable Remote
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="w-px self-stretch bg-white/5 shrink-0" />

            {/* Right: QR code + URL + instructions */}
            <div className="flex-grow flex flex-row items-center gap-10">
              <div className={`p-3 rounded-2xl shrink-0 transition-opacity duration-300 ${remoteAccessEnabled ? 'bg-white opacity-100' : 'bg-zinc-800 opacity-30'}`}>
                <QRCodeSVG
                  value={remoteUrl}
                  size={148}
                  bgColor={remoteAccessEnabled ? '#ffffff' : '#1f2937'}
                  fgColor="#000000"
                  level="M"
                />
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 mb-1.5">Remote URL</p>
                  <p className="text-[11px] font-mono text-[var(--theme-color)] break-all">{remoteUrl}</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-[8px] font-extrabold uppercase tracking-widest text-zinc-500 mb-0.5">How to connect</p>
                  <p className="text-[9px] text-zinc-400">1 · Point your phone camera at the QR code</p>
                  <p className="text-[9px] text-zinc-400">2 · Open the link in your mobile browser</p>
                  <p className="text-[9px] text-zinc-400">3 · Both devices must be on the same Wi-Fi</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full-Screen CamillaDSP Calibration Wizard Overlay */}
        <div
          className={`absolute inset-0 bg-[#070b13] border border-white/10 rounded-3xl shadow-2xl z-50 transform transition-all duration-300 ease-in-out flex flex-col p-1.5 font-sans ${
            isDspWizardOpen ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <DspWizard
            onClose={() => setIsDspWizardOpen(false)}
            onCalibrationComplete={(active) => setDspActive(active)}
          />
        </div>

        <Toaster theme="dark" closeButton richColors position="bottom-right" visibleToasts={1} />
      </div>

      {/* Backlight Brightness hardware simulation overlay */}
      <div 
        className="fixed inset-0 bg-black pointer-events-none z-[99999] transition-opacity duration-300" 
        style={{ opacity: (100 - brightness) / 100 }} 
      />
    </div>
  );
}
