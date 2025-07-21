/**
 * AAAI Solutions Service Worker
 * Handles caching and auto-reload notifications
 */

const CACHE_VERSION = Date.now().toString();
const CACHE_NAME = 'aaai-cache-v' + CACHE_VERSION;
const STATIC_CACHE = 'aaai-static-v' + CACHE_VERSION;

// Files to cache on install
const STATIC_FILES = [
  '/',
  '/index.html',
  '/project.html',
  '/chat.html',
  '/login.html',
  '/assets/css/style.css',
  '/assets/js/script.js',
  '/assets/js/auto-updater.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('🔧 Service Worker: Installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('📦 Service Worker: Caching static files...');
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log('✅ Service Worker: Static files cached');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('❌ Service Worker: Cache failed:', error);
      })
  );
});

// Activate event - clean old caches and take control
self.addEventListener('activate', (event) => {
  console.log('🚀 Service Worker: Activating...');
  
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
              console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log('✅ Service Worker: Old caches cleaned');
        return self.clients.claim();
      })
      .then(() => {
        console.log('✅ Service Worker: Ready and controlling pages');
      })
  );
});

// Fetch event - handle network requests
self.addEventListener('fetch', (event) => {
  const request = event.request;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip admin API calls - always fetch fresh
  if (request.url.includes('/admin/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip other API calls
  if (request.url.includes('/api/') || request.url.includes('/auth/')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Handle static file requests with cache-first strategy
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
          // Found in cache, return it
          return response;
        }
        
        // Not in cache, fetch from network
        return fetch(request)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone response for caching
            const responseToCache = response.clone();
            
            // Cache the response
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(request, responseToCache);
              })
              .catch(error => {
                console.warn('⚠️ Service Worker: Failed to cache:', error);
              });
            
            return response;
          })
          .catch(error => {
            console.warn('⚠️ Service Worker: Fetch failed:', error);
            
            // Try to return cached version as fallback
            return caches.match(request);
          });
      })
  );
});

// Listen for messages from auto-updater
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FORCE_AUTO_RELOAD') {
    console.log('🔄 Service Worker: Force reload requested');
    
    // Notify all clients to reload
    self.clients.matchAll()
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ 
            type: 'AUTO_RELOAD_NOW',
            timestamp: Date.now()
          });
        });
      })
      .catch(error => {
        console.error('❌ Service Worker: Failed to notify clients:', error);
      });
  }
});

// Error handling
self.addEventListener('error', (event) => {
  console.error('❌ Service Worker: Error:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('❌ Service Worker: Unhandled rejection:', event.reason);
});

console.log('✅ Service Worker: Script loaded successfully');