/**
 * Enhanced Unified Application Initialization for AAAI Solutions
 * WITH CONSISTENT AUTHENTICATION STATE MANAGEMENT
 * Ensures proper service loading order and handles authentication consistency
 */

(function() {
    'use strict';
    
    // Global application state with enhanced tracking
    window.AAAI_APP = {
        initialized: false,
        services: {},
        config: window.AAAI_CONFIG || {},
        debug: false,
        authenticationStatus: 'unknown', // 'complete', 'partial', 'none', 'failed'
        initializationAttempts: 0,
        maxInitializationAttempts: 3
    };
    
    // Service initialization order (important for dependency management)
    const SERVICE_INIT_ORDER = [
        'AuthService',
        'ProjectService', 
        'NavigationManager',
        'ChatService',
        'ChatIntegration'
    ];
    
    // Service dependencies mapping
    const SERVICE_DEPENDENCIES = {
        'AuthService': [],
        'ProjectService': ['AuthService'],
        'NavigationManager': ['AuthService', 'ProjectService'],
        'ChatService': ['AuthService'],
        'ChatIntegration': ['ChatService']
    };
    
    /**
     * ENHANCED: Initialize the unified application with consistent auth handling
     */
    async function initializeApplication() {
        window.AAAI_APP.initializationAttempts++;
        
        try {
            console.log(`🚀 ENHANCED AAAI Solutions - Unified Initialization (Attempt ${window.AAAI_APP.initializationAttempts})`);
            
            // Set debug mode
            window.AAAI_APP.debug = window.AAAI_CONFIG?.ENABLE_DEBUG || false;
            
            // Initialize environment
            initializeEnvironment();
            
            // Get current page type
            const currentPage = getCurrentPageType();
            console.log('📄 Current page type:', currentPage);
            
            // ENHANCED: Handle page authentication with retry logic
            const authResult = await handleEnhancedPageAuthentication(currentPage);
            if (!authResult.success) {
                console.log('❌ Enhanced authentication failed, handling redirect...');
                return; // Page will handle redirect
            }
            
            console.log('✅ Enhanced authentication confirmed, continuing initialization...');
            
            // Initialize services with enhanced error handling
            await initializeServicesWithRetry();
            
            // Setup enhanced error handling
            setupEnhancedErrorHandling();
            
            // Setup enhanced service communication
            setupEnhancedServiceCommunication();
            
            // Page-specific initialization with auth validation
            await initializePageSpecificEnhanced(currentPage);
            
            window.AAAI_APP.initialized = true;
            window.AAAI_APP.authenticationStatus = authResult.authStatus;
            
            console.log('✅ ENHANCED AAAI Solutions application initialized successfully');
            console.log('🔍 Available services:', Object.keys(window.AAAI_APP.services));
            console.log('🔐 Authentication status:', window.AAAI_APP.authenticationStatus);
            
            // Notify page scripts that initialization is complete
            document.dispatchEvent(new CustomEvent('aaai:initialized', {
                detail: { 
                    services: window.AAAI_APP.services,
                    config: window.AAAI_APP.config,
                    authenticationStatus: window.AAAI_APP.authenticationStatus,
                    authenticationComplete: authResult.authenticationComplete
                }
            }));
            
        } catch (error) {
            console.error('❌ Failed to initialize ENHANCED AAAI application:', error);
            await handleEnhancedInitializationError(error);
        }
    }
    
    /**
     * ENHANCED: Handle page authentication with JWT system
     */
    async function handleEnhancedPageAuthentication(pageType) {
        console.log('🔐 ENHANCED: Handling page authentication for:', pageType);
        
        try {
            // Initialize AuthService first
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            // Initialize AuthService
            console.log('🔐 Initializing AuthService...');
            const authInitResult = window.AuthService.init();
            
            console.log('🔐 AuthService initialization result:', authInitResult);
            
            // Handle based on page type
            switch (pageType) {
                case 'login':
                    return await handleLoginPageAuth();
                    
                case 'project':
                case 'chat':
                    return await handleProtectedPageAuth(pageType);
                    
                default:
                    // Public pages
                    return { 
                        success: true, 
                        authenticated: window.AuthService.isAuthenticated(),
                        authStatus: window.AuthService.isAuthenticated() ? 'complete' : 'none'
                    };
            }
            
        } catch (error) {
            console.error('🔐 Enhanced authentication handling error:', error);
            return { 
                success: false, 
                error: error.message,
                authStatus: 'failed'
            };
        }
    }

    async function handleProtectedPageAuth(pageType) {
        console.log(`🔐 Handling protected page authentication for: ${pageType}`);
        
        // If authenticated, proceed
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 Already authenticated for protected page');
            return { 
                success: true, 
                authenticated: true,
                authStatus: 'complete',
                user: window.AuthService.getCurrentUser()
            };
        }
        
        // If no persistent session, redirect to login
        if (!window.AuthService.hasPersistentSession()) {
            console.log('🔐 No persistent session, redirecting to login...');
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
        
        // Try to restore session
        console.log('🔐 Attempting session restoration...');
        
        try {
            const refreshed = await window.AuthService.refreshTokenIfNeeded();
            
            if (refreshed && window.AuthService.isAuthenticated()) {
                console.log('🔐 Session restored successfully');
                return { 
                    success: true, 
                    authenticated: true,
                    authStatus: 'complete',
                    user: window.AuthService.getCurrentUser()
                };
            } else {
                console.log('🔐 Session restoration failed, redirecting to login...');
                window.location.href = 'login.html';
                return { success: false, redirect: true };
            }
            
        } catch (error) {
            console.error('🔐 Session restoration error:', error);
            window.location.href = 'login.html';
            return { success: false, redirect: true };
        }
    }


    async function handleLoginPageAuth() {
        console.log('🔐 Handling login page authentication...');
        
        // If already authenticated, redirect to projects
        if (window.AuthService.isAuthenticated()) {
            console.log('🔐 Already authenticated, redirecting to projects...');
            window.location.href = 'project.html';
            return { success: false, redirect: true };
        }
        
        // If has persistent session, try to restore
        if (window.AuthService.hasPersistentSession()) {
            console.log('🔐 Persistent session found, attempting restoration...');
            
            try {
                const refreshed = await window.AuthService.refreshTokenIfNeeded();
                if (refreshed && window.AuthService.isAuthenticated()) {
                    console.log('🔐 Session restored, redirecting to projects...');
                    window.location.href = 'project.html';
                    return { success: false, redirect: true };
                }
            } catch (error) {
                console.warn('🔐 Failed to restore session:', error);
            }
        }
        
        // Stay on login page for new authentication
        return { 
            success: true, 
            authenticated: false,
            authStatus: 'none'
        };
    }

    /**
     * Initialize services with enhanced error handling and retries
     */
    async function initializeServicesWithRetry() {
        console.log('🔧 ENHANCED: Initializing services with retry logic...');
        
        let lastError = null;
        
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                for (const serviceName of SERVICE_INIT_ORDER) {
                    await initializeServiceEnhanced(serviceName);
                }
                
                console.log('✅ All services initialized successfully');
                return; // Success
                
            } catch (error) {
                lastError = error;
                console.error(`❌ Service initialization attempt ${attempt} failed:`, error);
                
                if (attempt < 2) {
                    console.log('🔄 Retrying service initialization...');
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        
        // If we get here, all attempts failed
        throw new Error(`Service initialization failed after retries: ${lastError.message}`);
    }
    
    /**
     * ENHANCED: Initialize a specific service with better error handling
     */
    async function initializeServiceEnhanced(serviceName) {
        try {
            // Check if service exists
            if (!window[serviceName]) {
                console.warn(`⚠️ Service ${serviceName} not found, skipping`);
                return;
            }
            
            // Check if already initialized
            if (window.AAAI_APP.services[serviceName]) {
                console.log(`ℹ️ Service ${serviceName} already initialized`);
                return;
            }
            
            // Check dependencies
            const dependencies = SERVICE_DEPENDENCIES[serviceName] || [];
            for (const dep of dependencies) {
                if (!window.AAAI_APP.services[dep]) {
                    throw new Error(`Service ${serviceName} requires ${dep} but it's not initialized`);
                }
            }
            
            console.log(`🔧 Initializing ${serviceName} with enhanced checks...`);
            
            // Get the service object
            let service = window[serviceName];
            
            // Initialize based on service type with enhanced validation
            switch (serviceName) {
                case 'AuthService':
                    // AuthService should already be initialized
                    if (!service._isAuthenticationComplete) {
                        console.warn('⚠️ AuthService missing enhanced methods');
                    }
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                case 'ProjectService':
                    if (typeof service.init === 'function' && !service.isInitialized) {
                        // Validate AuthService before initializing ProjectService
                        const authService = window.AAAI_APP.services.AuthService;
                        if (!authService) {
                            throw new Error('AuthService required for ProjectService');
                        }
                        
                        service.init(authService, {
                            debug: window.AAAI_APP.debug
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
                        service.init(window.AAAI_APP.services.AuthService, {
                            debug: window.AAAI_APP.debug
                        });
                    }
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                case 'ChatIntegration':
                    if (typeof service.init === 'function' && !service.isInitialized) {
                        service.init();
                    }
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                default:
                    window.AAAI_APP.services[serviceName] = service;
                    break;
            }
            
            console.log(`✅ ${serviceName} initialized successfully`);
            
        } catch (error) {
            console.error(`❌ Failed to initialize ${serviceName}:`, error);
            throw error;
        }
    }
    
    /**
     * Setup enhanced global error handling
     */
    function setupEnhancedErrorHandling() {
        // Handle uncaught errors with authentication context
        window.addEventListener('error', (event) => {
            console.error('🚨 Uncaught error:', event.error);
            
            // Check if it's an authentication error
            if (isAuthenticationError(event.error)) {
                handleAuthenticationErrorEnhanced(event.error);
            }
        });
        
        // Handle unhandled promise rejections with authentication context
        window.addEventListener('unhandledrejection', (event) => {
            console.error('🚨 Unhandled promise rejection:', event.reason);
            
            // Check if it's an authentication error
            if (isAuthenticationError(event.reason)) {
                handleAuthenticationErrorEnhanced(event.reason);
            }
        });
        
        console.log('🛡️ Enhanced global error handling configured');
    }
    
    /**
     * Check if an error is authentication-related
     */
    function isAuthenticationError(error) {
        if (!error) return false;
        
        const message = error.message || '';
        const authKeywords = [
            'authentication', 'login', 'session', 'expired', 'unauthorized', 
            'token', 'credential', 'access denied', 'forbidden'
        ];
        
        return authKeywords.some(keyword => message.toLowerCase().includes(keyword));
    }
    
    /**
     * Handle authentication errors with enhanced logic
     */
    function handleAuthenticationErrorEnhanced(error) {
        console.warn('🔐 Enhanced authentication error handling:', error.message);
        
        // Get current authentication status
        const authService = window.AAAI_APP.services?.AuthService;
        if (!authService) {
            console.error('AuthService not available for error handling');
            redirectToLogin('AuthService unavailable');
            return;
        }
        
        const isComplete = authService._isAuthenticationComplete ? 
                         authService._isAuthenticationComplete() : 
                         authService.isAuthenticated();
        
        if (!isComplete) {
            console.log('🔐 Authentication incomplete during error, clearing state...');
            
            // Clear authentication state
            if (typeof authService.clearAuthData === 'function') {
                authService.clearAuthData();
            }
            
            // Redirect to login after a brief delay
            setTimeout(() => {
                redirectToLogin('Authentication error');
            }, 1000);
        }
    }
    
    /**
     * Redirect to login with error context
     */
    function redirectToLogin(reason) {
        console.log('🔐 Redirecting to login:', reason);
        
        // Use NavigationManager if available
        if (window.AAAI_APP.services?.NavigationManager) {
            window.AAAI_APP.services.NavigationManager.goToLogin(reason);
        } else {
            window.location.href = 'login.html';
        }
    }
    
    /**
     * Setup enhanced service communication
     */
    function setupEnhancedServiceCommunication() {
        // Create enhanced event system
        window.AAAI_EVENTS = new EventTarget();
        
        // Enhanced event handlers with authentication context
        const eventHandlers = {
            'auth:changed': handleAuthChangeEnhanced,
            'auth:expired': handleAuthExpiredEnhanced,
            'project:switched': handleProjectSwitchEnhanced,
            'chat:connected': handleChatConnectedEnhanced,
            'navigation:changed': handleNavigationChangeEnhanced
        };
        
        // Register enhanced event handlers
        for (const [event, handler] of Object.entries(eventHandlers)) {
            window.AAAI_EVENTS.addEventListener(event, handler);
        }
        
        // Setup service-specific communication with auth monitoring
        setupAuthServiceEventsEnhanced();
        setupProjectServiceEventsEnhanced();
        setupChatServiceEventsEnhanced();
        
        console.log('📡 Enhanced inter-service communication configured');
    }
    
    /**
     * Enhanced authentication change handler
     */
    function handleAuthChangeEnhanced(event) {
        console.log('🔐 Enhanced authentication changed:', event.detail);
        
        if (!event.detail.authenticated) {
            // User authentication lost
            console.log('🔐 Authentication lost, cleaning up services...');
            
            // Clear service caches
            if (window.AAAI_APP.services.ProjectService?.clearCache) {
                window.AAAI_APP.services.ProjectService.clearCache();
            }
            
            // Disconnect chat
            if (window.AAAI_APP.services.ChatService?.disconnect) {
                window.AAAI_APP.services.ChatService.disconnect();
            }
            
            // Redirect to login
            setTimeout(() => {
                redirectToLogin('Authentication lost');
            }, 1000);
        }
    }
    
    /**
     * Handle authentication expiration
     */
    function handleAuthExpiredEnhanced(event) {
        console.log('🔐 Authentication expired:', event.detail);
        
        // Clear all service states
        Object.values(window.AAAI_APP.services).forEach(service => {
            if (service.clearCache) service.clearCache();
            if (service.disconnect) service.disconnect();
        });
        
        // Redirect to login
        redirectToLogin('Session expired');
    }
    
    /**
     * Setup enhanced AuthService events
     */
    function setupAuthServiceEventsEnhanced() {
        const authService = window.AAAI_APP.services?.AuthService;
        if (!authService) return;
        
        // Monitor authentication state changes with enhanced checking
        let lastAuthState = authService._isAuthenticationComplete ? 
                           authService._isAuthenticationComplete() : 
                           authService.isAuthenticated();
        
        setInterval(() => {
            const currentAuthState = authService._isAuthenticationComplete ? 
                                   authService._isAuthenticationComplete() : 
                                   authService.isAuthenticated();
            
            if (currentAuthState !== lastAuthState) {
                lastAuthState = currentAuthState;
                
                window.AAAI_EVENTS.dispatchEvent(new CustomEvent('auth:changed', {
                    detail: { 
                        authenticated: currentAuthState,
                        authenticationComplete: currentAuthState,
                        timestamp: Date.now()
                    }
                }));
            }
        }, 5000); // Check every 5 seconds
    }
    
    // Include other enhanced event handlers...
    function handleProjectSwitchEnhanced(event) {
        console.log('📂 Enhanced project switched:', event.detail);
        
        // Update ChatService context with validation
        const chatService = window.AAAI_APP.services.ChatService;
        const projectData = event.detail.data;
        
        if (chatService && projectData?.chat_id && projectData?.project_name) {
            chatService.setProjectContext(projectData.chat_id, projectData.project_name);
        }
    }
    
    function handleChatConnectedEnhanced(event) {
        console.log('💬 Enhanced chat connected:', event.detail);
        
        // Sync project context with authentication validation
        const projectService = window.AAAI_APP.services.ProjectService;
        const chatService = window.AAAI_APP.services.ChatService;
        
        if (projectService && chatService) {
            const context = projectService.getContext();
            if (context.chat_id && context.project_name) {
                chatService.setProjectContext(context.chat_id, context.project_name);
            }
        }
    }
    
    function handleNavigationChangeEnhanced(event) {
        console.log('🧭 Enhanced navigation changed:', event.detail);
    }
    
    function setupProjectServiceEventsEnhanced() {
        const projectService = window.AAAI_APP.services?.ProjectService;
        if (!projectService) return;
        
        if (typeof projectService.onContextChange === 'function') {
            projectService.onContextChange((eventType, data) => {
                window.AAAI_EVENTS.dispatchEvent(new CustomEvent('project:switched', {
                    detail: { eventType, data }
                }));
            });
        }
    }
    
    function setupChatServiceEventsEnhanced() {
        const chatService = window.AAAI_APP.services?.ChatService;
        if (!chatService) return;
        
        if (typeof chatService.onStatusChange === 'function') {
            chatService.onStatusChange((status) => {
                if (status === 'connected') {
                    window.AAAI_EVENTS.dispatchEvent(new CustomEvent('chat:connected', {
                        detail: { status }
                    }));
                }
            });
        }
    }
    
    /**
     * Page-specific initialization with enhanced auth validation
     */
    async function initializePageSpecificEnhanced(pageType) {
        console.log(`🎯 Enhanced page-specific initialization for: ${pageType}`);
        
        switch (pageType) {
            case 'login':
                // Login page doesn't need authenticated services
                break;
                
            case 'project':
                await initializeProjectPageEnhanced();
                break;
                
            case 'chat':
                await initializeChatPageEnhanced();
                break;
                
            default:
                console.log('ℹ️ No specific initialization for page type:', pageType);
                break;
        }
    }
    
    /**
     * Enhanced project page initialization
     */
    async function initializeProjectPageEnhanced() {
        try {
            console.log('📂 Enhanced project page initialization...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            // Validate authentication
            if (!authService || !authService._isAuthenticationComplete()) {
                throw new Error('Complete authentication required for project page');
            }
            
            console.log('✅ Project page authentication validated');
            
            // Load project context if available
            if (projectService) {
                try {
                    await projectService.getCurrentContext();
                    console.log('✅ Project page context loaded');
                } catch (error) {
                    console.warn('⚠️ Could not load project context:', error);
                    // Don't fail the page load for context issues
                }
            }
            
        } catch (error) {
            console.error('❌ Enhanced project page initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Enhanced chat page initialization
     */
    async function initializeChatPageEnhanced() {
        const authService = window.AAAI_APP.services.AuthService;
        const projectService = window.AAAI_APP.services.ProjectService;
        
        if (!authService?._isAuthenticationComplete()) {
            redirectToLogin('Authentication required for chat');
            return;
        }
        
        // Get project ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const projectId = urlParams.get('project');
        
        if (!projectId) {
            console.warn('⚠️ No project ID found, redirecting to projects');
            if (window.AAAI_APP.services.NavigationManager) {
                window.AAAI_APP.services.NavigationManager.goToProject();
            } else {
                window.location.href = 'project.html';
            }
            return;
        }
        
        // Switch to project context
        if (projectService) {
            try {
                const projectName = urlParams.get('project_name');
                await projectService.switchToProject(
                    projectId, 
                    projectName ? decodeURIComponent(projectName) : null
                );
                console.log('✅ Enhanced chat page project context loaded');
            } catch (error) {
                console.error('❌ Failed to load project context for chat:', error);
            }
        }
    }
    
    /**
     * Handle enhanced initialization errors
     */
    async function handleEnhancedInitializationError(error) {
        console.error('🚨 Enhanced initialization failed:', error);
        
        // Check if we can retry
        if (window.AAAI_APP.initializationAttempts < window.AAAI_APP.maxInitializationAttempts) {
            console.log('🔄 Retrying enhanced initialization...');
            
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                await initializeApplication();
                return; // Success on retry
            } catch (retryError) {
                console.error('🚨 Retry also failed:', retryError);
            }
        }
        
        // Show user-friendly error message
        showEnhancedErrorMessage(error);
    }
    
    /**
     * Show enhanced error message to user
     */
    function showEnhancedErrorMessage(error) {
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            color: white;
            font-family: Arial, sans-serif;
        `;
        
        const isAuthError = isAuthenticationError(error);
        
        errorDiv.innerHTML = `
            <div style="text-align: center; max-width: 500px; padding: 20px;">
                <h2 style="color: ${isAuthError ? '#f39c12' : '#e74c3c'}; margin-bottom: 20px;">
                    ${isAuthError ? 'Authentication Issue' : 'Application Error'}
                </h2>
                <p style="margin-bottom: 20px;">
                    ${isAuthError 
                        ? 'There was a problem with your authentication. Please log in again.' 
                        : 'The application failed to initialize properly.'}
                </p>
                <div style="margin-bottom: 30px;">
                    <button onclick="window.location.reload()" style="
                        background: #3498db;
                        color: white;
                        border: none;
                        padding: 10px 20px;
                        border-radius: 5px;
                        cursor: pointer;
                        font-size: 16px;
                        margin-right: 10px;
                    ">
                        Refresh Page
                    </button>
                    ${isAuthError ? `
                        <button onclick="window.location.href='login.html'" style="
                            background: #f39c12;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            cursor: pointer;
                            font-size: 16px;
                        ">
                            Go to Login
                        </button>
                    ` : ''}
                </div>
                <details style="text-align: left; font-size: 12px; color: #ccc;">
                    <summary style="cursor: pointer;">Technical Details</summary>
                    <pre style="margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.5); border-radius: 3px;">
${error.message || 'Unknown error'}
Authentication Status: ${window.AAAI_APP.authenticationStatus}
Initialization Attempts: ${window.AAAI_APP.initializationAttempts}
                    </pre>
                </details>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
    }
    
    /**
     * Initialize environment with enhanced logging
     */
    function initializeEnvironment() {
        if (!window.AAAI_CONFIG) {
            window.AAAI_CONFIG = {
                ENVIRONMENT: 'production',
                ENABLE_DEBUG: false,
                ENABLE_WEBSOCKETS: true,
                VERSION: '1.0.0'
            };
        }
        
        if (!window.AAAI_LOGGER) {
            const logLevel = window.AAAI_CONFIG.ENABLE_DEBUG ? 'debug' : 'info';
            
            window.AAAI_LOGGER = {
                debug: logLevel === 'debug' ? console.log.bind(console, '[DEBUG]') : () => {},
                info: console.info.bind(console, '[INFO]'),
                warn: console.warn.bind(console, '[WARN]'),
                error: console.error.bind(console, '[ERROR]')
            };
        }
        
        window.AAAI_APP.config = window.AAAI_CONFIG;
        
        console.log('🌍 Enhanced environment initialized:', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            debug: window.AAAI_CONFIG.ENABLE_DEBUG,
            websockets: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
            version: window.AAAI_CONFIG.VERSION
        });
    }
    
    /**
     * Determine current page type
     */
    function getCurrentPageType() {
        const path = window.location.pathname;
        
        if (path.includes('login.html')) return 'login';
        if (path.includes('project.html')) return 'project';
        if (path.includes('chat.html')) return 'chat';
        
        return 'unknown';
    }
    
    /**
     * Enhanced public API
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
    
    window.AAAI_APP.getAuthenticationStatus = function() {
        return window.AAAI_APP.authenticationStatus;
    };
    
    window.AAAI_APP.isAuthenticationComplete = function() {
        const authService = window.AAAI_APP.services?.AuthService;
        return authService?._isAuthenticationComplete ? 
               authService._isAuthenticationComplete() : 
               false;
    };
    
    // Wait for DOM to be ready, then initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        setTimeout(initializeApplication, 0);
    }
    
    console.log('🎬 Enhanced AAAI Application initialization script loaded');
    
})();