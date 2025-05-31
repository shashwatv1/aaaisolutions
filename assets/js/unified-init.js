/**
 * Unified Application Initialization Script for AAAI Solutions
 * Ensures proper service loading order and handles dependencies
 * Place this script after all service scripts but before page-specific scripts
 */

(function() {
    'use strict';
    
    // Global application state
    window.AAAI_APP = {
        initialized: false,
        services: {},
        config: window.AAAI_CONFIG || {},
        debug: false
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
     * Initialize the unified application
     */
    async function initializeApplication() {
        try {
            console.log('🚀 AAAI Solutions - Unified Application Initialization');
            
            // Set debug mode
            window.AAAI_APP.debug = window.AAAI_CONFIG?.ENABLE_DEBUG || false;
            
            // Initialize environment
            initializeEnvironment();
            
            // Check if we're on a page that requires authentication
            const currentPage = getCurrentPageType();
            console.log('📄 Current page type:', currentPage);
            
            // Enhanced authentication handling for different page types
            const authResult = await handlePageAuthentication(currentPage);
            if (!authResult.success) {
                return; // Page will handle redirect
            }
            
            // Initialize services in correct order
            await initializeServicesInOrder();
            
            // Setup global error handling
            setupGlobalErrorHandling();
            
            // Setup cross-service communication
            setupServiceCommunication();
            
            // Page-specific initialization
            await initializePageSpecific(currentPage);
            
            window.AAAI_APP.initialized = true;
            
            console.log('✅ AAAI Solutions application initialized successfully');
            console.log('🔍 Available services:', Object.keys(window.AAAI_APP.services));
            
            // Notify page scripts that initialization is complete
            document.dispatchEvent(new CustomEvent('aaai:initialized', {
                detail: { 
                    services: window.AAAI_APP.services,
                    config: window.AAAI_APP.config
                }
            }));
            
        } catch (error) {
            console.error('❌ Failed to initialize AAAI application:', error);
            handleInitializationError(error);
        }
    }
    
    /**
     * Enhanced authentication handling for different page types
     */
    async function handlePageAuthentication(pageType) {
        console.log('🔐 Handling page authentication for:', pageType);
        
        try {
            // Initialize AuthService first
            if (!window.AuthService) {
                throw new Error('AuthService not available');
            }
            
            // Initialize AuthService
            const authInitResult = window.AuthService.init();
            console.log('🔐 AuthService initialization result:', authInitResult);
            
            // Handle based on page type
            switch (pageType) {
                case 'login':
                    // Login page - check if already authenticated
                    if (authInitResult) {
                        console.log('🔐 Already authenticated, redirecting to projects...');
                        window.location.href = 'project.html';
                        return { success: false, redirect: true };
                    }
                    return { success: true, authenticated: false };
                    
                case 'project':
                case 'chat':
                    // Protected pages - require authentication
                    if (!authInitResult) {
                        console.log('🔐 Authentication required, attempting validation...');
                        
                        // Try session validation with timeout
                        const validationResult = await checkAuthenticationWithTimeout(window.AuthService, 3000);
                        if (!validationResult) {
                            console.log('🔐 Authentication validation failed, redirecting to login...');
                            window.location.href = 'login.html';
                            return { success: false, redirect: true };
                        }
                    }
                    
                    // Verify user information is complete
                    const user = window.AuthService.getCurrentUser();
                    if (!user || !user.email || !user.id) {
                        console.error('🔐 Incomplete user information:', user);
                        window.location.href = 'login.html';
                        return { success: false, redirect: true };
                    }
                    
                    return { success: true, authenticated: true, user: user };
                    
                default:
                    // Public pages - no authentication required
                    return { success: true, authenticated: authInitResult };
            }
            
        } catch (error) {
            console.error('🔐 Authentication handling error:', error);
            
            if (pageType === 'project' || pageType === 'chat') {
                window.location.href = 'login.html';
                return { success: false, redirect: true };
            }
            
            return { success: true, authenticated: false };
        }
    }
    
    /**
     * Check authentication with timeout and retries
     */
    async function checkAuthenticationWithTimeout(authService, timeout = 3000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                // Check if basic authentication is present
                if (authService.isAuthenticated()) {
                    const user = authService.getCurrentUser();
                    if (user && user.email && user.id) {
                        console.log('✅ Authentication confirmed:', user.email);
                        return true;
                    }
                }
                
                // Check if we have persistent session data
                if (authService.hasPersistentSession()) {
                    console.log('🔍 Persistent session found, attempting validation...');
                    
                    // Try a quick token refresh
                    try {
                        const refreshResult = await Promise.race([
                            authService.refreshTokenIfNeeded(),
                            new Promise((_, reject) => 
                                setTimeout(() => reject(new Error('Timeout')), 2000)
                            )
                        ]);
                        
                        if (refreshResult && authService.isAuthenticated()) {
                            console.log('✅ Authentication restored via token refresh');
                            return true;
                        }
                    } catch (refreshError) {
                        console.warn('⚠️ Token refresh failed or timed out:', refreshError.message);
                    }
                }
                
                // Short wait before next check
                await new Promise(resolve => setTimeout(resolve, 200));
                
            } catch (error) {
                console.error('❌ Authentication check error:', error);
                break;
            }
        }
        
        console.log('❌ Authentication check timeout or failed');
        return false;
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
                    // AuthService should already be initialized by handlePageAuthentication
                    // Just store the reference
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
                event.error?.message?.includes('login')) {
                handleAuthenticationError();
            }
        });
        
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('🚨 Unhandled promise rejection:', event.reason);
            
            // Check if it's an authentication error
            if (event.reason?.message?.includes('authentication') || 
                event.reason?.message?.includes('login')) {
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
        
        setInterval(() => {
            const currentAuthState = authService.isAuthenticated();
            if (currentAuthState !== lastAuthState) {
                lastAuthState = currentAuthState;
                window.AAAI_EVENTS.dispatchEvent(new CustomEvent('auth:changed', {
                    detail: { authenticated: currentAuthState }
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
                if (window.AAAI_APP.services.NavigationManager) {
                    window.AAAI_APP.services.NavigationManager.goToLogin('Session expired');
                } else {
                    window.location.href = 'login.html';
                }
            }, 1000);
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
     * Page-specific initialization
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
     * Initialize project page with enhanced authentication handling
     */
    async function initializeProjectPage() {
        try {
            console.log('📂 Initializing project page...');
            
            const authService = window.AAAI_APP.services.AuthService;
            const projectService = window.AAAI_APP.services.ProjectService;
            
            // Enhanced authentication check
            if (!authService) {
                console.error('❌ AuthService not available');
                throw new Error('AuthService not available');
            }
            
            // Check authentication with timeout
            const isAuthenticated = await checkAuthenticationWithTimeout(authService, 3000);
            if (!isAuthenticated) {
                console.log('❌ Authentication check failed, redirecting to login');
                if (window.AAAI_APP.services.NavigationManager) {
                    window.AAAI_APP.services.NavigationManager.goToLogin('Authentication required');
                } else {
                    window.location.href = 'login.html';
                }
                return;
            }
            
            console.log('✅ Project page authentication confirmed');
            
            // Load current context (non-blocking)
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
            console.error('❌ Project page initialization failed:', error);
            throw error;
        }
    }
    
    /**
     * Initialize chat page
     */
    async function initializeChatPage() {
        const authService = window.AAAI_APP.services.AuthService;
        const projectService = window.AAAI_APP.services.ProjectService;
        
        if (!authService?.isAuthenticated()) {
            if (window.AAAI_APP.services.NavigationManager) {
                window.AAAI_APP.services.NavigationManager.goToLogin();
            } else {
                window.location.href = 'login.html';
            }
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
                console.log('✅ Chat page project context loaded');
            } catch (error) {
                console.error('❌ Failed to load project context for chat:', error);
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
                ">
                    Refresh Page
                </button>
            </div>
        `;
        
        document.body.appendChild(errorDiv);
    }
    
    /**
     * Handle authentication errors with user-friendly messages
     */
    function handleAuthenticationError() {
        console.warn('🔐 Authentication error detected, handling gracefully...');
        
        // Clear any invalid authentication state
        if (window.AAAI_APP.services.AuthService) {
            // Don't clear everything immediately - might be temporary
            setTimeout(() => {
                if (window.AAAI_APP.services.AuthService && 
                    !window.AAAI_APP.services.AuthService.isAuthenticated() &&
                    !window.AAAI_APP.services.AuthService.hasPersistentSession()) {
                    
                    console.log('🔐 Clearing invalid authentication state');
                    window.AAAI_APP.services.AuthService.clearAuthData();
                    
                    // Redirect to login
                    if (window.AAAI_APP.services.NavigationManager) {
                        window.AAAI_APP.services.NavigationManager.goToLogin('Session expired');
                    } else {
                        window.location.href = 'login.html';
                    }
                }
            }, 2000); // Give some time for recovery
        } else {
            // Immediate redirect if no auth service
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
        }
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
    
    window.AAAI_APP.getConfig = function() {
        return window.AAAI_APP.config;
    };
    
    // Wait for DOM to be ready, then initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeApplication);
    } else {
        // DOM is already ready
        setTimeout(initializeApplication, 0);
    }
    
    console.log('🎬 AAAI Application initialization script loaded');
    
})();