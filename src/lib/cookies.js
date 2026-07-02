// Minimal cookie helpers for the remote session token.
// `remote_token` is only ever set from the HTTPS remote page (resonance.local:5001) —
// the kiosk is loopback-trusted and never calls this — so `Secure` is safe whenever
// we're actually on https:. `SameSite=Strict` is safe too: every request that sends
// this cookie is a same-origin fetch/XHR from the already-loaded remote page: the
// initial navigation authenticates via the ?qr= token in the URL, not this cookie.
export const setCookie = (n, v, d = 365) => {
  const e = new Date();
  e.setTime(e.getTime() + d * 86400000);
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${n}=${v}; expires=${e.toUTCString()}; path=/; SameSite=Strict${secure}`;
};

export const getCookie = (n) => {
  const v = `; ${document.cookie}`;
  const p = v.split(`; ${n}=`);
  return p.length === 2 ? p.pop().split(';').shift() : null;
};

export const eraseCookie = (n) => {
  document.cookie = `${n}=; Max-Age=-99999999; path=/`;
};
