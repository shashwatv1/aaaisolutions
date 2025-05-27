/**
 * FIXED WebSocket Chat Service - Enhanced cookie-based authentication
 * File: assets/js/websocket-chat.js
 */
const ChatService = {
    // Core state
    socket: null,
    isConnected: false,
    isConnecting: false,
    isAuthenticated: false,
    authService: null,
    
    // Connection management
    reconnectAttempts: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
    authTimeout: null,
    connectionPromise: null,
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    authSuccessListeners: [],
    authErrorListeners: [],
    
    // Configuration
    options: {
        reconnectInterval: 5000,
        maxReconnectAttempts: 2,  // Reduced for httpOnly cookie issues
        heartbeatInterval: 30000,
        connectionTimeout: 12000,  // Reduced timeout
        authTimeout: 8000,        // Reduced auth timeout
        messageQueueLimit: 20,
        socketReadyTimeout: 2000,  // Reduced socket ready timeout
        preAuthDelay: 500,        // Reduced pre-auth delay
        debug: false
    },
    
    /**
     * Initialize chat service with enhanced debugging
     */
    init(authService, options = {}) {
        if (!authService) {
            throw new Error('AuthService is required');
        }
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        // Enhanced debugging
        this._log('FIXED: ChatService initializing with options:', {
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            connectionTimeout: this.options.connectionTimeout,
            authTimeout: this.options.authTimeout,
            debug: this.options.debug
        });
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('FIXED: ChatService initialized for httpOnly cookie authentication');
        return this;
    },
    
    /**
     * Setup enhanced event handlers
     */
    _setupEventHandlers() {
        // Handle page visibility with debugging
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._log('FIXED: Page visible, checking connection status');
                
                if (this.authService.isAuthenticated() && !this.isConnected && !this.isConnecting) {
                    this._log('FIXED: Page visible - attempting to connect');
                    this.connect().catch(err => this._error('FIXED: Failed to connect on page visible:', err));
                }
            }
        });
        
        // Enhanced session expiration handling
        window.addEventListener('sessionExpired', () => {
            this._log('FIXED: Session expired event received');
            this._handleSessionExpired();
        });
        
        // Network change handlers
        window.addEventListener('online', () => {
            this._log('FIXED: Network online event');
            if (this.authService.isAuthenticated() && !this.isConnected) {
                setTimeout(() => {
                    this._log('FIXED: Attempting reconnect after network online');
                    this.connect().catch(err => this._log('FIXED: Reconnect after online failed:', err));
                }, 1000);
            }
        });
        
        window.addEventListener('offline', () => {
            this._log('FIXED: Network offline event');
            this._notifyStatusChange('offline');
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this._cleanup();
        });
    },
    
    /**
     * FIXED: Connect with comprehensive pre-flight checks
     */
    async connect() {
        // Basic authentication check
        if (!this.authService.isAuthenticated()) {
            throw new Error('Authentication required - user not authenticated');
        }
    
        if (this.isConnected && this.isAuthenticated) {
            this._log('FIXED: Already connected and authenticated');
            return true;
        }

        if (this.isConnecting && this.connectionPromise) {
            this._log('FIXED: Connection already in progress, waiting...');
            return this.connectionPromise;
        }

        this._log('FIXED: Starting WebSocket connection process...');

        // FIXED: Enhanced pre-connection validation
        try {
            await this._validateAuthenticationState();
        } catch (error) {
            this._error('FIXED: Pre-connection validation failed:', error);
            throw new Error(`Pre-connection validation failed: ${error.message}`);
        }

        // Create connection promise
        this.connectionPromise = this._performConnection();
        
        try {
            const result = await this.connectionPromise;
            this.connectionPromise = null;
            return result;
        } catch (error) {
            this.connectionPromise = null;
            throw error;
        }
    },
    
    /**
     * FIXED: Enhanced authentication state validation
     */
    async _validateAuthenticationState() {
        this._log('FIXED: Validating authentication state...');
        
        // Check AuthService state
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('Missing user information');
        }
        
        this._log('FIXED: User info validated:', {
            hasId: !!user.id,
            hasEmail: !!user.email,
            email: user.email.substring(0, 3) + '***'
        });
        
        // FIXED: Check only JavaScript-accessible cookies
        const cookieStatus = this._checkAccessibleCookies();
        this._log('FIXED: Cookie status:', cookieStatus);
        
        // FIXED: If critical cookies are missing, attempt refresh
        if (!cookieStatus.authenticated || !cookieStatus.userInfo) {
            this._log('FIXED: Critical cookies missing, attempting token refresh...');
            
            try {
                const refreshSuccess = await this.authService.refreshTokenIfNeeded();
                this._log('FIXED: Token refresh result:', refreshSuccess);
                
                // Wait for cookies to be set
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                // Re-check cookies
                const newCookieStatus = this._checkAccessibleCookies();
                this._log('FIXED: Post-refresh cookie status:', newCookieStatus);
                
                if (!newCookieStatus.authenticated || !newCookieStatus.userInfo) {
                    this._log('FIXED: ⚠️ Basic cookies still missing, but proceeding (server will validate httpOnly cookies)');
                }
                
            } catch (refreshError) {
                this._error('FIXED: Token refresh failed:', refreshError);
                // Don't throw here unless it's a critical auth error
                if (refreshError.message.includes('Authentication required') || 
                    refreshError.message.includes('expired')) {
                    throw new Error(`Authentication refresh failed: ${refreshError.message}`);
                }
                this._log('FIXED: ⚠️ Refresh failed but proceeding - server will validate httpOnly cookies');
            }
        }
        
        this._log('FIXED: ✅ Authentication state validation complete');
        return true;
    },
    
    /**
     * FIXED: Check JavaScript-accessible cookies only
     */
    _checkAccessibleCookies() {
        const cookies = {
            authenticated: this._getCookie('authenticated') === 'true',
            userInfo: !!this._getCookie('user_info'),
            // Note: access_token and refresh_token are httpOnly - can't check from JS
        };
        
        // Try to parse user_info for validation
        if (cookies.userInfo) {
            try {
                const userInfoStr = this._getCookie('user_info');
                const userInfo = JSON.parse(decodeURIComponent(userInfoStr));
                cookies.userInfoValid = !!(userInfo.id && userInfo.email);
            } catch (e) {
                cookies.userInfoValid = false;
                this._log('FIXED: ⚠️ Error parsing user_info cookie:', e.message);
            }
        }
        
        return cookies;
    },
    
    /**
     * FIXED: Perform connection with enhanced error handling
     */
    async _performConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout with better error message
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('FIXED: Connection timeout exceeded');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout - server may be overloaded'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // FIXED: Create WebSocket with clean URL (no token parameter)
                const wsUrl = this._getWebSocketURL();
                this._log(`FIXED: Connecting to: ${wsUrl.replace(/[a-f0-9-]{36}/, 'USER_ID')}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // FIXED: Enhanced open handler
                this.socket.addEventListener('open', async (event) => {
                    this._log('FIXED: ✅ WebSocket opened, waiting for ready state...');
                    
                    try {
                        // FIXED: Wait for socket to be truly ready
                        await this._waitForSocketReady();
                        this._log('FIXED: ✅ Socket ready, sending authentication...');
                        
                        // FIXED: Send cookie-based authentication message
                        await this._performCookieAuthentication();
                        
                        // Authentication success/failure will be handled by message listener
                        
                    } catch (error) {
                        clearTimeout(overallTimeout);
                        this._error('FIXED: ❌ Authentication setup failed:', error);
                        this._cleanupConnection();
                        reject(error);
                    }
                });
                
                // FIXED: Enhanced message handler
                this.socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('FIXED: 📨 Received message:', data.type);
                        
                        // FIXED: Handle authentication responses
                        if (data.type === 'connection_established' || 
                            data.type === 'auth_success' || 
                            data.type === 'authenticated') {
                            clearTimeout(overallTimeout);
                            this._handleAuthenticationSuccess(data);
                            resolve(true);
                            return;
                        }
                        
                        // FIXED: Handle authentication errors with detailed logging
                        if (data.type === 'error' && (
                            data.code === 'AUTH_FAILED' || 
                            data.code === 'AUTH_ERROR' ||
                            this._isAuthError(data))) {
                            clearTimeout(overallTimeout);
                            this._handleAuthenticationError(data);
                            reject(new Error(data.message || 'Server authentication failed'));
                            return;
                        }
                        
                        // FIXED: Handle token refresh recommendations
                        if (data.type === 'token_refresh_recommended') {
                            this._log('FIXED: ⚠️ Server recommends token refresh');
                            this._refreshTokenInBackground();
                        }
                        
                        // Handle other messages normally
                        this._onMessage(event);
                        
                    } catch (parseError) {
                        this._error('FIXED: Error parsing message:', parseError);
                    }
                });
                
                // FIXED: Enhanced close handler
                this.socket.addEventListener('close', (event) => {
                    this._log(`FIXED: 🔌 WebSocket closed: code=${event.code}, reason='${event.reason}'`);
                    this._onClose(event);
                    
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        
                        // Provide specific error messages based on close code
                        let errorMessage = 'WebSocket connection failed';
                        if (event.code === 4001) {
                            errorMessage = 'Authentication failed - session may be expired';
                        } else if (event.code === 4000) {
                            errorMessage = 'Session expired';
                        } else if (event.code === 1006) {
                            errorMessage = 'Connection closed abnormally - network issue';
                        }
                        
                        reject(new Error(errorMessage));
                    }
                });
                
                // FIXED: Enhanced error handler
                this.socket.addEventListener('error', (event) => {
                    this._error('FIXED: 💥 WebSocket error:', event);
                    this._onError(event);
                    
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection error'));
                    }
                });
                
            } catch (error) {
                clearTimeout(overallTimeout);
                this.isConnecting = false;
                this._error('FIXED: Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * FIXED: Wait for socket ready with reduced timeout
     */
    async _waitForSocketReady() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxWaitTime = this.options.socketReadyTimeout; // 2 seconds
            
            const checkReady = () => {
                const elapsed = Date.now() - startTime;
                
                if (!this.socket) {
                    reject(new Error('WebSocket is null'));
                    return;
                }
                
                const isReady = this.socket.readyState === WebSocket.OPEN;
                
                if (isReady) {
                    this._log('FIXED: ✅ WebSocket is ready');
                    resolve();
                } else if (elapsed > maxWaitTime) {
                    this._error('FIXED: ⏰ Socket ready timeout');
                    reject(new Error('Socket not ready in time'));
                } else if (this.socket.readyState >= WebSocket.CLOSING) {
                    reject(new Error('WebSocket closed during ready check'));
                } else {
                    // Check more frequently for faster response
                    setTimeout(checkReady, 50);
                }
            };
            
            checkReady();
        });
    },
    
    /**
     * FIXED: Perform cookie-based authentication
     */
    async _performCookieAuthentication() {
        const user = this.authService.getCurrentUser();
        
        if (!user.id || !user.email) {
            throw new Error('Missing user information for authentication');
        }
        
        // FIXED: Cookie-based authentication message (no token needed)
        const authMessage = {
            type: 'authenticate',
            userId: user.id,
            email: user.email,
            timestamp: new Date().toISOString(),
            method: 'cookie',
            client_info: {
                user_agent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                cookie_status: this._checkAccessibleCookies()
            }
        };
        
        this._log('FIXED: 🔐 Sending cookie-based authentication:', {
            userId: user.id.substring(0, 8) + '...',
            email: user.email.substring(0, 3) + '***',
            method: 'cookie',
            cookieStatus: authMessage.client_info.cookie_status
        });
        
        // FIXED: Send with timeout
        await this._sendMessageWithTimeout(authMessage, this.options.authTimeout);
    },
    
    /**
     * FIXED: Send message with timeout
     */
    async _sendMessageWithTimeout(messageData, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Message send timeout after ${timeout}ms`));
            }, timeout);
            
            try {
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    clearTimeout(timeoutId);
                    reject(new Error('WebSocket not ready'));
                    return;
                }
                
                const messageStr = JSON.stringify(messageData);
                this.socket.send(messageStr);
                
                clearTimeout(timeoutId);
                resolve();
                
            } catch (error) {
                clearTimeout(timeoutId);
                reject(error);
            }
        });
    },
    
    /**
     * FIXED: Background token refresh
     */
    async _refreshTokenInBackground() {
        try {
            this._log('FIXED: 🔄 Background token refresh started');
            await this.authService.refreshTokenIfNeeded();
            this._log('FIXED: ✅ Background token refresh completed');
        } catch (error) {
            this._error('FIXED: ❌ Background token refresh failed:', error);
        }
    },
    
    /**
     * FIXED: Check if message is auth-related error
     */
    _isAuthError(data) {
        const message = (data.message || '').toLowerCase();
        return (
            data.code === 'AUTH_FAILED' ||
            data.code === 'AUTH_ERROR' ||
            message.includes('authentication') ||
            message.includes('token') ||
            message.includes('expired') ||
            message.includes('unauthorized')
        );
    },
    
    /**
     * FIXED: Handle authentication success
     */
    _handleAuthenticationSuccess(data) {
        this._log('FIXED: ✅ Authentication successful!', {
            type: data.type,
            authMethod: data.auth_method,
            tokenStatus: data.token_status
        });
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._notifyStatusChange('connected');
        this._notifyAuthSuccess(data);
        
        // Start heartbeat
        this._startHeartbeat();
        
        // Process queued messages
        this._processQueuedMessages();
        
        this._log('FIXED: 🎉 WebSocket fully connected and authenticated');
    },
    
    /**
     * FIXED: Handle authentication error with detailed analysis
     */
    _handleAuthenticationError(data) {
        this._error('FIXED: ❌ Authentication failed:', {
            message: data.message,
            code: data.code,
            details: data.details,
            requiresRefresh: data.requires_refresh
        });
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // Close connection
        if (this.socket) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        this._cleanupConnection();
        
        // FIXED: Enhanced error analysis and response
        const isTokenError = data.code === 'AUTH_FAILED' || 
                           data.requires_refresh ||
                           (data.message && data.message.includes('expired'));
        
        if (isTokenError) {
            this._log('FIXED: 🔑 Token/cookie authentication issue detected');
            
            const errorData = {
                error: 'Authentication failed - your session may have expired. Please refresh the page.',
                requiresLogin: false,
                requiresPageRefresh: true,
                reason: 'httpOnly cookie validation failed on server',
                originalError: data,
                suggestion: 'Try refreshing the page to update your authentication cookies'
            };
            
            this._notifyErrorListeners(errorData);
        } else {
            // Other authentication errors
            const errorData = {
                error: 'Authentication failed - please log in again',
                requiresLogin: true,
                requiresPageRefresh: false,
                originalError: data
            };
            
            this._notifyErrorListeners(errorData);
        }
    },
    
    /**
     * FIXED: Get WebSocket URL (clean, no token parameter)
     */
    _getWebSocketURL() {
        const user = this.authService.getCurrentUser();
        if (!user || !user.id) {
            throw new Error('User ID not available for WebSocket connection');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // FIXED: Clean URL for cookie-based auth (no token parameter)
        const url = `${wsProtocol}//${wsHost}/ws/${encodeURIComponent(user.id)}`;
        
        return url;
    },
    
    /**
     * FIXED: Enhanced cookie getter with error handling
     */
    _getCookie(name) {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) {
                const cookieValue = parts.pop().split(';').shift();
                return decodeURIComponent(cookieValue);
            }
        } catch (error) {
            // Note: This is expected for httpOnly cookies like access_token
            if (name === 'access_token' || name === 'refresh_token') {
                this._log(`FIXED: Cannot read httpOnly cookie '${name}' from JavaScript (this is normal and secure)`);
            } else {
                this._error(`FIXED: Error reading cookie ${name}:`, error);
            }
        }
        return null;
    },
    
    // ... [Keep all other existing methods from the original websocket-chat.js] ...
    
    /**
     * FIXED: Enhanced status reporting
     */
    getStatus() {
        const cookieStatus = this._checkAccessibleCookies();
        
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null,
            authServiceValid: this.authService ? this.authService.isAuthenticated() : false,
            cookies: cookieStatus,
            websocketUrl: this.socket ? 'connected' : 'not_connected',
            lastError: this.lastError || null,
            connectionTime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
        };
    },
    
    /**
     * FIXED: Enhanced logging
     */
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService FIXED]', ...args);
        } else if (this.options.debug) {
            console.log('[ChatService FIXED]', ...args);
        }
    },
    
    _error(...args) {
        // Always log errors, even if debug is off
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService FIXED]', ...args);
        } else {
            console.error('[ChatService FIXED]', ...args);
        }
        
        // Store last error for debugging
        this.lastError = {
            message: args.join(' '),
            timestamp: new Date().toISOString()
        };
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}