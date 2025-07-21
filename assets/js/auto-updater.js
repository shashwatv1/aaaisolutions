/**
 * AAAI Solutions Auto-Updater - Fixed Version
 * Handles automatic version checking and reloading with proper cache management
 * Works with nginx + API Gateway routing
 */

class AutoUpdater {
    constructor() {
      this.currentVersion = window.BUILD_TIMESTAMP || Date.now().toString();
      this.checkInterval = 120000; // 2 minutes
      this.isInitialized = false;
      this.intervalId = null;
      this.retryCount = 0;
      this.maxRetries = 3;
      this.isReloading = false;
      
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
        this.retryInitialization();
      }
    }
  
    async retryInitialization() {
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`🔄 Retrying auto-updater initialization (${this.retryCount}/${this.maxRetries})...`);
        setTimeout(() => this.init(), 5000 * this.retryCount);
      }
    }
  
    async registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        try {
          // Register service worker with version parameter
          const swUrl = `/sw.js?v=${this.currentVersion}`;
          const registration = await navigator.serviceWorker.register(swUrl);
          
          console.log('✅ Service Worker registered');
          
          // Handle service worker updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  console.log('🔄 Service Worker updated - preparing reload');
                  this.handleServiceWorkerUpdate();
                }
              });
            }
          });
          
          // Check for waiting service worker
          if (registration.waiting) {
            console.log('🔄 Service Worker waiting - activating...');
            this.handleServiceWorkerUpdate();
          }
          
        } catch (error) {
          console.warn('⚠️ Service Worker registration failed:', error);
          throw error;
        }
      }
    }
  
    handleServiceWorkerUpdate() {
      // Add delay to ensure service worker is ready
      setTimeout(() => {
        this.performReload('service_worker_update');
      }, 1000);
    }
  
    setupMessageListeners() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'AUTO_RELOAD_NOW') {
            this.performReload('service_worker_message');
          }
          
          if (event.data && event.data.type === 'SW_ACTIVATED') {
            console.log(`🔧 Service Worker activated: v${event.data.version}`);
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
              this.performReload('broadcast_channel');
            }, Math.random() * 2000);
          }
        });
      }
    }
  
    async getCurrentServerVersion() {
      try {
        // Use correct admin endpoint with proper cache busting
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
          throw new Error(`Version check failed: ${response.status}`);
        }
  
        const data = await response.json();
        console.log(`🔍 Version check: current=${this.currentVersion}, server=${data.version}`);
        
        return data;
        
      } catch (error) {
        console.warn('⚠️ Version check failed:', error.message);
        return null;
      }
    }
  
    async reportVersionToAdmin() {
      try {
        await fetch('/admin/api/version', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            version: this.currentVersion,
            timestamp: Date.now(),
            user_agent: navigator.userAgent
          })
        });
      } catch (error) {
        console.warn('⚠️ Failed to report version:', error.message);
      }
    }
  
    async checkForUpdates() {
      if (this.isReloading) {
        console.log('🔄 Already reloading, skipping version check');
        return false;
      }
  
      const versionData = await this.getCurrentServerVersion();
      
      if (!versionData) {
        return false;
      }
  
      const serverVersion = versionData.version;
      const needsUpdate = versionData.needs_update || (serverVersion !== this.currentVersion);
      
      if (needsUpdate) {
        console.log('🆕 New version detected!');
        console.log(`   Current: ${this.currentVersion}`);
        console.log(`   Server:  ${serverVersion}`);
        console.log('🔄 Triggering auto-reload...');
        
        this.triggerAutoReload();
        return true;
      }
      
      return false;
    }
  
    triggerAutoReload() {
      if (this.isReloading) return;
      
      this.isReloading = true;
      
      // Notify other tabs
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('app-updates');
        channel.postMessage({ 
          type: 'AUTO_RELOAD',
          timestamp: Date.now(),
          version: this.currentVersion
        });
      }
      
      // Perform reload after short delay
      setTimeout(() => this.performReload('version_update'), 1000);
    }
  
    async performReload(reason = 'unknown') {
      if (this.isReloading) return;
      
      this.isReloading = true;
      console.log(`🔄 Performing auto-reload due to: ${reason}`);
      
      try {
        // Stop version checking
        this.stopVersionCheck();
        
        // Report update attempt
        await this.reportUpdateAttempt(reason);
        
        // Clear all caches through service worker with confirmation
        await this.clearCachesWithConfirmation();
        
        // Unregister service worker to ensure clean state
        await this.unregisterServiceWorker();
        
        // Perform aggressive reload
        this.performAggressiveReload();
        
      } catch (error) {
        console.error('❌ Reload process failed:', error);
        // Fallback to simple reload
        this.performAggressiveReload();
      }
    }
  
    async reportUpdateAttempt(reason) {
      try {
        const versionResponse = await fetch(`/admin/api/version?current_version=${this.currentVersion}`, { 
          cache: 'no-cache' 
        });
        
        if (versionResponse.ok) {
          const versionData = await versionResponse.json();
          
          await fetch('/admin/api/user-updated', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              version: versionData.version,
              timestamp: Date.now(),
              updated_from: this.currentVersion,
              update_type: 'auto_reload',
              reason: reason
            })
          });
          
          console.log(`✅ Update reported - upgrading from ${this.currentVersion} to ${versionData.version}`);
        }
      } catch (error) {
        console.warn('⚠️ Failed to report update attempt:', error.message);
      }
    }
  
    async clearCachesWithConfirmation() {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Cache clearing timeout'));
        }, 5000);
        
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          // Create message channel for response
          const messageChannel = new MessageChannel();
          
          messageChannel.port1.onmessage = (event) => {
            clearTimeout(timeout);
            if (event.data.success) {
              console.log('✅ Caches cleared via service worker');
              resolve();
            } else {
              reject(new Error('Service worker cache clearing failed'));
            }
          };
          
          // Send clear cache message with response port
          navigator.serviceWorker.controller.postMessage(
            { type: 'CLEAR_CACHES' },
            [messageChannel.port2]
          );
        } else {
          // Fallback: clear caches directly
          this.clearCachesDirectly().then(resolve).catch(reject);
        }
      });
    }
  
    async clearCachesDirectly() {
      if ('caches' in window) {
        try {
          const cacheNames = await caches.keys();
          console.log(`🗑️ Clearing ${cacheNames.length} caches directly...`);
          await Promise.all(cacheNames.map(cacheName => caches.delete(cacheName)));
          console.log('✅ Caches cleared directly');
        } catch (error) {
          console.warn('⚠️ Direct cache clearing failed:', error.message);
          throw error;
        }
      }
    }
  
    async unregisterServiceWorker() {
      if ('serviceWorker' in navigator) {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map(registration => registration.unregister()));
          console.log('✅ Service workers unregistered');
        } catch (error) {
          console.warn('⚠️ Service worker unregistration failed:', error.message);
        }
      }
    }
  
    performAggressiveReload() {
      console.log('🔄 Performing aggressive reload...');
      
      // Clear session storage
      try {
        sessionStorage.clear();
        localStorage.clear();
      } catch (error) {
        console.warn('⚠️ Storage clearing failed:', error.message);
      }
      
      // Add cache busting parameter and reload
      const url = new URL(window.location);
      url.searchParams.set('_t', Date.now());
      url.searchParams.set('_v', 'refresh');
      
      // Use location.replace for hard navigation
      window.location.replace(url.toString());
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
      
      console.log(`✅ Auto-updater active - checking every ${this.checkInterval/1000}s`);
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
      console.log('🧪 Manual version check triggered');
      return await this.checkForUpdates();
    }
  
    async manualVersionReport() {
      console.log('🧪 Manual version report triggered');
      return await this.reportVersionToAdmin();
    }
  
    manualTriggerReload() {
      console.log('🧪 Manual reload triggered');
      this.triggerAutoReload();
    }
  
    getCurrentStatus() {
      return {
        currentVersion: this.currentVersion,
        isInitialized: this.isInitialized,
        isReloading: this.isReloading,
        hasInterval: !!this.intervalId,
        retryCount: this.retryCount,
        checkInterval: this.checkInterval
      };
    }
  
    async testAdminEndpoints() {
      const results = {};
      
      // Test version endpoint
      try {
        const versionResponse = await fetch('/admin/api/version', {
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
            version: 'test',
            timestamp: Date.now(),
            updated_from: this.currentVersion,
            update_type: 'test'
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