/**
 * High-Performance Unified Application Initialization for AAAI Solutions
 * Optimized for fast loading with minimal blocking operations
 */

(function() {
    'use strict';
    
    // Simplified global application state
    window.AAAI_APP = {
        initialized: false,
        services: {},
        config: window.AAAI_CONFIG || {},
        debug: false,
        fastMode: true
    };
    
    // Minimal service loading order
    const CORE_SERVICES = ['AuthService', 'ProjectService', 'NavigationManager'];
    
    /**
     * Fast initialization with minimal blocking
     */
    async function initializeApplication() {
        try {
            console.log('🚀 Fast AAAI Solutions initialization starting...');
            
            // Quick environment setup
            initializeEnvironmentFast();
            
            // Get current page type quickly
            const currentPage = getCurrentPageTypeFast();
            console.log('📄 Page type:', currentPage);
            
            // Fast page authentication
            const authResult = await handlePageAuthenticationFast(currentPage);
            if (!authResult.success) {
                if (authResult.redirect) {
                    return; // Page will handle redirect
                }
                throw new Error(authResult.reason || 'Authentication failed');
            }
            
            console.log('✅ Authentication ready, continuing...');
            
            // Initialize core services only
            await initializeCoreServicesFast();
            
            // Page-specific initialization (non-blocking)
            initializePageSpecificFast(currentPage);
            
            window.AAAI_APP.initialized = true;
            
            console.log('✅ Fast AAAI initialization completed');
            
            // Notify page scripts
            document.dispatchEvent(new CustomEvent('aaai:initialized', {
                detail: { 
                    services: window.AAAI_APP.services,
                    config: window.AAAI_APP.config,
                    fastMode: true
                }
            }));
            
        } catch (error) {
            console.error('❌ Fast initialization failed:', error);
            showFastErrorMessage(error);
        }
    }
    
    /**
     * Fast page authentication with minimal checks
     */
    async function handlePageAuthenticationFast(pageType) {
        console.log('🔐 Fast authentication check for:', pageType);
        
        try {
            // Initialize AuthService quickly
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            const authInitResult = window.AuthService.init();
            console.log('🔐 AuthService init result:', authInitResult);
            
            // Handle based on page type with fast logic
            switch (pageType) {
                case 'login':
                    return handleLoginPageAuthFast();
                    
                case 'project':
                case 'chat':
                    return handleProtectedPageAuthFast();
                    
                default:
                    return { 
                        success: true, 
                        authenticated: window.AuthService.isAuthenticated()
                    };
            }
            
        } catch (error) {
            console.error('🔐 Fast authentication error:', error);
            return { success: false, reason: error.message };
        }
    }

    async function handleProtectedPageAuthFast() {
        console.log('🔐 Fast protected page auth check');
        
        // Quick authentication check
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 Already authenticated');
            return { success: true, authenticated: true };
        }
        
        // Quick session check
        if (!window.AuthService.hasPersistentSession()) {
            console.log('🔐 No session, redirecting to login');
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
        
        // Try quick refresh
        console.log('🔐 Attempting quick session restore');
        try {
            const refreshed = await window.AuthService.refreshTokenIfNeeded();
            
            if (refreshed && window.AuthService.isAuthenticated()) {
                console.log('🔐 Session restored quickly');
                return { success: true, authenticated: true };
            } else {
                console.log('🔐 Session restore failed, redirecting');
                window.location.href = 'login.html';
                return { success: false, redirect: true };
            }
            
        } catch (error) {
            console.error('🔐 Session restore error:', error);
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
    }

    async function handleLoginPageAuthFast() {
        console.log('🔐 Fast login page auth check');
        
        // Quick check if already authenticated
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 Already authenticated, redirecting');
            window.location.href = 'project.html';
            return { success: false, redirect: true };
        }
        
        // Quick session restore attempt
        if (window.AuthService.hasPersistentSession()) {
            console.log('🔐 Quick session restore attempt');
            
            try {
                const refreshed = await window.AuthService.refreshTokenIfNeeded();
                if (refreshed && window.AuthService.isAuthenticated()) {
                    console.log('🔐 Session restored, redirecting');
                    window.location.href = 'project.html';
                    return { success: false, redirect: true };
                }
            } catch (error) {
                console.warn('🔐 Session restore failed:', error);
            }
        }
        
        return { success: true, authenticated: false };
    }

    /**
     * Initialize core services quickly
     */
    async function initializeCoreServicesFast() {
        console.log('🔧 Fast core services initialization...');
        
        for (const serviceName of CORE_SERVICES) {
            try {
                if (!window[serviceName]) {
                    console.warn(`⚠️ ${serviceName} not found, skipping`);
                    continue;
                }
                
                if (window.AAAI_APP.services[serviceName]) {
                    console.log(`ℹ️ ${serviceName} already initialized`);
                    continue;
                }
                
                console.log(`🔧 Quick init ${serviceName}...`);
                
                let service = window[serviceName];
                
                switch (serviceName) {
                    case 'AuthService':
                        // Already initialized
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ProjectService':
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            service.init(window.AAAI_APP.services.AuthService, {
                                debug: window.AAAI_APP.debug,
                                autoSync: true, // Efficient auto-sync enabled
                                enableRealTimeUpdates: true, // Efficient real-time updates
                                syncInterval: 60000 // 1 minute intervals
                            });
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'NavigationManager':
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            service.init(
                                window.AAAI_APP.services.AuthService,
                                window.AAAI_APP.services.ProjectService,
                                { debug: window.AAAI_APP.debug }
                            );
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    default:
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                }
                
                console.log(`✅ ${serviceName} initialized quickly`);
                
            } catch (error) {
                console.error(`❌ Failed to initialize ${serviceName}:`, error);
                // Continue with other services
            }
        }
        
        console.log('✅ Core services initialized');
    }
    
    /**
     * Page-specific initialization (non-blocking)
     */
    function initializePageSpecificFast(pageType) {
        console.log(`🎯 Fast page-specific init for: ${pageType}`);
        
        // Use setTimeout to make it non-blocking
        setTimeout(() => {
            switch (pageType) {
                case 'project':
                    initializeProjectPageFast();
                    break;
                    
                case 'chat':
                    initializeChatPageFast();
                    break;
                    
                default:
                    console.log('ℹ️ No specific initialization needed');
                    break;
            }
        }, 0);
    }
    
    /**
     * Fast project page initialization
     */
    function initializeProjectPageFast() {
        try {
            console.log('📂 Fast project page init...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            // Load context asynchronously (non-blocking)
            if (projectService) {
                projectService.getCurrentContext().catch(error => {
                    console.warn('⚠️ Context load failed:', error);
                });
            }
            
            console.log('✅ Project page initialized');
            
        } catch (error) {
            console.error('❌ Project page init failed:', error);
        }
    }
    
    /**
     * Fast chat page initialization
     */
    function initializeChatPageFast() {
        try {
            console.log('💬 Fast chat page init...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                window.location.href = 'login.html';
                return;
            }
            
            // Get project ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project');
            
            if (!projectId) {
                console.warn('⚠️ No project ID, redirecting to projects');
                window.location.href = 'project.html';
                return;
            }
            
            // Switch to project context asynchronously
            if (projectService) {
                const projectName = urlParams.get('project_name');
                projectService.switchToProject(
                    projectId, 
                    projectName ? decodeURIComponent(projectName) : null
                ).catch(error => {
                    console.error('❌ Project context switch failed:', error);
                });
            }
            
            console.log('✅ Chat page initialized');
            
        } catch (error) {
            console.error('❌ Chat page init failed:', error);
        }
    }
    
    /**
     * Fast environment initialization
     */
    function initializeEnvironmentFast() {
        if (!window.AAAI_CONFIG) {
            window.AAAI_CONFIG = {
                ENVIRONMENT: 'production',
                ENABLE_DEBUG: false,
                ENABLE_WEBSOCKETS: true,
                VERSION: '1.0.0'
            };
        }
        
        window.AAAI_APP.config = window.AAAI_CONFIG;
        window.AAAI_APP.debug = window.AAAI_CONFIG.ENABLE_DEBUG || false;
        
        if (!window.AAAI_LOGGER) {
            const logLevel = window.AAAI_CONFIG.ENABLE_DEBUG ? 'debug' : 'warn';
            
            window.AAAI_LOGGER = {
                debug: logLevel === 'debug' ? console.log.bind(console, '[DEBUG]') : () => {},
                info: console.info.bind(console, '[INFO]'),
                warn: console.warn.bind(console, '[WARN]'),
                error: console.error.bind(console, '[ERROR]')
            };
        }
        
        console.log('🌍 Fast environment initialized');
    }
    
    /**
     * Fast page type detection
     */
    function getCurrentPageTypeFast() {
        const path = window.location.pathname;
        
        if (path.includes('login.html')) return 'login';
        if (path.includes('project.html')) return 'project';
        if (path.includes('chat.html')) return 'chat';
        
        return 'unknown';
    }
    
    /**
     * Show error message quickly
     */
    function showFastErrorMessage(error) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 15px 20px;
            border-radius: 5px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            max-width: 400px;
        `;
        
        errorDiv.innerHTML = `
            <strong>Initialization Error</strong><br>
            ${error.message || 'Unknown error'}
            <br><br>
            <button onclick="window.location.reload()" style="
                background: white;
                color: #dc3545;
                border: none;
                padding: 5px 10px;
                border-radius: 3px;
                cursor: pointer;
            ">
                Reload Page
            </button>
        `;
        
        document.body.appendChild(errorDiv);
        
        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 10000);
    }
    
    /**
     * Fast public API
     */
    window.AAAI_APP.getService = function(serviceName) {
        return window.AAAI_APP.services[serviceName] || null;
    };
    
    window.AAAI_APP.isInitialized = function() {
        return window.AAAI_APP.initialized;
    };
    
    window.AAAI_APP.getConfig = function() {
        return window.AAAI_APP.config;
    };
    
    // Initialize immediately when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        // Use setTimeout to ensure non-blocking
        setTimeout(initializeApplication, 0);
    }
    
    console.log('🎬 Fast AAAI initialization script loaded');
    
})();