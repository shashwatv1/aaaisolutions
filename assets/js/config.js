/**
 * Simplified AAAI Solutions Configuration
 * Single source of truth for all application settings
 */

// Detect environment
const getEnvironment = () => {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'development';
    } else if (hostname.includes('staging') || hostname.includes('dev')) {
        return 'staging';
    }
    return 'production';
};

// Initialize global configuration
window.AAAI_CONFIG = {
    // Environment
    ENVIRONMENT: getEnvironment(),
    VERSION: '2.1.0',
    
    // API Configuration
    API_BASE_URL: getEnvironment() === 'development' 
        ? 'http://localhost:8080' 
        : 'https://aaai-gateway-754x89jf.uc.gateway.dev',
    
    WS_BASE_URL: getEnvironment() === 'development'
        ? 'ws://localhost:8080'
        : 'wss://api-server-559730737995.us-central1.run.app',
    
    // Feature Flags
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: getEnvironment() !== 'production',
    
    // Timeouts and Intervals
    REQUEST_TIMEOUT: 30000,           // 30 seconds
    TOKEN_REFRESH_THRESHOLD: 300000,  // 5 minutes
    SESSION_CHECK_INTERVAL: 60000,    // 1 minute
    
    // WebSocket Settings
    WS_RECONNECT_INTERVAL: 5000,      // 5 seconds
    WS_MAX_RECONNECT_ATTEMPTS: 5,     // 5 attempts
    WS_HEARTBEAT_INTERVAL: 30000,     // 30 seconds
    WS_CONNECTION_TIMEOUT: 10000,     // 10 seconds
    WS_MESSAGE_QUEUE_LIMIT: 20        // 20 messages
};

// Initialize global logger
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
        
        // In production, you could send errors to a monitoring service
        if (window.AAAI_CONFIG.ENVIRONMENT === 'production') {
            // Optional: Send to error monitoring service
        }
    }
};

// Helper function to get chat service configuration
window.getChatServiceConfig = function() {
    return {
        reconnectInterval: window.AAAI_CONFIG.WS_RECONNECT_INTERVAL,
        maxReconnectAttempts: window.AAAI_CONFIG.WS_MAX_RECONNECT_ATTEMPTS,
        heartbeatInterval: window.AAAI_CONFIG.WS_HEARTBEAT_INTERVAL,
        connectionTimeout: window.AAAI_CONFIG.WS_CONNECTION_TIMEOUT,
        messageQueueLimit: window.AAAI_CONFIG.WS_MESSAGE_QUEUE_LIMIT,
        debug: window.AAAI_CONFIG.ENABLE_DEBUG
    };
};

// Validation
try {
    const required = ['API_BASE_URL', 'WS_BASE_URL'];
    const missing = required.filter(key => !window.AAAI_CONFIG[key]);
    
    if (missing.length > 0) {
        throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }
    
    // Log successful initialization
    window.AAAI_LOGGER.info('AAAI Configuration loaded successfully', {
        environment: window.AAAI_CONFIG.ENVIRONMENT,
        version: window.AAAI_CONFIG.VERSION,
        websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
        debugEnabled: window.AAAI_CONFIG.ENABLE_DEBUG
    });
    
} catch (error) {
    console.error('Configuration initialization failed:', error);
}

// Freeze configuration to prevent modification
Object.freeze(window.AAAI_CONFIG);
Object.freeze(window.AAAI_LOGGER);