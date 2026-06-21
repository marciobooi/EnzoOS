// Installs a fetch interceptor that attaches the remote-access bearer token to
// same-origin /api and /auth requests. This is a no-op on the kiosk: the kiosk
// has no `remote_token` cookie (it is trusted via loopback on the server), so no
// header is added and its behaviour is unchanged. The phone remote sets the
// cookie at login, after which every API call carries the token automatically —
// without having to thread it through dozens of call sites.

export const getAuthToken = () => {
  const m = `; ${document.cookie}`.split('; remote_token=');
  return m.length === 2 ? m.pop().split(';').shift() : null;
};

let installed = false;

export function installAuthFetch() {
  if (installed || typeof window === 'undefined' || !window.fetch) return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);

  const isLocalApi = (url) => {
    try {
      // Relative paths to our own API/auth surface.
      if (url.startsWith('/api') || url.startsWith('/auth')) return true;
      const u = new URL(url, window.location.origin);
      return u.origin === window.location.origin && (u.pathname.startsWith('/api') || u.pathname.startsWith('/auth'));
    } catch {
      return false;
    }
  };

  window.fetch = (input, init = {}) => {
    const token = getAuthToken();
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (token && isLocalApi(url)) {
      const headers = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
      if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      return nativeFetch(input, { ...init, headers });
    }
    return nativeFetch(input, init);
  };
}
