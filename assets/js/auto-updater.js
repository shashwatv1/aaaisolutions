class AutoUpdater {
    constructor() {
      this.currentVersion = window.BUILD_TIMESTAMP || Date.now().toString();
      this.checkInterval = 120000; // 2 minutes
      this.init();
    }
  
    async init() {
      this.registerServiceWorker();
      this.setupMessageListeners();
      this.setupBroadcastChannel();
      this.startVersionCheck();
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
        const response = await fetch(`/admin/api/version?current_version=${this.currentVersion}&t=${Date.now()}`, {
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache'
          }
        });
        const data = await response.json();
        
        console.log(`Version check: current=${this.currentVersion}, server=${data.version}`);
        
        return data.version;
      } catch (error) {
        console.warn('Version check failed:', error);
        return null;
      }
    }
  
    async reportVersionToAdmin() {
      try {
        await fetch('/admin/api/user-updated', {
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
      } catch (error) {
        console.warn('Failed to report version to admin:', error);
      }
    }
  
    async checkForUpdates() {
      const serverVersion = await this.getCurrentServerVersion();
      
      if (serverVersion && serverVersion !== this.currentVersion) {
        console.log(`New version detected: ${serverVersion} (current: ${this.currentVersion})`);
        console.log('Auto-reloading to update...');
        this.triggerAutoReload();
        return true;
      }
      
      return false;
    }
  
    triggerAutoReload() {
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('app-updates');
        channel.postMessage({ type: 'AUTO_RELOAD' });
      }
      
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'FORCE_AUTO_RELOAD'
        });
      }
      
      setTimeout(() => this.performAutoReload(), 1000);
    }
  
    async performAutoReload() {
      console.log('Auto-reloading due to version update...');
      
      try {
        const response = await fetch(`/admin/api/version?current_version=${this.currentVersion}`, { cache: 'no-cache' });
        const data = await response.json();
        
        await fetch('/admin/api/user-updated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: data.version,
            timestamp: Date.now(),
            updated_from: this.currentVersion
          })
        });
      } catch (error) {
        console.warn('Failed to report update to admin:', error);
      }
      
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
        } catch (error) {
          console.warn('Cache clearing failed:', error);
        }
      }
      
      window.location.reload(true);
    }
  
    startVersionCheck() {
      this.checkForUpdates();
      
      setInterval(() => {
        this.checkForUpdates();
      }, this.checkInterval);
      
      console.log('Auto-updater initialized - website will refresh automatically on updates');
      console.log(`Current version: ${this.currentVersion}`);
      console.log(`Checking for updates every ${this.checkInterval/1000} seconds`);
    }
  }
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.autoUpdater = new AutoUpdater();
    });
  } else {
    window.autoUpdater = new AutoUpdater();
  }