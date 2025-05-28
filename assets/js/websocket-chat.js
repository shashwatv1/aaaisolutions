/**
 * FIXED WebSocket Chat Service - Pure Cookie-Based Authentication
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
        maxReconnectAttempts: 3,
        heartbeatInterval: 30000,
        connectionTimeout: 15000,
        authTimeout: 8000,
        messageQueueLimit: 20,
        socketReadyTimeout: 2000,
        preAuthDelay: 500,
        debug: false
    },
    
    /**
     * Initialize chat service
     */
    init(authService, options = {}) {
        if (!authService) {
            throw new Error('AuthService is required');
        }
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('FIXED ChatService initialized for pure cookie authentication');
        return this;
    },
    
    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // Handle page visibility
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && 
                this.authService.isAuthenticated() && 
                !this.isConnected && 
                !this.isConnecting) {
                this._log('Page visible, attempting to connect');
                this.connect().catch(err => this._error('Failed to connect on page visible:', err));
            }
        });
        
        // Handle session expiration
        window.addEventListener('sessionExpired', () => {
            this._log('Session expired, disconnecting WebSocket');
            this._handleSessionExpired();
        });
        
        // Handle network changes
        window.addEventListener('online', () => {
            this._log('Network online');
            if (this.authService.isAuthenticated() && !this.isConnected) {
                setTimeout(() => this.connect().catch(err => console.warn('Reconnect failed:', err)), 1000);
            }
        });
        
        window.addEventListener('offline', () => {
            this._log('Network offline');
            this._notifyStatusChange('offline');
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this._cleanup();
        });
    },
    
    /**
     * FIXED: Connect with pure cookie-based authentication
     */
    async connect() {
        if (!this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }
    
        if (this.isConnected && this.isAuthenticated) {
            this._log('Already connected and authenticated');
            return true;
        }

        // If already connecting, return the existing promise
        if (this.isConnecting && this.connectionPromise) {
            this._log('Connection already in progress, waiting...');
            return this.connectionPromise;
        }

        this._log('🔄 Starting FIXED WebSocket connection...');

        // FIXED: Simplified pre-connection check
        try {
            await this._validateAuthenticationState();
        } catch (error) {
            this._error('❌ Authentication state validation failed:', error);
            throw new Error(`Authentication validation failed: ${error.message}`);
        }

        // Create new connection promise
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
     * FIXED: Simplified authentication state validation
     */
    async _validateAuthenticationState() {
        this._log('🔍 FIXED: Validating authentication state...');
        
        // Check if we have basic auth info
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('Missing user information');
        }
        
        // Check basic auth indicators (non-httpOnly cookies)
        const hasAuthCookie = this._getCookie('authenticated') === 'true';
        const hasUserInfo = !!this._getCookie('user_info');
        
        this._log('🍪 Basic auth indicators:', {
            authenticated: hasAuthCookie,
            userInfo: hasUserInfo,
            email: user.email
        });
        
        // If missing basic indicators, try refresh once
        if (!hasAuthCookie || !hasUserInfo) {
            this._log('🔄 Missing basic auth indicators, attempting refresh...');
            
            try {
                await this.authService.refreshTokenIfNeeded();
                await new Promise(resolve => setTimeout(resolve, 500));
                
                const newHasAuthCookie = this._getCookie('authenticated') === 'true';
                const newHasUserInfo = !!this._getCookie('user_info');
                
                if (!newHasAuthCookie || !newHasUserInfo) {
                    this._log('⚠️ Still missing basic indicators after refresh');
                }
                
            } catch (refreshError) {
                this._log('⚠️ Token refresh failed, but continuing:', refreshError.message);
            }
        }
        
        return true;
    },
    
    /**
     * FIXED: Simplified connection process
     */
    async _performConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('FIXED: Connection timeout');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // FIXED: Create clean WebSocket URL
                const wsUrl = this._getCleanWebSocketURL();
                this._log(`FIXED: Connecting to: ${wsUrl}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // Set up event handlers
                this.socket.addEventListener('open', async () => {
                    this._log('✅ FIXED: WebSocket opened');
                    this.isConnected = true;
                    
                    try {
                        // Wait for socket readiness
                        await this._waitForSocketReady();
                        
                        // FIXED: No explicit authentication needed - server validates cookies automatically
                        this._log('🔐 FIXED: Waiting for server-side cookie validation...');
                        
                        // Set auth timeout
                        this.authTimeout = setTimeout(() => {
                            if (!this.isAuthenticated) {
                                this._error('❌ Server cookie validation timeout');
                                this.socket.close(4001, 'Authentication timeout');
                            }
                        }, this.options.authTimeout);
                        
                    } catch (error) {
                        clearTimeout(overallTimeout);
                        this._error('❌ Post-connection setup failed:', error);
                        this._cleanupConnection();
                        reject(error);
                    }
                });
                
                this.socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('📨 FIXED: Received:', data.type);
                        
                        // Handle authentication success
                        if (data.type === 'connection_established' || 
                            data.type === 'auth_success' || 
                            data.type === 'authenticated') {
                            clearTimeout(overallTimeout);
                            this._handleAuthenticationSuccess(data);
                            resolve(true);
                            return;
                        }
                        
                        // Handle authentication errors
                        if (data.type === 'auth_error' || 
                            data.type === 'authentication_failed' || 
                            (data.type === 'error' && this._isAuthError(data))) {
                            clearTimeout(overallTimeout);
                            this._handleAuthenticationError(data);
                            reject(new Error(data.message || 'Cookie authentication failed'));
                            return;
                        }
                        
                        // Handle other messages
                        this._onMessage(event);
                        
                    } catch (parseError) {
                        this._error('FIXED: Message parse error:', parseError);
                    }
                });
                
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection failed'));
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
     * FIXED: Get clean WebSocket URL without any parameters
     */
    _getCleanWebSocketURL() {
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
        
        // FIXED: Clean URL - no query parameters, cookies handle authentication
        const url = `${wsProtocol}//${wsHost}/ws/${encodeURIComponent(user.id)}`;
        
        this._log('🔗 FIXED: Clean WebSocket URL:', url.replace(user.id, user.id.substring(0, 8) + '...'));
        return url;
    },
    
    /**
     * Get cookie value
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
            // Note: This is expected for httpOnly cookies
            if (name !== 'access_token') {
                this._error(`Error reading cookie ${name}:`, error);
            }
        }
        return null;
    },
    
    /**
     * Wait for socket to be ready
     */
    async _waitForSocketReady() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxWaitTime = this.options.socketReadyTimeout;
            
            const checkReady = () => {
                const elapsed = Date.now() - startTime;
                
                if (!this.socket) {
                    reject(new Error('WebSocket is null'));
                    return;
                }
                
                if (this.socket.readyState === WebSocket.OPEN) {
                    this._log('✅ WebSocket ready');
                    resolve();
                } else if (elapsed > maxWaitTime) {
                    reject(new Error('Socket ready timeout'));
                } else if (this.socket.readyState === WebSocket.CLOSED || 
                          this.socket.readyState === WebSocket.CLOSING) {
                    reject(new Error('WebSocket closed during ready check'));
                } else {
                    setTimeout(checkReady, 50);
                }
            };
            
            checkReady();
        });
    },
    
    /**
     * Check if error is authentication-related
     */
    _isAuthError(data) {
        if (data.code === 'AUTH_FAILED') return true;
        if (data.message && data.message.toLowerCase().includes('authentication')) return true;
        if (data.message && data.message.toLowerCase().includes('token')) return true;
        if (data.message && data.message.toLowerCase().includes('expired')) return true;
        if (data.message && data.message.toLowerCase().includes('cookie')) return true;
        return false;
    },
    
    /**
     * Handle WebSocket message
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat
            if (data.type === 'ping' || data.type === 'heartbeat') {
                this._sendHeartbeat('pong');
                return;
            }
            
            if (data.type === 'pong' || data.type === 'heartbeat_ack') {
                return; // Heartbeat acknowledged
            }
            
            // Handle regular messages (only if authenticated)
            if (this.isAuthenticated) {
                this._notifyMessageListeners(data);
            } else {
                this._log('⚠️ Received message before authentication:', data.type);
            }
            
        } catch (error) {
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * Handle successful authentication
     */
    _handleAuthenticationSuccess(data) {
        this._log('✅ FIXED: Cookie authentication successful!');
        
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
        
        this._log('🎉 FIXED: WebSocket fully connected and authenticated');
    },
    
    /**
     * Handle authentication failure
     */
    _handleAuthenticationError(data) {
        this._error('❌ FIXED: Cookie authentication failed:', data.message || data.error);
        
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
        
        // Notify about authentication failure
        if (data.message && (data.message.includes('expired') || data.message.includes('invalid'))) {
            const errorData = {
                error: 'Your session has expired. Please refresh the page.',
                requiresLogin: false,
                requiresPageRefresh: true,
                reason: 'cookie_validation_failed',
                originalError: data
            };
            this._notifyErrorListeners(errorData);
        } else {
            const errorData = {
                error: 'Authentication failed. Please refresh the page.',
                requiresLogin: true,
                requiresPageRefresh: true,
                originalError: data
            };
            this._notifyErrorListeners(errorData);
        }
    },
    
    /**
     * Handle session expiration
     */
    _handleSessionExpired() {
        this._log('🔑 Session expired');
        
        this.isAuthenticated = false;
        
        if (this.socket) {
            this.socket.close(4000, 'Session expired');
        }
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        this.messageQueue = [];
    },
    
    /**
     * Handle WebSocket close
     */
    _onClose(event) {
        this._log('🔌 WebSocket closed', { code: event.code, reason: event.reason });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // Better reconnection logic
        const shouldReconnect = this._shouldReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('Not reconnecting', { 
                code: event.code, 
                authenticated: this.authService.isAuthenticated()
            });
        }
    },
    
    /**
     * Handle WebSocket error
     */
    _onError(event) {
        this._error('💥 WebSocket error:', event);
        this._notifyStatusChange('error');
        this._notifyErrorListeners({ error: 'WebSocket error', event });
    },
    
    /**
     * Clean up connection state
     */
    _cleanupConnection() {
        this.isConnected = false;
        this.isConnecting = false;
        this.isAuthenticated = false;
        
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this._stopHeartbeat();
    },
    
    /**
     * Determine if we should attempt reconnection
     */
    _shouldReconnect(code) {
        // Don't reconnect on authentication failures or normal closures
        const noReconnectCodes = [1000, 1001, 1005, 4000, 4001, 4403];
        return !noReconnectCodes.includes(code) && 
               this.reconnectAttempts < this.options.maxReconnectAttempts;
    },
    
    /**
     * Schedule reconnection attempt
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this._error('Max reconnect attempts reached');
            this._notifyStatusChange('failed');
            return;
        }
        
        this.reconnectAttempts++;
        
        const delay = Math.min(
            this.options.reconnectInterval * Math.pow(1.5, this.reconnectAttempts - 1),
            30000
        );
        
        this._log(`⏰ Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isAuthenticated && this.authService.isAuthenticated()) {
                try {
                    await this.connect();
                } catch (error) {
                    this._error('Reconnect failed:', error);
                    this._scheduleReconnect();
                }
            }
        }, delay);
    },
    
    /**
     * Start heartbeat mechanism
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        
        if (this.options.heartbeatInterval > 0) {
            this.heartbeatTimer = setInterval(() => {
                if (this.isAuthenticated) {
                    this._sendHeartbeat('ping');
                }
            }, this.options.heartbeatInterval);
            
            this._log('💓 Heartbeat started');
        }
    },
    
    /**
     * Stop heartbeat mechanism
     */
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    /**
     * Send heartbeat message
     */
    _sendHeartbeat(type = 'ping') {
        try {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const message = { 
                    type: type, 
                    timestamp: new Date().toISOString() 
                };
                this.socket.send(JSON.stringify(message));
                this._log(`💓 ${type} sent`);
            }
        } catch (error) {
            this._error('Heartbeat failed:', error);
        }
    },
    
    /**
     * Send message through WebSocket
     */
    async sendMessage(message) {
        if (!message || typeof message !== 'string' || !message.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const messageData = {
            type: 'message',
            message: message.trim(),
            timestamp: new Date().toISOString(),
            id: this._generateMessageId()
        };
        
        if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(messageData));
                return messageData.id;
            } catch (error) {
                this._error('Send error:', error);
                throw error;
            }
        } else if (this.isConnected && !this.isAuthenticated) {
            // Connected but not authenticated yet - queue message
            this._queueMessage(messageData);
            return messageData.id;
        } else {
            // Not connected - queue message and try to connect
            this._queueMessage(messageData);
            
            if (!this.isConnecting) {
                try {
                    await this.connect();
                    return messageData.id;
                } catch (error) {
                    throw new Error('Failed to connect for message send');
                }
            }
            
            return messageData.id;
        }
    },
    
    /**
     * Queue message for later sending
     */
    _queueMessage(messageData) {
        if (this.messageQueue.length >= this.options.messageQueueLimit) {
            this.messageQueue.shift();
        }
        
        this.messageQueue.push({
            ...messageData,
            queued_at: Date.now()
        });
        
        this._log(`📥 Message queued (${this.messageQueue.length}/${this.options.messageQueueLimit})`);
    },
    
    /**
     * Process all queued messages
     */
    async _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        let sent = 0;
        for (const messageData of messages) {
            try {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(messageData));
                    sent++;
                } else {
                    this._queueMessage(messageData);
                }
            } catch (error) {
                this._error('Failed to send queued message:', error);
                this._queueMessage(messageData);
            }
        }
        
        this._log(`📤 Processed queued messages: ${sent} sent`);
    },
    
    /**
     * Generate unique message ID
     */
    _generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        this._log('🔌 Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this._cleanupConnection();
        this.reconnectAttempts = 0;
        
        this._notifyStatusChange('disconnected');
    },
    
    /**
     * Cleanup resources
     */
    _cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this._stopHeartbeat();
        this.connectionPromise = null;
    },
    
    /**
     * Event listener management
     */
    onMessage(callback) {
        if (typeof callback === 'function') {
            this.messageListeners.push(callback);
        }
    },
    
    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.push(callback);
        }
    },
    
    onError(callback) {
        if (typeof callback === 'function') {
            this.errorListeners.push(callback);
        }
    },
    
    onAuthSuccess(callback) {
        if (typeof callback === 'function') {
            this.authSuccessListeners.push(callback);
        }
    },
    
    onAuthError(callback) {
        if (typeof callback === 'function') {
            this.authErrorListeners.push(callback);
        }
    },
    
    /**
     * Notification methods
     */
    _notifyMessageListeners(data) {
        this.messageListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in message listener:', error);
            }
        });
    },
    
    _notifyStatusChange(status) {
        this.statusListeners.forEach(callback => {
            try {
                callback(status);
            } catch (error) {
                this._error('Error in status listener:', error);
            }
        });
    },
    
    _notifyErrorListeners(data) {
        this.errorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in error listener:', error);
            }
        });
    },
    
    _notifyAuthSuccess(data) {
        this.authSuccessListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in auth success listener:', error);
            }
        });
    },
    
    _notifyAuthError(data) {
        this.authErrorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in auth error listener:', error);
            }
        });
    },
    
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null,
            authServiceValid: this.authService ? this.authService.isAuthenticated() : false,
            lastError: null
        };
    },
    
    /**
     * Force reconnect
     */
    async forceReconnect() {
        this._log('🔄 FIXED: Force reconnecting...');
        
        // Disconnect first
        this.disconnect();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check authentication
        if (!this.authService.isAuthenticated()) {
            throw new Error('Cannot reconnect: Authentication invalid');
        }
        
        // Try to refresh token before reconnecting
        try {
            await this.authService.refreshTokenIfNeeded();
        } catch (error) {
            this._log('⚠️ Token refresh failed during force reconnect, continuing anyway');
        }
        
        // Reset reconnect attempts
        this.reconnectAttempts = 0;
        
        // Attempt connection
        return this.connect();
    },
    
    /**
     * Utility methods
     */
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService FIXED]', ...args);
        } else if (this.options.debug) {
            console.log('[ChatService FIXED]', ...args);
        }
    },
    
    _error(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService FIXED]', ...args);
        } else {
            console.error('[ChatService FIXED]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}