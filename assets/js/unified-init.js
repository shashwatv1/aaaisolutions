/**
 * FIXED: Simplified Unified Application Initialization for AAAI Solutions
 * Removed competing authentication logic to prevent race conditions
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
     * FIXED: Fast initialization WITHOUT authentication handling
     */
    async function initializeApplication() {
        try {
            console.log('🚀 Fast AAAI Solutions initialization starting...');
            
            // Quick environment setup
            initializeEnvironmentFast();
            
            // Get current page type quickly
            const currentPage = getCurrentPageTypeFast();
            console.log('📄 Page type:', currentPage);
            
            // FIXED: NO authentication handling here - let pages handle their own auth
            // This prevents race conditions and competing initialization
            
            // Initialize core services only (without auth dependency)
            await initializeCoreServicesSimplified();
            
            // Page-specific setup (non-blocking)
            initializePageSpecificFast(currentPage);
            
            window.AAAI_APP.initialized = true;
            
            console.log('✅ Fast AAAI initialization completed - ready for page coordination');
            
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
     * FIXED: Simplified core services initialization without auth dependency
     */
    async function initializeCoreServicesSimplified() {
        console.log('🔧 Simplified core services initialization...');
        
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
                
                console.log(`🔧 Setting up ${serviceName}...`);
                
                let service = window[serviceName];
                
                switch (serviceName) {
                    case 'AuthService':
                        // FIXED: Don't initialize AuthService here - let pages handle it
                        // Just register it for coordination
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'ProjectService':
                        // FIXED: Don't initialize without auth - let project page handle it
                        window.AAAI_APP.services[serviceName] = service;
                        break;
                        
                    case 'NavigationManager':
                        // FIXED: Don't initialize without auth - let project page handle it
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
                
                console.log(`✅ ${serviceName} registered successfully`);
                
            } catch (error) {
                console.error(`❌ Failed to register ${serviceName}:`, error);
                // Continue with other services
            }
        }
        
        console.log('✅ Core services registered for coordination');
    }
        
    /**
     * FIXED: Page-specific setup without authentication
     */
    function initializePageSpecificFast(pageType) {
        console.log(`🎯 Fast page-specific setup for: ${pageType}`);
        
        // Use setTimeout to make it non-blocking
        setTimeout(() => {
            switch (pageType) {
                case 'project':
                    setupProjectPageEnvironment();
                    break;
                    
                case 'chat':
                    setupChatPageEnvironment();
                    break;
                    
                case 'login':
                    setupLoginPageEnvironment();
                    break;
                    
                default:
                    console.log('ℹ️ No specific setup needed');
                    break;
            }
        }, 0);
    }
    
    /**
     * FIXED: Project page environment setup (no auth handling)
     */
    function setupProjectPageEnvironment() {
        try {
            console.log('📂 Project page environment setup...');
            
            // Set up environment indicators
            setupEnvironmentIndicators();
            
            // Prepare for welcome message if needed
            prepareWelcomeState();
            
            console.log('✅ Project page environment ready');
            
        } catch (error) {
            console.error('❌ Project page environment setup failed:', error);
        }
    }
    
    /**
     * FIXED: Chat page environment setup (no auth handling)
     */
    function setupChatPageEnvironment() {
        try {
            console.log('💬 Chat page environment setup');
            
            // Set up environment indicators
            setupEnvironmentIndicators();
            
            // Get project context from URL for later use
            const urlParams = new URLSearchParams(window.location.search);
            const projectId = urlParams.get('project');
            const projectName = urlParams.get('project_name');
            
            if (projectId) {
                window.AAAI_APP.urlContext = {
                    projectId: projectId,
                    projectName: projectName ? decodeURIComponent(projectName) : null
                };
                console.log('📋 URL context prepared:', window.AAAI_APP.urlContext);
            }
            
            console.log('✅ Chat page environment ready');
            
        } catch (error) {
            console.error('❌ Chat page environment setup failed:', error);
        }
    }
    
    /**
     * FIXED: Login page environment setup
     */
    function setupLoginPageEnvironment() {
        try {
            console.log('🔐 Login page environment setup');
            
            // Set up environment indicators
            setupEnvironmentIndicators();
            
            console.log('✅ Login page environment ready');
            
        } catch (error) {
            console.error('❌ Login page environment setup failed:', error);
        }
    }
    
    /**
     * Setup environment indicators
     */
    function setupEnvironmentIndicators() {
        try {
            const envIndicator = document.getElementById('envIndicator');
            const envText = document.getElementById('envText');
            
            if (window.AAAI_CONFIG?.ENVIRONMENT && envIndicator && envText) {
                const environment = window.AAAI_CONFIG.ENVIRONMENT;
                envText.textContent = environment.toUpperCase();
                envIndicator.style.display = environment !== 'production' ? 'block' : 'none';
                
                if (environment === 'development') {
                    envIndicator.style.backgroundColor = '#28a745';
                } else if (environment === 'staging') {
                    envIndicator.style.backgroundColor = '#ffc107';
                }
            }
        } catch (error) {
            console.warn('⚠️ Environment indicator setup failed:', error);
        }
    }
    
    /**
     * Prepare welcome state for new users
     */
    function prepareWelcomeState() {
        // Helper function for pages to use
        window.showWelcomeMessage = function() {
            const projectsGrid = document.getElementById('projectsGrid');
            if (projectsGrid) {
                projectsGrid.innerHTML = `
                    <div class="welcome-state" style="text-align: center; padding: 40px; color: #fff;">
                        <h3>👋 Welcome to AAAI Solutions!</h3>
                        <p>You don't have any projects yet. Create your first project to get started.</p>
                        <button class="btn btn-primary" onclick="document.getElementById('newProjectBtn').click()" style="padding: 10px 20px; background: #007acc; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Create Your First Project
                        </button>
                    </div>
                `;
            }
        };
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
     * FIXED: Public API for coordination (no auth handling)
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
    
    /**
     * FIXED: Wait for app to be ready (removed auth dependency)
     */
    window.AAAI_APP.waitForReady = async function() {
        return new Promise((resolve) => {
            const checkReady = () => {
                if (window.AAAI_APP.initialized) {
                    resolve(true);
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            checkReady();
        });
    };
    
    /**
     * FIXED: Helper for pages to coordinate authentication
     */
    window.AAAI_APP.markAuthReady = function() {
        window.AAAI_APP.authReady = true;
        console.log('🔐 Auth marked as ready by page');
    };
    
    window.AAAI_APP.isAuthReady = function() {
        return window.AAAI_APP.authReady;
    };
    
    /**
     * FIXED: Helper for pages to wait for both app and auth
     */
    window.AAAI_APP.waitForAuthReady = async function() {
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
    
    console.log('🎬 FIXED AAAI initialization script loaded - no competing auth logic');
    
})();