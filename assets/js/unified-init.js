/**
 * Unified Application Initialization Script for AAAI Solutions
 * WITH PROPER ASYNC AUTHENTICATION WAITING
 * Ensures proper service loading order and handles dependencies
 */

(function() {
    'use strict';
    
    // Global application state
    window.AAAI_APP = {
        initialized: false,
        services: {},
        config: window.AAAI_CONFIG || {},
        debug: false,
        authenticationReady: false // NEW: Track when auth is fully ready
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
     * Initialize the unified application with proper async auth waiting
     */
    async function initializeApplication() {
        try {
            console.log('🚀 AAAI Solutions - Unified Application Initialization with Async Auth');
            
            // Set debug mode
            window.AAAI_APP.debug = window.AAAI_CONFIG?.ENABLE_DEBUG || false;
            
            // Initialize environment
            initializeEnvironment();
            
            // Check if we're on a page that requires authentication
            const currentPage = getCurrentPageType();
            console.log('📄 Current page type:', currentPage);
            
            // Initialize services in correct order
            await initializeServicesInOrder();
            
            // NEW: Wait for authentication to be fully ready before proceeding
            if (currentPage !== 'login') {
                const authReady = await waitForAuthenticationReady();
                if (!authReady) {
                    console.log('❌ Authentication not ready, redirecting to login');
                    redirectToLogin('Authentication validation failed');
                    return;
                }
                window.AAAI_APP.authenticationReady = true;
            }
            
            // Setup global error handling
            setupGlobalErrorHandling();
            
            // Setup cross-service communication
            setupServiceCommunication();
            
            // Page-specific initialization (now after auth is ready)
            await initializePageSpecific(currentPage);
            
            window.AAAI_APP.initialized = true;
            
            console.log('✅ AAAI Solutions application initialized successfully');
            console.log('🔍 Available services:', Object.keys(window.AAAI_APP.services));
            console.log('🔐 Authentication ready:', window.AAAI_APP.authenticationReady);
            
            // Notify page scripts that initialization is complete
            document.dispatchEvent(new CustomEvent('aaai:initialized', {
                detail: { 
                    services: window.AAAI_APP.services,
                    config: window.AAAI_APP.config,
                    authenticationReady: window.AAAI_APP.authenticationReady
                }
            }));
            
        } catch (error) {
            console.error('❌ Failed to initialize AAAI application:', error);
            handleInitializationError(error);
        }
    }

    /**
     * NEW: Wait for authentication to be fully ready for API calls
     */
    async function waitForAuthenticationReady(timeoutMs = 20000) {
        const authService = window.AAAI_APP.services.AuthService;
        
        if (!authService) {
            console.error('❌ AuthService not available');
            return false;
        }
        
        // If not authenticated at all, don't wait
        if (!authService.isAuthenticated()) {
            console.log('❌ User not authenticated');
            return false;
        }
        
        console.log('⏳ Waiting for authentication to be fully ready...');
        const startTime = Date.now();
        
        try {
            // Use the new waitForAuthentication method
            const result = await authService.waitForAuthentication(timeoutMs);
            
            if (result) {
                const duration = Date.now() - startTime;
                console.log(`✅ Authentication ready after ${duration}ms`);
                return true;
            } else {
                console.log('❌ Authentication validation failed');
                return false;
            }
            
        } catch (error) {
            console.error('❌ Error waiting for authentication:', error);
            return false;
        }
    }

    /**
     * Redirect to login page
     */
    function redirectToLogin(reason = 'Authentication required') {
        console.log(`🔓 Redirecting to login: ${reason}`);
        
        // Try NavigationManager first
        if (window.AAAI_APP.services.NavigationManager) {
            window.AAAI_APP.services.NavigationManager.goToLogin(reason);
        } else {
            // Fallback to direct redirect
            const currentUrl = window.location.href;
            const loginUrl = new URL('login.html', window.location.origin);
            
            // Add return URL if not already on login page
            if (!currentUrl.includes('login.html')) {
                loginUrl.searchParams.set('return', encodeURIComponent(currentUrl));
            }
            
            window.location.href = loginUrl.href;
        }
    }
    
    /**
     * Initialize environment settings
     */
    function initializeEnvironment() {
        // Ensure config exists
        if (!window.AAAI_CONFIG) {
            window.AAAI_CONFIG = {
                ENVIRONMENT: 'production',
                ENABLE_DEBUG: false,
                ENABLE_WEBSOCKETS: true,
                VERSION: '1.0.0'
            };
        }
        
        // Set up logger
        if (!window.AAAI_LOGGER) {
            const logLevel = window.AAAI_CONFIG.ENABLE_DEBUG ? 'debug' : 'info';
            
            window.AAAI_LOGGER = {
                debug: logLevel === 'debug' ? console.log.bind(console, '[DEBUG]') : () => {},
                info: console.info.bind(console, '[INFO]'),
                warn: console.warn.bind(console, '[WARN]'),
                error: console.error.bind(console, '[ERROR]')
            };
        }
        
        // Store config in app state
        window.AAAI_APP.config = window.AAAI_CONFIG;
        
        console.log('🌍 Environment initialized:', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            debug: window.AAAI_CONFIG.ENABLE_DEBUG,
            websockets: window.AAAI_CONFIG.ENABLE_WEBSOCKETS
        });
    }
    
    /**
     * Initialize services in the correct dependency order
     */
    async function initializeServicesInOrder() {
        console.log('🔧 Initializing services in dependency order...');
        
        for (const serviceName of SERVICE_INIT_ORDER) {
            await initializeService(serviceName);
        }
        
        console.log('✅ All services initialized successfully');
    }
    
    /**
     * Initialize a specific service with dependency checking
     */
    async function initializeService(serviceName) {
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
            
            console.log(`🔧 Initializing ${serviceName}...`);
            
            // Get the service object
            let service = window[serviceName];
            
            // Initialize the service and store the service object (not the return value)
            switch (serviceName) {
                case 'AuthService':
                    if (typeof service.init === 'function') {
                        service.init(); // Call init but don't use return value
                    }
                    // Store the actual service object
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                case 'ProjectService':
                    if (typeof service.init === 'function' && !service.isInitialized) {
                        service.init(window.AAAI_APP.services.AuthService, {
                            debug: window.AAAI_APP.debug
                        });
                    }
                    // Store the actual service object
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
                    // Store the actual service object
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                case 'ChatService':
                    if (typeof service.init === 'function' && !service.isInitialized) {
                        service.init(window.AAAI_APP.services.AuthService, {
                            debug: window.AAAI_APP.debug
                        });
                    }
                    // Store the actual service object
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                case 'ChatIntegration':
                    if (typeof service.init === 'function' && !service.isInitialized) {
                        service.init();
                    }
                    // Store the actual service object
                    window.AAAI_APP.services[serviceName] = service;
                    break;
                    
                default:
                    // For any other services, just store them
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
     * Setup global error handling
     */
    function setupGlobalErrorHandling() {
        // Handle uncaught errors
        window.addEventListener('error', (event) => {
            console.error('🚨 Uncaught error:', event.error);
            
            // Check if it's an authentication error
            if (event.error?.message?.includes('authentication') || 
                event.error?.message?.includes('login') ||
                event.error?.message?.includes('Session expired')) {
                handleAuthenticationError();
            }
        });
        
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('🚨 Unhandled promise rejection:', event.reason);
            
            // Check if it's an authentication error
            if (event.reason?.message?.includes('authentication') || 
                event.reason?.message?.includes('login') ||
                event.reason?.message?.includes('Session expired')) {
                handleAuthenticationError();
            }
        });
        
        console.log('🛡️ Global error handling configured');
    }
    
    /**
     * Setup communication between services
     */
    function setupServiceCommunication() {
        // Create event system for service communication
        window.AAAI_EVENTS = new EventTarget();
        
        // Service event handlers
        const eventHandlers = {
            'project:switched': handleProjectSwitch,
            'auth:changed': handleAuthChange,
            'chat:connected': handleChatConnected,
            'navigation:changed': handleNavigationChange
        };
        
        // Register event handlers
        for (const [event, handler] of Object.entries(eventHandlers)) {
            window.AAAI_EVENTS.addEventListener(event, handler);
        }
        
        // Setup service-specific communication
        setupProjectServiceEvents();
        setupAuthServiceEvents();
        setupChatServiceEvents();
        
        console.log('📡 Inter-service communication configured');
    }
    
    /**
     * Setup ProjectService events
     */
    function setupProjectServiceEvents() {
        const projectService = window.AAAI_APP.services.ProjectService;
        if (!projectService) return;
        
        // Listen for project context changes
        if (typeof projectService.onContextChange === 'function') {
            projectService.onContextChange((eventType, data) => {
                window.AAAI_EVENTS.dispatchEvent(new CustomEvent('project:switched', {
                    detail: { eventType, data }
                }));
            });
        }
    }
    
    /**
     * Setup AuthService events
     */
    function setupAuthServiceEvents() {
        const authService = window.AAAI_APP.services.AuthService;
        if (!authService) return;
        
        // Monitor authentication state changes
        let lastAuthState = authService.isAuthenticated();
        let lastAuthReady = authService.isAuthenticationReady ? authService.isAuthenticationReady() : false;
        
        setInterval(() => {
            const currentAuthState = authService.isAuthenticated();
            const currentAuthReady = authService.isAuthenticationReady ? authService.isAuthenticationReady() : false;
            
            if (currentAuthState !== lastAuthState || currentAuthReady !== lastAuthReady) {
                lastAuthState = currentAuthState;
                lastAuthReady = currentAuthReady;
                
                window.AAAI_EVENTS.dispatchEvent(new CustomEvent('auth:changed', {
                    detail: { 
                        authenticated: currentAuthState,
                        authenticationReady: currentAuthReady
                    }
                }));
            }
        }, 5000); // Check every 5 seconds
    }
    
    /**
     * Setup ChatService events
     */
    function setupChatServiceEvents() {
        const chatService = window.AAAI_APP.services.ChatService;
        if (!chatService) return;
        
        // Listen for connection status changes
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
     * Event handlers for service communication
     */
    function handleProjectSwitch(event) {
        console.log('📂 Project switched:', event.detail);
        
        // Update ChatService context
        const chatService = window.AAAI_APP.services.ChatService;
        const projectData = event.detail.data;
        
        if (chatService && projectData?.chat_id && projectData?.project_name) {
            chatService.setProjectContext(projectData.chat_id, projectData.project_name);
        }
    }
    
    function handleAuthChange(event) {
        console.log('🔐 Authentication changed:', event.detail);
        
        if (!event.detail.authenticated) {
            // User logged out, redirect to login
            setTimeout(() => {
                redirectToLogin('Session expired');
            }, 1000);
        } else if (!event.detail.authenticationReady) {
            // Authentication state changed but not ready yet
            console.log('⏳ Authentication state changed, but not ready for API calls');
            window.AAAI_APP.authenticationReady = false;
        } else {
            // Authentication is ready
            console.log('✅ Authentication is now ready for API calls');
            window.AAAI_APP.authenticationReady = true;
        }
    }
    
    function handleChatConnected(event) {
        console.log('💬 Chat connected:', event.detail);
        
        // Sync project context with chat
        const projectService = window.AAAI_APP.services.ProjectService;
        const chatService = window.AAAI_APP.services.ChatService;
        
        if (projectService && chatService) {
            const context = projectService.getContext();
            if (context.chat_id && context.project_name) {
                chatService.setProjectContext(context.chat_id, context.project_name);
            }
        }
    }
    
    function handleNavigationChange(event) {
        console.log('🧭 Navigation changed:', event.detail);
    }
    
    /**
     * Page-specific initialization - NOW WITH AUTH WAITING
     */
    async function initializePageSpecific(pageType) {
        console.log(`🎯 Initializing page-specific features for: ${pageType}`);
        
        switch (pageType) {
            case 'login':
                // Login page doesn't need authenticated services
                break;
                
            case 'project':
                await initializeProjectPage();
                break;
                
            case 'chat':
                await initializeChatPage();
                break;
                
            default:
                console.log('ℹ️ No specific initialization for page type:', pageType);
                break;
        }
    }
    
    /**
     * Initialize project page - WITH AUTH WAITING
     */
    async function initializeProjectPage() {
        const authService = window.AAAI_APP.services.AuthService;
        const projectService = window.AAAI_APP.services.ProjectService;
        
        if (!authService?.isAuthenticated()) {
            redirectToLogin('Authentication required for projects page');
            return;
        }
        
        // NEW: Ensure authentication is ready before making API calls
        if (!window.AAAI_APP.authenticationReady) {
            console.log('⚠️ Authentication not ready for project page initialization');
            return;
        }
        
        // Load current context - NOW SAFE TO MAKE API CALLS
        if (projectService) {
            try {
                console.log('📂 Loading project context...');
                await projectService.getCurrentContext();
                console.log('✅ Project page context loaded');
            } catch (error) {
                console.warn('⚠️ Could not load project context:', error);
                // Don't fail completely, just warn
            }
        }
    }
    
    /**
     * Initialize chat page - WITH AUTH WAITING
     */
    async function initializeChatPage() {
        const authService = window.AAAI_APP.services.AuthService;
        const projectService = window.AAAI_APP.services.ProjectService;
        
        if (!authService?.isAuthenticated()) {
            redirectToLogin('Authentication required for chat page');
            return;
        }
        
        // NEW: Ensure authentication is ready
        if (!window.AAAI_APP.authenticationReady) {
            console.log('⚠️ Authentication not ready for chat page initialization');
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
        
        // Switch to project context - NOW SAFE TO MAKE API CALLS
        if (projectService) {
            try {
                console.log('📂 Loading chat page project context...');
                const projectName = urlParams.get('project_name');
                await projectService.switchToProject(
                    projectId, 
                    projectName ? decodeURIComponent(projectName) : null
                );
                console.log('✅ Chat page project context loaded');
            } catch (error) {
                console.error('❌ Failed to load project context for chat:', error);
                // Redirect to projects page on error
                redirectToLogin('Failed to load project context');
            }
        }
    }
    
    /**
     * Handle initialization errors
     */
    function handleInitializationError(error) {
        console.error('🚨 Initialization failed:', error);
        
        // Show user-friendly error message
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
        
        errorDiv.innerHTML = `
            <div style="text-align: center; max-width: 500px; padding: 20px;">
                <h2 style="color: #e74c3c; margin-bottom: 20px;">Application Error</h2>
                <p style="margin-bottom: 20px;">
                    The application failed to initialize properly. This could be due to:
                </p>
                <ul style="text-align: left; margin-bottom: 30px;">
                    <li>Network connectivity issues</li>
                    <li>Authentication problems</li>
                    <li>Service unavailability</li>
                </ul>
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
                <button onclick="window.location.href='login.html'" style="
                    background: #e74c3c;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 16px;
                ">
                    Go to Login
                </button>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
    }
    
    /**
     * Handle authentication errors
     */
    function handleAuthenticationError() {
        console.warn('🔐 Authentication error detected, redirecting to login');
        
        setTimeout(() => {
            redirectToLogin('Authentication error');
        }, 1000);
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
     * Public API for accessing application state
     */
    window.AAAI_APP.getService = function(serviceName) {
        return window.AAAI_APP.services[serviceName] || null;
    };
    
    window.AAAI_APP.isInitialized = function() {
        return window.AAAI_APP.initialized;
    };
    
    window.AAAI_APP.isAuthenticationReady = function() {
        return window.AAAI_APP.authenticationReady;
    };
    
    window.AAAI_APP.getConfig = function() {
        return window.AAAI_APP.config;
    };

    /**
     * NEW: Wait for authentication to be ready (for external use)
     */
    window.AAAI_APP.waitForAuth = async function(timeoutMs = 15000) {
        if (window.AAAI_APP.authenticationReady) {
            return true;
        }
        
        const authService = window.AAAI_APP.services.AuthService;
        if (!authService) {
            return false;
        }
        
        try {
            const result = await authService.waitForAuthentication(timeoutMs);
            if (result) {
                window.AAAI_APP.authenticationReady = true;
            }
            return result;
        } catch (error) {
            console.error('Error waiting for authentication:', error);
            return false;
        }
    };
    
    // Wait for DOM to be ready, then initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        // DOM is already ready
        setTimeout(initializeApplication, 0);
    }
    
    console.log('🎬 AAAI Application initialization script loaded with Async Auth Support');
    
})();