/**
 * UPDATED: High-Performance Unified Application Initialization for AAAI Solutions
 * Enhanced with promise-based AuthService integration and robust authentication
 */

(function() {
    'use strict';
    
    // Simplified global application state
    window.AAAI_APP = {
        initialized: false,
        authReady: false,
        services: {},
        config: window.AAAI_CONFIG || {},
        debug: false,
        fastMode: true
    };
    
    // Minimal service loading order (using direct API approach for chat)
    const CORE_SERVICES = ['AuthService', 'ProjectService', 'NavigationManager', 'ChatIntegration'];
    
    /**
     * UPDATED: Fast initialization with enhanced auth handling
     */
    async function initializeApplication() {
        try {
            console.log('🚀 Fast AAAI Solutions initialization starting...');
            
            // Quick environment setup
            initializeEnvironmentFast();
            
            // Get current page type quickly
            const currentPage = getCurrentPageTypeFast();
            console.log('📄 Page type:', currentPage);
            
            // UPDATED: Enhanced page authentication with proper waiting
            const authResult = await handlePageAuthenticationEnhanced(currentPage);
            if (!authResult.success) {
                if (authResult.redirect) {
                    return; // Page will handle redirect
                }
                throw new Error(authResult.reason || 'Authentication failed');
            }
            
            console.log('✅ Authentication ready, continuing...');
            
            // Initialize core services only
            await initializeCoreServicesEnhanced();
            
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
     * UPDATED: Enhanced page authentication with promise-based AuthService
     */
    async function handlePageAuthenticationEnhanced(pageType) {
        console.log('🔐 Enhanced authentication check for:', pageType);
        
        try {
            // UPDATED: Ensure AuthService is available
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            // UPDATED: Wait for AuthService to be properly initialized
            console.log('🔐 Waiting for AuthService initialization...');
            await window.AuthService.waitForInit();
            window.AAAI_APP.authReady = true;
            
            // Handle based on page type with enhanced logic
            switch (pageType) {
                case 'login':
                    return await handleLoginPageAuthEnhanced();
                    
                case 'project':
                case 'chat':
                    return await handleProtectedPageAuthEnhanced();
                    
                default:
                    return { 
                        success: true, 
                        authenticated: window.AuthService.isAuthenticated()
                    };
            }
            
        } catch (error) {
            console.error('🔐 Enhanced authentication error:', error);
            return { success: false, reason: error.message };
        }
    }

    /**
     * UPDATED: Enhanced protected page authentication with multiple attempts
     */
    async function handleProtectedPageAuthEnhanced() {
        console.log('🔐 Enhanced protected page auth check');
        
        // UPDATED: Multiple authentication attempts with delays
        let authSuccess = false;
        const maxAttempts = 3;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`🔐 Authentication attempt ${attempt}/${maxAttempts}`);
            
            // Quick authentication check
            if (window.AuthService.isAuthenticated()) {
                console.log('🔐 Already authenticated');
                authSuccess = true;
                break;
            }
            
            // Try session restoration if available
            if (window.AuthService.hasPersistentSession()) {
                console.log('🔐 Attempting session restoration...');
                
                try {
                    const refreshed = await window.AuthService.refreshTokenIfNeeded();
                    
                    if (refreshed && window.AuthService.isAuthenticated()) {
                        console.log('🔐 Session restored successfully');
                        authSuccess = true;
                        break;
                    }
                    
                    // Wait before next attempt (except last)
                    if (attempt < maxAttempts) {
                        console.log(`🔐 Attempt ${attempt} failed, waiting before retry...`);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                } catch (error) {
                    console.error('🔐 Session restoration failed:', error);
                    
                    // Wait before next attempt (except last)
                    if (attempt < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } else {
                console.log('🔐 No persistent session available');
                break; // No point in retrying without session
            }
        }
        
        if (!authSuccess) {
            console.log('🔐 All authentication attempts failed, redirecting to login');
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
        
        return { success: true, authenticated: true };
    }

    /**
     * UPDATED: Enhanced login page authentication
     */
    async function handleLoginPageAuthEnhanced() {
        console.log('🔐 Enhanced login page auth check');
        
        // Quick check if already authenticated
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 Already authenticated, redirecting to projects');
            window.location.href = 'project.html';
            return { success: false, redirect: true };
        }
        
        // Try session restore if available
        if (window.AuthService.hasPersistentSession()) {
            console.log('🔐 Attempting session restore on login page');
            
            try {
                const refreshed = await window.AuthService.refreshTokenIfNeeded();
                if (refreshed && window.AuthService.isAuthenticated()) {
                    console.log('🔐 Session restored, redirecting to projects');
                    window.location.href = 'project.html';
                    return { success: false, redirect: true };
                }
            } catch (error) {
                console.warn('🔐 Login page session restore failed:', error);
            }
        }
        
        return { success: true, authenticated: false };
    }

    /**
     * UPDATED: Enhanced core services initialization with async support
     */
    async function initializeCoreServicesEnhanced() {
        console.log('🔧 Enhanced core services initialization...');
        
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
                
                console.log(`🔧 Enhanced init ${serviceName}...`);
                
                let service = window[serviceName];
                
                switch (serviceName) {
                    case 'AuthService':
                        // Already initialized via waitForInit()
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ProjectService':
                        // UPDATED: Use async initialization if available
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            try {
                                // Use async init if supported
                                const initResult = service.init(window.AAAI_APP.services.AuthService, {
                                    debug: window.AAAI_APP.debug,
                                    autoSync: true,
                                    enableRealTimeUpdates: true,
                                    syncInterval: 60000
                                });
                                
                                // Wait for initialization if it returns a promise
                                if (initResult && typeof initResult.then === 'function') {
                                    await initResult;
                                }
                            } catch (error) {
                                console.error(`❌ ProjectService init failed:`, error);
                                // Continue without ProjectService
                            }
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'NavigationManager':
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            try {
                                const initResult = service.init(
                                    window.AAAI_APP.services.AuthService,
                                    window.AAAI_APP.services.ProjectService,
                                    { debug: window.AAAI_APP.debug }
                                );
                                
                                // Wait if it returns a promise
                                if (initResult && typeof initResult.then === 'function') {
                                    await initResult;
                                }
                            } catch (error) {
                                console.error(`❌ NavigationManager init failed:`, error);
                            }
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ChatIntegration':
                        // ChatIntegration is initialized per-page with direct API approach
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    default:
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                }
                
                console.log(`✅ ${serviceName} initialized successfully`);
                
            } catch (error) {
                console.error(`❌ Failed to initialize ${serviceName}:`, error);
                // Continue with other services
            }
        }
        
        console.log('✅ Enhanced core services initialized');
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
                    initializeProjectPageEnhanced();
                    break;
                    
                case 'chat':
                    initializeChatPageEnhanced();
                    break;
                    
                default:
                    console.log('ℹ️ No specific initialization needed');
                    break;
            }
        }, 0);
    }
    
    /**
     * UPDATED: Enhanced project page initialization
     */
    function initializeProjectPageEnhanced() {
        try {
            console.log('📂 Enhanced project page init...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            // UPDATED: Load context asynchronously with better error handling
            if (projectService) {
                // Check if ProjectService is properly initialized
                if (projectService.isInitialized || typeof projectService.getCurrentContext === 'function') {
                    projectService.getCurrentContext()
                        .then(context => {
                            console.log('✅ Project context loaded:', context);
                        })
                        .catch(error => {
                            console.warn('⚠️ Context load failed (non-critical):', error);
                        });
                } else {
                    console.warn('⚠️ ProjectService not properly initialized');
                }
            }
            
            console.log('✅ Enhanced project page initialized');
            
        } catch (error) {
            console.error('❌ Enhanced project page init failed:', error);
        }
    }
    
    /**
     * UPDATED: Enhanced chat page initialization with better error handling
     */
    function initializeChatPageEnhanced() {
        try {
            console.log('💬 Enhanced chat page initialization');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                console.error('Authentication required for chat page');
                window.location.href = 'login.html';
                return;
            }
            
            // Get project context from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project');
            const projectName = urlParams.get('project_name');
            
            if (!projectId) {
                console.warn('No project ID, redirecting to projects');
                window.location.href = 'project.html';
                return;
            }
            
            // UPDATED: Switch project context with better error handling
            if (projectService && (projectService.isInitialized || typeof projectService.switchToProject === 'function')) {
                projectService.switchToProject(
                    projectId, 
                    projectName ? decodeURIComponent(projectName) : null
                ).then(result => {
                    console.log('✅ Project context switched:', result);
                }).catch(error => {
                    console.error('❌ Project context switch failed:', error);
                    // Don't redirect, user can still use chat
                });
            } else {
                console.warn('⚠️ ProjectService not available for context switching');
            }
            
            console.log('✅ Enhanced chat page initialization completed');
            
        } catch (error) {
            console.error('❌ Enhanced chat page init failed:', error);
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
     * UPDATED: Enhanced public API with auth state checking
     */
    window.AAAI_APP.getService = function(serviceName) {
        return window.AAAI_APP.services[serviceName] || null;
    };
    
    window.AAAI_APP.isInitialized = function() {
        return window.AAAI_APP.initialized;
    };
    
    window.AAAI_APP.isAuthReady = function() {
        return window.AAAI_APP.authReady;
    };
    
    window.AAAI_APP.getConfig = function() {
        return window.AAAI_APP.config;
    };
    
    /**
     * UPDATED: Wait for both app and auth to be ready
     */
    window.AAAI_APP.waitForReady = async function() {
        return new Promise((resolve) => {
            const checkReady = () => {
                if (window.AAAI_APP.initialized && window.AAAI_APP.authReady) {
                    resolve(true);
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    };
    
    // Initialize immediately when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        // Use setTimeout to ensure non-blocking
        setTimeout(initializeApplication, 0);
    }
    
    console.log('🎬 Enhanced AAAI initialization script loaded');
    
})();