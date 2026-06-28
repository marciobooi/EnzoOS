// Minimal cookie helpers for the remote session token.
export const setCookie = (n, v, d = 365) => {
  const e = new Date();
  e.setTime(e.getTime() + d * 86400000);
  document.cookie = `${n}=${v}; expires=${e.toUTCString()}; path=/`;
};

export const getCookie = (n) => {
  const v = `; ${document.cookie}`;
  const p = v.split(`; ${n}=`);
  return p.length === 2 ? p.pop().split(';').shift() : null;
};

export const eraseCookie = (n) => {
  document.cookie = `${n}=; Max-Age=-99999999; path=/`;
};
