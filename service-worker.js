// Minimal offline app-shell cache. This app does all its calculations
// client-side with no backend — caching the shell means it still opens and
// works with no connection after the first successful load, which matters
// for a Play Store app that might be opened without signal.
const CACHE_NAME = 'enghub-shell-v1';
const SHELL_FILES = [
  './index.html',
  './css/styles.css',
  './js/app.js',
  './data/formulaLibrary.json',
  './manifest.webmanifest',
  './assets/logo.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {
      // If a shell file 404s (e.g. deployed without the full folder), don't
      // block install entirely — partial offline support beats none.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          // Cache calculator module files as they're fetched, so the full
          // app becomes available offline after the first real visit.
          if (response.ok && new URL(event.request.url).origin === location.origin) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline and not cached: let it fail naturally
    })
  );
});
