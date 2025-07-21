const CACHE_NAME = 'app-cache-v' + (window.BUILD_TIMESTAMP || Date.now());
const STATIC_CACHE = 'static-cache-v' + (window.BUILD_TIMESTAMP || Date.now());

// Install event - cache core assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Installing');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        return cache.addAll([
          '/',
          '/index.html',
          '/project.html',
          '/chat.html',
          '/login.html',
          '/assets/css/style.css',
          '/assets/js/script.js'
        ]);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/api/version')) {
    return fetch(event.request);
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) return response;
        
        return fetch(event.request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }
          
          const responseToCache = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, responseToCache));
          
          return response;
        });
      })
  );
});

// Listen for auto-reload messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FORCE_AUTO_RELOAD') {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'AUTO_RELOAD_NOW' });
      });
    });
  }
});