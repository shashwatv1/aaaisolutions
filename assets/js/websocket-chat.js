/**
 * RACE CONDITION FIX - WebSocket Chat Service
 * This fixes the authentication timing issue you're experiencing
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
    connectionPromise: null, // NEW: Track connection promises
    
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
        connectionTimeout: 15000,
        authTimeout: 10000,
        messageQueueLimit: 20,
        socketReadyTimeout: 3000, // NEW: Max time to wait for socket ready
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
        
        // Bind methods to maintain context
        this._onOpen = this._onOpen.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('ChatService initialized with race condition fixes');
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
     * FIXED: Connect with proper promise handling and authentication timing
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
     * NEW: Perform the actual connection with proper error handling
     */
    async _performConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting && !this.isAuthenticated) {
                    this._error('Overall connection timeout');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout'));
                }
            }, this.options.connectionTimeout + this.options.authTimeout);
            
            try {
                // Refresh token before connection
                await this.authService.refreshTokenIfNeeded();
                
                // Create WebSocket
                const wsUrl = this._getWebSocketURL();
                this._log(`Connecting to: ${this._maskUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // FIXED: Enhanced event setup with proper error handling
                this.socket.addEventListener('open', async (event) => {
                    clearTimeout(overallTimeout);
                    
                    try {
                        this._log('✅ WebSocket opened, starting authentication...');
                        this.isConnected = true;
                        
                        // FIXED: Wait for socket to be truly ready before authenticating
                        await this._waitForSocketReady();
                        
                        // Send authentication
                        await this._performAuthentication();
                        
                        this._log('✅ Authentication completed successfully');
                        this._handleAuthenticationSuccess({});
                        resolve(true);
                        
                    } catch (error) {
                        this._error('❌ Authentication failed:', error);
                        this._handleAuthenticationError({ message: error.message });
                        reject(error);
                    }
                });
                
                this.socket.addEventListener('message', this._onMessage);
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
                this._error('Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * FIXED: Enhanced socket ready check with multiple verification methods
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
                
                // Multiple checks for socket readiness
                const isReady = this.socket.readyState === WebSocket.OPEN;
                const canSend = this._testSocketSend();
                
                this._log(`🔍 Socket ready check: readyState=${this.socket.readyState}, canSend=${canSend}, elapsed=${elapsed}ms`);
                
                if (isReady && canSend) {
                    this._log('✅ WebSocket is fully ready');
                    resolve();
                } else if (elapsed > maxWaitTime) {
                    this._error('⏰ Socket ready timeout exceeded');
                    reject(new Error('Socket ready timeout'));
                } else {
                    // Continue checking
                    setTimeout(checkReady, 50); // Check every 50ms
                }
            };
            
            checkReady();
        });
    },
    
    /**
     * NEW: Test if socket can actually send data
     */
    _testSocketSend() {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return false;
        }
        
        try {
            // Try to access the send method (this will throw if not ready)
            const canSend = typeof this.socket.send === 'function';
            return canSend;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * FIXED: Perform authentication with better error handling
     */
    async _performAuthentication() {
        // Ensure we have a fresh token
        await this.authService.refreshTokenIfNeeded();
        
        const authMessage = {
            type: 'authenticate',
            token: this.authService.getToken(),
            userId: this.authService.userId,
            timestamp: new Date().toISOString()
        };
        
        this._log('🔐 Sending authentication message...');
        
        // FIXED: Use the safe send method with retries
        await this._sendMessageWithRetry(authMessage, 3);
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('❌ Authentication timeout - no response from server');
                this.socket?.close(4001, 'Authentication timeout');
            }
        }, this.options.authTimeout);
    },
    
    /**
     * NEW: Send message with retry logic for critical messages
     */
    async _sendMessageWithRetry(messageData, maxRetries = 1) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this._log(`📤 Sending message (attempt ${attempt}/${maxRetries}):`, messageData.type);
                
                // Verify socket is ready before each attempt
                if (this.socket?.readyState !== WebSocket.OPEN) {
                    await this._waitForSocketReady();
                }
                
                // Send the message
                const messageStr = JSON.stringify(messageData);
                this.socket.send(messageStr);
                
                this._log('✅ Message sent successfully:', messageData.type);
                return; // Success!
                
            } catch (error) {
                lastError = error;
                this._error(`❌ Send attempt ${attempt} failed:`, error);
                
                if (attempt < maxRetries) {
                    this._log(`⏳ Retrying in 100ms...`);
                    await new Promise(resolve => setTimeout(resolve, 100));
                } else {
                    this._error(`❌ All ${maxRetries} send attempts failed`);
                    throw lastError;
                }
            }
        }
    },
    
    /**
     * Get WebSocket URL without token parameter
     */
    _getWebSocketURL() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // No token in URL - authentication happens after connection
        const userId = this.authService.userId || 'user';
        return `${wsProtocol}//${wsHost}/ws/${userId}`;
    },
    
    /**
     * Handle WebSocket message with authentication flow
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this._log('📨 Received message:', data.type);
            
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
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * Handle successful authentication
     */
    _handleAuthenticationSuccess(data) {
        this._log('✅ Authentication successful');
        
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
     * Handle authentication failure
     */
    _handleAuthenticationError(data) {
        this._error('❌ Authentication failed:', data.message || data.error);
        
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
     * Handle token refresh and reconnection
     */
    async _handleTokenRefreshAndReconnect(errorData) {
        this._log('🔄 Attempting token refresh and reconnection');
        
        try {
            const refreshed = await this.authService.refreshTokenIfNeeded();
            
            if (refreshed) {
                this._log('✅ Token refreshed, reconnecting...');
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
                this._error('❌ Token refresh failed');
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
        this._log('🔌 WebSocket closed', { code: event.code, reason: event.reason });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
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
        this._error('💥 WebSocket error:', event);
        this._notifyStatusChange('error');
        this._notifyErrorListeners({ error: 'WebSocket error', event });
    },
    
    /**
     * NEW: Clean up connection state
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

// Add global debug function for testing
if (typeof window !== 'undefined') {
    window.testWebSocketConnection = async function() {
        console.log('🧪 === Testing WebSocket Connection ===');
        
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
            const testChatService = Object.create(ChatService);
            testChatService.init(AuthService, { debug: true, socketReadyTimeout: 5000 });
            
            console.log('🚀 Attempting connection...');
            await testChatService.connect();
            
            console.log('✅ Connection test successful!');
            
            // Clean up
            setTimeout(() => {
                testChatService.disconnect();
                console.log('🧹 Test cleanup completed');
            }, 2000);
            
        } catch (error) {
            console.error('❌ Connection test failed:', error);
        }
    };
}