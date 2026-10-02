// Minimal cookie helpers for the remote session token.
// `remote_token` is only ever set from the HTTPS remote page (resonance.local:5001) —
// the kiosk is loopback-trusted and never calls this — so `Secure` is safe whenever
// we're actually on https:. `SameSite=Strict` is safe too: every request that sends
// this cookie is a same-origin fetch/XHR from the already-loaded remote page: the
// initial navigation authenticates via the ?qr= token in the URL, not this cookie.
// Safari/iOS (ITP) deletes script-written cookies after ~7 days without a visit, which
// silently logged the installed home-screen remote out. localStorage is exempt for
// home-screen web apps, so every value is mirrored there and restored on read.
const store = {
  get: (k) => { try { return localStorage.getItem(`cookie:${k}`); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`cookie:${k}`, v); } catch { /* storage blocked */ } },
  del: (k) => { try { localStorage.removeItem(`cookie:${k}`); } catch { /* storage blocked */ } },
};

export const setCookie = (n, v, d = 365) => {
  store.set(n, v);
  const e = new Date();
  e.setTime(e.getTime() + d * 86400000);
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${n}=${v}; expires=${e.toUTCString()}; path=/; SameSite=Strict${secure}`;
};

export const getCookie = (n) => {
  const v = `; ${document.cookie}`;
  const p = v.split(`; ${n}=`);
  if (p.length === 2) return p.pop().split(';').shift();
  const saved = store.get(n);
  if (saved) setCookie(n, saved); // cookie was evicted — restore it
  return saved;
};

export const eraseCookie = (n) => {
  store.del(n);
  document.cookie = `${n}=; Max-Age=-99999999; path=/`;
};
