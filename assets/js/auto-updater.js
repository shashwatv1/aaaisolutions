// Auto-updater.js - Updated for AAAI Solutions Nginx Proxy Setup
class AutoUpdater {
    constructor() {
      this.currentVersion = window.BUILD_TIMESTAMP || Date.now().toString();
      this.checkInterval = 120000; // 2 minutes
      
      // UPDATED: Use same domain - nginx will proxy to gateway
      this.API_BASE_URL = window.location.origin; // https://aaai.solutions
      
      this.init();
    }
  
    async init() {
      await this.registerServiceWorker();
      this.setupMessageListeners();
      this.setupBroadcastChannel();
      this.startVersionCheck();
      
      // Initial check-in with admin system
      this.reportVersionToAdmin();
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
        // UPDATED: Use nginx proxied admin endpoint
        const response = await fetch(`${this.API_BASE_URL}/admin/api/version?current_version=${this.currentVersion}&t=${Date.now()}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        
        if (!response.ok) {
          console.warn(`Version check failed: ${response.status} - ${response.statusText}`);
          return null;
        }
        
        const data = await response.json();
        
        // Report to admin that we checked for updates
        console.log(`🔍 Version check: current=${this.currentVersion}, server=${data.version}`);
        
        return data.version;
      } catch (error) {
        console.warn('Version check failed:', error);
        return null;
      }
    }
  
    async reportVersionToAdmin() {
      try {
        // UPDATED: Use nginx proxied admin endpoint
        const response = await fetch(`${this.API_BASE_URL}/admin/api/user-updated`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            version: this.currentVersion,
            timestamp: Date.now(),
            user_agent: navigator.userAgent,
            url: window.location.href
          })
        });
        
        if (!response.ok) {
          console.warn(`Failed to report version: ${response.status}`);
        }
      } catch (error) {
        console.warn('Failed to report version to admin:', error);
      }
    }
  
    async checkForUpdates() {
      const serverVersion = await this.getCurrentServerVersion();
      
      if (serverVersion && serverVersion !== this.currentVersion) {
        console.log(`🚀 New version detected: ${serverVersion} (current: ${this.currentVersion})`);
        console.log('📱 Auto-reloading to update...');
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
      console.log('🔄 Auto-reloading due to version update...');
      
      try {
        // Report successful update to admin before reloading
        const response = await fetch(`${this.API_BASE_URL}/admin/api/version?current_version=${this.currentVersion}`, { cache: 'no-cache' });
        
        if (response.ok) {
          const data = await response.json();
          
          await fetch(`${this.API_BASE_URL}/admin/api/user-updated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: data.version,
              timestamp: Date.now(),
              updated_from: this.currentVersion
            })
          });
        }
      } catch (error) {
        console.warn('Failed to report update to admin:', error);
      }
      
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
      // Initial check
      this.checkForUpdates();
      
      // Periodic checks
      setInterval(() => {
        this.checkForUpdates();
      }, this.checkInterval);
      
      console.log('✅ Auto-updater initialized - website will refresh automatically on updates');
      console.log(`📊 Current version: ${this.currentVersion}`);
      console.log(`🔄 Checking for updates every ${this.checkInterval/1000} seconds`);
      console.log(`🌐 Admin API: ${this.API_BASE_URL}/admin/api (via nginx proxy)`);
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