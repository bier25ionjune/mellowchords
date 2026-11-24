'use strict';

const CACHE_NAME = 'mellowchords-v14';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Install: cache all essential app shell files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[SW] Pre-caching warning:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches & take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: offline-first for app shell, complete bypass for Supabase & external APIs
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Non-GET requests (e.g. Supabase Auth/DB POST/PUT/DELETE): pass through directly to network
  if (req.method !== 'GET') return;

  // Completely bypass Service Worker interception for Supabase, Jina Reader, LRCLIB, and CORS proxies
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('jina.ai') ||
    url.hostname.includes('lrclib.net') ||
    url.hostname.includes('allorigins') ||
    url.hostname.includes('corsproxy') ||
    url.hostname.includes('weserv.nl') ||
    url.hostname.includes('chordtabs.in.th') ||
    url.hostname.includes('yahoo.com') ||
    url.hostname.includes('duckduckgo.com')
  ) {
    return;
  }

  // Navigation requests (HTML pages): Stale-While-Revalidate with index.html fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then(cached => {
        const fetchPromise = fetch(req).then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Static assets (CSS, JS, images, icons, fonts, CDN): Cache-First with Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req).then(networkResponse => {
        if (networkResponse && (networkResponse.ok || networkResponse.type === 'opaque')) {
          const respClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, respClone));
        }
        return networkResponse;
      }).catch(err => {
        if (cached) return cached;
        throw err;
      });
      return cached || fetchPromise;
    })
  );
});

// Listen for update instructions
self.addEventListener('message', event => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
