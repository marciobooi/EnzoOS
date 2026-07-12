import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Apply a full /api/status snapshot to all React state setters at once.
 * Called on WS connect so all clients get a consistent view in one shot
 * instead of waiting for the multi-message WS handshake sequence.
 */
function applyFullStatus(status, setters) {
  if (!status) return;
  const { source, standby, pureDirect, remoteAccessEnabled, playback, eq, theme } = status;

  if (source     !== undefined && setters.setSource)              setters.setSource(source);
  if (source     !== undefined && setters.setSpotify)             setters.setSpotify(source === 'spotify');
  if (standby      !== undefined && setters.setStandby)      setters.setStandby(standby);
  if (pureDirect   !== undefined && setters.setPureDirect)   setters.setPureDirect(pureDirect);
  if (remoteAccessEnabled !== undefined && setters.setRemoteAccessEnabled)
    setters.setRemoteAccessEnabled(remoteAccessEnabled);

  if (playback) {
    const ps = playback.track ? {
      paused:        playback.paused,
      position:      playback.position,
      duration:      playback.duration,
      shuffle_state: playback.shuffle,
      repeat_state:  playback.repeat,
      volume:        playback.volume,
      is_muted:      playback.muted,
      track_window: {
        current_track: {
          name:    playback.track.name,
          artists: [{ name: playback.track.artist }],
          album:   { name: playback.track.album, images: playback.track.albumArt ? [{ url: playback.track.albumArt }] : [] },
          uri:     playback.track.uri,
          url:     playback.track.radioUrl,
        },
      },
    } : null;

    if (setters.setPlaybackState)  setters.setPlaybackState(ps);
    if (setters.setTrackPosition)  setters.setTrackPosition(playback.position  ?? 0);
    if (setters.setTrackDuration)  setters.setTrackDuration(playback.duration  ?? 0);
    if (setters.setShuffleState)   setters.setShuffleState(playback.shuffle    ?? false);
    if (setters.setRepeatState)    setters.setRepeatState(playback.repeat      ?? 'off');
    if (playback.volume !== undefined && setters.setVolume)   setters.setVolume(playback.volume);
    if (playback.muted  !== undefined && setters.setIsMuted)  setters.setIsMuted(playback.muted);
  }

  if (eq) {
    if (setters.setEqPreset)    setters.setEqPreset(eq.preset);
    if (setters.setEqBands)     setters.setEqBands(eq.bands);
    if (setters.setEqSaturation) setters.setEqSaturation(eq.saturation);
    if (setters.setEqNoiseFloor) setters.setEqNoiseFloor(eq.noiseFloor);
    if (setters.setEqPreAmp)    setters.setEqPreAmp(eq.preAmp);
    if (setters.setDspActive)   setters.setDspActive(eq.dspActive);
    try {
      localStorage.setItem('resonance_eq_preset',  eq.preset);
      localStorage.setItem('resonance_eq_bands',   JSON.stringify(eq.bands));
      localStorage.setItem('resonance_eq_saturation', String(eq.saturation));
      localStorage.setItem('resonance_eq_noise',   String(eq.noiseFloor));
      localStorage.setItem('resonance_eq_preamp',  String(eq.preAmp));
    } catch {}
  }

  if (theme) {
    if (setters.setTheme)          setters.setTheme(theme.color);
    if (setters.setActiveTheme)    setters.setActiveTheme(theme.activeTheme);
    if (setters.setBrightness)     setters.setBrightness(theme.brightness);
    if (setters.setVisualizerMode) setters.setVisualizerMode(theme.visualizerMode || 'vu');
    try {
      localStorage.setItem('resonance_theme',            theme.color);
      localStorage.setItem('resonance_theme_active',     theme.activeTheme);
      localStorage.setItem('resonance_theme_brightness', String(theme.brightness));
      localStorage.setItem('resonance_visualizer_mode',  theme.visualizerMode || 'vu');
    } catch {}
  }
}

/**
 * A custom hook that manages the WebSocket connection lifecycle for Resonance clients.
 * It handles connection, auto-reconnection, parsing messages, updating shared React states,
 * and syncing tokens.
 */
