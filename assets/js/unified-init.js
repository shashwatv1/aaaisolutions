/**
 * High-Performance Unified Application Initialization for AAAI Solutions
 * Optimized with parallel processing and non-blocking operations
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
    
    // Minimal service loading order (using direct API approach for chat)
    const CORE_SERVICES = ['AuthService', 'ProjectService', 'NavigationManager', 'ChatIntegration'];
    
    /**
     * Ultra-fast initialization with parallel processing
     */
    async function initializeApplication() {
        try {
            console.log('🚀 Ultra-fast AAAI Solutions initialization starting...');
            
            // Quick environment setup (non-blocking)
            initializeEnvironmentFast();
            
            // Get current page type quickly
            const currentPage = getCurrentPageTypeFast();
            console.log('📄 Page type:', currentPage);
            
            // Parallel authentication and service initialization
            const [authResult, servicesReady] = await Promise.allSettled([
                handlePageAuthenticationParallel(currentPage),
                initializeCoreServicesParallel()
            ]);
            
            if (authResult.status === 'rejected' || !authResult.value?.success) {
                if (authResult.value?.redirect) {
                    return; // Page will handle redirect
                }
                throw new Error(authResult.value?.reason || 'Authentication failed');
            }
            
            console.log('✅ Authentication and services ready');
            
            // Page-specific initialization (completely non-blocking)
            setTimeout(() => initializePageSpecificParallel(currentPage), 0);
            
            window.AAAI_APP.initialized = true;
            
            console.log('✅ Ultra-fast AAAI initialization completed');
            
            // Notify page scripts (non-blocking)
            requestAnimationFrame(() => {
                document.dispatchEvent(new CustomEvent('aaai:initialized', {
                    detail: { 
                        services: window.AAAI_APP.services,
                        config: window.AAAI_APP.config,
                        fastMode: true
                    }
                }));
            });
            
        } catch (error) {
            console.error('❌ Fast initialization failed:', error);
            showFastErrorMessage(error);
        }
    }
    
    /**
     * Parallel authentication with non-blocking checks
     */
    async function handlePageAuthenticationParallel(pageType) {
        console.log('🔐 Parallel authentication check for:', pageType);
        
        try {
            // Initialize AuthService quickly (non-blocking)
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            const authInitResult = window.AuthService.init();
            console.log('🔐 AuthService init result:', authInitResult);
            
            // Handle based on page type with parallel logic
            switch (pageType) {
                case 'login':
                    return handleLoginPageAuthParallel();
                    
                case 'project':
                case 'chat':
                    return handleProtectedPageAuthParallel();
                    
                default:
                    return { 
                        success: true, 
                        authenticated: window.AuthService.isAuthenticated()
                    };
            }
            
        } catch (error) {
            console.error('🔐 Parallel authentication error:', error);
            return { success: false, reason: error.message };
        }
    }

    async function handleProtectedPageAuthParallel() {
        console.log('🔐 Parallel protected page auth check');
        
        // Quick authentication check (non-blocking)
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 Already authenticated');
            return { success: true, authenticated: true };
        }
        
        // Parallel session checks
        const [hasSession, refreshResult] = await Promise.allSettled([
            Promise.resolve(window.AuthService.hasPersistentSession()),
            window.AuthService.refreshTokenIfNeeded()
        ]);
        
        if (hasSession.status === 'rejected' || !hasSession.value) {
            console.log('🔐 No session, redirecting to login');
            setTimeout(() => window.location.href = 'login.html', 0);
            return { success: false, redirect: true };
        }
        
        if (refreshResult.status === 'fulfilled' && refreshResult.value && window.AuthService.isAuthenticated()) {
            console.log('🔐 Session restored in parallel');
            return { success: true, authenticated: true };
        } else {
            console.log('🔐 Session restore failed, redirecting');
            setTimeout(() => window.location.href = 'login.html', 0);
            return { success: false, redirect: true };
        }
    }

    async function handleLoginPageAuthParallel() {
        console.log('🔐 Parallel login page auth check');
        
        // Parallel authentication checks
        const [isAuth, hasSession] = await Promise.allSettled([
            Promise.resolve(window.AuthService.isAuthenticated()),
            Promise.resolve(window.AuthService.hasPersistentSession())
        ]);
        
        if (isAuth.status === 'fulfilled' && isAuth.value) {
            console.log('🔐 Already authenticated, redirecting');
            setTimeout(() => window.location.href = 'project.html', 0);
            return { success: false, redirect: true };
        }
        
        if (hasSession.status === 'fulfilled' && hasSession.value) {
            console.log('🔐 Parallel session restore attempt');
            
            try {
                const refreshed = await window.AuthService.refreshTokenIfNeeded();
                if (refreshed && window.AuthService.isAuthenticated()) {
                    console.log('🔐 Session restored, redirecting');
                    setTimeout(() => window.location.href = 'project.html', 0);
                    return { success: false, redirect: true };
                }
            } catch (error) {
                console.warn('🔐 Session restore failed:', error);
            }
        }
        
        return { success: true, authenticated: false };
    }

    /**
     * Parallel core services initialization
     */
    async function initializeCoreServicesParallel() {
        console.log('🔧 Parallel core services initialization...');
        
        // Initialize all services in parallel
        const servicePromises = CORE_SERVICES.map(async (serviceName) => {
            try {
                if (!window[serviceName]) {
                    console.warn(`⚠️ ${serviceName} not found, skipping`);
                    return { name: serviceName, success: false, reason: 'not_found' };
                }
                
                if (window.AAAI_APP.services[serviceName]) {
                    console.log(`ℹ️ ${serviceName} already initialized`);
                    return { name: serviceName, success: true, reason: 'already_initialized' };
                }
                
                console.log(`🔧 Parallel init ${serviceName}...`);
                
                let service = window[serviceName];
                
                switch (serviceName) {
                    case 'AuthService':
                        // Already initialized
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ProjectService':
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            service.init(window.AAAI_APP.services.AuthService || window.AuthService, {
                                debug: window.AAAI_APP.debug,
                                autoSync: true,
                                enableRealTimeUpdates: true,
                                syncInterval: 60000
                            });
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'NavigationManager':
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            service.init(
                                window.AAAI_APP.services.AuthService || window.AuthService,
                                window.AAAI_APP.services.ProjectService || window.ProjectService,
                                { debug: window.AAAI_APP.debug }
                            );
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ChatIntegration':
                        // ChatIntegration is initialized per-page with parallel approach
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    default:
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                }
                
                console.log(`✅ ${serviceName} initialized in parallel`);
                return { name: serviceName, success: true };
                
            } catch (error) {
                console.error(`❌ Failed to initialize ${serviceName}:`, error);
                return { name: serviceName, success: false, error: error.message };
            }
        });
        
        // Wait for all services to initialize in parallel
        const results = await Promise.allSettled(servicePromises);
        
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success);
        const failed = results.filter(r => r.status === 'rejected' || !r.value.success);
        
        console.log(`✅ Parallel services initialized: ${successful.length}/${CORE_SERVICES.length}`);
        if (failed.length > 0) {
            console.warn('⚠️ Some services failed to initialize:', failed);
        }
        
        return { successful: successful.length, failed: failed.length };
    }
        
    /**
     * Parallel page-specific initialization (completely non-blocking)
     */
    function initializePageSpecificParallel(pageType) {
        console.log(`🎯 Parallel page-specific init for: ${pageType}`);
        
        // Use requestAnimationFrame for non-blocking execution
        requestAnimationFrame(() => {
            switch (pageType) {
                case 'project':
                    initializeProjectPageParallel();
                    break;
                    
                case 'chat':
                    initializeChatPageParallel();
                    break;
                    
                default:
                    console.log('ℹ️ No specific initialization needed');
                    break;
            }
        });
    }
    
    /**
     * Parallel project page initialization
     */
    function initializeProjectPageParallel() {
        try {
            console.log('📂 Parallel project page init...');
            
            const authService = window.AAAI_APP.services.AuthService || window.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService || window.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            // Load context in parallel (completely non-blocking)
            if (projectService) {
                projectService.getCurrentContext().catch(error => {
                    console.warn('⚠️ Context load failed:', error);
                });
            }
            
            console.log('✅ Project page initialized in parallel');
            
        } catch (error) {
            console.error('❌ Project page init failed:', error);
        }
    }
    
    /**
     * Parallel chat page initialization
     */
    function initializeChatPageParallel() {
        try {
            console.log('💬 Parallel chat page initialization');
            
            const authService = window.AAAI_APP.services.AuthService || window.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService || window.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                console.error('Authentication required for chat page');
                setTimeout(() => window.location.href = 'login.html', 0);
                return;
            }
            
            // Get project context from URL (non-blocking)
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project');
            const projectName = urlParams.get('project_name');
            
            if (!projectId) {
                console.warn('No project ID, redirecting to projects');
                setTimeout(() => window.location.href = 'project.html', 0);
                return;
            }
            
            // Switch project context in parallel (completely non-blocking)
            if (projectService) {
                projectService.switchToProject(
                    projectId, 
                    projectName ? decodeURIComponent(projectName) : null
                ).then(() => {
                    console.log('✅ Project context switched in parallel');
                }).catch(error => {
                    console.error('❌ Project context switch failed:', error);
                });
            }
            
            console.log('✅ Parallel chat page initialization completed');
            
        } catch (error) {
            console.error('❌ Chat page parallel init failed:', error);
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
        // Use requestAnimationFrame for non-blocking error display
        requestAnimationFrame(() => {
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
        });
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
    
    // Initialize immediately when DOM is ready (non-blocking)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            requestAnimationFrame(initializeApplication);
        });
    } else {
        // Use requestAnimationFrame for non-blocking execution
        requestAnimationFrame(initializeApplication);
    }
    
    console.log('🎬 Ultra-fast AAAI initialization script loaded');
    
})();