// Resonance Remote — service worker (app shell cache)
// Goal: the installed PWA opens instantly and survives brief network blips,
// while NEVER serving stale app code or intercepting live data.
//
// Strategy:
//  • /api/*, /auth/*, /ws       → never intercepted (live data & auth only).
//  • navigations (HTML)         → network-first, cache fallback (offline shell).
//  • hashed build assets/fonts  → cache-first (immutable by construction),
//    everything else same-origin GET → stale-while-revalidate.
// Old caches are dropped on activate whenever CACHE bumps.

const CACHE = 'resonance-shell-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(['/remote', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']))
      .catch(() => {}) // partial precache is fine — runtime caching fills in
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data, auth and websockets must always hit the network directly
  if (/^\/(api|auth|ws)(\/|$)/.test(url.pathname)) return;

  // HTML navigations: freshest wins; cached shell only when truly offline
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return r;
        })
        .catch(() => caches.match(request).then(m => m || caches.match('/remote')))
    );
    return;
  }

  // Vite's hashed assets are immutable — cache-first is always correct;
  // everything else same-origin: stale-while-revalidate.
  const immutable = /^\/assets\/|^\/fonts\//.test(url.pathname);
  e.respondWith(
    caches.match(request).then(cached => {
      if (immutable && cached) return cached;
      const network = fetch(request).then(r => {
        if (r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
        }
        return r;
      });
      if (cached) {
        network.catch(() => {}); // background refresh; failures are fine
        return cached;
      }
      return network;
    })
  );
});
