import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { toast } from '../lib/toast';
import { reportError } from '../lib/errors';
import { api } from '../api';
import { useResonanceWS } from '../websocket';
import { EQ_PRESETS } from '../components/EqualizerControl';
import { getGreeting } from '../lib/format';
import { useStableCallback } from '../lib/useStableCallback';
import { LIBRESPOT_DEVICE_NAME } from '../lib/spotifyDevice';

// Subcomponents
import PlayerDisplay from '../components/PlayerDisplay';

// Kiosk context + overlay components
import { Kk } from '../components/kiosk/KioskContext';
import StandbyOverlay from '../components/kiosk/StandbyOverlay';
import EqualizerOverlay from '../components/kiosk/EqualizerOverlay';
import AlbumInfoOverlay from '../components/kiosk/AlbumInfoOverlay';
import SettingsMenuOverlay from '../components/kiosk/SettingsMenuOverlay';
import UniversalSearchOverlay from '../components/kiosk/UniversalSearchOverlay';
import ThemeSettingsOverlay from '../components/kiosk/ThemeSettingsOverlay';
import RemoteAccessOverlay from '../components/kiosk/RemoteAccessOverlay';
import DspWizardOverlay from '../components/kiosk/DspWizardOverlay';
import RadioSearchOverlay from '../components/kiosk/RadioSearchOverlay';
import WifiOverlay from '../components/kiosk/WifiOverlay';
import SystemAdminOverlay from '../components/kiosk/SystemAdminOverlay';

