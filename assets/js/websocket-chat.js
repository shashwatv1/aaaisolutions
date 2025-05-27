/**
 * FIXED WebSocket Chat Service - Handles cookie-based authentication
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
        authTimeout: 10000,
        messageQueueLimit: 20,
        socketReadyTimeout: 3000,
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
        
        this._log('ROBUST ChatService initialized for cookie authentication');
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
     * FIXED: Connect with cookie-based authentication
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

        this._log('🔄 Starting ROBUST WebSocket connection...');

        // ROBUST: Pre-connection authentication validation
        try {
            await this._validateAuthenticationBeforeConnect();
        } catch (error) {
            this._error('❌ Pre-connection auth validation failed:', error);
            throw new Error(`Authentication validation failed: ${error.message}`);
        }

        // Create new connection promise
        this.connectionPromise = this._performRobustConnection();
        
        try {
            const result = await this.connectionPromise;
            this.connectionPromise = null;
            return result;
        } catch (error) {
            this.connectionPromise = null;
            throw error;
        }
    },
    
    _getCookie(name) {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) {
                const cookieValue = parts.pop().split(';').shift();
                return decodeURIComponent(cookieValue);
            }
        } catch (error) {
            this._error(`Error reading cookie ${name}:`, error);
        }
        return null;
    },
    

    async _validateAuthenticationBeforeConnect() {
        this._log('🔍 FIXED: Validating authentication before WebSocket connection...');
        
        // Check if we have basic auth info
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('Missing user information');
        }
        
        // FIXED: Only check non-httpOnly cookies that JavaScript can access
        const hasAuthCookie = this._getCookie('authenticated') === 'true';
        const hasUserInfo = !!this._getCookie('user_info');
        
        // REMOVED: Don't try to check httpOnly access_token from JavaScript
        // const hasAccessToken = !!this._getCookie('access_token'); // This always fails for httpOnly cookies
        
        this._log('🍪 FIXED: Cookie status (JavaScript-accessible only):', {
            authenticated: hasAuthCookie,
            userInfo: hasUserInfo,
            note: 'access_token is httpOnly - only server can validate it'
        });
        
        // FIXED: If we don't have basic auth indicators, try to refresh
        if (!hasAuthCookie || !hasUserInfo) {
            this._log('🔄 FIXED: Missing basic auth indicators, attempting token refresh...');
            
            try {
                const refreshSuccess = await this.authService.refreshTokenIfNeeded();
                if (!refreshSuccess) {
                    throw new Error('Token refresh failed');
                }
                
                // Wait a moment for cookies to be set
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Recheck only the non-httpOnly cookies
                const newHasAuthCookie = this._getCookie('authenticated') === 'true';
                const newHasUserInfo = !!this._getCookie('user_info');
                
                this._log('🍪 FIXED: Post-refresh cookie status:', {
                    authenticated: newHasAuthCookie,
                    userInfo: newHasUserInfo
                });
                
                if (!newHasAuthCookie || !newHasUserInfo) {
                    // Still no basic indicators, but this might be OK
                    this._log('⚠️ FIXED: Basic auth indicators still missing after refresh');
                    this._log('💡 FIXED: Proceeding anyway - server will validate httpOnly cookies');
                    // Don't throw error here - let the server handle httpOnly cookie validation
                } else {
                    this._log('✅ FIXED: Token refresh successful, auth indicators updated');
                }
                
            } catch (refreshError) {
                this._error('❌ FIXED: Token refresh failed during pre-connection validation:', refreshError);
                // Only throw if it's a serious auth error
                if (refreshError.message && (
                    refreshError.message.includes('Authentication required') ||
                    refreshError.message.includes('expired') ||
                    refreshError.message.includes('Invalid')
                )) {
                    throw new Error(`Token refresh failed: ${refreshError.message}`);
                }
                // Otherwise, log warning but proceed
                this._log('⚠️ FIXED: Token refresh had issues but proceeding - server will validate');
            }
        } else {
            this._log('✅ FIXED: Basic auth indicators present');
        }
        
        // FIXED: Always return true - let the WebSocket server handle httpOnly cookie validation
        this._log('✅ FIXED: Pre-connection validation complete - server will handle httpOnly cookies');
        return true;
    },

    /**
     * FIXED: Perform connection with cookie authentication
     */
    async _performRobustConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('FIXED: Overall connection timeout');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // Create WebSocket with better URL handling
                const wsUrl = this._getWebSocketURL();
                this._log(`FIXED: Connecting to: ${wsUrl}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // Enhanced event setup
                this.socket.addEventListener('open', async (event) => {
                    this._log('✅ FIXED: WebSocket opened successfully');
                    this.isConnected = true;
                    
                    try {
                        // Wait for socket to be ready
                        await this._waitForSocketReady();
                        
                        // Additional delay to ensure server is ready for authentication
                        await new Promise(resolve => setTimeout(resolve, this.options.preAuthDelay || 750));
                        
                        // FIXED: Send authentication message (server will validate httpOnly cookies)
                        await this._performEnhancedAuthentication();
                        
                        // Authentication success will be handled by message listener
                        
                    } catch (error) {
                        clearTimeout(overallTimeout);
                        this._error('❌ FIXED: Authentication setup failed:', error);
                        this._cleanupConnection();
                        reject(error);
                    }
                });
                
                this.socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('📨 FIXED: Received message:', data.type);
                        
                        // Handle authentication responses
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
                            reject(new Error(data.message || 'Server-side authentication failed'));
                            return;
                        }
                        
                        // Handle token refresh recommendations
                        if (data.type === 'token_refresh_recommended') {
                            this._log('⚠️ FIXED: Server recommends token refresh');
                            // Don't fail connection, but refresh in background
                            this._refreshTokenInBackground();
                        }
                        
                        // Handle other messages normally
                        this._onMessage(event);
                        
                    } catch (parseError) {
                        this._error('FIXED: Error parsing message:', parseError);
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


    async _refreshTokenInBackground() {
        try {
            this._log('🔄 Background token refresh started');
            await this.authService.refreshTokenIfNeeded();
            this._log('✅ Background token refresh completed');
        } catch (error) {
            this._error('❌ Background token refresh failed:', error);
        }
    },

    _isAuthError(data) {
        if (data.code === 'AUTH_FAILED') return true;
        if (data.message && data.message.toLowerCase().includes('authentication')) return true;
        if (data.message && data.message.toLowerCase().includes('token')) return true;
        if (data.message && data.message.toLowerCase().includes('expired')) return true;
        return false;
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
                
                const isReady = this.socket.readyState === WebSocket.OPEN;
                this._log(`🔍 ROBUST: Socket ready check: readyState=${this.socket.readyState}, elapsed=${elapsed}ms`);
                
                if (isReady) {
                    this._log('✅ ROBUST: WebSocket is ready');
                    resolve();
                } else if (elapsed > maxWaitTime) {
                    this._error('⏰ ROBUST: Socket ready timeout exceeded');
                    reject(new Error('Socket ready timeout'));
                } else if (this.socket.readyState === WebSocket.CLOSED || this.socket.readyState === WebSocket.CLOSING) {
                    reject(new Error('WebSocket closed during ready check'));
                } else {
                    setTimeout(checkReady, 100); // Increased check interval
                }
            };
            
            checkReady();
        });
    },
    
    /**
     * FIXED: Perform authentication using cookie data
     */
    async _performEnhancedAuthentication() {
        const user = this.authService.getCurrentUser();
        
        if (!user.id || !user.email) {
            throw new Error('Missing user information for authentication');
        }
        
        // Log authentication state for debugging
        this._log('🔐 FIXED: Starting cookie-based authentication:', {
            userId: user.id?.substring(0, 8) + '...',
            email: user.email,
            hasAuthCookie: this._getCookie('authenticated') === 'true',
            hasUserInfo: !!this._getCookie('user_info'),
            authMethod: 'httpOnly cookies (server-side validation)'
        });
        
        // FIXED: Authentication message for cookie-based auth (no token needed)
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
                timestamp: Date.now()
            }
        };
        
        this._log('🔐 FIXED: Sending cookie-based authentication message...');
        
        // Send authentication message with retry
        await this._sendMessageWithRetry(authMessage, 2);
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('❌ FIXED: Authentication timeout - server did not validate httpOnly cookies');
                if (this.socket) {
                    this.socket.close(4001, 'Authentication timeout');
                }
            }
        }, this.options.authTimeout);
    },
    
    /**
     * FIXED: Get WebSocket URL without token parameter
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
        
        // Clean WebSocket URL for cookie authentication
        const url = `${wsProtocol}//${wsHost}/ws/${encodeURIComponent(user.id)}`;
        
        this._log('🔗 ROBUST: WebSocket URL generated:', url.replace(user.id, user.id.substring(0, 8) + '...'));
        return url;
    },
    
    /**
     * Send message with retry logic
     */
    async _sendMessageWithRetry(messageData, maxRetries = 2) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this._log(`📤 ROBUST: Sending message (attempt ${attempt}/${maxRetries}):`, messageData.type);
                
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    throw new Error('WebSocket not ready');
                }
                
                const messageStr = JSON.stringify(messageData);
                this.socket.send(messageStr);
                
                this._log('✅ ROBUST: Message sent successfully:', messageData.type);
                return;
                
            } catch (error) {
                lastError = error;
                this._error(`❌ ROBUST: Send attempt ${attempt} failed:`, error);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 200 * attempt));
                }
            }
        }
        
        throw lastError || new Error('Failed to send message after retries');
    },
    
    /**
     * Handle WebSocket message
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat
            if (data.type === 'ping' || data.type === 'heartbeat') {
                this._sendMessageWithRetry({ type: 'pong' }).catch(err => 
                    this._error('Failed to send pong:', err)
                );
                return;
            }
            
            if (data.type === 'pong' || data.type === 'heartbeat_ack') {
                return; // Heartbeat acknowledged
            }
            
            // Handle regular messages (only if authenticated)
            if (this.isAuthenticated) {
                this._notifyMessageListeners(data);
            } else {
                this._log('⚠️ Received message before authentication, ignoring:', data.type);
            }
            
        } catch (error) {
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * Handle successful authentication
     */
    _handleAuthenticationSuccess(data) {
        this._log('✅ ROBUST: Cookie authentication successful!');
        
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
        
        this._log('🎉 ROBUST: WebSocket fully connected and authenticated');
    },
    
    /**
     * FIXED: Handle authentication failure
     */
    _handleAuthenticationError(data) {
        this._error('❌ ROBUST: Cookie authentication failed:', data.message || data.error);
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // Enhanced authentication failure handling
        this._handleAuthenticationFailure(data);
    },
    
    /**
     * FIXED: Handle authentication failure properly
     */
    _handleAuthenticationFailure(data) {
        this._log('🔑 FIXED: Handling authentication failure...');
        
        // Close connection
        if (this.socket) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        this._cleanupConnection();
        
        // Determine error type
        const isTokenError = data.message && (
            data.message.includes('expired') || 
            data.message.includes('invalid') ||
            data.message.includes('httpOnly') ||
            data.code === 'AUTH_FAILED'
        );
        
        if (isTokenError) {
            this._log('🔄 FIXED: Token/cookie error detected - likely httpOnly cookie issue');
            
            // Notify about authentication failure
            const errorData = {
                error: 'Authentication failed - please refresh the page to update your session',
                requiresLogin: false,
                requiresPageRefresh: true,
                reason: 'httpOnly cookie validation failed',
                originalError: data
            };
            
            this._notifyErrorListeners(errorData);
        } else {
            // Non-recoverable authentication error
            const errorData = {
                error: 'Authentication failed - please refresh the page and log in again',
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
        this._log('🔑 Session expired event received');
        
        this.isAuthenticated = false;
        
        if (this.socket) {
            this.socket.close(4000, 'Session expired');
        }
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // Clear message queue
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
            this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
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
                    this._sendHeartbeat();
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
    _sendHeartbeat() {
        try {
            this._sendMessageWithRetry({ 
                type: 'ping', 
                timestamp: new Date().toISOString() 
            }).catch(error => {
                this._error('Heartbeat failed:', error);
            });
            
            this._log('💓 Heartbeat sent');
            
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
        
        if (this.isAuthenticated) {
            try {
                await this._sendMessageWithRetry(messageData);
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
                await this._sendMessageWithRetry(messageData);
                sent++;
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
    
    removeListener(type, callback) {
        const listeners = {
            'message': this.messageListeners,
            'status': this.statusListeners,
            'error': this.errorListeners,
            'authSuccess': this.authSuccessListeners,
            'authError': this.authErrorListeners
        };
        
        const array = listeners[type];
        if (array) {
            const index = array.indexOf(callback);
            if (index > -1) array.splice(index, 1);
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
            hasCookies: {
                authenticated: this._getCookie('authenticated') === 'true',
                accessToken: !!this._getCookie('access_token'),
                userInfo: !!this._getCookie('user_info')
            }
        };
    },
    
    /**
     * Force reconnect
     */
    async forceReconnect() {
        this._log('🔄 ROBUST: Force reconnecting...');
        
        // Disconnect first
        this.disconnect();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check and refresh authentication
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
            window.AAAI_LOGGER.debug('[ChatService ROBUST]', ...args);
        } else if (this.options.debug) {
            console.log('[ChatService ROBUST]', ...args);
        }
    },
    
    
    _error(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService ROBUST]', ...args);
        } else {
            console.error('[ChatService ROBUST]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}