/**
 * AAAI Solutions Service Worker - Fixed Version
 * Handles caching and auto-reload notifications with proper cache management
 */

// Get version from URL parameter or fallback to timestamp
const CACHE_VERSION = self.registration.scope.includes('?v=') 
  ? new URL(self.registration.scope).searchParams.get('v')
  : new URL(location).searchParams.get('v') || Date.now().toString();

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
  console.log(`🔧 Service Worker: Installing version ${CACHE_VERSION}...`);
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('📦 Service Worker: Caching static files...');
        // Add cache-busting parameters to ensure fresh content
        const cachePromises = STATIC_FILES.map(url => {
          const cacheBustUrl = `${url}${url.includes('?') ? '&' : '?'}v=${CACHE_VERSION}`;
          return fetch(cacheBustUrl, { cache: 'no-cache' })
            .then(response => {
              if (response.ok) {
                return cache.put(url, response);
              } else {
                console.warn(`Failed to cache ${url}: ${response.status}`);
              }
            })
            .catch(error => {
              console.warn(`Failed to fetch ${url}:`, error);
            });
        });
        return Promise.all(cachePromises);
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
  console.log(`🚀 Service Worker: Activating version ${CACHE_VERSION}...`);
  
  event.waitUntil(
    Promise.all([
      // Clean old caches
      caches.keys().then(cacheNames => {
        const deletePromises = cacheNames.map(cacheName => {
          // Keep only current version caches
          if (cacheName !== CACHE_NAME && cacheName !== STATIC_CACHE) {
            console.log('🗑️ Service Worker: Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        }).filter(Boolean);
        
        return Promise.all(deletePromises);
      }),
      
      // Clear all stored data to ensure fresh start
      self.clients.claim().then(() => {
        // Notify all clients that service worker is ready
        return self.clients.matchAll();
      }).then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: CACHE_VERSION,
            timestamp: Date.now()
          });
        });
        console.log('✅ Service Worker: Ready and controlling pages');
      })
    ])
  );
});

// Fetch event - handle network requests with improved strategy
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip admin API calls - always fetch fresh
  if (url.pathname.includes('/admin/api/') || url.pathname.includes('/api/') || url.pathname.includes('/auth/')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' }).catch(() => {
        // Return offline fallback if available
        return caches.match('/offline.html') || new Response('Offline', { status: 503 });
      })
    );
    return;
  }
  
  // For HTML files, use network-first strategy to ensure updates
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request, { cache: 'no-cache' })
        .then(response => {
          if (response.ok) {
            // Cache the fresh response
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseClone);
            });
            return response;
          }
          throw new Error('Network response not ok');
        })
        .catch(() => {
          // Fall back to cache
          return caches.match(request).then(response => {
            return response || new Response('Page not available offline', { 
              status: 503,
              headers: { 'Content-Type': 'text/html' }
            });
          });
        })
    );
    return;
  }
  
  // For other static assets, use cache-first strategy
  event.respondWith(
    caches.match(request)
      .then(response => {
        if (response) {
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
            return new Response('Resource not available', { status: 503 });
          });
      })
  );
});

// Listen for messages from auto-updater
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLEAR_CACHES') {
    console.log('🗑️ Service Worker: Clearing all caches...');
    
    event.waitUntil(
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            console.log('🗑️ Service Worker: Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('✅ Service Worker: All caches cleared');
        // Notify client that caches are cleared
        event.ports[0]?.postMessage({ success: true });
      }).catch(error => {
        console.error('❌ Service Worker: Cache clearing failed:', error);
        event.ports[0]?.postMessage({ success: false, error: error.message });
      })
    );
  }
  
  if (event.data && event.data.type === 'FORCE_AUTO_RELOAD') {
    console.log('🔄 Service Worker: Force reload requested');
    
    // Notify all clients to reload
    self.clients.matchAll()
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ 
            type: 'AUTO_RELOAD_NOW',
            timestamp: Date.now(),
            version: CACHE_VERSION
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

console.log(`✅ Service Worker: Script loaded successfully (v${CACHE_VERSION})`);