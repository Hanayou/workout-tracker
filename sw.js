/* IRONOS service worker — offline app shell + font caching */
const VERSION = 'ironos-v2';
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

// Core app files + navigations: network-first (always fresh when online, cached
// when offline) so deploys show up on the next launch. Icons/fonts: cache-first.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === 'https://fonts.googleapis.com' || url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, RUNTIME));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const isCore = req.mode === 'navigate'
    || url.pathname.endsWith('/')
    || /\/(index\.html|app\.js|styles\.css|manifest\.webmanifest)$/.test(url.pathname);

  event.respondWith(isCore ? networkFirst(req) : cacheFirst(req, SHELL));
});

async function networkFirst(req) {
  const cache = await caches.open(SHELL);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = await cache.match(req);
    return hit || cache.match('./index.html');
  }
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch (_) {
    return hit;
  }
}
