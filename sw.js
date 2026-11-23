'use strict';

const CACHE_NAME = 'mellowchords-v3';
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

// Fetch: offline-first for app shell, network-first for Supabase & external proxies
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Non-GET requests (e.g. Supabase POST/PUT): pass through
  if (req.method !== 'GET') return;

  // Supabase REST or dynamic API endpoints: network-first
  if (url.hostname.includes('supabase.co') || url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ offline: true }), {
        headers: { 'Content-Type': 'application/json' },
        status: 503
      }))
    );
    return;
  }

  // Web scraping proxies: network-first, do not cache proxy scraping responses
  if (url.hostname.includes('allorigins') || url.hostname.includes('corsproxy')) {
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
