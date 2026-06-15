import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { exec } from 'child_process';
import { getSetting, setSetting, deleteSetting } from './db.js';

const router = express.Router();

// In-memory token state
let tokenState = {
  access_token: null,
  refresh_token: null,
  expires_at: 0,   // unix ms timestamp
  display_name: null,
};

// Load persisted tokens on startup
const loadTokens = async () => {
  try {
    const access = await getSetting('spotify_access_token');
    const refresh = await getSetting('spotify_refresh_token');
    const expires = await getSetting('spotify_expires_at');
    const display = await getSetting('spotify_display_name');
    
    if (refresh) {
      tokenState = {
        access_token: access,
        refresh_token: refresh,
        expires_at: expires ? Number(expires) : 0,
        display_name: display
      };
      console.log('[Resonance Auth] Loaded persisted Spotify tokens from DB.');
    }
  } catch (err) {
    console.warn('[Resonance Auth] Could not load persisted tokens from DB:', err.message);
  }
};

// Persist tokens to DB
const saveTokens = async () => {
  try {
    if (tokenState.access_token) await setSetting('spotify_access_token', tokenState.access_token);
    if (tokenState.refresh_token) await setSetting('spotify_refresh_token', tokenState.refresh_token);
    await setSetting('spotify_expires_at', tokenState.expires_at);
    if (tokenState.display_name) await setSetting('spotify_display_name', tokenState.display_name);
  } catch (err) {
    console.warn('[Resonance Auth] Could not persist tokens to DB:', err.message);
  }
};

loadTokens();

// Helper: refresh access token using stored refresh token
export const refreshAccessToken = async () => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  if (!clientId || !clientSecret || !tokenState.refresh_token) return null;

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokenState.refresh_token,
      }),
    });

    const data = await response.json();

    if (data.access_token) {
      tokenState.access_token = data.access_token;
      tokenState.expires_at = Date.now() + (data.expires_in * 1000) - 60000; // 1 min buffer
      if (data.refresh_token) {
        tokenState.refresh_token = data.refresh_token;
      }
      saveTokens();
      console.log('[Resonance Auth] Access token refreshed successfully.');
      return tokenState.access_token;
    }
  } catch (err) {
    console.error('[Resonance Auth] Token refresh failed:', err.message);
  }

  return null;
};

// Helper: get a valid access token (refreshes if expired)
export const getValidAccessToken = async () => {
  if (!tokenState.access_token) return null;
  if (Date.now() > tokenState.expires_at) {
    return await refreshAccessToken();
  }
  return tokenState.access_token;
};

// Start auto-refresh interval: check every 5 minutes
setInterval(async () => {
  if (tokenState.refresh_token && Date.now() > tokenState.expires_at) {
    await refreshAccessToken();
  }
}, 5 * 60 * 1000);

// State param to prevent CSRF
let pendingOAuthState = null;

// GET /auth/spotify/login  →  redirect to Spotify OAuth

// GET /auth/spotify/kiosk-login
// Called by phone remote. Opens Spotify login on the Pi/kiosk browser.
router.get('/kiosk-login', (req, res) => {
  const loginUrl = 'http://127.0.0.1:5000/auth/spotify/login';

  exec(
    `xdg-open "${loginUrl}"`,
    {
      env: {
        ...process.env,
        DISPLAY: ':0',
        XAUTHORITY: '/home/pi/.Xauthority',
      },
    },
    (err) => {
      if (err) {
        console.error('[Resonance Auth] Failed to open Spotify login on kiosk:', err.message);
        return res.status(500).send(`
          <html>
            <body style="font-family:sans-serif;background:#111;color:#fff;padding:24px;">
              <h2>Could not open Spotify login on kiosk</h2>
              <p>Please open this URL directly on the kiosk:</p>
              <code>${loginUrl}</code>
            </body>
          </html>
        `);
      }

      res.send(`
        <html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Spotify Login Sent</title>
          </head>
          <body style="font-family:sans-serif;background:#090b0e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;">
            <div style="max-width:420px;text-align:center;background:#141820;padding:28px;border-radius:18px;">
              <h2>Spotify login opened on kiosk</h2>
              <p style="color:#9aa4b2;line-height:1.5;">
                Please complete the Spotify login on the kiosk screen.
                After login, return to the remote.
              </p>
              <a href="/remote" style="display:inline-block;margin-top:16px;background:#1ed760;color:#000;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:800;">
                Back to Remote
              </a>
            </div>
          </body>
        </html>
      `);
    }
  );
});

