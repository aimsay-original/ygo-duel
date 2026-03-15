const CACHE_NAME = 'ygo-duel-v1';
const CARD_CACHE = 'ygo-cards-v1';

// Detect base path from SW scope (works with both / and /ygo-duel/)
const BASE = self.registration ? new URL(self.registration.scope).pathname : '/';

// App shell files to precache (updated on build)
const APP_SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'card-back.svg',
  BASE + 'manifest.json'
];

// Install: precache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== CARD_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip WebRTC/PeerJS signaling requests (don't cache these)
  if (url.hostname.includes('peerjs') || url.pathname.includes('peerjs')) return;

  // Skip API requests (card search must be fresh)
  if (url.hostname === 'db.ygoprodeck.com') return;

  // CacheFirst for card images from ygoprodeck
  if (url.hostname === 'images.ygoprodeck.com') {
    event.respondWith(
      caches.open(CARD_CACHE).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) {
              // Clone and cache (limit to 500 entries)
              cache.put(event.request, response.clone());
              // Trim old entries if needed
              cache.keys().then((keys) => {
                if (keys.length > 500) {
                  cache.delete(keys[0]);
                }
              });
            }
            return response;
          }).catch(() => {
            // Return card back SVG as fallback
            return caches.match(BASE + 'card-back.svg');
          });
        });
      })
    );
    return;
  }

  // CacheFirst for Google Fonts
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.match(event.request).then((cached) => {
          if (cached) return cached;
          return fetch(event.request).then((response) => {
            if (response.ok) cache.put(event.request, response.clone());
            return response;
          });
        });
      })
    );
    return;
  }

  // NetworkFirst for app shell (HTML, JS, CSS)
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for app shell
        if (response.ok && (url.origin === self.location.origin)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
