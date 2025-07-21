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

// Get consistent API base URL for all environments with nginx proxy support
const getAPIBaseURL = () => {
    const environment = getEnvironment();
    
    if (environment === 'development') {
        return 'http://localhost:8080'; // Local development
    } else {
        // UPDATED: Use same domain - nginx will proxy to gateway
        return window.location.origin; // https://aaai.solutions
    }
};

// Get WebSocket base URL for all environments
const getWebSocketBaseURL = () => {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'localhost:3000';
    } else {
        return hostname; // aaai.solutions (nginx will handle WebSocket proxying)
    }
};

// Initialize AAAI Configuration
window.AAAI_CONFIG = {
    // Environment Configuration
    ENVIRONMENT: getEnvironment(),
    VERSION: '2.1.0',
    
    // UPDATED: API and WebSocket via same domain (nginx proxy)
    API_BASE_URL: getAPIBaseURL(),
    WEBSOCKET_BASE_URL: getWebSocketBaseURL(),
    
    // Feature Flags
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: getEnvironment() !== 'production',
    ENABLE_COMPRESSION: false,
    ENABLE_BATCHING: false,
    ENABLE_CACHING: true,
    ENABLE_PERSISTENCE: true,
    ENABLE_GATEWAY_ROUTING: true, // Still true - just proxied through nginx
    
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
        JWT_PROTOCOLS: false,           // Don't use WebSocket subprotocols (nginx handles routing)
        GATEWAY_WEBSOCKET: true         // WebSocket via nginx proxy to gateway
    },
    
    // Authentication Configuration
    AUTH_CONFIG: {
        TOKEN_REFRESH_THRESHOLD: 300000,  // 5 minutes before expiry
        SESSION_CHECK_INTERVAL: 30000,    // 30 seconds
        AUTO_REFRESH: true,
        PERSIST_SESSION: true,
        JWT_BEARER_ONLY: true,            // Only use Bearer tokens
        GATEWAY_AUTH: true,               // Route auth through nginx proxy to gateway
        WEBSOCKET_VIA_GATEWAY: true       // WebSocket authentication via nginx proxy
    },
    
    // Development Configuration
    DEV_CONFIG: {
        MOCK_WEBSOCKET: false,
        VERBOSE_LOGGING: false,
        PERFORMANCE_MONITORING: true,
        ERROR_SIMULATION: false,
        GATEWAY_BYPASS: false,            // Never bypass nginx proxy
        GATEWAY_WEBSOCKET_DEBUG: getEnvironment() !== 'production',
        NGINX_PROXY_MODE: getEnvironment() === 'production' // Flag to indicate nginx proxy usage
    }
};

// Initialize Logger with enhanced error handling
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
        gatewayWebSocket: window.AAAI_CONFIG.WS_CONFIG.GATEWAY_WEBSOCKET
    };
};

// Enhanced URL helpers for nginx proxy setup
window.getAPIURL = function(endpoint) {
    try {
        const baseURL = window.AAAI_CONFIG.API_BASE_URL;
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${baseURL}${cleanEndpoint}`;
    } catch (error) {
        console.error('Error constructing API URL:', error);
        // Fallback to same domain (nginx proxy)
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
        return `${window.location.origin}${cleanEndpoint}`;
    }
};

window.getWebSocketURL = function(endpoint, params = {}) {
    try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
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
    } catch (error) {
        console.error('Error constructing WebSocket URL:', error);
        return `wss://${window.location.hostname}${endpoint}`;
    }
};

// Log configuration loaded
window.AAAI_LOGGER.info('AAAI Configuration loaded for nginx proxy setup', {
    environment: window.AAAI_CONFIG.ENVIRONMENT,
    version: window.AAAI_CONFIG.VERSION,
    apiBaseURL: window.AAAI_CONFIG.API_BASE_URL,
    websocketBaseURL: window.AAAI_CONFIG.WEBSOCKET_BASE_URL,
    websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
    debugEnabled: window.AAAI_CONFIG.ENABLE_DEBUG,
    gatewayRouting: 'via nginx proxy',
    nginxProxyMode: window.AAAI_CONFIG.DEV_CONFIG.NGINX_PROXY_MODE
});

// Freeze configuration
Object.freeze(window.AAAI_CONFIG);
Object.freeze(window.AAAI_LOGGER);