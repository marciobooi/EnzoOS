import express from 'express';
import fetch from 'node-fetch';
import crypto from 'crypto';
import { getSetting, setSetting, deleteSetting } from './db.js';
import { sendError, unauthorized } from './lib/errors.js';
import { emit } from './event-service.js';

const router = express.Router();

// Build the redirect URI for the current request.
// HTTPS requests (remote browsers on LAN) can use any host — Spotify accepts them.
// HTTP requests must use 127.0.0.1 (the only non-HTTPS host Spotify allows).
function getRedirectUri(req) {
  if (req.secure) {
    return `https://${req.get('host')}/auth/spotify/callback`;
  }
  const port = (req.get('host') || '').split(':')[1] || '5000';
  return `http://127.0.0.1:${port}/auth/spotify/callback`;
}

// ── PKCE (Authorization Code with Proof Key for Code Exchange) ────────────────
// Resonance is a public/native client: it ships an installable image, so a
// client *secret* could never be kept confidential. PKCE removes the secret
// entirely — the app proves possession of a one-time random `code_verifier`
// instead. Only the (non-confidential) Client ID is needed on-device.
function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function createPkcePair() {
  const verifier = base64url(crypto.randomBytes(64));            // 86-char high-entropy string
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

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

// Mutex: prevents concurrent token refresh calls (interval + WS connection race)
let refreshing = null;

// Helper: refresh access token using stored refresh token
export const refreshAccessToken = async () => {
  if (refreshing) return refreshing; // return the in-flight promise to concurrent callers

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId || !tokenState.refresh_token) return null;

  refreshing = (async () => {
    try {
      // PKCE refresh: client_id in the body, no client secret / Basic auth.
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenState.refresh_token,
          client_id: clientId,
        }),
      });

      const data = await response.json();

      if (data.access_token) {
        tokenState.access_token = data.access_token;
        tokenState.expires_at = Date.now() + (data.expires_in * 1000) - 60000;
        if (data.refresh_token) tokenState.refresh_token = data.refresh_token;
        saveTokens();
        console.log('[Resonance Auth] Access token refreshed successfully.');
        // Push the new token to all connected clients so they don't keep using the expired one.
        emit('SET_TOKEN', { token: tokenState.access_token });
        return tokenState.access_token;
      }
    } catch (err) {
      console.error('[Resonance Auth] Token refresh failed:', err.message);
    }
    return null;
  })().finally(() => { refreshing = null; });

  return refreshing;
};

// Helper: get a valid access token (refreshes if expired)
export const getValidAccessToken = async () => {
  if (!tokenState.access_token) return null;
  if (Date.now() > tokenState.expires_at) {
    return await refreshAccessToken();
  }
  return tokenState.access_token;
};

// Proactively refresh 5 minutes before expiry so clients never hold an
// expired token. Checks every 4 minutes; the window is generous enough
// that a single missed tick doesn't cause a 401.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const tokenRefreshInterval = setInterval(async () => {
  if (tokenState.refresh_token && Date.now() > tokenState.expires_at - REFRESH_MARGIN_MS) {
    await refreshAccessToken();
  }
}, 4 * 60 * 1000);

export function stopTokenRefresh() {
  clearInterval(tokenRefreshInterval);
}

// State param to prevent CSRF + callback URI tracking
let pendingOAuth = null;

// GET /auth/spotify/login  →  redirect to Spotify OAuth

router.get('/login', (req, res) => {
  const clientId = process.env.SPOTIFY_CLIENT_ID;

  if (!clientId) {
    return res.status(500).send(`
      <html>
        <head><title>Resonance — Setup Required</title><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
        <body style="background:#090b0e;color:#f1f3f6;font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;box-sizing:border-box;">
          <div style="max-width:420px;background:#13161c;border:1px solid rgba(255,255,255,0.05);padding:32px;border-radius:16px;text-align:center;">
            <h1 style="color:#ff3366;font-size:1.2rem;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.1em;">Setup Required</h1>
            <p style="color:#8695a7;font-size:0.85rem;line-height:1.6;margin:0 0 20px;">
              Spotify is not configured on this server.<br/><br/>
              Add <strong style="color:#fff;">SPOTIFY_CLIENT_ID</strong> to the <code style="color:#c788ff;">.env</code> file in the project root, then restart the server. No client secret is required (PKCE).
            </p>
            <a href="/" style="display:inline-block;padding:10px 24px;background:#1ed760;color:#000;border-radius:50px;font-weight:800;text-decoration:none;font-size:0.8rem;text-transform:uppercase;letter-spacing:0.08em;">Back to App</a>
          </div>
        </body>
      </html>
    `);
  }

  const redirectUri = getRedirectUri(req);
  const isFromRemote = req.query.from === 'remote';

  const scopes = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'user-read-private',
    'user-read-email',
    'streaming',
    'user-library-read',
    // like-sync: the remote's favorite heart mirrors into the user's real
    // Spotify library (PUT/DELETE /me/tracks) — requires the modify scope.
    // Existing logins keep working; the new scope applies on next re-login.
    'user-library-modify',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read',
    'user-read-recently-played',
  ].join(' ');

  const state = crypto.randomBytes(16).toString('hex') + (isFromRemote ? '_remote' : '');
  const { verifier, challenge } = createPkcePair();
  pendingOAuth = {
    state,
    redirectUri,
    isFromRemote,
    codeVerifier: verifier,
  };

  console.log(`[Resonance Auth] Starting OAuth (PKCE) flow. Redirect URI: ${redirectUri}`);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes,
    redirect_uri: redirectUri,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });

  res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
});

// GET /auth/spotify/callback  →  exchange code for tokens
router.get('/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const stateValue = typeof state === 'string' ? state : '';
  const pendingWasRemote = !!pendingOAuth?.isFromRemote;
  const isFromRemote = stateValue.endsWith('_remote') || pendingWasRemote;
  const redirectBase = isFromRemote ? '/remote' : '/';
  const fallbackRedirectUri = getRedirectUri(req);
  const redirectUri = pendingOAuth?.redirectUri || fallbackRedirectUri;
  const codeVerifier = pendingOAuth?.codeVerifier || '';

  if (error) {
    return res.redirect(`${redirectBase}?auth_error=${encodeURIComponent(error)}`);
  }

  if (!state || !pendingOAuth || state !== pendingOAuth.state) {
    pendingOAuth = null;
    return res.redirect(`${redirectBase}?auth_error=state_mismatch`);
  }
  pendingOAuth = null;

  try {
    // PKCE token exchange: prove possession of the one-time code_verifier.
    // No client secret / Basic auth — client_id travels in the body.
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
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

    // Broadcast new token and request sync via EventService
    emit('SET_TOKEN', { token: tokenState.access_token });
    setTimeout(() => {
      emit('REQUEST_SYNC', null).catch(err =>
        console.error('[Resonance Auth] REQUEST_SYNC after login failed:', err)
      );
    }, 1500);

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
    return sendError(res, unauthorized('Not authenticated'));
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

  emit('CLEAR_TOKEN', null);

  console.log('[Resonance Auth] Logged out from Spotify.');
  res.json({ success: true });
});

export default router;
