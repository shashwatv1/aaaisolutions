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

// Initialize AAAI Configuration
window.AAAI_CONFIG = {
    // Environment Configuration
    ENVIRONMENT: getEnvironment(),
    VERSION: '2.1.0',
    
    // Feature Flags
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: getEnvironment() !== 'production',
    ENABLE_COMPRESSION: false,
    ENABLE_BATCHING: false,
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

// Freeze configuration
Object.freeze(window.AAAI_CONFIG);
Object.freeze(window.AAAI_LOGGER);