// Guards the radio "now playing" art lookup (see syncRadioIcy below) against
// commercial breaks, news segments, and station IDs that some encoders push
// through ICY's StreamTitle instead of leaving it alone — wasting a lookup
// on these is harmless, but the server-side match-quality check can't help
// if the "artist" being searched for is itself junk to begin with.
const NON_MUSIC_PATTERN = /publicidade|an[uú]ncio|not[íi]cias?|\bnews\b|advert|commercial break|jingle|station\s?id/i;

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
  // True for the duration of a drag on the seek bar — guards the 1s ticker
  // below from fighting the user's in-progress drag (AUDIT-2026-08-02, see
  // handleSeek/commitSeek).
  const isSeekingRef = useRef(false);

  // Volume state (0 - 100)
  const [volume, setVolume] = useState(50);
  const [isMuted, setIsMuted] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAlbumInfoOpen, setIsAlbumInfoOpen] = useState(false);
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
  // remoteUrl is the IP-based link (primary — the server reads the current
  // LAN IP per request, so it's always dynamic); remoteHostUrl is the
  // resonance.local alternate, which needs mDNS to resolve on the phone.
  const [remoteUrl, setRemoteUrl] = useState('');
  const [remoteHostUrl, setRemoteHostUrl] = useState('');
  const [isWifiOpen, setIsWifiOpen] = useState(false);
  const [isSystemAdminOpen, setIsSystemAdminOpen] = useState(false);

  // Populates the Remote Access panel's QR code + "remote url" display —
  // was declared but never actually fetched, so that panel always showed
  // "—" with no IP. One-shot on mount: the LAN IP doesn't change mid-session.
  useEffect(() => {
    fetch('/api/system/lan-url')
      .then(r => r.json())
      .then(d => {
        if (d?.url) setRemoteUrl(d.url);
        if (d?.hostUrl) setRemoteHostUrl(d.hostUrl);
      })
      .catch(() => {});
  }, []);

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
    }, 800);
  };

  const handleThemeColorChange = useStableCallback((newColor) => {
    setTheme(newColor);
    localStorage.setItem('resonance_theme', newColor);
    sendUpdate('SET_THEME_SETTINGS', {
      themeColor: newColor,
      activeTheme,
      brightness,
      visualizerMode
    });
  });

  // The first-boot welcome wizard (App-level, no WS context) asks for the accent
  // colour and skin via these events; apply both through the normal theme path so
  // they persist (localStorage + SET_THEME_SETTINGS).
  useEffect(() => {
    const onSetTheme = (e) => { if (e.detail) handleThemeColorChange(e.detail); };
    const onSetSkin  = (e) => { if (e.detail) handleActiveThemeChange(e.detail); };
    window.addEventListener('resonance:set-theme', onSetTheme);
    window.addEventListener('resonance:set-skin', onSetSkin);
    return () => {
      window.removeEventListener('resonance:set-theme', onSetTheme);
      window.removeEventListener('resonance:set-skin', onSetSkin);
    };
  }, [theme, activeTheme, brightness, visualizerMode]);

  const handleActiveThemeChange = useStableCallback((newTheme) => {
    setActiveTheme(newTheme);
    localStorage.setItem('resonance_theme_active', newTheme);
    sendUpdate('SET_THEME_SETTINGS', {
      themeColor: theme,
      activeTheme: newTheme,
      brightness,
      visualizerMode
    });
  });

  const handleBrightnessChange = useStableCallback((newVal) => {
    setBrightness(newVal);
    localStorage.setItem('resonance_theme_brightness', newVal);
    queueThemeSync(theme, activeTheme, newVal, visualizerMode);
  });

  const handleVisualizerModeChange = useStableCallback((mode) => {
    setVisualizerMode(mode);
    localStorage.setItem('resonance_visualizer_mode', mode);
    sendUpdate('SET_THEME_SETTINGS', {
      themeColor: theme,
      activeTheme,
      brightness,
      visualizerMode: mode
    });
  });

  const lastVolumeChangeTime = useRef(0);
  const volumeApiTimeout = useRef(null);
  const lastNonZeroVolume = useRef(50);
  const spotifyVolPinned = useRef(false);
  const raspotifyRestartInFlight = useRef(false);
  const standbyRef = useRef(false);
  const volumeRef = useRef(volume);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  const isMutedRef = useRef(isMuted);
  useEffect(() => { isMutedRef.current = isMuted; }, [isMuted]);
  const [favoriteStations, setFavoriteStations] = useState([]);

  const [otaProgress, setOtaProgress] = useState([]);
  const [otaPercent, setOtaPercent] = useState(0);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [source, setSource] = useState('spotify'); // 'spotify' | 'local' | 'radio'
  const spotify = source === 'spotify';
  // Re-pin the Spotify device to unity next time it becomes active.
  useEffect(() => { if (!spotify) spotifyVolPinned.current = false; }, [spotify]);

  const [radioCountry, setRadioCountry] = useState('');
  const [stationsList, setStationsList] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isRadioSearchOpen, setIsRadioSearchOpen] = useState(false);
  const [standby, setStandby] = useState(false);
  const [transitionScreen, setTransitionScreen] = useState('welcome'); // 'welcome' | 'goodbye' | null
  const [isDspWizardOpen, setIsDspWizardOpen] = useState(false);
  const [dspActive, setDspActive] = useState(false);
  const [signalInfo, setSignalInfo] = useState(null);
  const [pureDirect, setPureDirect] = useState(false);
  const [scale, setScale] = useState(1);
  const containerRef = useRef(null);
  // Tracks the current source synchronously — used to fence in-flight async
  // polls so they don't overwrite state after a source switch.
  const sourceRef = useRef(source);
  useEffect(() => { sourceRef.current = source; }, [source]);

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
    }, 800);
  };

  const handleEqPresetChange = useStableCallback((presetName) => {
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
  });

  const handleBandChange = useStableCallback((index, val) => {
    const nextBands = [...eqBands];
    nextBands[index] = val;
    setEqBands(nextBands);
    localStorage.setItem('resonance_eq_bands', JSON.stringify(nextBands));
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', nextBands, eqSaturation, eqNoiseFloor, eqPreAmp);
  });

  const handleSaturationChange = useStableCallback((val) => {
    setEqSaturation(val);
    localStorage.setItem('resonance_eq_saturation', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, val, eqNoiseFloor, eqPreAmp);
  });

  const handleNoiseFloorChange = useStableCallback((val) => {
    setEqNoiseFloor(val);
    localStorage.setItem('resonance_eq_noise', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, eqSaturation, val, eqPreAmp);
  });

  const handlePreAmpChange = useStableCallback((val) => {
    setEqPreAmp(val);
    localStorage.setItem('resonance_eq_preamp', val);
    setEqPreset('Custom');
    localStorage.setItem('resonance_eq_preset', 'Custom');
    queueEqSync('Custom', eqBands, eqSaturation, eqNoiseFloor, val);
  });



  async function fetchFavorites() {
    try {
      const favs = await api.getFavoriteRadios();
      setFavoriteStations(favs || []);
    } catch (err) {
      console.warn('Failed to load favorite stations:', err);
    }
  }

  // Welcome screen is dismissed by the video's onEnded event in StandbyOverlay.
  // 60 s hard-cap fallback in case the video fails to load or has no end event.
  useEffect(() => {
    const t = setTimeout(() => setTransitionScreen(null), 60_000);
    return () => clearTimeout(t);
  }, []);

  // (An effect that reset stationsList when radioCountry was cleared used to
  // live here — but setRadioCountry is only ever called from CountryPicker
  // with a real country name, so it only fired once on mount, setting [] to
  // the [] it was already initialised to: a pointless extra render + kioskCtx
  // memo recompute. Removed in the derived-state audit.)



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

  const handleDeactivateDsp = useStableCallback(async () => {
    try {
      const calibration = await api.getDspCalibration() || {};
      calibration[0] = 'eq';
      await api.saveDspCalibration(calibration);
      setDspActive(false);
    } catch (err) {
      console.warn('Failed to change audio processing mode:', err);
    }
  });

  function setVolumeWithLock(vol) {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setVolume(vol);
  }

  function setIsMutedWithLock(muted) {
    if (Date.now() - lastVolumeChangeTime.current < 2500) return;
    setIsMuted(muted);
  }






  // Set up periodic device list and state fetching — only while source is Spotify.
  // Must depend on `spotify` so the interval is torn down when switching away from Spotify;
  // otherwise the stale closure keeps polling and overwrites non-Spotify playback state.
  //
  // Playback state (/me/player) and the device list (/me/player/devices) used to
  // poll together every 3s. Playback state genuinely needs that cadence — it's
  // the only way to notice a track/pause/seek change made from another Spotify
  // client (Spotify's Connect API has no push mechanism for third parties).
  // The device list barely ever changes (only raspotify restarting, or another
  // device connecting/disconnecting) and only feeds the auto-reclaim check a
  // few effects down, which doesn't need sub-10s responsiveness — so it's now
  // on its own much slower interval instead of doubling every playback-state
  // poll's request count for no visible benefit.
  useEffect(() => {
    if (!token || !spotify) return;

    syncCurrentState();
    const stateIntervalId = setInterval(syncCurrentState, 3000);

    fetchDevices({ silent: true });
    const devicesIntervalId = setInterval(() => fetchDevices({ silent: true }), 15000);

    return () => {
      clearInterval(stateIntervalId);
      clearInterval(devicesIntervalId);
    };
  }, [token, spotify]);

  // Poll MPD ICY metadata for radio source — some stations send StreamTitle
  // in "Artist - Song" format. Falls back silently when no ICY data present.
  //
  // Also opportunistically fetches real cover art for whatever's actually
  // playing (radio has no album art of its own — ICY never carries one) and
  // swaps it in when found, falling back to the station's own icon
  // otherwise. Requested live: "we could improve and fetch the album of
  // that band pic... or maybe the radio provides this? if not we could
  // fetch from one of the services we already have" (AUDIT-2026-08-02).
  //
  // Deliberately reactive only, never predictive — live radio has no queue
  // to look ahead into ("careful, it's live radio, I don't know how to get
  // the next song"), so this only ever reacts to whatever ICY says is
  // playing right now, the instant it changes.
  //
  // NON_MUSIC_PATTERN (module-level, above) guards against wasting a lookup
  // (or worse, showing a confidently wrong cover) during a commercial break,
  // news segment, or station ID ("we need to be smart with this"). The
  // server side (fromItunesTrackArt) additionally verifies the returned
  // artist actually matches before trusting any result, since iTunes' fuzzy
  // search will still return a "closest guess" for genuinely non-song input.
  const radioFaviconRef = useRef(null);
  const lastIcyKeyRef = useRef(null);

  useEffect(() => {
    if (source !== 'radio') return;
    radioFaviconRef.current = null;
    lastIcyKeyRef.current = null;

    const syncRadioIcy = async () => {
      try {
        const status = await api.localGetStatus();
        if (!status?.name) return;
        // The server now strips URLs/XML and parses the artist out of Dalet
        // metadata. Prefer that; otherwise stations send "Artist - Song" in the
        // title — split on the first " - ".
        let icyTitle, icyArtist;
        if (status.artist) {
          icyTitle  = status.name;
          icyArtist = status.artist;
        } else {
          const sep = status.name.indexOf(' - ');
          icyTitle  = sep > 0 ? status.name.slice(sep + 3) : status.name;
          icyArtist = sep > 0 ? status.name.slice(0, sep)  : null;
        }

        const key = `${icyArtist || ''}::${icyTitle}`;
        const isNewTrack = key !== lastIcyKeyRef.current;
        lastIcyKeyRef.current = key;
        if (!isNewTrack) return;

        setPlaybackState(prev => {
          if (!prev) return prev;
          const cur = prev.track_window?.current_track;
          if (cur?.name === icyTitle) return prev; // no change
          // Remember the station's own icon (set when the station started
          // playing) the first time we touch this track, so a failed/no-art
          // lookup below has something correct to fall back to instead of a
          // stale previous track's cover.
          if (radioFaviconRef.current === null) {
            radioFaviconRef.current = cur?.album?.images?.[0]?.url || '';
          }
          return {
            ...prev,
            track_window: {
              ...prev.track_window,
              current_track: {
                ...cur,
                name:    icyTitle,
                artists: icyArtist ? [{ name: icyArtist }] : (cur?.artists || [{ name: 'Live Stream' }]),
                album: {
                  name: cur?.album?.name || 'Web Radio Broadcast',
                  images: radioFaviconRef.current ? [{ url: radioFaviconRef.current }] : [],
                },
              },
            },
          };
        });

        if (!icyArtist || !icyTitle || NON_MUSIC_PATTERN.test(icyArtist) || NON_MUSIC_PATTERN.test(icyTitle)) return;
        try {
          const art = await api.getTrackArt(icyArtist, icyTitle);
          // Bail if the station moved on to another track while this was in
          // flight — never apply a stale lookup's art to whatever's airing now.
          if (!art?.artworkUrl || lastIcyKeyRef.current !== key) return;
          setPlaybackState(prev => {
            if (!prev) return prev;
            const cur = prev.track_window?.current_track;
            if (cur?.name !== icyTitle) return prev;
            return {
              ...prev,
              track_window: {
                ...prev.track_window,
                current_track: { ...cur, album: { ...cur.album, images: [{ url: art.artworkUrl }] } },
              },
            };
          });
        } catch {}
      } catch {}
    };

    syncRadioIcy();
    const id = setInterval(() => { if (!standbyRef.current) syncRadioIcy(); }, 10000);
    return () => clearInterval(id);
  }, [source]);

  // Poll MPD state for local source so track info and paused state stay current
  // on both kiosk and remote. Torn down when source changes away from local.
  // NOT 'dj': DJ mode (server/dj.js) plays via Spotify Web API calls, not
  // MPD — it pushes BROADCAST_STATE itself once it has real Spotify
  // now-playing data, so polling MPD here as well would just read "nothing
  // playing" and fight that broadcast.
  useEffect(() => {
    if (source !== 'local') return;

    syncLocalState();
    const id = setInterval(() => {
      if (!standbyRef.current) syncLocalState();
    }, 3000);
    return () => clearInterval(id);
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // AUDIT-2026-08-02: during DJ mode this used to re-broadcast the
      // kiosk's own CACHED playbackState unconditionally — which is stale
      // during DJ mode specifically, because syncCurrentState()'s own poll
      // (a few lines down) is gated on source === 'spotify' and never runs
      // while source === 'dj'. dj.js already broadcasts authoritative state
      // itself on every track start and poll tick, so this echo is not just
      // redundant during DJ mode but actively harmful: a remote seek calls
      // requestWSStateSync() right after seeking, which reaches the kiosk
      // here, and the kiosk's stale pre-seek position would immediately
      // overwrite the just-seeked one on every screen. For a non-DJ source
      // this self-corrects near-instantly (syncCurrentState below DOES run
      // and fetches a fresh position moments later), which is why the same
      // action "worked in Spotify, not in DJ" — reported live.
      if (source !== 'dj' && ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({
          type: 'BROADCAST_STATE',
          payload: { ...(playbackState || {}), volume, is_muted: isMuted },
        }));
      }
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
    setPureDirect,
    onQrRedeemed: () => {
      window.dispatchEvent(new CustomEvent('resonance-qr-redeemed'));
    },
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

  // Poll /api/player/signal-path — live rate, clipping, and path info. Sample
  // rate/DSP path only actually change on a track or source switch, so this
  // doesn't need sub-10s freshness the way the Spotify playback-state poll does.
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/player/signal-path');
        if (r.ok) setSignalInfo(await r.json());
      } catch {}
    };
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, []);

  const handleTogglePureDirect = useStableCallback(async (enabled) => {
    try {
      await fetch('/api/player/pure-direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      setPureDirect(enabled);
    } catch (err) {
      console.error('[Kiosk] Pure Direct toggle failed:', err);
    }
  });

  const handleToggleStandby = useStableCallback((enabled) => {
    if (transitionScreen) return;
    if (enabled) {
      // Mark standby immediately so syncCurrentState stops polling during the goodbye animation
      standbyRef.current = true;
      setTransitionScreen('goodbye');
      setTimeout(() => {
        setTransitionScreen(null);
        setStandby(true);
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: true } }));
        }
      }, 2200);
    } else {
      // No 'welcome' transition screen here (removed AUDIT-2026-08-02) — it
      // used to hold a branded logo animation over the player for ~2.8s on
      // EVERY wake, stacked on top of the physical display's own hardware
      // power-on latency and the wake-monitor's tap-swallow delay. Reported
      // live as "touch to activate... takes time to activate." Waking from
      // standby is a routine, frequent action (unlike a first boot), so it
      // should be instant — the player is visible the moment the physical
      // screen lights back up, not several seconds after.
      standbyRef.current = false;
      setStandby(false);
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: 'SET_STANDBY', payload: { enabled: false } }));
      }
    }
  });

  // Keep standbyRef always current so async callbacks (syncCurrentState, polling) can read it
  useEffect(() => { standbyRef.current = standby; }, [standby]);

  // Auto-standby idle timer (10 minutes of paused/idle state triggers standby)
  useEffect(() => {
    if (standby || isPlaying) return;

    const idleTimeout = setTimeout(() => {
      console.log('[Kiosk] Auto-standby triggered due to 10 minutes of inactivity');
      handleToggleStandby(true);
    }, 10 * 60 * 1000); // 10 minutes

    return () => clearTimeout(idleTimeout);
  }, [isPlaying, standby]);

  // Auto-dim (not full standby) while music plays and the screen goes
  // untouched for a while. Full black standby above is deliberately gated on
  // !isPlaying — it never fires while music is going, which used to mean NO
  // power-saving at all during a long unattended playback session (the
  // physical display just stayed at full brightness indefinitely). Dimming
  // instead keeps now-playing glanceable without a wake gesture and restores
  // instantly on the next touch (no display power-cycle, no hardware wake
  // latency) — reserving the heavier full-standby treatment for genuine idle
  // (no music, no activity) as requested live: "if music is playing we will
  // never enter standby... what we can do is dim a bit after 10 minutes...
  // the full screen standby is only when nothing happens, no music etc"
  // (AUDIT-2026-08-02). Does not touch localStorage — this is a temporary
  // auto-dim, not a change to the user's actual brightness preference.
  const DIM_IDLE_MS = 10 * 60 * 1000;
  const DIM_BRIGHTNESS = 15;
  const isDimmedRef = useRef(false);
  const preDimBrightness = useRef(null);
  const dimTimeoutRef = useRef(null);
  // Kept in sync below so the timer callback (captured once per effect run,
  // which could be up to DIM_IDLE_MS stale) always dims from the CURRENT
  // brightness rather than whatever it was when the effect last (re-)ran.
  const brightnessRef = useRef(brightness);
  useEffect(() => { brightnessRef.current = brightness; }, [brightness]);

  const applyBrightnessNow = useStableCallback((val) => {
    setBrightness(val);
    queueThemeSync(theme, activeTheme, val, visualizerMode);
  });

  const wakeFromDim = useStableCallback(() => {
    if (!isDimmedRef.current) return;
    isDimmedRef.current = false;
    if (preDimBrightness.current != null) applyBrightnessNow(preDimBrightness.current);
    preDimBrightness.current = null;
  });

  useEffect(() => {
    if (!isPlaying || standby) { clearTimeout(dimTimeoutRef.current); return; }

    const armDimTimer = () => {
      clearTimeout(dimTimeoutRef.current);
      dimTimeoutRef.current = setTimeout(() => {
        preDimBrightness.current = brightnessRef.current;
        isDimmedRef.current = true;
        applyBrightnessNow(DIM_BRIGHTNESS);
      }, DIM_IDLE_MS);
    };

    const onActivity = () => { wakeFromDim(); armDimTimer(); };

    armDimTimer();
    window.addEventListener('pointerdown', onActivity);
    return () => {
      clearTimeout(dimTimeoutRef.current);
      window.removeEventListener('pointerdown', onActivity);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, standby]);

  // Music stopping or standby engaging while dimmed shouldn't leave the
  // display stuck dim — restore immediately rather than waiting for a touch
  // that may not come until the next listening session.
  useEffect(() => {
    if (!isPlaying || standby) wakeFromDim();
  }, [isPlaying, standby, wakeFromDim]);

  const handleToggleSource = useStableCallback((targetSource) => {
    let nextSource = targetSource;
    if (!targetSource || typeof targetSource !== 'string') {
      nextSource = source === 'spotify' ? 'local' : (source === 'local' ? 'radio' : 'spotify');
    }

    // ── Immediately silence the CURRENT source ────────────────────────────────
    // Fire-and-forget before the async server event queue even processes
    // SET_SOURCE. Every source type has a direct stop call so there is no
    // audio bleed between sources regardless of queue latency.
    switch (source) {
      case 'local':
      case 'radio':
        fetch('/api/player/pause', { method: 'POST' }).catch(() => {});
        break;
      case 'spotify':
        if (token) {
          // 404 = no active player (nothing to pause) — safe to ignore
          fetch('https://api.spotify.com/v1/me/player/pause', {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` },
          }).catch(() => {});
        }
        break;
      case 'airplay':
        fetch('/api/player/airplay/stop', { method: 'POST' }).catch(() => {});
        break;
      case 'upnp':
        fetch('/api/player/upnp/stop', { method: 'POST' }).catch(() => {});
        break;
      case 'bluetooth':
        fetch('/api/player/bluetooth/stop', { method: 'POST' }).catch(() => {});
        break;
      case 'dj':
        api.stopDjMode().catch(() => {});
        break;
      default:
        break;
    }

    // Clear all playback display fields immediately — before the server responds
    setSource(nextSource);
    setPlaybackState(null);
    setTrackPosition(0);
    setTrackDuration(0);
    setShuffleState(false);
    setRepeatState('off');
    const isSpotify = nextSource === 'spotify';
    sendUpdate('SET_SOURCE', { spotify: isSpotify, source: nextSource });
    // DJ mode has no external playback state to react to (Spotify Connect,
    // MPD, etc.) — it drives itself server-side, so it's the one source
    // started with a direct call rather than through the SET_SOURCE event.
    if (nextSource === 'dj') api.startDjMode().catch(() => {});
  });

  const handleToggleFavoriteRadio = useStableCallback(async (station) => {
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
      reportError(`Favorite operation failed: ${err.message}`);
    }
  });

  const handleRadioByCountry = useStableCallback(async (country) => {
    if (!country) { setStationsList([]); return; }
    try {
      setIsSearching(true);
      const res = await fetch(`/api/player/radio-bycountry?country=${encodeURIComponent(country)}&limit=60`);
      const data = await res.json();
      const formatted = data.map(s => ({
        name: s.name.length > 22 ? s.name.substring(0, 20) + '...' : s.name,
        url: s.url_resolved || s.url,
        favicon: s.favicon,
        country: s.country,
        tags: s.tags,
      }));
      if (formatted.length === 0) reportError('No stations found.');
      else setStationsList(formatted);
    } catch { reportError('Failed to scan stations.'); }
    finally { setIsSearching(false); }
  });

  const handlePlayRadio = useStableCallback(async (url, name, favicon) => {
    try {
      await api.localPlayRadio(url, name, favicon);
      // The REST route emits SET_SOURCE + PLAYBACK_STATE through the event queue,
      // which broadcasts to all clients. Just update local source state — no WS send.
      if (source !== 'radio') setSource('radio');
    } catch (err) {
      reportError(`Failed to play radio: ${err.message}`);
    }
  });

  useEffect(() => {
    const handleResize = () => {
      // Skip if window dimensions haven't been reported yet (Chromium startup race)
      if (window.innerWidth === 0 || window.innerHeight === 0) return;

      // Calculate target scale based on the 1480x320 design canvas, which
      // matches the Waveshare panel's actual driven resolution exactly (both
      // the real hardware's rotated mode and the QEMU dev VM's custom
      // modeline are 1480x320). No margin is subtracted here: on the target
      // hardware this makes scale resolve to exactly 1 with zero letterboxing.
      // The previous 1400x320 canvas plus a 48px margin was narrower than the
      // real panel's aspect ratio, so scale ended up height-bound and left
      // large empty gutters on the left/right (visually confirmed on real Pi 4).
      const containerWidth = window.innerWidth;
      const containerHeight = window.innerHeight;

      const scaleX = containerWidth / 1480;
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
  const resonanceDevice = devices.find(d => d.name === LIBRESPOT_DEVICE_NAME);
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
          if (isSeekingRef.current) return prev; // user is mid-drag — don't fight it
          if (prev + 1000 >= trackDuration) {
            clearInterval(progressInterval.current);
            // Local ticker caps out here and stops until the next 3s poll
            // picks up the new track — waiting for that made anything
            // driven by trackPosition/trackDuration (seek bar, cassette
            // reels) look frozen at the old song's numbers for up to 3s
            // after it ended. Sync immediately instead of waiting.
            syncCurrentState();
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

  // Refresh Spotify Connect devices list. `silent` is used by the background
  // poll (see the effect above) so it doesn't toggle isFetchingDevices — that
  // flag only drives a spinner on the manual refresh button in
  // OutputPatchBay, which nobody is looking at during an unattended 15s poll,
  // and both it and `devices` are kioskCtx dependencies, so flipping them
  // needlessly recomputes that memo and re-renders every overlay for nothing.
  const fetchDevices = useStableCallback(async ({ silent = false } = {}) => {
    if (!token) return;
    try {
      if (!silent) setIsFetchingDevices(true);
      const data = await api.getDevices(token);
      const next = data.devices || [];
      // Also skip replacing the array reference when the list is unchanged —
      // the common case for a 15s poll — for the same reason.
      setDevices(prev => {
        const same = prev.length === next.length && prev.every((d, i) =>
          d.id === next[i]?.id && d.is_active === next[i]?.is_active && d.name === next[i]?.name);
        return same ? prev : next;
      });
    } catch (err) {
      console.error('Error fetching devices:', err);
    } finally {
      if (!silent) setIsFetchingDevices(false);
    }
  });

  // Transfer playback to target device
  const transferPlayback = useStableCallback(async (targetId) => {
    try {
      await api.transferPlayback(token, targetId);
      setTimeout(fetchDevices, 500);
    } catch (err) {
      reportError(`Transfer error: ${err.message}`);
    }
  });

  // Auto-reclaim Spotify Connect. When librespot restarts (reboot, raspotify
  // conf change) its Connect session drops and Spotify de-activates the device;
  // Spotify never re-activates a device on its own — a transfer command must be
  // issued. That used to be the manual "ROUTE TO RESONANCE" pill; do it
  // automatically whenever the kiosk is on the Spotify source, our device is
  // listed but inactive, and no OTHER device is active (never steal playback
  // from a phone/desktop the user is deliberately listening on). Transfers with
  // play=false: the device becomes ACTIVE and ready without blasting audio
  // unprompted after a reboot.
  const lastAutoReclaim = useRef(0);
  useEffect(() => {
    if (!spotify || !token || standbyRef.current) return;
    if (!resonanceDeviceId || isLocalDeviceActive) return;
    if (devices.some(d => d.is_active)) return;
    const now = Date.now();
    if (now - lastAutoReclaim.current < 15000) return; // don't spam if a transfer 4xx-loops
    lastAutoReclaim.current = now;
    api.transferPlayback(token, resonanceDeviceId, false)
      .then(() => setTimeout(fetchDevices, 500))
      .catch(() => {}); // silent — background action, next poll retries after cooldown
  }, [spotify, token, devices, resonanceDeviceId, isLocalDeviceActive, fetchDevices]);

  // Restart raspotify and poll until LIBRESPOT_DEVICE_NAME appears, then call onReady(deviceId).
  // Guard prevents concurrent restart storms if the user clicks rapidly.
  const ensureRaspotify = async (onReady) => {
    if (resonanceDeviceId) { onReady(resonanceDeviceId); return; }
    if (raspotifyRestartInFlight.current) return;
    raspotifyRestartInFlight.current = true;
    toast.success(`${LIBRESPOT_DEVICE_NAME} offline — restarting...`);
    try { await fetch('/api/system/service/raspotify/restart', { method: 'POST' }); } catch {}
    try {
      for (let i = 0; i < 8; i++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
          const data = await api.getDevices(token);
          const found = (data.devices || []).find(d => d.name === LIBRESPOT_DEVICE_NAME);
          if (found) { setDevices(data.devices || []); onReady(found.id); return; }
        } catch {}
      }
      reportError(`${LIBRESPOT_DEVICE_NAME} did not come online. Check raspotify.`);
    } finally {
      raspotifyRestartInFlight.current = false;
    }
  };

  // Route audio to local Librespot device
  const handleTransferToLocal = () => {
    ensureRaspotify(async (deviceId) => {
      await transferPlayback(deviceId);
    });
  };

  // Starting playback needs a device that is not just KNOWN but ACTIVE.
  // Both play helpers used to send `resonanceDeviceId || devices.find(is_active)`
  // and give up on failure — so whenever the cached device list was stale or
  // empty (right after a raspotify restart, a reboot, or the installer
  // bouncing the service) that resolved to undefined, Spotify was asked to
  // play on "whatever is active", nothing was, and tapping a playlist item
  // died with 404 "Player command failed: No active device found".
  // librespot is online and published the whole time — it simply is not the
  // active device until something transfers to it, which nothing here did.
  // Resolve a real id (re-fetching, restarting raspotify only as a last
  // resort), and if Spotify still reports no active device, transfer and
  // retry once.
  const playOnResonance = async (doPlay) => {
    let id = resonanceDeviceId || devices.find(d => d.is_active)?.id;
    if (!id) {
      const data = await api.getDevices(token).catch(() => null);
      const list = data?.devices || [];
      if (list.length) setDevices(list);
      id = list.find(d => d.name === LIBRESPOT_DEVICE_NAME)?.id || list.find(d => d.is_active)?.id;
    }
    if (!id) {
      // ensureRaspotify only calls its callback on SUCCESS — it silently
      // returns (device never came online, or a restart was already in
      // flight) or reports its own error otherwise, never rejecting. Awaiting
      // just the callback would hang this function forever in those cases,
      // so race it against ensureRaspotify's own completion instead.
      await new Promise(resolve => {
        let settled = false;
        const finish = () => { if (!settled) { settled = true; resolve(); } };
        ensureRaspotify(async (deviceId) => { id = deviceId; finish(); }).finally(finish);
      });
      if (!id) return; // ensureRaspotify already surfaced why, or a restart was already running
    }
    try {
      await doPlay(id);
    } catch (err) {
      if (!/no active device/i.test(err?.message || '')) throw err;
      await api.transferPlayback(token, id, false).catch(() => {});
      await new Promise(r => setTimeout(r, 600));
      await doPlay(id);
    }
  };

  // Play a searched track on the active device
  const handlePlayTrack = useStableCallback(async (trackUri) => {
    try {
      await playOnResonance(id => api.play(token, id, null, [trackUri]));
      setIsSearchOpen(false);
      setTimeout(syncCurrentState, 800);
    } catch (err) {
      reportError(`Play error: ${err.message}`);
    }
  });

  // Play an album or playlist context on the active device
  const handlePlayContext = useStableCallback(async (contextUri) => {
    try {
      await playOnResonance(id => api.play(token, id, contextUri));
      setIsSearchOpen(false);
      setTimeout(syncCurrentState, 800);
    } catch (err) {
      reportError(`Play error: ${err.message}`);
    }
  });

  // Build a BROADCAST_STATE-compatible object from the /status endpoint response
  const syncLocalState = async () => {
    // Capture source at call time — discard result if source changed while awaiting
    const capturedSource = sourceRef.current;
    try {
      const status = await api.localGetStatus();
      // Source changed while the request was in-flight — discard stale result
      if (sourceRef.current !== capturedSource || sourceRef.current !== 'local') return;
      if (!status || (!status.name && !status.file)) return;
      // MPD might still have a radio/stream URL in its queue.
      // Don't show stream metadata (URL or empty name) as local file info.
      const isStreamUrl = (s) => s && (s.startsWith('http://') || s.startsWith('https://'));
      if (isStreamUrl(status.file)) return;
      if (!status.name && !status.file) return;
      const newState = {
        paused: status.paused,
        position: status.position,
        duration: status.duration,
        track_window: {
          current_track: {
            name: status.name,
            artists: [{ name: status.artist || 'Unknown' }],
            album: { name: status.album || '', images: [] },
            uri: status.file,
          },
        },
      };
      setPlaybackState(newState);
      sendUpdate('BROADCAST_STATE', newState);
    } catch {}
  };

  // Playback Control Handlers
  const handlePlayPause = async () => {
    if (!spotify) {
      try {
        const isPaused = playbackState ? playbackState.paused : true;
        if (source === 'radio') {
          if (isPaused) {
            const radioUrl = playbackState?.track_window?.current_track?.url;
            if (radioUrl) {
              // MPD still has the URL in its queue — just resume
              await api.localPlay();
              setPlaybackState(prev => prev ? { ...prev, paused: false } : prev);
            } else {
              // No station in queue yet — open radio search so user can pick one
              setIsRadioSearchOpen(true);
            }
          } else {
            await api.localPause();
            setPlaybackState(prev => prev ? { ...prev, paused: true } : prev);
          }
          return;
        }
        if (isPaused) {
          await api.localPlay();
          // Always fetch fresh MPD state after play — never spread the current
          // playbackState, which may be stale from a previous source.
          setTimeout(syncLocalState, 350);
        } else {
          await api.localPause();
          const newState = { ...(playbackState || {}), paused: true };
          setPlaybackState(newState);
          sendUpdate('BROADCAST_STATE', newState);
        }
      } catch (err) {
        reportError(`Local action failed: ${err.message}`);
      }
      return;
    }
    if (!token) return;
    try {
      if (playbackState?.paused === false) {
        const r = await api.pause(token);
        if (r?.alreadyPaused) setPlaybackState(prev => prev ? { ...prev, paused: true } : prev);
        setTimeout(syncCurrentState, 500);
      } else {
        // No device at all — auto-restart raspotify and retry
        if (!resonanceDeviceId) {
          ensureRaspotify(async (deviceId) => {
            try {
              // Transfer first so Spotify routes audio to our device, then play
              await api.transferPlayback(token, deviceId, true);
              setTimeout(syncCurrentState, 800);
            } catch (err) { reportError(`Action failed: ${err.message}`); }
          });
          return;
        }
        // Device exists but may not be active — transferPlayback activates and plays
        if (!isLocalDeviceActive) {
          await api.transferPlayback(token, resonanceDeviceId, true);
        } else {
          await api.play(token, null);
        }
        setTimeout(syncCurrentState, 600);
      }
    } catch (err) {
      // 404 on play = no active context yet; tell user to pick a track
      if (err.message?.includes('404') || err.message?.includes('Not Found') || err.message?.includes('No active')) {
        reportError('No track queued — pick a song in Spotify first.');
        syncCurrentState();
      } else {
        reportError(`Action failed: ${err.message}`);
      }
    }
  };

  const handleNext = async () => {
    if (!spotify) {
      try {
        await api.localNext();
        setTimeout(syncLocalState, 400);
      } catch (err) {
        reportError(`Local skip failed: ${err.message}`);
      }
      return;
    }
    if (!token) return;
    try {
      await api.skipNext(token);
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      reportError(`Skip next failed: ${err.message}`);
    }
  };

  const handlePrevious = async () => {
    if (!spotify) {
      try {
        await api.localPrevious();
        setTimeout(syncLocalState, 400);
      } catch (err) {
        reportError(`Local back failed: ${err.message}`);
      }
      return;
    }
    if (!token) return;
    try {
      await api.skipPrevious(token);
      setTimeout(syncCurrentState, 500);
    } catch (err) {
      reportError(`Skip back failed: ${err.message}`);
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
      reportError(`Shuffle toggle failed: ${err.message}`);
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
      reportError(`Repeat toggle failed: ${err.message}`);
    }
  };

  // Sync state manually from Spotify Web API
  async function syncCurrentState() {
    if (!spotify) return;
    if (!token) return;
    if (standbyRef.current) return;
    try {
      const state = await api.getPlaybackState(token);
      if (state) {
        const newState = {
          paused: !state.is_playing,
          position: state.progress_ms,
          duration: state.item?.duration_ms || 0,
          shuffle_state: state.shuffle_state,
          repeat_state: state.repeat_state,
          // CamillaDSP owns volume — use refs so stale interval closures read current value.
          volume: volumeRef.current,
          is_muted: isMutedRef.current,
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
        // trackPosition/trackDuration are cheap, page-local state (not read by
        // the kioskCtx memo below) — the local 1s ticker already advances
        // position smoothly between polls, so these are just periodic drift
        // correction and can update unconditionally every poll.
        setTrackPosition(state.progress_ms);
        setTrackDuration(state.item?.duration_ms || 0);
        setShuffleState(state.shuffle_state);
        setRepeatState(state.repeat_state);

        // playbackState feeds trackArtist/currentTrack/albumImage, which are
        // dependencies of the big kioskCtx useMemo every overlay subscribes
        // to via useContext(Kk) — replacing it with a fresh object on every
        // poll (even one that found nothing new) recomputed that memo and
        // re-rendered every overlay in the tree on a fixed ~3s cadence,
        // which showed up as a visible stutter in kiosk animations exactly
        // synced with each poll (reported live as "choking"). Only replace
        // it, and only broadcast to other clients, when something a viewer
        // would actually notice changed.
        const prevTrack = playbackState?.track_window?.current_track;
        const nextTrack = newState.track_window.current_track;
        const changed = !playbackState
          || prevTrack?.uri !== nextTrack.uri
          || playbackState.paused !== newState.paused;
        if (changed) {
          setPlaybackState(newState);
          if (ws.current && ws.current.readyState === WebSocket.OPEN) {
            ws.current.send(JSON.stringify({ type: 'BROADCAST_STATE', payload: newState }));
          }
        }

        // Keep the Resonance device pinned at 100% on every poll — CamillaDSP is the
        // single gain master. librespot uses VOLUME_CTRL=fixed so this is a safety net.
        if (state.device?.name === LIBRESPOT_DEVICE_NAME && state.device?.volume_percent !== 100) {
          api.setVolume(token, 100).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('Could not sync remote state:', err);
    }
  }

  // Manual Seek — split into visual (every onChange, fired continuously
  // while dragging a range input) and commit (once, on release). Wiring the
  // API call straight to onChange used to fire a full seek request per
  // pixel of drag; those overlapping requests can resolve out of order,
  // landing the track wherever the race settles rather than where the user
  // actually released the thumb. Reported live: "the time seek in Spotify
  // still doesn't work, it jumps but not in the position I want"
  // (AUDIT-2026-08-02).
  const handleSeek = (e) => {
    isSeekingRef.current = true;
    setTrackPosition(parseInt(e.target.value, 10));
  };
  const commitSeek = async (e) => {
    const seekMs = parseInt(e.target.value, 10);
    try {
      if (!spotify) {
        const percent = trackDuration ? Math.round((seekMs / trackDuration) * 100) : 0;
        await api.localSeek(`${percent}%`);
      } else {
        await api.seek(token, seekMs);
      }
    } catch (err) {
      console.error('Seek error:', err);
    } finally {
      isSeekingRef.current = false;
    }
  };

  // Volume control — CamillaDSP master owns the volume stage for EVERY source.
  // A single persisted level then restores correctly on reboot/wake regardless of
  // source, and Spotify no longer double-attenuates ahead of CamillaDSP.
  const handleVolumeChange = async (e) => {
    const vol = parseInt(e.target.value, 10);
    setVolume(vol);
    setIsMuted(vol === 0);
    lastVolumeChangeTime.current = Date.now();
    if (vol > 0) lastNonZeroVolume.current = vol;

    // No client-side broadcast here on purpose: this fires on every onChange
    // tick while dragging (unlike the debounced REST call below), and used to
    // send a full playbackState-replacing BROADCAST_STATE per tick — on other
    // connected screens that meant replacing playbackState (a kioskCtx/
    // ctxValue dependency) dozens of times in a couple of seconds during a
    // single smooth drag, each one cascading a full re-render across the
    // whole overlay tree. The server's /api/player/volume route now
    // broadcasts a lightweight SET_VOLUME event itself (once, debounced,
    // decoupled from playbackState) — see the setTimeout below — which is
    // sufficient for other screens to reflect the new volume within ~180ms.

    if (volumeApiTimeout.current) {
      clearTimeout(volumeApiTimeout.current);
    }

    volumeApiTimeout.current = setTimeout(async () => {
      try {
        await api.localSetVolume(vol);
      } catch (err) {
        console.error('Volume error:', err);
      }
    }, 180);
  };

  const handleToggleMute = async () => {
    const newMuteState = !isMuted;
    setIsMuted(newMuteState);
    lastVolumeChangeTime.current = Date.now();
    const targetVolume = newMuteState ? 0 : (lastNonZeroVolume.current || 30);
    if (!newMuteState) setVolume(targetVolume);

    // No client-side broadcast here — /api/player/volume (called below)
    // already broadcasts a lightweight SET_VOLUME event server-side, which
    // is sufficient for other screens; see handleVolumeChange above for why
    // replacing playbackState over WS for a volume-only change was removed.
    try {
      await api.localSetVolume(targetVolume);
    } catch (err) {
      console.error('Mute error:', err);
    }
  };

  // Log out / disconnect Spotify
  const handleLogout = useStableCallback(async () => {
    try {
      await fetch('/auth/spotify/logout', { method: 'POST' });
    } catch (_) {}
    setToken('');
    setPlaybackState(null);
    setDevices([]);
    sendUpdate('CLEAR_TOKEN');
  });

  const onToggleMenu      = useCallback(() => setIsMenuOpen(v => !v), []);
  const onToggleEqualizer = useCallback(() => setIsEqualizerOpen(v => !v), []);
  const onToggleSearch    = useCallback(() => setIsSearchOpen(v => !v), []);
  const onToggleAlbumInfo = useCallback(() => setIsAlbumInfoOpen(true), []);

  const kioskCtx = useMemo(() => ({
    // standby / transitions
    standby, transitionScreen, handleToggleStandby, getGreeting,
    // equalizer
    isEqualizerOpen, setIsEqualizerOpen,
    eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    handleEqPresetChange, handleBandChange, handleSaturationChange,
    handleNoiseFloorChange, handlePreAmpChange,
    dspActive, handleDeactivateDsp,
    pureDirect, handleTogglePureDirect,
    // album info
    isAlbumInfoOpen, setIsAlbumInfoOpen,
    albumInfoArtist: trackArtist,
    albumInfoAlbum: currentTrack?.album?.name || '',
    albumInfoImage: albumImage,
    // settings menu
    isMenuOpen, setIsMenuOpen,
    token, handleLogout,
    devices, isFetchingDevices, transferPlayback, fetchDevices,
    theme, handleThemeColorChange,
    otaProgress, setOtaProgress, otaPercent, setOtaPercent,
    source, handleToggleSource,
    isRadioSearchOpen, setIsRadioSearchOpen,
    radioCountry, setRadioCountry,
    stationsList, isSearching,
    handleRadioByCountry, handlePlayRadio,
    favoriteStations, handleToggleFavoriteRadio,
    updateStatus, setUpdateStatus,
    errorMessage, setErrorMessage,
    setIsDspWizardOpen, setIsThemeSettingsOpen,
    remoteAccessEnabled, setRemoteAccessEnabled,
    sendUpdate,
    setIsRemoteAccessOpen, setRemoteUrl, setRemoteHostUrl,
    // search
    isSearchOpen, setIsSearchOpen,
    handlePlayTrack, handlePlayContext,
    // theme settings
    isThemeSettingsOpen,
    activeTheme, handleActiveThemeChange,
    brightness, handleBrightnessChange,
    visualizerMode, handleVisualizerModeChange,
    // remote access
    isRemoteAccessOpen, remoteUrl, remoteHostUrl,
    // wifi
    isWifiOpen, setIsWifiOpen,
    // system admin
    isSystemAdminOpen, setIsSystemAdminOpen,
    // dsp wizard
    isDspWizardOpen, setDspActive,
    // welcome/goodbye transition
    scale,
    onWelcomeDone: () => setTransitionScreen(null),
  }), [
    standby, transitionScreen, handleToggleStandby,
    isEqualizerOpen, eqPreset, eqBands, eqSaturation, eqNoiseFloor, eqPreAmp,
    handleEqPresetChange, handleBandChange, handleSaturationChange,
    handleNoiseFloorChange, handlePreAmpChange, dspActive, handleDeactivateDsp,
    pureDirect, handleTogglePureDirect,
    isAlbumInfoOpen, trackArtist, currentTrack, albumImage,
    isMenuOpen, token, handleLogout, devices, isFetchingDevices,
    transferPlayback, fetchDevices, theme, handleThemeColorChange,
    otaProgress, otaPercent, source, handleToggleSource,
    isRadioSearchOpen, radioCountry, stationsList, isSearching,
    handleRadioByCountry, handlePlayRadio, favoriteStations, handleToggleFavoriteRadio,
    updateStatus, errorMessage, setIsDspWizardOpen, setIsThemeSettingsOpen,
    remoteAccessEnabled, setRemoteAccessEnabled, sendUpdate,
    setIsRemoteAccessOpen, setRemoteUrl, setRemoteHostUrl,
    isSearchOpen, handlePlayTrack, handlePlayContext,
    isThemeSettingsOpen, activeTheme, handleActiveThemeChange,
    brightness, handleBrightnessChange, visualizerMode, handleVisualizerModeChange,
    isRemoteAccessOpen, remoteUrl, remoteHostUrl, isDspWizardOpen,
    isWifiOpen, setIsWifiOpen,
    isSystemAdminOpen, setIsSystemAdminOpen,
    scale,
  ]);

  return (
    <Kk.Provider value={kioskCtx}>
    <div
      data-theme={theme}
      data-active-theme={activeTheme}
      className="w-screen h-screen flex items-center justify-center relative overflow-hidden select-none font-sans"
      style={{ '--album-art-url': `url(${albumImage})` }}
    >
      
      {/* Dynamic Album Art Blur Canvas for Premium Glass Themes */}
      <div className="album-bg-blur" />

      <StandbyOverlay />

      {/* Subtle retro glowing background spots — radial-gradient rather than
          a blur filter (see .theme-bg-glow/.emerald-bg-glow in index.css):
          same soft look, without asking the Pi4's GPU to blur a huge area
          continuously. */}
      <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] rounded-full theme-bg-glow pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-20%] w-[70%] h-[70%] rounded-full emerald-bg-glow pointer-events-none" />

      <div 
        ref={containerRef}
        className="music-player-container"
        style={{
          '--scale-kiosk': scale,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          width: '1480px',
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
          commitSeek={commitSeek}
          handleVolumeChange={handleVolumeChange}
          handleToggleMute={handleToggleMute}
          handleToggleShuffle={handleToggleShuffle}
          handleToggleRepeat={handleToggleRepeat}
          playbackState={playbackState}
          onToggleMenu={onToggleMenu}
          onToggleAlbumInfo={onToggleAlbumInfo}
          onTransferPlayback={handleTransferToLocal}
          hasToken={!!token}
          spotify={spotify}
          onToggleSource={handleToggleSource}
          onToggleEqualizer={onToggleEqualizer}
          onToggleSearch={onToggleSearch}
          onToggleRadioSearch={() => setIsRadioSearchOpen(true)}
          source={source}
          favoriteStations={favoriteStations}
          onToggleFavoriteRadio={handleToggleFavoriteRadio}
          onToggleStandby={handleToggleStandby}
          signalInfo={signalInfo}
        />

        <EqualizerOverlay />
        <AlbumInfoOverlay />
        <SettingsMenuOverlay />
        {isSearchOpen && <UniversalSearchOverlay />}
        <ThemeSettingsOverlay />
        <RemoteAccessOverlay />
        <WifiOverlay />
        <SystemAdminOverlay />
        {isDspWizardOpen && <DspWizardOverlay />}
        <RadioSearchOverlay />
      </div>

      {/* Backlight Brightness hardware simulation overlay */}
      <div
        className="fixed inset-0 bg-black pointer-events-none z-[99999] transition-opacity duration-300"
        style={{ opacity: (100 - brightness) / 100 }}
      />
    </div>
    </Kk.Provider>
  );
}
