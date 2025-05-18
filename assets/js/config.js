/**
 * AAAI Solutions Configuration
 * Environment-based configuration for different deployment environments
 */

// Detect environment based on hostname
const getEnvironment = () => {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
    } else if (hostname.includes('staging') || hostname.includes('dev')) {
        return 'staging';
    } else {
        return 'production';
    }
};

// Environment-specific configurations
const environments = {
    development: {
        API_BASE_URL: 'http://localhost:8080',
        WS_BASE_URL: 'ws://localhost:8080',
        DEBUG: true,
        LOG_LEVEL: 'debug'
    },
    
    staging: {
        API_BASE_URL: 'https://aaai-gateway-754x89jf.uc.gateway.dev',
        WS_BASE_URL: 'wss://staging.aaai.solutions',
        DEBUG: true,
        LOG_LEVEL: 'info'
    },
    
    production: {
        API_BASE_URL: 'https://aaai-gateway-754x89jf.uc.gateway.dev',
        WS_BASE_URL: 'wss://aaai.solutions',
        DEBUG: false,
        LOG_LEVEL: 'error'
    }
};

// Get current environment
const currentEnv = getEnvironment();
const config = environments[currentEnv];

// Global configuration object
window.AAAI_CONFIG = {
    // Environment
    ENVIRONMENT: currentEnv,
    
    // API Configuration
    API_BASE_URL: config.API_BASE_URL,
    WS_BASE_URL: config.WS_BASE_URL,
    
    // Feature Flags
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: config.DEBUG,
    ENABLE_ANALYTICS: currentEnv === 'production',
    ENABLE_ERROR_REPORTING: currentEnv !== 'development',
    
    // Logging
    LOG_LEVEL: config.LOG_LEVEL,
    
    // WebSocket Configuration
    WS_RECONNECT_INTERVAL: 3000,
    WS_MAX_RECONNECT_ATTEMPTS: 5,
    WS_HEARTBEAT_INTERVAL: 30000,
    
    // Rate Limiting
    RATE_LIMIT_REQUESTS: 60,
    RATE_LIMIT_WINDOW: 60000, // 1 minute
    
    // Timeouts
    API_TIMEOUT: 30000, // 30 seconds
    WS_TIMEOUT: 5000,   // 5 seconds
    
    // Security
    CSRF_ENABLED: true,
    TOKEN_REFRESH_THRESHOLD: 300, // 5 minutes before expiry
    
    // UI Configuration
    CHAT_MESSAGE_LIMIT: 100,
    CHAT_HISTORY_DAYS: 30,
    
    // Version information
    VERSION: '1.0.0',
    BUILD_DATE: new Date().toISOString()
};

// Configuration validation
const validateConfig = () => {
    const required = ['API_BASE_URL', 'WS_BASE_URL'];
    const missing = required.filter(key => !window.AAAI_CONFIG[key]);
    
    if (missing.length > 0) {
        console.error('Missing required configuration:', missing);
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }
    
    // Validate URLs
    try {
        new URL(window.AAAI_CONFIG.API_BASE_URL);
        new URL(window.AAAI_CONFIG.WS_BASE_URL);
    } catch (error) {
        console.error('Invalid URL in configuration:', error);
        throw new Error('Configuration error: Invalid URL format');
    }
};

// Logger utility based on configuration
window.AAAI_LOGGER = {
    debug: (...args) => {
        if (window.AAAI_CONFIG.LOG_LEVEL === 'debug' && window.AAAI_CONFIG.ENABLE_DEBUG) {
            console.log('[DEBUG]', ...args);
        }
    },
    info: (...args) => {
        if (['debug', 'info'].includes(window.AAAI_CONFIG.LOG_LEVEL)) {
            console.info('[INFO]', ...args);
        }
    },
    warn: (...args) => {
        if (['debug', 'info', 'warn'].includes(window.AAAI_CONFIG.LOG_LEVEL)) {
            console.warn('[WARN]', ...args);
        }
    },
    error: (...args) => {
        console.error('[ERROR]', ...args);
        
        // Send to error reporting service in production
        if (window.AAAI_CONFIG.ENABLE_ERROR_REPORTING) {
            // Implement error reporting here
            // Example: Send to Sentry, LogRocket, etc.
        }
    }
};

// Initialize configuration
try {
    validateConfig();
    window.AAAI_LOGGER.info('Configuration loaded successfully:', {
        environment: window.AAAI_CONFIG.ENVIRONMENT,
        version: window.AAAI_CONFIG.VERSION,
        debug: window.AAAI_CONFIG.ENABLE_DEBUG
    });
} catch (error) {
    console.error('Failed to initialize configuration:', error);
    throw error;
}

// Freeze configuration to prevent modification
Object.freeze(window.AAAI_CONFIG);
Object.freeze(window.AAAI_LOGGER);