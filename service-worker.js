// Offline app-shell cache.
//
// WHY THIS WAS REWRITTEN
// The previous version was cache-first for EVERYTHING and used a hardcoded
// cache name. That combination meant a deployed update was never picked up:
// once index.html and app.js were in the cache they were served forever, a
// normal refresh did nothing, and because the cache name never changed the
// cleanup in `activate` never ran either. Users were pinned to whatever
// version they first loaded.
//
// STRATEGY NOW
//   - Code and data (HTML, JS, CSS, JSON): NETWORK-FIRST. Always try the
//     network so a deploy is picked up on the next load; fall back to cache
//     only when genuinely offline. This is the fix for the stale-site bug.
//   - Static assets (images, fonts): CACHE-FIRST. They rarely change and
//     are the expensive part of an offline load.
//   - BUILD_ID is stamped at build time, so every deploy gets a fresh cache
//     and the previous one is deleted on activate.

const BUILD_ID = '20260901085253';           // replaced during build
const CACHE_NAME = 'enghub-' + BUILD_ID;

const SHELL_FILES = [
  './index.html',
  './css/styles.css',
  './js/app.js',
  './data/formulaLibrary.json',
  './data/content-visibility.json',
  './manifest.webmanifest',
  './assets/logo.png',
];

// Extensions served cache-first: they change rarely and are heavy.
const STATIC_RE = /\.(png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|eot)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .catch(() => {
        // A missing shell file shouldn't block install entirely —
        // partial offline support beats none.
      })
  );
  // Activate immediately rather than waiting for every old tab to close,
  // so an update isn't stuck behind a long-lived tab.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        // Delete every cache from a previous build.
        keys.filter((k) => k.indexOf('enghub-') === 0 && k !== CACHE_NAME)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Allow the page to tell a waiting worker to take over right away.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== location.origin) return;   // let cross-origin through

  if (STATIC_RE.test(url.pathname)) {
    // CACHE-FIRST for images and fonts.
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // NETWORK-FIRST for navigations, HTML, JS, CSS and JSON — this is what
  // makes a new deploy show up instead of the old cached copy.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        // Offline: serve the cached copy, falling back to the shell for
        // navigations so the app still opens with no connection.
        caches.match(req).then((cached) =>
          cached || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)
        )
      )
  );
});
