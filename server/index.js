import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:5000/api/callback';

// Verify config
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn('[Resonance Backend] WARNING: SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is missing from .env file.');
}

/**
 * Route: Login - Redirects to Spotify authorize URL.
 * Dynamic state parameter carries the client origin (e.g., http://localhost:5173) 
 * so callback knows where to redirect back.
 */
app.get('/api/login', (req, res) => {
  const referer = req.headers.referer || 'http://localhost:5173';
  let clientOrigin = 'http://localhost:5173';
  try {
    clientOrigin = new URL(referer).origin;
  } catch (err) {
    // Fallback if referer header is invalid
  }

  const scopes = [
    'streaming',
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-private',
    'user-read-email'
  ].join(' ');

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('client_id', CLIENT_ID || '');
  authUrl.searchParams.append('scope', scopes);
  authUrl.searchParams.append('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.append('state', clientOrigin);

  res.redirect(authUrl.toString());
});

/**
 * Route: Callback - Receives Spotify Auth code, exchanges for access token, 
 * and redirects back to the client frontend with tokens in query params.
 */
app.get('/api/callback', async (req, res) => {
  const code = req.query.code || null;
  const clientOrigin = req.query.state || 'http://localhost:5173';

  if (!code) {
    return res.redirect(`${clientOrigin}/?error=state_mismatch`);
  }

  try {
    const authOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        code: code,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    };

    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', authOptions);
    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('[Resonance Backend] Error exchanging auth code:', tokenData);
      return res.redirect(`${clientOrigin}/?error=token_exchange_failed`);
    }

    const { access_token, refresh_token, expires_in } = tokenData;

    // Redirect user back to the client application with token data
    res.redirect(
      `${clientOrigin}/?access_token=${access_token}&refresh_token=${refresh_token}&expires_in=${expires_in}`
    );
  } catch (error) {
    console.error('[Resonance Backend] Exception during callback processing:', error);
    res.redirect(`${clientOrigin}/?error=server_exception`);
  }
});

/**
 * Route: Refresh Token - Exposes access token renewal to the client.
 */
app.post('/api/refresh', async (req, res) => {
  const refresh_token = req.body.refresh_token;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token is required.' });
  }

  try {
    const authOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(CLIENT_ID + ':' + CLIENT_SECRET).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refresh_token
      })
    };

    const refreshResponse = await fetch('https://accounts.spotify.com/api/token', authOptions);
    const refreshData = await refreshResponse.json();

    if (!refreshResponse.ok) {
      console.error('[Resonance Backend] Error refreshing token:', refreshData);
      return res.status(refreshResponse.status).json(refreshData);
    }

    res.json({
      access_token: refreshData.access_token,
      expires_in: refreshData.expires_in,
      // Spotify may or may not return a new refresh token. Fallback to old one if not present.
      refresh_token: refreshData.refresh_token || refresh_token
    });
  } catch (error) {
    console.error('[Resonance Backend] Exception during refresh processing:', error);
    res.status(500).json({ error: 'Internal server exception' });
  }
});

// Serve static assets from Vite's production build folder
app.use(express.static(path.join(__dirname, '../dist')));

// Fallback all non-API requests to index.html for Single Page App client routing
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && req.method === 'GET') {
    res.sendFile(path.join(__dirname, '../dist/index.html'));
  } else {
    next();
  }
});

// Create HTTP server wrapping Express
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocketServer({ noServer: true });

let cachedPlaybackState = null;
let activeToken = null;
let pollInterval = null;

// Helper to broadcast messages to all connected WS clients
const broadcast = (data, excludeWs = null) => {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(message);
    }
  });
};

// Spotify backend polling loop (runs every 5s if active clients exist)
const startSpotifyPolling = () => {
  if (pollInterval) return;
  
  pollInterval = setInterval(async () => {
    if (wss.clients.size === 0 || !activeToken) {
      return;
    }

    try {
      const response = await fetch('https://api.spotify.com/v1/me/player', {
        headers: {
          'Authorization': `Bearer ${activeToken}`
        }
      });

      if (response.status === 200) {
        const data = await response.json();
        if (data && data.item) {
          const payload = {
            paused: !data.is_playing,
            position: data.progress_ms,
            duration: data.item.duration_ms || 0,
            shuffle_state: data.shuffle_state,
            repeat_state: data.repeat_state,
            track_window: {
              current_track: {
                uri: data.item.uri,
                name: data.item.name,
                album: {
                  name: data.item.album?.name,
                  images: data.item.album?.images || []
                },
                artists: data.item.artists || []
              }
            }
          };
          cachedPlaybackState = payload;
          broadcast({ type: 'PLAYBACK_STATE', payload });
        }
      } else if (response.status === 401) {
        activeToken = null;
        broadcast({ type: 'ERROR', payload: { message: 'Spotify token expired' } });
      }
    } catch (err) {
      console.error('[Resonance WS Poller] Error polling Spotify playback:', err.message);
    }
  }, 5000);
};

wss.on('connection', (ws) => {
  console.log('[Resonance WS] Client connected. Active clients:', wss.clients.size);
  
  // Send last cached playback state on connect
  if (cachedPlaybackState) {
    ws.send(JSON.stringify({ type: 'PLAYBACK_STATE', payload: cachedPlaybackState }));
  }

  ws.on('message', (messageStr) => {
    try {
      const { type, payload } = JSON.parse(messageStr);
      
      if (type === 'BROADCAST_STATE') {
        cachedPlaybackState = payload;
        // Broadcast new state to all OTHER clients
        broadcast({ type: 'PLAYBACK_STATE', payload }, ws);
      }
      
      if (type === 'SET_TOKEN') {
        activeToken = payload.token;
        startSpotifyPolling();
      }
    } catch (err) {
      console.error('[Resonance WS] Failed parsing client message:', err);
    }
  });

  ws.on('close', () => {
    console.log('[Resonance WS] Client disconnected. Active clients:', wss.clients.size);
    if (wss.clients.size === 0 && pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  });
});

// Upgrade HTTP connection to WebSocket on /ws path
server.on('upgrade', (request, socket, head) => {
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);

  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`[Resonance Backend] Server listening on http://localhost:${PORT}`);
});
