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
  setDevices,
  onRequestSync,
  isAuthenticated = true,
  isRemote = false
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
            if (setTrackPosition) setTrackPosition(payload.position);
            if (setTrackDuration) setTrackDuration(payload.duration);
            if (payload.shuffle_state !== undefined && setShuffleState) {
              setShuffleState(payload.shuffle_state);
            }
            if (payload.repeat_state !== undefined && setRepeatState) {
              setRepeatState(payload.repeat_state);
            }
            if (payload.volume !== undefined && setVolume) {
              setVolume(payload.volume);
            }
            if (payload.is_muted !== undefined && setIsMuted) {
              setIsMuted(payload.is_muted);
            }
          }

          if (type === 'REQUEST_SYNC') {
            console.log('[Resonance WS] Received request to sync state, scheduling fetch in 1200ms');
            setTimeout(() => {
              if (onRequestSyncRef.current) {
                onRequestSyncRef.current();
              }
            }, 1200);
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
          }

          if (type === 'SET_TOKEN') {
            const newToken = payload.token;
            if (newToken && newToken !== tokenRef.current) {
              if (setToken) setToken(newToken);
            }
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