router.get('/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).send(`
      <html>
        <head><title>Resonance — Setup Required</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
        <body style="background:#090b0e;color:#f1f3f6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;">
          <div style="max-width:420px;background:#13161c;border:1px solid rgba(255,255,255,0.05);padding:32px;border-radius:16px;text-align:center;">
            <h1 style="color:#ff3366;font-size:1.2rem;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.1em;">Setup Required</h1>
            <p style="color:#8695a7;font-size:0.85rem;line-height:1.6;margin:0 0 20px;">
              Spotify credentials are not configured on this server.<br/><br/>
              Add <strong style="color:#fff;">SPOTIFY_CLIENT_ID</strong>, <strong style="color:#fff;">SPOTIFY_CLIENT_SECRET</strong> and <strong style="color:#fff;">SPOTIFY_REDIRECT_URI</strong> to the <code style="color:#c788ff;">.env</code> file in the project root, then restart the server.
            </p>
            <a href="/" style="display:inline-block;padding:10px 24px;background:#1ed760;color:#000;border-radius:50px;font-weight:800;text-decoration:none;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;">Back to App</a>
          </div>
        </body>
      </html>
    `);
  }

  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-private',
    'user-read-email',
    'streaming',
    'user-library-read',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-recently-played',
  ].join(' ');

  pendingOAuthState = crypto.randomBytes(16).toString('hex') + (req.query.from === 'remote' ? '_remote' : '');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state: pendingOAuthState,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// GET /auth/spotify/callback  →  exchange code for tokens
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  const stateValue = typeof state === 'string' ? state : '';
  const pendingWasRemote = typeof pendingOAuthState === 'string' && pendingOAuthState.endsWith('_remote');
  const isFromRemote = stateValue.endsWith('_remote') || pendingWasRemote;
  const redirectBase = isFromRemote ? '/remote' : '/';

  if (error) {
    return res.redirect(`${redirectBase}?auth_error=${encodeURIComponent(error)}`);
  }

  if (!state || state !== pendingOAuthState) {
    pendingOAuthState = null;
    return res.redirect(`${redirectBase}?auth_error=state_mismatch`);
  }
  pendingOAuthState = null;

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new Error(tokenData.error_description || 'No access token returned');
    }

    // Fetch Spotify profile to get display name
    const profileRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json();

    tokenState = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000) - 60000,
      display_name: profile.display_name || profile.id || 'Spotify User',
    };

    saveTokens();

    // Broadcast the new token to all WS clients
    const broadcast = req.app.get('wssBroadcast');
    if (broadcast) {
      broadcast({ type: 'SET_TOKEN', payload: { token: tokenState.access_token } });
    }

    console.log(`[Resonance Auth] Authenticated as: ${tokenState.display_name}`);

    // Redirect back to the app root cleanly
    res.redirect(redirectBase);

  } catch (err) {
    console.error('[Resonance Auth] OAuth callback error:', err.message);
    res.redirect(`${redirectBase}?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// GET /auth/spotify/status  →  is the server authenticated?
router.get('/status', async (req, res) => {
  const token = await getValidAccessToken();
  res.json({
    isConnected: !!token,
    displayName: tokenState.display_name || null,
  });
});

// GET /auth/spotify/token  →  return the current valid access token to authorised local clients
router.get('/token', async (req, res) => {
  const token = await getValidAccessToken();
  if (!token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ token });
});

// POST /auth/spotify/logout  →  clear all tokens
router.post('/logout', async (req, res) => {
  tokenState = { access_token: null, refresh_token: null, expires_at: 0, display_name: null };
  try { 
    await deleteSetting('spotify_access_token');
    await deleteSetting('spotify_refresh_token');
    await deleteSetting('spotify_expires_at');
    await deleteSetting('spotify_display_name');
  } catch (_) {}

  const broadcast = req.app.get('wssBroadcast');
  if (broadcast) broadcast({ type: 'CLEAR_TOKEN' });

  console.log('[Resonance Auth] Logged out from Spotify.');
  res.json({ success: true });
});

export default router;
