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
        API_BASE_URL: 'http://localhost:8080/api',
        WS_BASE_URL: 'ws://localhost:8080/ws',
        DEBUG: true,
        LOG_LEVEL: 'debug'
    },
    
    staging: {
        API_BASE_URL: '/api',
        WS_BASE_URL: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
        DEBUG: true,
        LOG_LEVEL: 'info'
    },
    
    production: {
        API_BASE_URL: '/api',
        WS_BASE_URL: `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`,
        DEBUG: false,
        LOG_LEVEL: 'error'
    }
};

// Get current environment
const currentEnv = getEnvironment();
const config = environments[currentEnv];

// Global configuration object
// Initialize AAAI Configuration
window.AAAI_CONFIG = {
    // Environment Configuration
    ENVIRONMENT: 'production', // or 'development' for local testing
    VERSION: '2.1.0',
    
    // API Configuration
    API_BASE_URL: 'https://aaai-gateway-754x89jf.uc.gateway.dev',
    WS_BASE_URL: 'wss://api-server-559730737995.us-central1.run.app',
    
    // Feature Flags
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: false, // Set to true for development
    ENABLE_COMPRESSION: false, // Disabled for stability
    ENABLE_BATCHING: false, // Disabled to prevent empty message errors
    ENABLE_CACHING: true,
    ENABLE_PERSISTENCE: true,
    
    // WebSocket Configuration
    WS_CONFIG: {
        // Connection Settings
        RECONNECT_INTERVAL: 5000,        // 5 seconds base interval
        MAX_RECONNECT_ATTEMPTS: 8,       // Maximum reconnection attempts
        CONNECTION_TIMEOUT: 10000,       // 10 seconds connection timeout
        HEARTBEAT_INTERVAL: 45000,       // 45 seconds heartbeat (increased)
        MAX_CONNECTION_AGE: 3600000,     // 1 hour maximum connection age
        
        // Message Queue Settings
        MESSAGE_QUEUE_LIMIT: 50,         // Maximum queued messages
        QUEUE_TIMEOUT: 30000,           // 30 seconds to flush queue
        
        // Performance Settings
        CACHE_EXPIRY: 1800000,          // 30 minutes cache expiry
        MAX_CACHE_SIZE: 500,            // Maximum cache entries
        HISTORY_LIMIT: 30,              // Message history limit
        
        // Retry Settings
        RETRY_ON_ERROR: true,
        GRACEFUL_RECONNECT: true,
        BACKOFF_MULTIPLIER: 1.5,        // Exponential backoff multiplier
        MAX_BACKOFF_DELAY: 30000,       // Maximum 30 seconds delay
        JITTER_RANGE: 2000              // 0-2 seconds random jitter
    },
    
    // Authentication Configuration
    AUTH_CONFIG: {
        TOKEN_REFRESH_THRESHOLD: 300000,  // 5 minutes before expiry
        SESSION_CHECK_INTERVAL: 30000,    // 30 seconds
        AUTO_REFRESH: true,
        PERSIST_SESSION: true
    },
    
    // Development Configuration
    DEV_CONFIG: {
        MOCK_WEBSOCKET: false,
        VERBOSE_LOGGING: false,
        PERFORMANCE_MONITORING: true,
        ERROR_SIMULATION: false
    }
};

// Validation
const validateConfig = () => {
    const required = ['API_BASE_URL', 'WS_BASE_URL'];
    const missing = required.filter(key => !window.AAAI_CONFIG[key]);
    
    if (missing.length > 0) {
        console.error('Missing required configuration:', missing);
        throw new Error(`Configuration error: Missing ${missing.join(', ')}`);
    }
};

// Initialize Logger
window.AAAI_LOGGER = {
    debug: function(...args) {
        if (window.AAAI_CONFIG.ENABLE_DEBUG) {
            console.log('[DEBUG]', new Date().toISOString(), ...args);
        }
    },
    
    info: function(...args) {
        console.info('[INFO]', new Date().toISOString(), ...args);
    },
    
    warn: function(...args) {
        console.warn('[WARN]', new Date().toISOString(), ...args);
    },
    
    error: function(...args) {
        console.error('[ERROR]', new Date().toISOString(), ...args);
        
        // Optional: Send errors to monitoring service
        if (window.AAAI_CONFIG.ENVIRONMENT === 'production') {
            // You could send errors to a monitoring service here
        }
    }
};

// Environment-specific overrides
if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
    // Development overrides
    window.AAAI_CONFIG.ENABLE_DEBUG = true;
    window.AAAI_CONFIG.API_BASE_URL = 'http://localhost:8080';
    window.AAAI_CONFIG.WS_BASE_URL = 'ws://localhost:8080';
    window.AAAI_CONFIG.WS_CONFIG.HEARTBEAT_INTERVAL = 30000; // Shorter for development
    window.AAAI_CONFIG.WS_CONFIG.RECONNECT_INTERVAL = 3000;  // Faster reconnection in dev
    window.AAAI_CONFIG.DEV_CONFIG.VERBOSE_LOGGING = true;
    
    window.AAAI_LOGGER.info('Development mode enabled with local API endpoints');
}

// Initialize chat service configuration helper
window.getChatServiceConfig = function() {
    return {
        reconnectInterval: window.AAAI_CONFIG.WS_CONFIG.RECONNECT_INTERVAL,
        maxReconnectAttempts: window.AAAI_CONFIG.WS_CONFIG.MAX_RECONNECT_ATTEMPTS,
        heartbeatInterval: window.AAAI_CONFIG.WS_CONFIG.HEARTBEAT_INTERVAL,
        connectionTimeout: window.AAAI_CONFIG.WS_CONFIG.CONNECTION_TIMEOUT,
        maxConnectionAge: window.AAAI_CONFIG.WS_CONFIG.MAX_CONNECTION_AGE,
        messageQueueLimit: window.AAAI_CONFIG.WS_CONFIG.MESSAGE_QUEUE_LIMIT,
        persistentConnection: window.AAAI_CONFIG.ENABLE_PERSISTENCE,
        debug: window.AAAI_CONFIG.ENABLE_DEBUG,
        cacheExpiry: window.AAAI_CONFIG.WS_CONFIG.CACHE_EXPIRY,
        maxCacheSize: window.AAAI_CONFIG.WS_CONFIG.MAX_CACHE_SIZE,
        enableCompression: window.AAAI_CONFIG.ENABLE_COMPRESSION,
        enableBatching: window.AAAI_CONFIG.ENABLE_BATCHING,
        retryOnError: window.AAAI_CONFIG.WS_CONFIG.RETRY_ON_ERROR,
        gracefulReconnect: window.AAAI_CONFIG.WS_CONFIG.GRACEFUL_RECONNECT
    };
};

// Log configuration loaded
window.AAAI_LOGGER.info('AAAI Configuration loaded', {
    environment: window.AAAI_CONFIG.ENVIRONMENT,
    version: window.AAAI_CONFIG.VERSION,
    websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
    debugEnabled: window.AAAI_CONFIG.ENABLE_DEBUG
});

// Initialize
try {
    validateConfig();
    window.AAAI_LOGGER.info('Configuration loaded:', window.AAAI_CONFIG);
} catch (error) {
    console.error('Configuration failed:', error);
}

// Freeze configuration
Object.freeze(window.AAAI_CONFIG);
Object.freeze(window.AAAI_LOGGER);