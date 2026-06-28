// Shared HTTP helpers for the API layer.
export const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

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
