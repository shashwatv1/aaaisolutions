// assets/js/websocket-chat.js (UPDATED FOR JWT-ONLY)
/**
 * JWT-Only WebSocket Chat Service for AAAI Solutions
 * Simplified to work only with JWT authentication
 */
const ChatService = {
    // Core WebSocket state
    socket: null,
    isConnected: false,
    isConnecting: false,
    isAuthenticated: false,
    isInitialized: false,
    
    // Service dependencies
    authService: null,
    projectService: null,
    
    // Connection management
    reconnectAttempts: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
    sessionId: null,
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    pendingMessages: new Map(),
    deliveredMessages: new Set(),
    
    // Configuration
    options: {
        reconnectInterval: 3000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 60000,
        connectionTimeout: 15000,
        debug: false
    },
    
    /**
     * Initialize JWT-only ChatService
     */
    init(authService, options = {}) {
        if (this.isInitialized) {
            console.log('💬 JWT ChatService already initialized');
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService is required for JWT ChatService');
        }
        
        this.authService = authService;
        this.projectService = window.ProjectService;
        this.options = { ...this.options, ...options };
        
        // Set debug mode
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        this.isInitialized = true;
        
        this._log('JWT ChatService initialized successfully', {
            hasAuthService: !!this.authService,
            hasProjectService: !!this.projectService,
            authMethod: 'jwt_bearer_only'
        });
        
        return this;
    },

    /**
     * Check if authentication is ready for WebSocket operations
     */
    _requireAuth() {
        if (!this.authService || !this.authService.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket operations');
        }
        
        // Additional validation for user access token
        const token = this.authService.getToken();
        if (!token) {
            throw new Error('No valid user access token available for WebSocket');
        }
        
        return true;
    },

    /**
     * Build WebSocket URL with NGINX proxy routing
     */
    _buildWebSocketURL(user, projectContext = {}) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'wss:'; // Always use secure WebSocket
        
        // Use the main domain for NGINX proxy routing
        const wsHost = window.location.host || 'aaai.solutions';
        
        // Build parameters without JWT token (JWT will go in subprotocol)
        const params = new URLSearchParams({
            user_id: user.id,
            email: encodeURIComponent(user.email),
            chat_id: projectContext.chat_id || '',
            reel_id: projectContext.reel_id || '',
            session_id: user.sessionId || 'jwt_session',
            auth_method: 'jwt_bearer'
        });
        
        const url = `${wsProtocol}//${wsHost}/ws/${user.id}?${params}`;
        
        this._log('Built JWT WebSocket URL for NGINX proxy:', url);
        
        return url;
    },

    /**
     * ENHANCED: Connect with JWT authentication via NGINX proxy
     */
    async connect() {
        if (this.isConnected && this.isAuthenticated) {
            this._log('Already connected and authenticated');
            return true;
        }
        
        if (this.isConnecting) {
            this._log('Connection already in progress');
            return false;
        }
        
        this._log('Starting JWT WebSocket connection via NGINX proxy...');
        
        // Require authentication with enhanced validation
        this._requireAuth();
        
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('Complete user information not available');
        }

        // Get fresh JWT token and validate it's a user token
        let accessToken;
        try {
            accessToken = await this.authService._ensureValidAccessToken();
            if (!accessToken) {
                throw new Error('No valid access token available');
            }
            
            // Additional validation that this is a user token
            if (!this.authService._validateUserToken || !this.authService._validateUserToken(accessToken)) {
                throw new Error('Invalid user access token for WebSocket connection');
            }
        } catch (error) {
            throw new Error(`Token validation failed: ${error.message}`);
        }
        
        return new Promise((resolve, reject) => {
            this.isConnecting = true;
            this.connectionStartTime = Date.now();
            this._notifyStatusChange('connecting');
            
            // Get current project context
            let projectContext = {};
            if (this.projectService) {
                const context = this.projectService.getContext();
                projectContext = {
                    chat_id: context.chat_id || '',
                    reel_id: context.reel_id || '',
                    project_name: context.project_name || ''
                };
            }
            
            // Build WebSocket URL for NGINX proxy
            const wsUrl = this._buildWebSocketURL(user, projectContext);
            this._log('Connecting to JWT WebSocket via NGINX proxy:', wsUrl);
            
            // Connection timeout
            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._log('JWT WebSocket connection timeout');
                    this._cleanup();
                    this.isConnecting = false;
                    this._notifyStatusChange('disconnected');
                    reject(new Error('Connection timeout after 15 seconds'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // Create WebSocket with JWT token in subprotocol
                // NGINX will forward this to Cloud Run with proper headers
                const protocols = [`authorization.bearer.${accessToken}`];
                this.socket = new WebSocket(wsUrl, protocols);
                
                // Handle open
                this.socket.onopen = () => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`JWT WebSocket opened via NGINX proxy in ${connectionTime}ms`);
                    this.isConnected = true;
                };
                
                // Handle messages with JWT authentication context
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const messageTime = Date.now() - this.connectionStartTime;
                        this._log(`JWT Message received via NGINX proxy (${data.type}) after ${messageTime}ms`);
                        
                        // Handle JWT session establishment
                        if (data.type === 'session_established') {
                            this._log('JWT session established with server via NGINX proxy');
                            
                            this.isAuthenticated = true;
                            this.isConnecting = false;
                            this.reconnectAttempts = 0;
                            this.sessionId = data.session_id;
                            
                            clearTimeout(timeout);
                            this._notifyStatusChange('connected');
                            this._startHeartbeat();
                            this._processQueuedMessages();
                            this._requestPendingMessages();
                            
                            resolve(true);
                            return;
                        }
                        
                        // Handle JWT authentication errors
                        if (data.type === 'error' && this.isConnecting) {
                            this._log('JWT connection error via NGINX proxy:', data.message);
                            clearTimeout(timeout);
                            this.isConnecting = false;
                            this._cleanup();
                            
                            if (data.message.includes('token') || data.message.includes('authentication')) {
                                reject(new Error(`JWT Authentication failed: ${data.message}`));
                            } else {
                                reject(new Error(`Connection failed: ${data.message}`));
                            }
                            return;
                        }
                        
                        // Handle other messages
                        this._handleMessage(data);
                        
                    } catch (e) {
                        this._error('JWT Message parse error via NGINX proxy:', e);
                        this._error('Raw message:', event.data);
                    }
                };
                
                // Handle close with JWT authentication context
                this.socket.onclose = (event) => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`JWT WebSocket closed via NGINX proxy after ${connectionTime}ms:`, event.code, event.reason);
                    
                    if (this.isConnecting) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        reject(new Error(`Connection closed: ${event.reason || 'Unknown reason'}`));
                        return;
                    }
                    
                    this._handleClose(event);
                };
                
                // Handle errors
                this.socket.onerror = (event) => {
                    this._error('JWT WebSocket error via NGINX proxy:', event);
                    
                    if (this.isConnecting) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        this._cleanup();
                        reject(new Error('JWT WebSocket connection error via NGINX proxy'));
                    }
                };
                
            } catch (error) {
                clearTimeout(timeout);
                this.isConnecting = false;
                this._cleanup();
                reject(error);
            }
        });
    },
    
    /**
     * ENHANCED: Send message with JWT authentication validation
     */
    async sendMessage(text) {
        if (!text || !text.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        // Require authentication
        this._requireAuth();
        
        const messageId = this._generateId();
        
        // Get current context with enhanced validation
        const user = this.authService.getCurrentUser();
        if (!user || !user.id) {
            throw new Error('User information not available');
        }
        
        let context = {
            user_id: user.id
        };
        
        if (this.projectService) {
            const projectContext = this.projectService.getContext();
            context = {
                ...context,
                chat_id: projectContext.chat_id,
                reel_id: projectContext.reel_id,
                project_name: projectContext.project_name
            };
        }
        
        const message = {
            type: 'message',
            message: text.trim(),
            id: messageId,
            timestamp: new Date().toISOString(),
            context: context,
            auth_method: 'jwt_bearer'
        };
        
        if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this._log('Sending JWT-authenticated message:', messageId);
            this.socket.send(JSON.stringify(message));
            
            // Track as pending
            this.pendingMessages.set(messageId, {
                queuedAt: Date.now(),
                status: 'sent'
            });
            
            return messageId;
        } else if (this.isConnected && !this.isAuthenticated) {
            throw new Error('Connected but not authenticated with JWT');
        } else {
            // Queue message and try to connect
            this._queueMessage(message);
            
            if (!this.isConnecting && !this.isConnected) {
                try {
                    await this.connect();
                } catch (e) {
                    throw new Error(`JWT connection failed: ${e.message}`);
                }
            }
            
            return messageId;
        }
    },
    
    /**
     * Load chat history with JWT authentication
     */
    async loadChatHistory() {
        if (!this.authService._isAuthenticationComplete()) {
            throw new Error('Complete JWT authentication required to load chat history');
        }
        
        if (!this.projectService) {
            this._log('No ProjectService available for chat history');
            return [];
        }
        
        try {
            const context = this.projectService.getContext();
            
            if (!context.chat_id) {
                this._log('No project context for chat history');
                return [];
            }
            
            this._log('Loading JWT chat history for context:', context);
            
            const result = await this.authService.executeFunction('get_chat_messages', {
                user_id: context.user_id,
                chat_id: context.chat_id,
                reel_id: context.reel_id,
                limit: 50
            });
            
            if (result?.data?.success) {
                return result.data.messages || [];
            }
            
            return [];
            
        } catch (error) {
            this._error('Failed to load JWT chat history:', error);
            return [];
        }
    },
    
    /**
     * Force reconnect with JWT authentication
     */
    async forceReconnect() {
        this._log('Force reconnecting with JWT authentication');
        
        // Ensure we have complete authentication before reconnecting
        if (!this.authService._isAuthenticationComplete()) {
            throw new Error('Cannot reconnect: Complete JWT authentication required');
        }
        
        this.disconnect();
        this.reconnectAttempts = 0;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return this.connect();
    },
    
    /**
     * Get status with JWT details
     */
    getStatus() {
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            sessionId: this.sessionId,
            socketState: this.socket ? this.socket.readyState : null,
            pendingMessages: this.pendingMessages.size,
            deliveredMessages: this.deliveredMessages.size,
            authMethod: 'jwt_bearer_only',
            authenticationComplete: this.authService._isAuthenticationComplete(),
            hasValidAuth: this.authService ? this.authService._isAuthenticationComplete() : false,
            userInfo: this.authService._isAuthenticationComplete() ? this.authService.getCurrentUser() : null,
            jwtToken: this.authService._isAuthenticationComplete() ? !!this.authService.getToken() : false,
            gatewayRouting: true
        };
    },
    
    // Event listeners (unchanged)
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
    
    // Private methods
    
    /**
     * Handle connection close with JWT context
     */
    _handleClose(event) {
        this._cleanup();
        this._notifyStatusChange('disconnected');
        
        const shouldReconnect = event.code !== 1000 && // Normal closure
                              event.code !== 1001 && // Going away
                              event.code !== 4001 && // Authentication failed
                              event.code !== 4002 && // JWT token expired/invalid
                              this.reconnectAttempts < this.options.maxReconnectAttempts &&
                              this.authService._isAuthenticationComplete(); // JWT auth check
        
        if (event.code === 4002) {
            // JWT token expired/invalid during connection
            this._log('JWT WebSocket closed due to token expiration/invalid');
            this._handleJWTTokenExpiration().catch(error => {
                this._error('JWT token expiration handling failed:', error);
            });
            return;
        }
        
        if (shouldReconnect) {
            this._log(`JWT connection lost (code ${event.code}), attempting reconnect...`);
            this._scheduleReconnect();
        } else if (event.code === 4001 || event.code === 4002) {
            this._error('JWT authentication failed - please login again');
            this._notifyErrorListeners({
                type: 'jwt_auth_failed',
                message: 'JWT authentication failed, please login again'
            });
        } else {
            this._log(`JWT connection closed permanently (code ${event.code}): ${event.reason}`);
        }
    },
    
    /**
     * Handle JWT token expiration
     */
    async _handleJWTTokenExpiration() {
        this._log('JWT token expired during WebSocket connection, refreshing...');
        
        try {
            // Use token refresh
            await this.authService.refreshTokenIfNeeded();
            
            // Verify authentication is complete after refresh
            if (!this.authService._isAuthenticationComplete()) {
                throw new Error('JWT authentication incomplete after token refresh');
            }
            
            // Reconnect with new token
            this.disconnect();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.connect();
            
            this._log('JWT token refreshed and WebSocket reconnected');
        } catch (error) {
            this._error('JWT token refresh failed:', error);
            this._notifyErrorListeners({
                type: 'jwt_token_expired',
                message: 'JWT authentication expired, please login again'
            });
        }
    },
    
    /**
     * Schedule reconnect with JWT validation
     */
    _scheduleReconnect() {
        this.reconnectAttempts++;
        let delay = this.reconnectAttempts === 1 ? 1000 : (this.options.reconnectInterval * this.reconnectAttempts);
        delay = Math.min(delay, 10000);
        
        this._log(`JWT reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(() => {
            // Validate JWT authentication before attempting reconnect
            if (!this.authService._isAuthenticationComplete()) {
                this._error('JWT reconnect failed: Authentication incomplete');
                this._notifyErrorListeners({
                    type: 'reconnect_auth_failed',
                    message: 'Cannot reconnect: JWT authentication incomplete'
                });
                return;
            }
            
            this.connect().catch(e => {
                this._error('JWT reconnect failed:', e.message);
                if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
                    this._scheduleReconnect();
                } else {
                    this._error('Max JWT reconnect attempts reached');
                    this._notifyErrorListeners({
                        type: 'max_reconnect_attempts',
                        message: 'Maximum JWT reconnection attempts reached'
                    });
                }
            });
        }, delay);
    },
    
    disconnect() {
        this._log('Disconnecting JWT WebSocket');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this.pendingMessages.clear();
        this.isConnected = false;
        this.isAuthenticated = false;
        this.sessionId = null;
        
        this._notifyStatusChange('disconnected');
    },
    
    setProjectContext(chatId, projectName) {
        this._log('JWT project context updated', { chatId, projectName });
        
        // Notify server about context change if connected and authenticated
        if (this.isConnected && this.socket?.readyState === WebSocket.OPEN && this.authService._isAuthenticationComplete()) {
            const user = this.authService.getCurrentUser();
            this.socket.send(JSON.stringify({
                type: 'context_update',
                context: {
                    chat_id: chatId,
                    project_name: projectName,
                    user_id: user?.id
                },
                auth_method: 'jwt_bearer',
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    _handleMessage(data) {
        if (data.type === 'heartbeat' || data.type === 'ping') {
            this._sendPong();
            return;
        }
        
        if (data.type === 'pong') {
            return;
        }
        
        if (data.type === 'message_queued') {
            const messageId = data.message_id;
            this.pendingMessages.set(messageId, {
                queuedAt: Date.now(),
                status: 'pending'
            });
            
            this._notifyMessageListeners({
                type: 'message_queued',
                messageId: messageId,
                text: 'Processing your message...',
                timestamp: Date.now()
            });
            return;
        }
        
        if (data.type === 'chat_response') {
            const messageId = data.message_id;
            
            if (this.deliveredMessages.has(messageId)) {
                return;
            }
            
            this.deliveredMessages.add(messageId);
            this.pendingMessages.delete(messageId);
            
            this._notifyMessageListeners({
                type: 'chat_response',
                messageId: messageId,
                text: data.response?.text || 'No response text',
                components: data.response?.components || [],
                processingTime: data.processing_time || 0,
                timestamp: Date.now(),
                context: data.context
            });
            return;
        }
        
        if (data.type === 'chat_error') {
            const messageId = data.message_id;
            
            if (this.deliveredMessages.has(messageId)) {
                return;
            }
            
            this.deliveredMessages.add(messageId);
            this.pendingMessages.delete(messageId);
            
            this._notifyMessageListeners({
                type: 'chat_error',
                messageId: messageId,
                error: data.error || 'Unknown error occurred',
                timestamp: Date.now()
            });
            return;
        }
        
        // Handle unknown message types
        this._notifyMessageListeners(data);
    },
    
    _startHeartbeat() {
        this._stopHeartbeat();
        
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ 
                    type: 'ping',
                    auth_method: 'jwt_bearer',
                    timestamp: Date.now()
                }));
            }
        }, this.options.heartbeatInterval);
    },
    
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    _sendPong() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ 
                type: 'pong',
                auth_method: 'jwt_bearer',
                timestamp: Date.now()
            }));
        }
    },
    
    _queueMessage(message) {
        this.messageQueue.push(message);
        this._log('JWT message queued (total:', this.messageQueue.length, ')');
    },
    
    _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        this._log(`Processing ${messages.length} JWT queued messages`);
        
        messages.forEach(msg => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(msg));
                
                this.pendingMessages.set(msg.id, {
                    queuedAt: Date.now(),
                    status: 'sent'
                });
            } else {
                this.messageQueue.push(msg);
            }
        });
    },
    
    _requestPendingMessages() {
        // Request any pending messages from server
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'request_pending_messages',
                auth_method: 'jwt_bearer',
                timestamp: Date.now()
            }));
        }
    },
    
    _cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._stopHeartbeat();
        
        this.isConnected = false;
        this.isAuthenticated = false;
    },
    
    _generateId() {
        return `jwt_msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    _notifyMessageListeners(data) {
        this.messageListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                this._error('Error in JWT message listener:', e);
            }
        });
    },
    
    _notifyStatusChange(status) {
        this._log(`JWT status change: ${status}`);
        this.statusListeners.forEach(callback => {
            try {
                callback(status, this.getStatus());
            } catch (e) {
                this._error('Error in JWT status listener:', e);
            }
        });
    },
    
    _notifyErrorListeners(data) {
        this.errorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                this._error('Error in JWT error listener:', e);
            }
        });
    },
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[JWT ChatService]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[JWT ChatService]', ...args);
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatService;
}