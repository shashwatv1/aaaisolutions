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
window.AAAI_CONFIG = {
    ENVIRONMENT: currentEnv,
    API_BASE_URL: config.API_BASE_URL,
    WS_BASE_URL: config.WS_BASE_URL,
    ENABLE_WEBSOCKETS: true,
    ENABLE_DEBUG: config.DEBUG,
    LOG_LEVEL: config.LOG_LEVEL,
    VERSION: '1.0.0',
    BUILD_DATE: new Date().toISOString()
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

// Logger utility
window.AAAI_LOGGER = {
    debug: (...args) => {
        if (window.AAAI_CONFIG.LOG_LEVEL === 'debug') {
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
    }
};

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