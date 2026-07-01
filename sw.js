/* IRONOS service worker — offline app shell + font caching */
const VERSION = 'ironos-v1';
const SHELL = 'ironos-shell-' + VERSION;
const RUNTIME = 'ironos-runtime-' + VERSION;

const SHELL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL)
      .then(c => c.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => {}) // don't block install if an asset 404s during dev
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== SHELL && k !== RUNTIME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Google Fonts: cache-first, fall back to network then cache
  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(
      caches.open(RUNTIME).then(cache =>
        cache.match(req).then(hit => hit || fetch(req).then(res => {
          cache.put(req, res.clone()); return res;
        }).catch(() => hit))
      )
    );
    return;
  }

  if (!sameOrigin) return;

  // App shell: stale-while-revalidate — instant load, quiet background updates
  event.respondWith(
    caches.open(SHELL).then(cache =>
      cache.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if (res && res.status === 200) cache.put(req, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    )
  );
});
