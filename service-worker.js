/* ============================================================
   Stock Alert Dashboard — Service Worker
   Strategy:
     • App shell (HTML, fonts, xlsx.js) → Cache First
     • Firebase / Firestore calls       → Network Only (always fresh)
     • XLS / XLSX file uploads          → Network Only (daily data)
   ============================================================ */

const CACHE_NAME = 'stock-alert-v1';

// Assets to cache on install (app shell)
const SHELL_ASSETS = [
  './index.html',
  './manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600;700&family=Barlow+Condensed:wght@600;700;800&display=swap'
];

// Domains that must NEVER be served from cache (always live data)
const NETWORK_ONLY_PATTERNS = [
  'firebaseio.com',
  'firestore.googleapis.com',
  'googleapis.com/firestore',
  'gstatic.com/firebasejs'
];

// ── Install: cache the app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(SHELL_ASSETS).catch(err => {
        console.warn('[SW] Some shell assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activate: remove old caches ───────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: smart routing ──────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 1. Firebase / Firestore → always network (live data)
  if(NETWORK_ONLY_PATTERNS.some(p => url.includes(p))){
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. POST requests (file uploads) → always network
  if(event.request.method !== 'GET'){
    event.respondWith(fetch(event.request));
    return;
  }

  // 3. App shell → Cache First, fallback to network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) return cached;
      return fetch(event.request).then(response => {
        // Cache valid responses for shell assets
        if(response && response.status === 200 && response.type !== 'opaque'){
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback — serve index.html for navigation requests
      if(event.request.mode === 'navigate'){
        return caches.match('./index.html');
      }
    })
  );
});
