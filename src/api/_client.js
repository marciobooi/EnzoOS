// Shared HTTP helpers for the API layer.
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

/**
 * Parse a JSON response from OUR OWN backend and throw on non-2xx instead of
 * silently returning the error body as if it were success data. Our routes
 * always return errors as `{ error: "message", code, details? }` (a flat
 * string — see server/lib/errors.js), unlike Spotify's nested `{ error: {
 * message } }` shape, which is why this is separate from handleResponse().
 */
export async function handleJson(response, fallbackMessage) {
  if (response.status === 204) return { success: true };

  const text = await response.text();
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { /* non-JSON body, fall through */ }
  }

  if (!response.ok) {
    throw new Error(data?.error || fallbackMessage || `Request failed (${response.status})`);
  }
  return data ?? { success: true };
}

export async function handleResponse(response) {
  if (response.status === 204) return { success: true };

  // 401: token expired. Kick off a server-side refresh so the WS SET_TOKEN
  // broadcast delivers the new token to all clients. Throw a clean message
  // so the caller's toast doesn't show the raw Spotify error body.
  if (response.status === 401) {
    fetch('/auth/spotify/token').catch(() => {});
    throw new Error('Spotify session expired — refreshing token, please retry.');
  }

  const text = await response.text();
  if (!text) {
    if (!response.ok) throw new Error(`Spotify API error ${response.status}`);
    return { success: true };
  }

  let data;
  try { data = JSON.parse(text); } catch {
    if (!response.ok) throw new Error(`Spotify API error ${response.status}`);
    return { success: true };
  }

  if (!response.ok) {
    throw new Error(data?.error?.message || `Spotify API error ${response.status}`);
  }
  return data;
}