export function useResonanceWS({
  token,
  setToken,
  setPlaybackState,
  setTrackPosition,
  setTrackDuration,
  setShuffleState,
  setRepeatState,
  setVolume,
  setIsMuted,
  setUpdateStatus,
  setOtaProgress,
  setOtaPercent,
  setSpotify,
  setSource,
  setDevices,
  onRequestSync,
    isAuthenticated = true,
    isRemote = false,
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
    onAudioLevels,
    setVisualizerMode,
    setPureDirect,
    onQrRedeemed,
  }) {
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef(null);
  
    // Keep a ref to the latest onRequestSync handler to avoid stale closures
    const onRequestSyncRef = useRef(onRequestSync);
    useEffect(() => {
      onRequestSyncRef.current = onRequestSync;
    }, [onRequestSync]);
  
    // Keep token in a ref to avoid reconnecting when token changes
    const tokenRef = useRef(token);
    useEffect(() => {
      tokenRef.current = token;
    }, [token]);
  
    useEffect(() => {
      if (!isAuthenticated) return;
  
      let socket;
      let reconnectTimeout;
  
      const connectWS = () => {
        // Support IPv4, IPv6, HTTP, HTTPS connections seamlessly
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Browsers can't set headers on the WS handshake, so the remote-access
        // token (if any) travels in the query string. The kiosk has no token and
        // is authorized via loopback on the server.
        const m = `; ${document.cookie}`.split('; remote_token=');
        const wsToken = m.length === 2 ? m.pop().split(';').shift() : null;
        const wsUrl = `${wsProtocol}//${window.location.host}/ws${wsToken ? `?token=${encodeURIComponent(wsToken)}` : ''}`;
        socket = new WebSocket(wsUrl);
        ws.current = socket;
  
        socket.onopen = async () => {
          setIsConnected(true);
          console.log(`[Resonance Client] Connected to WebSocket. Remote: ${isRemote}`);

          if (localStorage.getItem('resonance_updating') === 'true') {
            localStorage.removeItem('resonance_updating');
            console.log('[Resonance WS] Successfully reconnected after system update. Reloading screen...');
            window.location.reload();
            return;
          }

          if (setUpdateStatus) setUpdateStatus(null);

          // ── Primary hydration: single atomic HTTP fetch replaces the multi-message
          // WS handshake. Source, playback, volume, EQ, DSP, theme, standby all land
          // together — no partial-state window between messages.
          try {
            const res = await fetch('/api/status');
            if (res.ok) {
              const status = await res.json();
              applyFullStatus(status, {
                setSource, setSpotify, setStandby, setRemoteAccessEnabled,
                setPlaybackState, setTrackPosition, setTrackDuration,
                setShuffleState, setRepeatState, setVolume, setIsMuted,
                setEqPreset, setEqBands, setEqSaturation, setEqNoiseFloor, setEqPreAmp,
                setDspActive, setTheme, setActiveTheme, setBrightness, setVisualizerMode,
              });
              console.log('[Resonance WS] Hydrated from /api/status');
            }
          } catch (e) {
            console.warn('[Resonance WS] /api/status fetch failed, WS messages will hydrate state:', e.message);
          }

          // Token is intentionally excluded from /api/status (security).
          // Send it separately so the server can push SET_TOKEN if the server
          // already has a fresher token from the OAuth refresh cycle.
          if (tokenRef.current) {
            socket.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token: tokenRef.current } }));
          }

          // Remote: ask kiosk to push its live Spotify position/device state.
          // /api/status covers everything else so this is only for Spotify live data.
          if (isRemote) {
            socket.send(JSON.stringify({ type: 'REQUEST_SYNC' }));
          }
        };
  
        socket.onmessage = (event) => {
          try {
            const { type, payload } = JSON.parse(event.data);
  
            if (type === 'PLAYBACK_STATE') {
              if (setPlaybackState) setPlaybackState(payload);
              if (payload) {
                if (setTrackPosition) setTrackPosition(payload.position);
                if (setTrackDuration) setTrackDuration(payload.duration);
                if (payload.shuffle_state !== undefined && setShuffleState) setShuffleState(payload.shuffle_state);
                if (payload.repeat_state !== undefined && setRepeatState) setRepeatState(payload.repeat_state);
                if (payload.volume !== undefined && setVolume) setVolume(payload.volume);
                if (payload.is_muted !== undefined && setIsMuted) setIsMuted(payload.is_muted);
              }
            }
  
            if (type === 'REQUEST_SYNC') {
              setTimeout(() => {
                if (onRequestSyncRef.current) {
                  onRequestSyncRef.current();
                }
              }, 350);
            }
  
            if (type === 'UPDATE_PROGRESS') {
              if (setUpdateStatus) setUpdateStatus('updating');
              if (setOtaProgress) {
                setOtaProgress(prev => [...prev, payload.text].slice(-30));
              }
              if (payload.percent !== undefined && payload.percent !== null && setOtaPercent) {
                setOtaPercent(payload.percent);
              }
            }
  
            if (type === 'SET_SOURCE') {
              if (setSpotify) setSpotify(payload.spotify);
              if (setSource) setSource(payload.source);
              // Clear stale track info — the new source broadcasts its own PLAYBACK_STATE
              if (setPlaybackState) setPlaybackState(null);
              if (setTrackPosition) setTrackPosition(0);
              if (setTrackDuration) setTrackDuration(0);
            }
  
            if (type === 'SET_STANDBY') {
              if (setStandby) setStandby(payload.enabled);
            }

            if (type === 'SET_PURE_DIRECT') {
              if (setPureDirect) setPureDirect(payload.enabled);
            }
  
            if (type === 'SET_TOKEN') {
              const newToken = payload.token;
              if (newToken && newToken !== tokenRef.current) {
                if (setToken) setToken(newToken);
              }
            }

            // SET_VOLUME: Spotify app changed volume via librespot --onevent hook.
            // Uses the same lock as PLAYBACK_STATE so kiosk slider changes take
            // priority for 2.5 s and aren't immediately overridden by this event.
            if (type === 'SET_VOLUME') {
              if (payload.volume !== undefined && setVolume) setVolume(payload.volume);
              if (payload.is_muted !== undefined && setIsMuted) setIsMuted(payload.is_muted);
            }

            if (type === 'EQ_SETTINGS') {
              if (setEqPreset) setEqPreset(payload.preset);
              if (setEqBands) setEqBands(payload.bands);
              if (setEqSaturation) setEqSaturation(payload.saturation);
              if (setEqNoiseFloor) setEqNoiseFloor(payload.noiseFloor);
              if (setEqPreAmp) setEqPreAmp(payload.preAmp);

              localStorage.setItem('resonance_eq_preset', payload.preset);
              localStorage.setItem('resonance_eq_bands', JSON.stringify(payload.bands));
              localStorage.setItem('resonance_eq_saturation', payload.saturation);
              localStorage.setItem('resonance_eq_noise', payload.noiseFloor);
              localStorage.setItem('resonance_eq_preamp', payload.preAmp);
            }

            if (type === 'DSP_CALIBRATION') {
              if (setDspActive) {
                setDspActive(payload && (payload[0] === 'dsp' || payload['0'] === 'dsp'));
              }
            }

            if (type === 'THEME_SETTINGS') {
              if (setTheme) setTheme(payload.themeColor);
              if (setActiveTheme) setActiveTheme(payload.activeTheme);
              if (setBrightness) setBrightness(payload.brightness);
              if (setVisualizerMode) setVisualizerMode(payload.visualizerMode || 'vu');

              localStorage.setItem('resonance_theme', payload.themeColor);
              localStorage.setItem('resonance_theme_active', payload.activeTheme);
              localStorage.setItem('resonance_theme_brightness', payload.brightness);
              localStorage.setItem('resonance_visualizer_mode', payload.visualizerMode || 'vu');
            }

            if (type === 'SET_REMOTE_ACCESS') {
              if (setRemoteAccessEnabled) setRemoteAccessEnabled(payload.enabled);
            }

            if (type === 'AUDIO_LEVELS') {
              if (onAudioLevels) onAudioLevels(payload);
            }

            if (type === 'QR_TOKEN_REDEEMED') {
              if (onQrRedeemed) onQrRedeemed();
            }

            if (type === 'CLEAR_TOKEN') {
              if (setToken) setToken('');
              if (setPlaybackState) setPlaybackState(null);
              if (setDevices) setDevices([]);
            }
  
            if (type === 'ERROR') {
              console.warn('[Resonance WS] Server reported error:', payload.message);
            }
        } catch (err) {
          console.error('[Resonance WS] Error parsing WS message:', err);
        }
      };

      socket.onclose = (e) => {
        setIsConnected(false);
        console.log('[Resonance WS] WebSocket disconnected. Reconnecting in 3s...', e.reason);
        reconnectTimeout = setTimeout(connectWS, 3000);
      };

      socket.onerror = (err) => {
        console.error('[Resonance WS] WebSocket error:', err);
        clearTimeout(reconnectTimeout);
        socket.close();
      };
    };

    connectWS();

    return () => {
      clearTimeout(reconnectTimeout);
      if (socket) {
        // Null out handlers so onclose can't queue a reconnect after cleanup
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
      ws.current = null;
    };
  }, [isAuthenticated, isRemote]);

  // Send token updates to WebSocket server when it changes locally
  useEffect(() => {
    if (isAuthenticated && token && ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token } }));
    }
  }, [token, isAuthenticated]);

  // Send updates to websocket. Stable identity (only touches the ws ref) —
  // it sits in both pages' context-memo dependency lists, so an inline
  // arrow here would defeat those memos on every render.
  const sendUpdate = useCallback((type, payload) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { isConnected, ws, sendUpdate };
}
