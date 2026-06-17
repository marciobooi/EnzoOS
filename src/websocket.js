import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

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
        const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
        socket = new WebSocket(wsUrl);
        ws.current = socket;
  
        socket.onopen = () => {
          setIsConnected(true);
          console.log(`[Resonance Client] Connected to WebSocket. Remote: ${isRemote}`);
          
          if (localStorage.getItem('resonance_updating') === 'true') {
            localStorage.removeItem('resonance_updating');
            console.log('[Resonance WS] Successfully reconnected after system update. Reloading screen...');
            window.location.reload();
            return;
          }
          
          if (setUpdateStatus) {
            setUpdateStatus(null);
          }
  
          if (tokenRef.current) {
            socket.send(JSON.stringify({ type: 'SET_TOKEN', payload: { token: tokenRef.current } }));
          }
          
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
  
            if (type === 'SET_TOKEN') {
              const newToken = payload.token;
              if (newToken && newToken !== tokenRef.current) {
                if (setToken) setToken(newToken);
              }
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

  // Send updates to websocket
  const sendUpdate = (type, payload) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type, payload }));
    }
  };

  return { isConnected, ws, sendUpdate };
}
