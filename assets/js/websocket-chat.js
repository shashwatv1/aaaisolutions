/**
 * FINAL FIX - WebSocket Chat Service with Post-Connection Authentication
 * This implements the industry standard of authenticating AFTER connection establishment
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
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    
    // Configuration
    options: {
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000,
        connectionTimeout: 10000,
        authTimeout: 10000,
        messageQueueLimit: 20,
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
        this._onOpen = this._onOpen.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('ChatService initialized');
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
     * Connect to WebSocket with post-connection authentication
     */
    async connect() {
        if (!this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        if (this.isConnected) {
            this._log('Already connected');
            return true;
        }
        
        if (this.isConnecting) {
            this._log('Connection already in progress');
            return new Promise((resolve, reject) => {
                const checkConnection = () => {
                    if (this.isAuthenticated) {
                        resolve(true);
                    } else if (!this.isConnecting) {
                        reject(new Error('Connection failed'));
                    } else {
                        setTimeout(checkConnection, 100);
                    }
                };
                setTimeout(checkConnection, 100);
            });
        }
        
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            try {
                // Refresh token before connection attempt
                await this.authService.refreshTokenIfNeeded();
                
                // FIXED: Connect without token in URL - authentication happens after connection
                const wsUrl = this._getWebSocketURL();
                this._log(`Connecting to: ${this._maskUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // Set up connection handlers
                this.socket.addEventListener('open', (event) => {
                    this._onOpen(event);
                    // Don't resolve yet - wait for authentication
                });
                
                this.socket.addEventListener('message', this._onMessage);
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection failed'));
                    }
                });
                
                // Wait for authentication completion
                const authSuccessHandler = () => {
                    this.removeListener('authSuccess', authSuccessHandler);
                    this.removeListener('authError', authErrorHandler);
                    resolve(true);
                };
                
                const authErrorHandler = (error) => {
                    this.removeListener('authSuccess', authSuccessHandler);
                    this.removeListener('authError', authErrorHandler);
                    reject(new Error(error.message || 'Authentication failed'));
                };
                
                this.onAuthSuccess(authSuccessHandler);
                this.onAuthError(authErrorHandler);
                
                // Connection timeout
                setTimeout(() => {
                    if (this.isConnecting) {
                        this._error('Connection timeout');
                        this.socket?.close();
                        this.isConnecting = false;
                        reject(new Error('Connection timeout'));
                    }
                }, this.options.connectionTimeout);
                
            } catch (error) {
                this.isConnecting = false;
                this._error('Connection error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * FIXED: Get WebSocket URL without token parameter
     */
    _getWebSocketURL() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // FIXED: No token in URL - authentication happens after connection
        const userId = this.authService.userId || 'user';
        return `${wsProtocol}//${wsHost}/ws/${userId}`;
    },
    
    /**
     * Handle WebSocket open - immediately authenticate
     */
    async _onOpen(event) {
        this._log('WebSocket connected, sending authentication...');
        
        this.isConnected = true;
        // Note: isAuthenticated is still false until auth succeeds
        
        try {
            // FIXED: Send authentication message immediately after connection
            await this._sendAuthenticationMessage();
        } catch (error) {
            this._error('Failed to send authentication:', error);
            this.socket?.close();
        }
    },
    
    /**
     * FIXED: Send authentication message after connection
     */
    async _sendAuthenticationMessage() {
        // Ensure we have a fresh token
        await this.authService.refreshTokenIfNeeded();
        
        const authMessage = {
            type: 'authenticate',
            token: this.authService.getToken(),
            userId: this.authService.userId,
            timestamp: new Date().toISOString()
        };
        
        this._log('Sending authentication message');
        this._sendRawMessage(authMessage);
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('Authentication timeout');
                this._notifyAuthError({ message: 'Authentication timeout' });
                this.socket?.close();
            }
        }, this.options.authTimeout);
    },
    
    /**
     * Handle WebSocket message with authentication flow
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this._log('Received message:', data.type);
            
            // Handle authentication response
            if (data.type === 'auth_success' || data.type === 'authenticated') {
                this._handleAuthenticationSuccess(data);
                return;
            }
            
            if (data.type === 'auth_error' || data.type === 'authentication_failed') {
                this._handleAuthenticationError(data);
                return;
            }
            
            // Handle heartbeat
            if (data.type === 'ping') {
                this._sendRawMessage({ type: 'pong' });
                return;
            }
            
            if (data.type === 'pong') {
                return; // Heartbeat acknowledged
            }
            
            // Handle regular messages (only if authenticated)
            if (this.isAuthenticated) {
                this._notifyMessageListeners(data);
            } else {
                this._log('Received message before authentication, ignoring:', data.type);
            }
            
        } catch (error) {
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * FIXED: Handle successful authentication
     */
    _handleAuthenticationSuccess(data) {
        this._log('Authentication successful');
        
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
    },
    
    /**
     * FIXED: Handle authentication failure
     */
    _handleAuthenticationError(data) {
        this._error('Authentication failed:', data.message || data.error);
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // Try to refresh token and reconnect
        this._handleTokenRefreshAndReconnect(data);
    },
    
    /**
     * FIXED: Handle token refresh and reconnection
     */
    async _handleTokenRefreshAndReconnect(errorData) {
        this._log('Attempting token refresh and reconnection');
        
        try {
            const refreshed = await this.authService.refreshTokenIfNeeded();
            
            if (refreshed) {
                this._log('Token refreshed, reconnecting...');
                // Close current connection and reconnect
                this.disconnect();
                setTimeout(() => {
                    this.connect().catch(err => {
                        this._error('Failed to reconnect after token refresh:', err);
                        this._notifyErrorListeners({
                            error: 'Authentication failed - please log in again',
                            originalError: errorData
                        });
                    });
                }, 1000);
            } else {
                this._error('Token refresh failed');
                this._notifyErrorListeners({
                    error: 'Authentication failed - please log in again',
                    originalError: errorData
                });
            }
        } catch (error) {
            this._error('Error during token refresh:', error);
            this._notifyErrorListeners({
                error: 'Authentication failed - please log in again',
                originalError: errorData
            });
        }
    },
    
    /**
     * Handle WebSocket close
     */
    _onClose(event) {
        this._log('WebSocket closed', { code: event.code, reason: event.reason });
        
        this.isConnected = false;
        this.isConnecting = false;
        this.isAuthenticated = false;
        
        this._stopHeartbeat();
        this._notifyStatusChange('disconnected');
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        // Determine if we should reconnect
        const shouldReconnect = this._shouldReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('Not reconnecting', { code: event.code, authenticated: this.authService.isAuthenticated() });
        }
    },
    
    /**
     * Handle WebSocket error
     */
    _onError(event) {
        this._error('WebSocket error:', event);
        this._notifyStatusChange('error');
        this._notifyErrorListeners({ error: 'WebSocket error', event });
    },
    
    /**
     * Determine if we should attempt reconnection
     */
    _shouldReconnect(code) {
        const noReconnectCodes = [1000, 1001, 1005, 4001, 4403];
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
        
        this._log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
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
            
            this._log('Heartbeat started');
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
            this._sendRawMessage({ 
                type: 'ping', 
                timestamp: new Date().toISOString() 
            });
            
            this._log('Heartbeat sent');
            
        } catch (error) {
            this._error('Heartbeat failed:', error);
        }
    },
    
    /**
     * Send message through WebSocket (only if authenticated)
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
                this._sendRawMessage(messageData);
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
     * FIXED: Send raw message (internal method)
     */
    _sendRawMessage(messageData) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        
        try {
            this.socket.send(JSON.stringify(messageData));
            this._log('Raw message sent:', messageData.type);
        } catch (error) {
            this._error('Failed to send raw message:', error);
            throw error;
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
        
        this._log(`Message queued (${this.messageQueue.length}/${this.options.messageQueueLimit})`);
    },
    
    /**
     * Process all queued messages
     */
    _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        let sent = 0;
        messages.forEach(messageData => {
            try {
                this._sendRawMessage(messageData);
                sent++;
            } catch (error) {
                this._error('Failed to send queued message:', error);
                this._queueMessage(messageData);
            }
        });
        
        this._log(`Processed queued messages: ${sent} sent`);
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
        this._log('Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this.isConnected = false;
        this.isConnecting = false;
        this.isAuthenticated = false;
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
    
    // FIXED: New authentication event listeners
    onAuthSuccess(callback) {
        if (typeof callback === 'function') {
            this.authSuccessListeners = this.authSuccessListeners || [];
            this.authSuccessListeners.push(callback);
        }
    },
    
    onAuthError(callback) {
        if (typeof callback === 'function') {
            this.authErrorListeners = this.authErrorListeners || [];
            this.authErrorListeners.push(callback);
        }
    },
    
    removeListener(type, callback) {
        const listeners = {
            'message': this.messageListeners,
            'status': this.statusListeners,
            'error': this.errorListeners,
            'authSuccess': this.authSuccessListeners || [],
            'authError': this.authErrorListeners || []
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
    
    // FIXED: New authentication notification methods
    _notifyAuthSuccess(data) {
        if (this.authSuccessListeners) {
            this.authSuccessListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this._error('Error in auth success listener:', error);
                }
            });
        }
    },
    
    _notifyAuthError(data) {
        if (this.authErrorListeners) {
            this.authErrorListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    this._error('Error in auth error listener:', error);
                }
            });
        }
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
     * Utility methods
     */
    _maskUrl(url) {
        return url.replace(/token=[^&]*/, 'token=***');
    },
    
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService]', ...args);
        }
    },
    
    _error(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}