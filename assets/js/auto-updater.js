/**
 * AAAI Solutions Auto-Updater - Fixed Version
 * Handles automatic version checking and reloading with proper cache management
 * Works with nginx + API Gateway routing and updates ALL pages in domain
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
    this.updateChannel = null;
    
    console.log(`🚀 Auto-updater starting with version: ${this.currentVersion}`);
    this.init();
  }

  async init() {
    if (this.isInitialized) return;
    
    try {
      // Set up broadcast channel FIRST for cross-tab communication
      this.setupPersistentBroadcastChannel();
      
      await this.registerServiceWorker();
      this.setupMessageListeners();
      
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

  setupPersistentBroadcastChannel() {
    if ('BroadcastChannel' in window) {
      // Create persistent channel that stays open
      this.updateChannel = new BroadcastChannel('aaai-app-updates');
      
      // Listen for updates from other tabs immediately
      this.updateChannel.addEventListener('message', (event) => {
        const data = event.data;
        
        if (data && data.type === 'DOMAIN_UPDATE_AVAILABLE') {
          console.log('📡 Received domain update broadcast:', data);
          console.log(`   Current version: ${this.currentVersion}`);
          console.log(`   New version: ${data.newVersion}`);
          
          // Only reload if this tab has older version
          if (this.shouldUpdateToVersion(data.newVersion)) {
            console.log('🔄 This tab needs update - reloading immediately');
            this.performReload('domain_broadcast_update');
          } else {
            console.log('✅ This tab already has latest version');
          }
        }
        
        if (data && data.type === 'FORCE_DOMAIN_RELOAD') {
          console.log('🚨 Received force reload broadcast');
          this.performReload('force_domain_reload');
        }
      });
      
      console.log('📡 Persistent broadcast channel established for domain updates');
    } else {
      console.warn('⚠️ BroadcastChannel not supported - cross-tab updates disabled');
    }
  }

  shouldUpdateToVersion(newVersion) {
    // Compare versions - if server version is different, update
    return newVersion !== this.currentVersion;
  }

  async reportVersionToAdmin() {
    try {
      const response = await fetch('/admin/api/version', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: this.currentVersion,
          timestamp: Date.now(),
          page: window.location.pathname,
          user_agent: navigator.userAgent,
          referrer: document.referrer || 'direct'
        })
      });
      
      if (response.ok) {
        console.log('✅ Version reported to admin');
      }
    } catch (error) {
      console.warn('⚠️ Failed to report version:', error.message);
    }
  }

  async checkForUpdates() {
    try {
      const response = await fetch(`/admin/api/version?current_version=${this.currentVersion}`, { 
        cache: 'no-cache',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });
      
      if (!response.ok) {
        console.warn(`⚠️ Version check failed: ${response.status}`);
        return false;
      }
      
      const data = await response.json();
      const serverVersion = data.version;
      
      if (this.shouldUpdateToVersion(serverVersion)) {
        console.log('🔄 Update detected!');
        console.log(`   Current: ${this.currentVersion}`);
        console.log(`   Server:  ${serverVersion}`);
        console.log('📡 Broadcasting update to all domain pages...');
        
        this.broadcastDomainUpdate(serverVersion);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn('⚠️ Version check failed:', error.message);
      return false;
    }
  }

  broadcastDomainUpdate(newVersion) {
    if (this.isReloading) return;
    
    // Broadcast to ALL tabs/windows in the domain
    if (this.updateChannel) {
      const updateMessage = {
        type: 'DOMAIN_UPDATE_AVAILABLE',
        newVersion: newVersion,
        currentVersion: this.currentVersion,
        timestamp: Date.now(),
        initiatorPage: window.location.pathname
      };
      
      console.log('📡 Broadcasting domain update:', updateMessage);
      this.updateChannel.postMessage(updateMessage);
    }
    
    // Also trigger update for current tab
    setTimeout(() => this.triggerAutoReload(newVersion), 500);
  }

  triggerAutoReload(newVersion = null) {
    if (this.isReloading) return;
    
    console.log('🔄 Triggering auto-reload for current tab...');
    this.performReload('version_update', newVersion);
  }

  async performReload(reason = 'unknown', newVersion = null) {
    if (this.isReloading) return;
    
    this.isReloading = true;
    console.log(`🔄 Performing auto-reload due to: ${reason}`);
    
    try {
      // Stop version checking
      this.stopVersionCheck();
      
      // Report update attempt
      await this.reportUpdateAttempt(reason, newVersion);
      
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

  async reportUpdateAttempt(reason, newVersion = null) {
    try {
      let versionData = { version: newVersion };
      
      if (!newVersion) {
        const versionResponse = await fetch(`/admin/api/version?current_version=${this.currentVersion}`, { 
          cache: 'no-cache' 
        });
        
        if (versionResponse.ok) {
          versionData = await versionResponse.json();
        }
      }
      
      await fetch('/admin/api/user-updated', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: versionData.version,
          timestamp: Date.now(),
          updated_from: this.currentVersion,
          update_type: 'auto_reload',
          reason: reason,
          page: window.location.pathname
        })
      });
      
      console.log(`✅ Update reported - upgrading from ${this.currentVersion} to ${versionData.version}`);
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

  forceDomainReload() {
    console.log('🚨 Force domain reload triggered');
    if (this.updateChannel) {
      this.updateChannel.postMessage({
        type: 'FORCE_DOMAIN_RELOAD',
        timestamp: Date.now(),
        initiatorPage: window.location.pathname
      });
    }
    this.performReload('manual_force_reload');
  }

  getCurrentStatus() {
    return {
      currentVersion: this.currentVersion,
      isInitialized: this.isInitialized,
      isReloading: this.isReloading,
      hasInterval: !!this.intervalId,
      hasBroadcastChannel: !!this.updateChannel,
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

// Expose enhanced testing interface to console
window.testAutoUpdater = {
  checkVersion: () => window.autoUpdater?.manualVersionCheck(),
  reportVersion: () => window.autoUpdater?.manualVersionReport(),
  triggerReload: () => window.autoUpdater?.manualTriggerReload(),
  forceDomainReload: () => window.autoUpdater?.forceDomainReload(),
  getStatus: () => window.autoUpdater?.getCurrentStatus(),
  testEndpoints: () => window.autoUpdater?.testAdminEndpoints(),
  broadcastTest: () => {
    if (window.autoUpdater?.updateChannel) {
      window.autoUpdater.updateChannel.postMessage({
        type: 'DOMAIN_UPDATE_AVAILABLE',
        newVersion: 'test-' + Date.now(),
        currentVersion: window.autoUpdater.currentVersion,
        timestamp: Date.now(),
        initiatorPage: window.location.pathname
      });
      console.log('📡 Test broadcast sent');
    }
  },
  restart: () => {
    if (window.autoUpdater) {
      window.autoUpdater.stopVersionCheck();
      if (window.autoUpdater.updateChannel) {
        window.autoUpdater.updateChannel.close();
      }
      window.autoUpdater = new AutoUpdater();
    }
  }
};