class AutoUpdater {
    constructor() {
      this.currentVersion = window.BUILD_TIMESTAMP || Date.now().toString();
      this.checkInterval = 120000; // 2 minutes
      this.init();
    }
  
    async init() {
      await this.registerServiceWorker();
      this.setupMessageListeners();
      this.setupBroadcastChannel();
      this.startVersionCheck();
    }
  
    async registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  setTimeout(() => this.performAutoReload(), 1000);
                }
              });
            }
          });
        } catch (error) {
          console.error('Service Worker registration failed:', error);
        }
      }
    }
  
    setupMessageListeners() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'AUTO_RELOAD_NOW') {
            this.performAutoReload();
          }
        });
      }
    }
  
    setupBroadcastChannel() {
      if ('BroadcastChannel' in window) {
        this.updateChannel = new BroadcastChannel('app-updates');
        
        this.updateChannel.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'AUTO_RELOAD') {
            setTimeout(() => {
              this.performAutoReload();
            }, Math.random() * 2000);
          }
        });
      }
    }
  
    async getCurrentServerVersion() {
      try {
        const response = await fetch('/api/version?' + Date.now(), {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        const data = await response.json();
        return data.version;
      } catch (error) {
        console.warn('Version check failed:', error);
        return null;
      }
    }
  
    async checkForUpdates() {
      const serverVersion = await this.getCurrentServerVersion();
      
      if (serverVersion && serverVersion !== this.currentVersion) {
        console.log('New version detected, auto-reloading...');
        this.triggerAutoReload();
        return true;
      }
      
      return false;
    }
  
    triggerAutoReload() {
      // Broadcast to other tabs
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('app-updates');
        channel.postMessage({ type: 'AUTO_RELOAD' });
      }
      
      // Notify service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'FORCE_AUTO_RELOAD'
        });
      }
      
      // Auto reload this tab
      setTimeout(() => this.performAutoReload(), 1000);
    }
  
    async performAutoReload() {
      console.log('Auto-reloading due to version update...');
      
      // Clear caches
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        } catch (error) {
          console.warn('Cache clearing failed:', error);
        }
      }
      
      // Force reload
      window.location.reload(true);
    }
  
    startVersionCheck() {
      setInterval(() => {
        this.checkForUpdates();
      }, this.checkInterval);
      
      console.log('Auto-updater initialized - website will refresh automatically on updates');
    }
  }
  
  // Initialize auto-updater
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.autoUpdater = new AutoUpdater();
    });
  } else {
    window.autoUpdater = new AutoUpdater();
  }