/**
 * High-Performance Unified Application Initialization for AAAI Solutions
 * FIXED: Enhanced timing and integration setup
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
    const CORE_SERVICES = ['AuthService', 'ProjectService', 'NavigationManager', 'ChatService', 'ChatIntegration'];
    
    /**
     * Fast initialization with minimal blocking
     */
    async function initializeApplication() {
        try {
            console.log('🚀 FIXED: Fast AAAI Solutions initialization starting...');
            
            // Quick environment setup
            initializeEnvironmentFast();
            
            // Get current page type quickly
            const currentPage = getCurrentPageTypeFast();
            console.log('📄 FIXED: Page type:', currentPage);
            
            // Fast page authentication
            const authResult = await handlePageAuthenticationFast(currentPage);
            if (!authResult.success) {
                if (authResult.redirect) {
                    return; // Page will handle redirect
                }
                throw new Error(authResult.reason || 'Authentication failed');
            }
            
            console.log('✅ FIXED: Authentication ready, continuing...');
            
            // Initialize core services only
            await initializeCoreServicesFixed();
            
            // Page-specific initialization (non-blocking)
            initializePageSpecificFast(currentPage);
            
            window.AAAI_APP.initialized = true;
            
            console.log('✅ FIXED: Fast AAAI initialization completed');
            
            // Notify page scripts
            document.dispatchEvent(new CustomEvent('aaai:initialized', {
                detail: { 
                    services: window.AAAI_APP.services,
                    config: window.AAAI_APP.config,
                    fastMode: true
                }
            }));
            
        } catch (error) {
            console.error('❌ FIXED: Fast initialization failed:', error);
            showFastErrorMessage(error);
        }
    }
    
    /**
     * Fast page authentication with minimal checks
     */
    async function handlePageAuthenticationFast(pageType) {
        console.log('🔐 FIXED: Fast authentication check for:', pageType);
        
        try {
            // Initialize AuthService quickly
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            const authInitResult = window.AuthService.init();
            console.log('🔐 FIXED: AuthService init result:', authInitResult);
            
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
            console.error('🔐 FIXED: Fast authentication error:', error);
            return { success: false, reason: error.message };
        }
    }

    async function handleProtectedPageAuthFast() {
        console.log('🔐 FIXED: Fast protected page auth check');
        
        // Quick authentication check
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 FIXED: Already authenticated');
            return { success: true, authenticated: true };
        }
        
        // Quick session check
        if (!window.AuthService.hasPersistentSession()) {
            console.log('🔐 FIXED: No session, redirecting to login');
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
        
        // Try quick refresh
        console.log('🔐 FIXED: Attempting quick session restore');
        try {
            const refreshed = await window.AuthService.refreshTokenIfNeeded();
            
            if (refreshed && window.AuthService.isAuthenticated()) {
                console.log('🔐 FIXED: Session restored quickly');
                return { success: true, authenticated: true };
            } else {
                console.log('🔐 FIXED: Session restore failed, redirecting');
                window.location.href = 'login.html';
                return { success: false, redirect: true };
            }
            
        } catch (error) {
            console.error('🔐 FIXED: Session restore error:', error);
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
    }

    async function handleLoginPageAuthFast() {
        console.log('🔐 FIXED: Fast login page auth check');
        
        // Quick check if already authenticated
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 FIXED: Already authenticated, redirecting');
            window.location.href = 'project.html';
            return { success: false, redirect: true };
        }
        
        // Quick session restore attempt
        if (window.AuthService.hasPersistentSession()) {
            console.log('🔐 FIXED: Quick session restore attempt');
            
            try {
                const refreshed = await window.AuthService.refreshTokenIfNeeded();
                if (refreshed && window.AuthService.isAuthenticated()) {
                    console.log('🔐 FIXED: Session restored, redirecting');
                    window.location.href = 'project.html';
                    return { success: false, redirect: true };
                }
            } catch (error) {
                console.warn('🔐 FIXED: Session restore failed:', error);
            }
        }
        
        return { success: true, authenticated: false };
    }

    /**
     * FIXED: Enhanced core services initialization with proper timing and error handling
     */
    async function initializeCoreServicesFixed() {
        console.log('🔧 FIXED: Fast core services initialization...');
        
        for (const serviceName of CORE_SERVICES) {
            try {
                if (!window[serviceName]) {
                    console.warn(`⚠️ FIXED: ${serviceName} not found, skipping`);
                    continue;
                }
                
                if (window.AAAI_APP.services[serviceName]) {
                    console.log(`ℹ️ FIXED: ${serviceName} already initialized`);
                    continue;
                }
                
                console.log(`🔧 FIXED: Quick init ${serviceName}...`);
                
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
                        
                    case 'ChatService':
                        if (typeof service.init === 'function' && !service.isInitialized) {
                            try {
                                service.init(window.AAAI_APP.services.AuthService, {
                                    debug: window.AAAI_APP.debug
                                });
                                console.log('✅ FIXED: ChatService initialized successfully');
                            } catch (error) {
                                console.warn(`⚠️ FIXED: ${serviceName} initialization failed:`, error);
                                continue;
                            }
                        }
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ChatIntegration':
                        // ChatIntegration is initialized per-page, not globally
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    default:
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                }
                
                console.log(`✅ FIXED: ${serviceName} initialized quickly`);
                
            } catch (error) {
                console.error(`❌ FIXED: Failed to initialize ${serviceName}:`, error);
                // Continue with other services
            }
        }
        
        console.log('✅ FIXED: Core services initialized');
    }
        
    /**
     * Page-specific initialization (non-blocking)
     */
    function initializePageSpecificFast(pageType) {
        console.log(`🎯 FIXED: Fast page-specific init for: ${pageType}`);
        
        // Use setTimeout to make it non-blocking
        setTimeout(() => {
            switch (pageType) {
                case 'project':
                    initializeProjectPageFast();
                    break;
                    
                case 'chat':
                    initializeChatPageFixed();
                    break;
                    
                default:
                    console.log('ℹ️ FIXED: No specific initialization needed');
                    break;
            }
        }, 0);
    }
    
    /**
     * Fast project page initialization
     */
    function initializeProjectPageFast() {
        try {
            console.log('📂 FIXED: Fast project page init...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            if (!authService?.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            // Load context asynchronously (non-blocking)
            if (projectService) {
                projectService.getCurrentContext().catch(error => {
                    console.warn('⚠️ FIXED: Context load failed:', error);
                });
            }
            
            console.log('✅ FIXED: Project page initialized');
            
        } catch (error) {
            console.error('❌ FIXED: Project page init failed:', error);
        }
    }
    
    /**
     * FIXED: Enhanced chat page initialization with proper sequencing and error handling
     */
    function initializeChatPageFixed() {
        try {
            console.log('💬 FIXED: Enhanced chat page initialization starting...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            const chatService = window.AAAI_APP.services.ChatService;
            
            if (!authService?.isAuthenticated()) {
                console.error('🔐 FIXED: Authentication required for chat page');
                window.location.href = 'login.html';
                return;
            }
            
            // Get project ID from URL
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project');
            const projectName = urlParams.get('project_name');
            
            if (!projectId) {
                console.warn('⚠️ FIXED: No project ID, redirecting to projects');
                window.location.href = 'project.html';
                return;
            }
            
            console.log('📝 FIXED: Chat page context:', {
                projectId,
                projectName: projectName ? decodeURIComponent(projectName) : null,
                chatServiceReady: !!chatService?.isInitialized
            });
            
            // FIXED: Initialize ChatIntegration with proper error handling and validation
            if (window.ChatIntegration && !window.ChatIntegration.isInitialized) {
                try {
                    console.log('🔧 FIXED: Initializing ChatIntegration...');
                    
                    // FIXED: Wait a bit for DOM to be fully ready
                    setTimeout(() => {
                        try {
                            window.ChatIntegration.init('chatContainer', {
                                debug: window.AAAI_APP.debug,
                                connectImmediately: false, // FIXED: Don't connect immediately, do it after setup
                                autoScroll: true,
                                showTimestamps: true,
                                enableTypingIndicator: true
                            });
                            console.log('✅ FIXED: ChatIntegration initialized successfully');
                            
                            // FIXED: Now connect ChatService after integration is set up
                            initializeChatConnectionFixed(projectId, projectName);
                            
                        } catch (error) {
                            console.error('❌ FIXED: ChatIntegration initialization failed:', error);
                            
                            // FIXED: Try fallback initialization
                            setTimeout(() => {
                                try {
                                    console.log('🔄 FIXED: Trying ChatIntegration fallback initialization...');
                                    window.ChatIntegration.init('chatContainer', {
                                        debug: true, // Enable debug for troubleshooting
                                        connectImmediately: false,
                                        autoScroll: true
                                    });
                                    initializeChatConnectionFixed(projectId, projectName);
                                } catch (fallbackError) {
                                    console.error('❌ FIXED: ChatIntegration fallback failed:', fallbackError);
                                }
                            }, 1000);
                        }
                    }, 500); // Wait 500ms for DOM readiness
                    
                } catch (error) {
                    console.error('❌ FIXED: ChatIntegration setup failed:', error);
                }
            } else if (window.ChatIntegration?.isInitialized) {
                console.log('ℹ️ FIXED: ChatIntegration already initialized');
                initializeChatConnectionFixed(projectId, projectName);
            } else {
                console.error('❌ FIXED: ChatIntegration not available');
            }
            
            // FIXED: Switch project context in parallel (don't wait for ChatService)
            if (projectService) {
                projectService.switchToProject(
                    projectId, 
                    projectName ? decodeURIComponent(projectName) : null
                ).then(() => {
                    console.log('✅ FIXED: Project context switched');
                }).catch(error => {
                    console.error('❌ FIXED: Project context switch failed:', error);
                });
            }
            
            console.log('✅ FIXED: Chat page initialization started');
            
        } catch (error) {
            console.error('❌ FIXED: Chat page init failed:', error);
        }
    }
    
    /**
     * FIXED: Separate chat connection initialization with proper sequencing
     */
    function initializeChatConnectionFixed(projectId, projectName) {
        console.log('🔌 FIXED: Initializing chat connection...', { projectId, projectName });
        
        const chatService = window.AAAI_APP.services.ChatService;
        
        if (!chatService?.isInitialized) {
            console.error('❌ FIXED: ChatService not available for connection');
            return;
        }
        
        // FIXED: Set project context first
        if (projectId) {
            try {
                if (window.ChatIntegration?.isInitialized) {
                    window.ChatIntegration.setProjectContext(
                        projectId, 
                        projectName ? decodeURIComponent(projectName) : null
                    );
                    console.log('✅ FIXED: ChatIntegration project context set');
                }
                
                // FIXED: Connect ChatService
                console.log('🔌 FIXED: Starting ChatService connection...');
                chatService.connect().then(() => {
                    console.log('✅ FIXED: ChatService connected successfully');
                    
                    // FIXED: Set project context on ChatService after connection
                    chatService.setProjectContext(
                        projectId, 
                        projectName ? decodeURIComponent(projectName) : null
                    );
                    
                    // FIXED: Validate the integration is working
                    setTimeout(() => {
                        const status = chatService.getStatus();
                        console.log('🔍 FIXED: ChatService status after connection:', status);
                        
                        if (status.listeners.message === 0) {
                            console.error('❌ FIXED: CRITICAL - No message listeners registered!');
                            
                            // FIXED: Try to re-setup integration
                            if (window.ChatIntegration?.isInitialized) {
                                try {
                                    console.log('🔄 FIXED: Re-setting up ChatIntegration...');
                                    window.ChatIntegration._setupChatServiceIntegrationFixed();
                                } catch (error) {
                                    console.error('❌ FIXED: Integration re-setup failed:', error);
                                }
                            }
                        }
                    }, 1000);
                    
                }).catch(error => {
                    console.error('❌ FIXED: ChatService connection failed:', error);
                    
                    // FIXED: Show user-friendly error
                    if (window.ChatIntegration?.isInitialized) {
                        try {
                            window.ChatIntegration._addMessageToUIFixed({
                                type: 'error',
                                text: 'Unable to connect to chat service. Please refresh the page.',
                                timestamp: Date.now()
                            });
                        } catch (uiError) {
                            console.error('❌ FIXED: Could not show error in UI:', uiError);
                        }
                    }
                });
                
            } catch (error) {
                console.error('❌ FIXED: Error in chat connection setup:', error);
            }
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
        
        console.log('🌍 FIXED: Fast environment initialized');
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
            <strong>FIXED: Initialization Error</strong><br>
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
    
    console.log('🎬 FIXED: Fast AAAI initialization script loaded');
    
})();