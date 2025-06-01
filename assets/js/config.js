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

// Get consistent API base URL for all environments
const getAPIBaseURL = () => {
    // Always use Gateway for consistency
    return 'https://aaai-gateway-754x89jf.uc.gateway.dev';
};

// Get WebSocket base URL for all environments
const getWebSocketBaseURL = () => {
    // Always use main domain for consistency with nginx proxy
    return window.location.host || 'aaai.solutions';
};

// Initialize AAAI Configuration
window.AAAI_CONFIG = {
    // Environment Configuration
    ENVIRONMENT: getEnvironment(),
    VERSION: '2.1.0',
    
    // Consistent URL Configuration
    API_BASE_URL: getAPIBaseURL(),
    WEBSOCKET_BASE_URL: getWebSocketBaseURL(),
    
    // Feature Flags
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: getEnvironment() !== 'production',
    ENABLE_COMPRESSION: false,
    ENABLE_BATCHING: false,
    ENABLE_CACHING: true,
    ENABLE_PERSISTENCE: true,
    ENABLE_GATEWAY_ROUTING: true,
    
    // WebSocket Configuration
    WS_CONFIG: {
        // Connection Settings
        RECONNECT_INTERVAL: 5000,        // 5 seconds base interval
        MAX_RECONNECT_ATTEMPTS: 8,       // Maximum reconnection attempts
        CONNECTION_TIMEOUT: 15000,       // 15 seconds connection timeout
        HEARTBEAT_INTERVAL: 45000,       // 45 seconds heartbeat
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
        JITTER_RANGE: 2000,             // 0-2 seconds random jitter
        
        // JWT Specific Settings
        JWT_BEARER_AUTH: true,          // Use JWT Bearer tokens for WebSocket
        JWT_REFRESH_ON_CONNECT: true,   // Refresh token before WebSocket connection
        JWT_PROTOCOLS: true             // Use WebSocket subprotocols for JWT
    },
    
    // Authentication Configuration
    AUTH_CONFIG: {
        TOKEN_REFRESH_THRESHOLD: 300000,  // 5 minutes before expiry
        SESSION_CHECK_INTERVAL: 30000,    // 30 seconds
        AUTO_REFRESH: true,
        PERSIST_SESSION: true,
        JWT_BEARER_ONLY: true,            // Only use Bearer tokens
        GATEWAY_AUTH: true                // Route auth through gateway
    },
    
    // Development Configuration
    DEV_CONFIG: {
        MOCK_WEBSOCKET: false,
        VERBOSE_LOGGING: false,
        PERFORMANCE_MONITORING: true,
        ERROR_SIMULATION: false,
        GATEWAY_BYPASS: false             // Never bypass gateway
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
        gracefulReconnect: window.AAAI_CONFIG.WS_CONFIG.GRACEFUL_RECONNECT,
        gatewayRouting: window.AAAI_CONFIG.ENABLE_GATEWAY_ROUTING,
        jwtBearerAuth: window.AAAI_CONFIG.WS_CONFIG.JWT_BEARER_AUTH,
        jwtRefreshOnConnect: window.AAAI_CONFIG.WS_CONFIG.JWT_REFRESH_ON_CONNECT,
        jwtProtocols: window.AAAI_CONFIG.WS_CONFIG.JWT_PROTOCOLS
    };
};

// Enhanced URL helpers
window.getAPIURL = function(endpoint) {
    const baseURL = window.AAAI_CONFIG.API_BASE_URL;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseURL}${cleanEndpoint}`;
};

window.getWebSocketURL = function(endpoint, params = {}) {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'wss:'; // Always use secure WebSocket
    const baseURL = window.AAAI_CONFIG.WEBSOCKET_BASE_URL;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    const url = new URL(`${wsProtocol}//${baseURL}${cleanEndpoint}`);
    
    // Add query parameters
    Object.keys(params).forEach(key => {
        if (params[key] !== null && params[key] !== undefined) {
            url.searchParams.set(key, params[key]);
        }
    });
    
    return url.toString();
};

// Log configuration loaded
window.AAAI_LOGGER.info('AAAI Configuration loaded with Gateway routing', {
    environment: window.AAAI_CONFIG.ENVIRONMENT,
    version: window.AAAI_CONFIG.VERSION,
    apiBaseURL: window.AAAI_CONFIG.API_BASE_URL,
    websocketBaseURL: window.AAAI_CONFIG.WEBSOCKET_BASE_URL,
    websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
    debugEnabled: window.AAAI_CONFIG.ENABLE_DEBUG,
    gatewayRouting: window.AAAI_CONFIG.ENABLE_GATEWAY_ROUTING
});

// Freeze configuration
Object.freeze(window.AAAI_CONFIG);
Object.freeze(window.AAAI_LOGGER);