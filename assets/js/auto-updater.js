class AutoUpdater {
    constructor() {
      this.currentVersion = window.BUILD_TIMESTAMP || Date.now().toString();
      this.checkInterval = 120000; // 2 minutes
      this.baseUrl = ''; // Use relative URLs - nginx will handle routing
      this.init();
    }
  
    async init() {
      console.log('🚀 Auto-updater initializing...');
      console.log(`Current version: ${this.currentVersion}`);
      
      this.registerServiceWorker();
      this.setupMessageListeners();
      this.setupBroadcastChannel();
      this.startVersionCheck();
      
      // Report initial version
      await this.reportVersionToAdmin();
    }
  
    async registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('✅ Service Worker registered successfully');
          
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🔄 Service Worker updated - triggering reload');
                  setTimeout(() => this.performAutoReload(), 1000);
                }
              });
            }
          });
        } catch (error) {
          console.error('❌ Service Worker registration failed:', error);
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
            // Add random delay to prevent thundering herd
            setTimeout(() => {
              this.performAutoReload();
            }, Math.random() * 2000);
          }
        });
      }
    }
  
    async getCurrentServerVersion() {
      try {
        // Use relative URL - nginx routes /admin/ to gateway automatically
        const url = `/admin/api/version?current_version=${this.currentVersion}&t=${Date.now()}`;
        
        console.log(`🔍 Checking version at: ${url}`);
        
        const response = await fetch(url, {
          method: 'GET',
          cache: 'no-cache',
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Version check successful - Current: ${this.currentVersion}, Server: ${data.version}`);
        
        return data.version;
      } catch (error) {
        console.warn('⚠️ Version check failed:', error.message);
        return null;
      }
    }
  
    async reportVersionToAdmin() {
      try {
        // Use relative URL - nginx routes /admin/ to gateway
        const url = '/admin/api/user-updated';
        
        const payload = {
          version: this.currentVersion,
          timestamp: Date.now(),
          user_agent: navigator.userAgent,
          url: window.location.href,
          reported_by: 'auto-updater'
        };
        
        console.log('📡 Reporting version to admin system...');
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        
        if (response.ok) {
          console.log('✅ Version reported successfully');
          const result = await response.json();
          console.log('📊 Admin response:', result);
        } else {
          console.warn(`⚠️ Version reporting failed: ${response.status} ${response.statusText}`);
        }
      } catch (error) {
        console.warn('⚠️ Failed to report version to admin:', error.message);
      }
    }
  
    async checkForUpdates() {
      const serverVersion = await this.getCurrentServerVersion();
      
      if (serverVersion && serverVersion !== this.currentVersion) {
        console.log(`🚀 NEW VERSION DETECTED!`);
        console.log(`   Current: ${this.currentVersion}`);
        console.log(`   Server:  ${serverVersion}`);
        console.log(`🔄 Triggering auto-reload...`);
        
        this.triggerAutoReload();
        return true;
      }
      
      return false;
    }
  
    triggerAutoReload() {
      // Notify other tabs via broadcast channel
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('app-updates');
        channel.postMessage({ 
          type: 'AUTO_RELOAD',
          timestamp: Date.now(),
          triggeredBy: this.currentVersion
        });
      }
      
      // Notify service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'FORCE_AUTO_RELOAD',
          timestamp: Date.now()
        });
      }
      
      // Trigger reload for this tab
      setTimeout(() => this.performAutoReload(), 1000);
    }
  
    async performAutoReload() {
      console.log('🔄 Performing auto-reload...');
      
      try {
        // Get latest version info before reloading
        const versionResponse = await fetch(`/admin/api/version?current_version=${this.currentVersion}`, { 
          cache: 'no-cache' 
        });
        
        if (versionResponse.ok) {
          const versionData = await versionResponse.json();
          
          // Report successful update
          await fetch('/admin/api/user-updated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: versionData.version,
              timestamp: Date.now(),
              updated_from: this.currentVersion,
              update_type: 'auto_reload'
            })
          });
          
          console.log(`✅ Update reported - upgrading from ${this.currentVersion} to ${versionData.version}`);
        }
      } catch (error) {
        console.warn('⚠️ Failed to report update completion:', error.message);
      }
      
      // Clear all caches
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          console.log(`🗑️ Clearing ${cacheNames.length} caches...`);
          await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
          console.log('✅ Caches cleared');
        } catch (error) {
          console.warn('⚠️ Cache clearing failed:', error.message);
        }
      }
      
      // Force hard reload
      console.log('🔄 Performing hard reload...');
      window.location.reload(true);
    }
  
    startVersionCheck() {
      // Initial check
      console.log('🔍 Starting initial version check...');
      this.checkForUpdates();
      
      // Set up periodic checks
      setInterval(() => {
        this.checkForUpdates();
      }, this.checkInterval);
      
      console.log(`✅ Auto-updater fully initialized`);
      console.log(`   - Version: ${this.currentVersion}`);
      console.log(`   - Check interval: ${this.checkInterval/1000}s`);
      console.log(`   - Service Worker: ${('serviceWorker' in navigator) ? 'Available' : 'Not available'}`);
      console.log(`   - Broadcast Channel: ${('BroadcastChannel' in window) ? 'Available' : 'Not available'}`);
    }
  
    // Manual methods for debugging
    async manualVersionCheck() {
      console.log('🔍 Manual version check triggered...');
      return await this.checkForUpdates();
    }
  
    async manualReportVersion() {
      console.log('📡 Manual version report triggered...');
      return await this.reportVersionToAdmin();
    }
  
    getCurrentStatus() {
      return {
        currentVersion: this.currentVersion,
        checkInterval: this.checkInterval,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasBroadcastChannel: 'BroadcastChannel' in window,
        url: window.location.href
      };
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.autoUpdater = new AutoUpdater();
    });
  } else {
    window.autoUpdater = new AutoUpdater();
  }
  
  // Expose manual testing functions to console
  window.testAutoUpdater = {
    checkVersion: () => window.autoUpdater?.manualVersionCheck(),
    reportVersion: () => window.autoUpdater?.manualReportVersion(),
    getStatus: () => window.autoUpdater?.getCurrentStatus(),
    triggerReload: () => window.autoUpdater?.triggerAutoReload()
  };