/**
 * Complete WebSocket Chat Service for AAAI Solutions
 * Fixed version with proper refresh token support - no HTTP fallback
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
    authRetryAttempted: false,
    
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
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000,
        connectionTimeout: 20000,
        authTimeout: 15000,
        messageQueueLimit: 20,
        socketReadyTimeout: 5000,
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
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('Complete ChatService initialized');
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
        
        // Handle network changes
        window.addEventListener('online', () => {
            this._log('Network online');
            if (this.authService.isAuthenticated() && !this.isConnected) {
                setTimeout(() => this.connect(), 1000);
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
     * Connect with mandatory token refresh
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
        
        // Try to refresh token before WebSocket connection
        this._log('🔄 Attempting token refresh before WebSocket connection...');
        try {
            // Check if forceTokenRefresh exists before calling it
            if (typeof this.authService.forceTokenRefresh === 'function') {
                const refreshed = await this.authService.forceTokenRefresh();
                if (refreshed) {
                    this._log('✅ Token successfully refreshed');
                } else {
                    this._log('⚠️ Token refresh unsuccessful, but continuing with current token');
                }
            } else {
                // Fall back to standard refresh if forceTokenRefresh doesn't exist
                await this.authService.refreshTokenIfNeeded();
            }
            
            // Verify token
            const token = this.authService.getToken();
            if (!token) {
                throw new Error('No authentication token available');
            }
            
            // Continue with connection even if refresh fails - the token might still be valid
        } catch (error) {
            this._error('❌ Token refresh error:', error);
            // Continue anyway - don't block the connection attempt
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
     * Perform the actual WebSocket connection
     */
    async _performConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting && !this.isAuthenticated) {
                    this._error('❌ Overall connection timeout');
                    this._cleanupConnection();
                    reject(new Error('WebSocket connection timeout'));
                }
            }, this.options.connectionTimeout + this.options.authTimeout);
            
            try {
                // Create WebSocket
                const wsUrl = this._getWebSocketURL();
                this._log(`🔌 Connecting to: ${this._maskUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // WebSocket event handlers
                this.socket.addEventListener('open', async (event) => {
                    clearTimeout(overallTimeout);
                    
                    try {
                        this._log('✅ WebSocket opened, starting authentication process...');
                        this.isConnected = true;
                        
                        // Wait for socket stability
                        await this._waitForSocketStabilization();
                        
                        if (this.socket.readyState !== WebSocket.OPEN) {
                            throw new Error('Socket closed during stabilization');
                        }
                        
                        // Perform authentication
                        await this._performAuthentication();
                        
                        this._log('✅ WebSocket authentication process completed');
                        
                        // Wait for authentication response
                        // The actual success will be handled in _onMessage
                        
                    } catch (error) {
                        this._error('❌ WebSocket connection/authentication failed:', error);
                        reject(error);
                    }
                });
                
                this.socket.addEventListener('message', (event) => {
                    this._onMessage(event, resolve, reject);
                });
                
                this.socket.addEventListener('close', (event) => {
                    clearTimeout(overallTimeout);
                    this._onClose(event);
                });
                
                this.socket.addEventListener('error', (event) => {
                    clearTimeout(overallTimeout);
                    this._onError(event);
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection failed'));
                    }
                });
                
            } catch (error) {
                clearTimeout(overallTimeout);
                this.isConnecting = false;
                this._error('❌ Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Wait for socket stabilization with error detection
     */
    async _waitForSocketStabilization() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxWaitTime = this.options.socketReadyTimeout;
            let errorReceived = false;
            
            // Listen for immediate error messages
            const errorListener = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'error') {
                        errorReceived = true;
                        this._error('❌ Immediate server error received:', data);
                        reject(new Error(`Server error: ${data.message || 'Unknown error'}`));
                        return;
                    }
                } catch (e) {
                    // Not JSON, ignore
                }
            };
            
            this.socket.addEventListener('message', errorListener);
            
            const checkReady = () => {
                const elapsed = Date.now() - startTime;
                
                if (errorReceived) {
                    if (this.socket) {
                        this.socket.removeEventListener('message', errorListener);
                    }
                    return; // Already rejected
                }
                
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    if (this.socket) {
                        this.socket.removeEventListener('message', errorListener);
                    }
                    reject(new Error('WebSocket closed during stabilization'));
                    return;
                }
                const isReady = this._testSocketSend();
                
                this._log(`🔍 Socket stabilization: readyState=${this.socket.readyState}, canSend=${isReady}, elapsed=${elapsed}ms`);
                
                if (isReady && elapsed >= 300) { // Wait at least 300ms for stability
                    this.socket.removeEventListener('message', errorListener);
                    this._log('✅ WebSocket is stable and ready for authentication');
                    resolve();
                } else if (elapsed > maxWaitTime) {
                    this.socket.removeEventListener('message', errorListener);
                    this._error('⏰ Socket stabilization timeout');
                    reject(new Error('Socket stabilization timeout'));
                } else {
                    setTimeout(checkReady, 100);
                }
            };
            
            setTimeout(checkReady, 200); // Initial delay
        });
    },
    
    /**
     * Test if socket can send data
     */
    _testSocketSend() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        
        try {
            return typeof this.socket.send === 'function';
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Perform WebSocket authentication
     */
    async _performAuthentication() {
        // Get fresh token
        const token = this.authService.getToken();
        const user = this.authService.getCurrentUser();
        
        if (!token || !user.id) {
            throw new Error('Missing authentication credentials');
        }
        
        // Validate token 
        if (!this._isTokenValid(token)) {
            throw new Error('Token appears expired during authentication');
        }
        
        // Updated authentication message format
        const authMessage = {
            type: 'authenticate',
            token: token,
            userId: user.id,
            email: user.email,
            timestamp: new Date().toISOString(),
            client: 'web',
            version: window.AAAI_CONFIG?.VERSION || '1.0'
        };
        
        this._log('🔐 Sending authentication message...');
        
        // Send authentication
        await this._sendMessageWithRetry(authMessage, 3);
    
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('❌ Authentication timeout - no response from server');
                if (this.socket) {
                    this.socket.close(4001, 'Authentication timeout');
                }
            }
        }, this.options.authTimeout);
    },
    
    /**
     * Get WebSocket URL
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
        
        // Add timestamp parameter to prevent caching issues
        const timestamp = Date.now();
        return `${wsProtocol}//${wsHost}/ws/${user.id}?token=${encodeURIComponent(this.authService.getToken())}&t=${timestamp}`;
    },

    /**
     * Handle WebSocket messages
     */
    _onMessage(event, connectResolve = null, connectReject = null) {
        try {
            const data = JSON.parse(event.data);
            this._log('📨 Received message:', data.type);
            
            // Handle authentication success
            if (data.type === 'auth_success' || data.type === 'authenticated') {
                this._handleAuthenticationSuccess(data);
                if (connectResolve) {
                    connectResolve(true);
                }
                return;
            }
            
            // Handle authentication failure
            if (data.type === 'auth_error' || data.type === 'authentication_failed') {
                this._handleAuthenticationError(data);
                if (connectReject) {
                    connectReject(new Error(data.message || 'Authentication failed'));
                }
                return;
            }
            
            // Handle server errors
            if (data.type === 'error') {
                this._error('❌ Server error received:', data);
                
                // If during connection, treat as auth error
                if (this.isConnecting && !this.isAuthenticated) {
                    this._handleAuthenticationError({
                        message: data.message || 'Server error during authentication',
                        code: data.code,
                        requires_refresh: data.requires_refresh
                    });
                    if (connectReject) {
                        connectReject(new Error(`Server error: ${data.message}`));
                    }
                    return;
                }
                
                // Regular error handling
                this._notifyErrorListeners({
                    error: data.message || 'Server error',
                    code: data.code
                });
                return;
            }
            
            // Handle heartbeat
            if (data.type === 'ping') {
                this._sendMessageWithRetry({ type: 'pong' }).catch(err => 
                    this._error('Failed to send pong:', err)
                );
                return;
            }
            
            if (data.type === 'pong') {
                return; // Heartbeat acknowledged
            }
            
            // Handle regular messages (only if authenticated)
            if (this.isAuthenticated) {
                this._notifyMessageListeners(data);
            } else {
                this._log('⚠️ Received message before authentication, ignoring:', data.type);
            }
            
        } catch (error) {
            this._error('❌ Error processing message:', error);
        }
    },
    
    /**
     * Handle successful authentication
     */
    _handleAuthenticationSuccess(data) {
        this._log('✅ WebSocket authentication successful');
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.authRetryAttempted = false;
        
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
    },
    
    /**
     * Handle authentication failure
     */
    _handleAuthenticationError(data) {
        this._error('❌ WebSocket authentication failed:', data.message || data.error);
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // Close socket if still open
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        // Handle token refresh requirement
        if (data.requires_refresh || data.code === 'AUTH_FAILED') {
            this._log('🔄 Server requires token refresh, attempting...');
            this._handleTokenRefreshAndReconnect(data);
        } else {
            setTimeout(() => {
                this._handleTokenRefreshAndReconnect(data);
            }, 2000);
        }
    },
    
    /**
     * Handle token refresh and reconnection
     */
    async _handleTokenRefreshAndReconnect(errorData) {
        this._log('🔄 Attempting token refresh and reconnection');
        
        try {
            this._log('🔄 Forcing token refresh due to WebSocket authentication failure...');
            
            // Try standard refresh first
            let refreshed = await this.authService.refreshTokenIfNeeded();
            
            if (!refreshed) {
                // Try force refresh
                if (typeof this.authService.forceTokenRefresh === 'function') {
                    this._log('🔄 Attempting forced token refresh...');
                    refreshed = await this.authService.forceTokenRefresh();
                } else {
                    throw new Error('Token refresh methods not available');
                }
            }
            
            if (!refreshed) {
                throw new Error('All token refresh attempts failed');
            }
            
            // Verify new token
            const newToken = this.authService.getToken();
            if (!newToken || !this._isTokenValid(newToken)) {
                throw new Error('Token refresh resulted in invalid token');
            }
            
            this._log('✅ Token refresh successful, reconnecting...');
            
            // Reset flags
            this.authRetryAttempted = false;
            
            // Reconnect
            this.disconnect();
            setTimeout(() => {
                this.connect().catch(err => {
                    this._error('❌ Failed to reconnect after token refresh:', err);
                    this._handleAuthenticationFailure(errorData);
                });
            }, 1000);
            
        } catch (error) {
            this._error('❌ Token refresh failed:', error);
            this._handleAuthenticationFailure(errorData);
        }
    },
    
    /**
     * Handle final authentication failure
     */
    _handleAuthenticationFailure(errorData) {
        this._log('🚫 Authentication failure - user needs to re-authenticate');
        
        // Clean up everything
        this._cleanup();
        
        // Notify that user needs to log in again
        this._notifyErrorListeners({
            error: 'Session expired - please refresh the page and log in again',
            requiresLogin: true,
            requiresPageRefresh: true,
            originalError: errorData
        });
    },
    
    /**
     * Send message with retry logic
     */
    async _sendMessageWithRetry(messageData, maxRetries = 2) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this._log(`📤 Sending message (attempt ${attempt}/${maxRetries}):`, messageData.type);
                
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    throw new Error('WebSocket not open');
                }
                
                const messageStr = JSON.stringify(messageData);
                this.socket.send(messageStr);
                
                this._log('✅ Message sent successfully:', messageData.type);
                return;
                
            } catch (error) {
                lastError = error;
                this._error(`❌ Send attempt ${attempt} failed:`, error);
                
                if (attempt < maxRetries) {
                    this._log(`⏳ Retrying in 300ms...`);
                    await new Promise(resolve => setTimeout(resolve, 300));
                } else {
                    this._error(`❌ All ${maxRetries} send attempts failed`);
                    throw lastError;
                }
            }
        }
    },
    
    /**
     * Handle WebSocket close
     */
    _onClose(event) {
        this._log('🔌 WebSocket closed', { 
            code: event.code, 
            reason: event.reason,
            wasAuthenticated: this.isAuthenticated 
        });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // Determine if we should reconnect
        const shouldReconnect = this._shouldReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('Not reconnecting', { 
                code: event.code, 
                authenticated: this.authService.isAuthenticated(),
                shouldReconnect 
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
     * Determine if should reconnect
     */
    _shouldReconnect(code) {
        const noReconnectCodes = [1000, 1001, 1005, 4001, 4003, 4403];
        return !noReconnectCodes.includes(code) && 
               this.reconnectAttempts < this.options.maxReconnectAttempts;
    },
    
    /**
     * Schedule reconnection
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this._error('❌ Max reconnect attempts reached');
            this._notifyStatusChange('failed');
            return;
        }
        
        this.reconnectAttempts++;
        
        const delay = Math.min(
            this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
            30000
        );
        
        this._log(`⏰ Scheduling reconnect ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isAuthenticated && this.authService.isAuthenticated()) {
                try {
                    await this.connect();
                } catch (error) {
                    this._error('❌ Reconnect failed:', error);
                    this._scheduleReconnect();
                }
            }
        }, delay);
    },
    
    /**
     * Start heartbeat
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
     * Stop heartbeat
     */
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    /**
     * Send heartbeat
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
            // Queue message during authentication
            this._queueMessage(messageData);
            return messageData.id;
        } else {
            // Queue and try to connect
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
     * Queue message
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
     * Process queued messages
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
     * Generate message ID
     */
    _generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Disconnect
     */
    disconnect() {
        this._log('🔌 Disconnecting WebSocket');
        
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
            readyState: this.socket ? this.socket.readyState : null
        };
    },
    
    /**
     * Validate token
     */
    _isTokenValid(token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            // Token valid if expires more than 5 minutes from now
            return payload.exp && payload.exp > (now + 300);
        } catch (error) {
            this._error('Token validation error:', error);
            return false;
        }
    },
    
    /**
     * Utility methods
     */
    _maskUrl(url) {
        return url.replace(/\/ws\/[^?]*/, '/ws/***');
    },
    
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService]', ...args);
        }
    },
    
    _error(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService]', ...args);
        } else {
            console.error('[ChatService]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}

// Enhanced debugging utilities
if (typeof window !== 'undefined') {
    /**
     * Test WebSocket connection with complete flow
     */
    window.testWebSocketConnection = async function() {
        console.log('🧪 === Complete WebSocket Connection Test ===');
        
        if (!window.ChatService || !window.AuthService) {
            console.error('❌ ChatService or AuthService not available');
            return;
        }
        
        if (!AuthService.isAuthenticated()) {
            console.error('❌ Not authenticated');
            return;
        }
        
        try {
            console.log('🔧 Initializing test ChatService...');
            
            // Create test instance
            const testChatService = Object.create(ChatService);
            testChatService.init(AuthService, { 
                debug: true, 
                socketReadyTimeout: 5000,
                authTimeout: 10000,
                connectionTimeout: 15000
            });
            
            console.log('🚀 Attempting complete connection flow...');
            await testChatService.connect();
            
            console.log('✅ Connection test successful!');
            console.log('📊 Final status:', testChatService.getStatus());
            
            // Test sending a message
            console.log('📤 Testing message send...');
            await testChatService.sendMessage('Test message from connection test');
            console.log('✅ Message send test completed');
            
            // Clean up
            setTimeout(() => {
                testChatService.disconnect();
                console.log('🧹 Test cleanup completed');
            }, 3000);
            
        } catch (error) {
            console.error('❌ Connection test failed:', error);
            console.log('🔍 Debug info:');
            if (typeof debugChatService === 'function') {
                debugChatService();
            }
        }
    };
    
    /**
     * Debug ChatService status
     */
    window.debugChatService = function() {
        console.log('🔍 === Complete ChatService Debug Information ===');
        
        if (!window.ChatService) {
            console.error('❌ ChatService not available');
            return;
        }
        
        const status = ChatService.getStatus();
        console.log('📊 Connection Status:', status);
        
        if (typeof AuthService !== 'undefined') {
            const authStatus = AuthService.getSessionInfo();
            console.log('🔑 Auth Status:', authStatus);
            
            // Token analysis
            const token = AuthService.getToken();
            if (token) {
                try {
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        const now = Math.floor(Date.now() / 1000);
                        console.log('🎫 Token Analysis:', {
                            issued: new Date(payload.iat * 1000).toISOString(),
                            expires: new Date(payload.exp * 1000).toISOString(),
                            expiresIn: payload.exp - now,
                            isExpired: payload.exp <= now,
                            expiresWithin5Min: payload.exp <= (now + 300),
                            userId: payload.sub || payload.user_id,
                            email: payload.email
                        });
                    }
                } catch (e) {
                    console.warn('🎫 Could not parse token:', e);
                }
            }
        }
        
        console.log('⚙️ Configuration:', ChatService.options);
        console.log('📮 Message Queue:', ChatService.messageQueue.length);
        console.log('🔄 Reconnect Attempts:', ChatService.reconnectAttempts);
        console.log('🏴 Flags:', {
            authRetryAttempted: ChatService.authRetryAttempted,
            isConnecting: ChatService.isConnecting,
            isConnected: ChatService.isConnected,
            isAuthenticated: ChatService.isAuthenticated
        });
        
        if (ChatService.socket) {
            console.log('🔌 WebSocket Info:', {
                readyState: ChatService.socket.readyState,
                state: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ChatService.socket.readyState] || 'UNKNOWN',
                url: ChatService.socket.url ? ChatService.socket.url.replace(/\/ws\/[^?]*/, '/ws/***') : 'N/A'
            });
        } else {
            console.log('🔌 WebSocket: null');
        }
        
        console.log('🔍 === End Debug Information ===');
    };
    
    /**
     * Quick connection test
     */
    window.quickConnectionTest = async function() {
        console.log('⚡ === Quick Connection Test ===');
        
        if (!AuthService.isAuthenticated()) {
            console.error('❌ Not authenticated');
            return;
        }
        
        // Check token validity first
        const token = AuthService.getToken();
        if (token) {
            try {
                const parts = token.split('.');
                const payload = JSON.parse(atob(parts[1]));
                const now = Math.floor(Date.now() / 1000);
                
                console.log('🎫 Token Check:', {
                    expiresIn: payload.exp - now,
                    isExpired: payload.exp <= now,
                    needsRefresh: payload.exp <= (now + 300)
                });
                
                if (payload.exp <= (now + 300)) {
                    console.log('🔄 Token needs refresh, attempting...');
                    await AuthService.refreshTokenIfNeeded();
                    console.log('✅ Token refreshed');
                }
                
            } catch (e) {
                console.warn('Could not parse token for validation');
            }
        }
        
        try {
            const user = AuthService.getCurrentUser();
            const wsUrl = `wss://api-server-559730737995.us-central1.run.app/ws/${user.id}`;
            
            console.log('🔗 Testing connection to:', wsUrl.replace(/\/ws\/[^?]*/, '/ws/***'));
            
            const testWs = new WebSocket(wsUrl);
            
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    testWs.close();
                    reject(new Error('Connection timeout'));
                }, 15000);
                
                testWs.onopen = () => {
                    console.log('✅ WebSocket opened successfully');
                    
                    // Send authentication
                    const authMsg = {
                        type: 'authenticate',
                        token: AuthService.getToken(),
                        userId: user.id,
                        email: user.email,
                        timestamp: new Date().toISOString()
                    };
                    
                    console.log('🔐 Sending authentication...');
                    testWs.send(JSON.stringify(authMsg));
                };
                
                testWs.onerror = (error) => {
                    console.error('❌ WebSocket error:', error);
                    clearTimeout(timeout);
                    reject(new Error('WebSocket error'));
                };
                
                testWs.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log('📨 Received:', data.type, data.message || '');
                        
                        if (data.type === 'error') {
                            console.error('❌ Server error:', data);
                            clearTimeout(timeout);
                            testWs.close();
                            reject(new Error(`Server error: ${data.message}`));
                        } else if (data.type === 'auth_success' || data.type === 'authenticated') {
                            console.log('✅ Authentication successful!');
                            clearTimeout(timeout);
                            testWs.close();
                            resolve('Complete connection and authentication successful');
                        }
                    } catch (e) {
                        console.log('📨 Received non-JSON message:', event.data);
                    }
                };
                
                testWs.onclose = (event) => {
                    console.log('🔌 WebSocket closed:', event.code, event.reason);
                    clearTimeout(timeout);
                    
                    if (event.code === 4001) {
                        reject(new Error(`Authentication failed: ${event.reason}`));
                    } else if (!event.wasClean) {
                        reject(new Error(`Connection closed unexpectedly: ${event.code} ${event.reason}`));
                    }
                };
            });
            
        } catch (error) {
            console.error('❌ Quick test failed:', error);
            throw error;
        }
    };
    
    /**
     * Force token refresh test
     */
    window.testTokenRefresh = async function() {
        console.log('🔄 === Token Refresh Test ===');
        
        if (!AuthService.isAuthenticated()) {
            console.error('❌ Not authenticated');
            return;
        }
        
        try {
            console.log('🔄 Testing refreshTokenIfNeeded...');
            const result1 = await AuthService.refreshTokenIfNeeded();
            console.log('Result:', result1);
            
            if (typeof AuthService.forceTokenRefresh === 'function') {
                console.log('🔄 Testing forceTokenRefresh...');
                const result2 = await AuthService.forceTokenRefresh();
                console.log('Result:', result2);
            } else {
                console.log('⚠️ forceTokenRefresh method not available');
            }
            
            console.log('✅ Token refresh test completed');
            
        } catch (error) {
            console.error('❌ Token refresh test failed:', error);
        }
    };
    
    // Auto-run debug on load
    setTimeout(() => {
        if (typeof window.debugChatService === 'function') {
            console.log('🔍 Auto-running ChatService debug...');
            window.debugChatService();
        }
    }, 2000);
    
    console.log('🔧 Complete WebSocket Chat Service loaded with debug utilities:');
    console.log('  debugChatService() - Show detailed status');
    console.log('  quickConnectionTest() - Test basic connection');
    console.log('  testWebSocketConnection() - Full connection test');
    console.log('  testTokenRefresh() - Test token refresh methods');
}