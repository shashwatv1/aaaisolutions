/**
 * AAAI Solutions Auto-Updater
 * Handles automatic version checking and reloading
 * Works with nginx + API Gateway routing
 */

class AutoUpdater {
    constructor() {
      this.currentVersion = window.BUILD_TIMESTAMP || Date.now().toString();
      this.checkInterval = 120000; // 2 minutes
      this.isInitialized = false;
      this.intervalId = null;
      
      console.log(`🚀 Auto-updater starting with version: ${this.currentVersion}`);
      this.init();
    }
  
    async init() {
      if (this.isInitialized) return;
      
      try {
        await this.registerServiceWorker();
        this.setupMessageListeners();
        this.setupBroadcastChannel();
        
        // Report initial version to admin
        await this.reportVersionToAdmin();
        
        // Start version checking
        this.startVersionCheck();
        
        this.isInitialized = true;
        console.log('✅ Auto-updater initialized successfully');
        
      } catch (error) {
        console.error('❌ Auto-updater initialization failed:', error);
      }
    }
  
    async registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          console.log('✅ Service Worker registered');
          
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
          console.warn('⚠️ Service Worker registration failed:', error);
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
            // Random delay to prevent thundering herd
            setTimeout(() => {
              this.performAutoReload();
            }, Math.random() * 2000);
          }
        });
      }
    }
  
    async getCurrentServerVersion() {
      try {
        // Use correct admin endpoint - nginx routes /admin/ to gateway
        const url = `/admin/api/version?current_version=${this.currentVersion}&t=${Date.now()}`;
        
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
        
        // Log version check result
        if (data.version !== this.currentVersion) {
          console.log(`🔍 Version check - Current: ${this.currentVersion}, Server: ${data.version}`);
        }
        
        return data.version;
  
      } catch (error) {
        console.warn('⚠️ Version check failed:', error.message);
        return null;
      }
    }
  
    async reportVersionToAdmin() {
      try {
        const url = '/admin/api/user-updated';
        
        const payload = {
          version: this.currentVersion,
          timestamp: Date.now(),
          user_agent: navigator.userAgent,
          url: window.location.href,
          reported_by: 'auto_updater'
        };
  
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
  
        if (response.ok) {
          console.log('📡 Version reported to admin system');
        } else {
          console.warn(`⚠️ Version reporting failed: ${response.status}`);
        }
  
      } catch (error) {
        console.warn('⚠️ Failed to report version to admin:', error.message);
      }
    }
  
    async checkForUpdates() {
      const serverVersion = await this.getCurrentServerVersion();
      
      if (serverVersion && serverVersion !== this.currentVersion) {
        console.log('🚀 NEW VERSION DETECTED!');
        console.log(`   Current: ${this.currentVersion}`);
        console.log(`   Server:  ${serverVersion}`);
        console.log('🔄 Triggering auto-reload...');
        
        this.triggerAutoReload();
        return true;
      }
      
      return false;
    }
  
    triggerAutoReload() {
      // Notify other tabs
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('app-updates');
        channel.postMessage({ 
          type: 'AUTO_RELOAD',
          timestamp: Date.now(),
          version: this.currentVersion
        });
      }
      
      // Notify service worker
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'FORCE_AUTO_RELOAD',
          timestamp: Date.now()
        });
      }
      
      // Reload this tab after short delay
      setTimeout(() => this.performAutoReload(), 1000);
    }
  
    async performAutoReload() {
      console.log('🔄 Performing auto-reload due to version update...');
      
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
      
      // Clear caches before reload
      await this.clearCaches();
      
      // Hard reload
      console.log('🔄 Performing hard reload...');
      window.location.reload(true);
    }
  
    async clearCaches() {
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
    }
  
    startVersionCheck() {
      // Clear any existing interval
      if (this.intervalId) {
        clearInterval(this.intervalId);
      }
      
      // Initial check
      console.log('🔍 Starting initial version check...');
      this.checkForUpdates();
      
      // Set up periodic checks
      this.intervalId = setInterval(() => {
        this.checkForUpdates();
      }, this.checkInterval);
      
      console.log(`✅ Auto-updater active - checking every ${this.checkInterval/1000} seconds`);
    }
  
    stopVersionCheck() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
        console.log('⏹️ Version checking stopped');
      }
    }
  
    // Manual testing methods
    async manualVersionCheck() {
      console.log('🔍 Manual version check triggered...');
      return await this.checkForUpdates();
    }
  
    async manualVersionReport() {
      console.log('📡 Manual version report triggered...');
      return await this.reportVersionToAdmin();
    }
  
    async manualTriggerReload() {
      console.log('🔄 Manual reload triggered...');
      this.triggerAutoReload();
    }
  
    getCurrentStatus() {
      return {
        currentVersion: this.currentVersion,
        isInitialized: this.isInitialized,
        checkInterval: this.checkInterval,
        hasServiceWorker: 'serviceWorker' in navigator,
        hasBroadcastChannel: 'BroadcastChannel' in window,
        url: window.location.href,
        intervalId: this.intervalId !== null
      };
    }
  
    // Debug method to test admin endpoints
    async testAdminEndpoints() {
      const results = {};
      
      console.log('🧪 Testing admin endpoints...');
      
      // Test version endpoint
      try {
        const versionResponse = await fetch(`/admin/api/version?test=true&t=${Date.now()}`, {
          cache: 'no-cache'
        });
        results.version = {
          status: versionResponse.status,
          ok: versionResponse.ok,
          data: versionResponse.ok ? await versionResponse.json() : await versionResponse.text()
        };
      } catch (error) {
        results.version = { error: error.message };
      }
      
      // Test user update endpoint
      try {
        const updateResponse = await fetch('/admin/api/user-updated', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: this.currentVersion,
            timestamp: Date.now(),
            test: true
          })
        });
        results.userUpdate = {
          status: updateResponse.status,
          ok: updateResponse.ok,
          data: updateResponse.ok ? await updateResponse.json() : await updateResponse.text()
        };
      } catch (error) {
        results.userUpdate = { error: error.message };
      }
      
      // Test stats endpoint
      try {
        const statsResponse = await fetch('/admin/api/stats', {
          cache: 'no-cache'
        });
        results.stats = {
          status: statsResponse.status,
          ok: statsResponse.ok,
          data: statsResponse.ok ? await statsResponse.json() : await statsResponse.text()
        };
      } catch (error) {
        results.stats = { error: error.message };
      }
      
      console.log('🧪 Admin endpoints test results:', results);
      return results;
    }
  }
  
  // Initialize auto-updater when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.autoUpdater = new AutoUpdater();
    });
  } else {
    window.autoUpdater = new AutoUpdater();
  }
  
  // Expose testing interface to console
  window.testAutoUpdater = {
    checkVersion: () => window.autoUpdater?.manualVersionCheck(),
    reportVersion: () => window.autoUpdater?.manualVersionReport(),
    triggerReload: () => window.autoUpdater?.manualTriggerReload(),
    getStatus: () => window.autoUpdater?.getCurrentStatus(),
    testEndpoints: () => window.autoUpdater?.testAdminEndpoints(),
    restart: () => {
      if (window.autoUpdater) {
        window.autoUpdater.stopVersionCheck();
        window.autoUpdater = new AutoUpdater();
      }
    }
  };