/**
 * Complete JWT-Enhanced WebSocket Chat Service for AAAI Solutions
 * Fully integrated with JWT Bearer token authentication
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
    
    // Message handling with delivery tracking
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    pendingMessages: new Map(),
    deliveredMessages: new Set(),
    
    // Performance tracking
    connectionStartTime: 0,
    lastPongTime: 0,
    messageCount: 0,
    
    // Configuration
    options: {
        reconnectInterval: 3000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 60000,
        connectionTimeout: 15000,
        debug: false
    },
    
    /**
     * Initialize the JWT chat service
     */
    init(authService, options = {}) {
        if (this.isInitialized) {
            console.log('💬 JWT ChatService already initialized');
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService is required for ChatService initialization');
        }
        
        this.authService = authService;
        this.projectService = window.ProjectService; // Get from global scope
        this.options = { ...this.options, ...options };
        
        // Set debug mode
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Get user context
        const user = authService.getCurrentUser();
        if (user) {
            this._log('JWT ChatService initialized for user:', user.email);
        }
        
        this.isInitialized = true;
        
        this._log('JWT ChatService initialized successfully', {
            userId: user?.id,
            hasProjectService: !!this.projectService,
            authMethod: 'jwt_bearer',
            maxReconnectAttempts: this.options.maxReconnectAttempts
        });
        
        return this;
    },
    
    /**
     * Connect to WebSocket with JWT authentication
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
        
        this._log('Starting JWT WebSocket connection...');
        
        // Check JWT authentication
        if (!this.authService.isAuthenticated()) {
            throw new Error('Not authenticated - please login first');
        }
        
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('User information not available');
        }
        
        // Ensure we have a valid JWT token
        try {
            await this.authService._ensureValidToken();
        } catch (error) {
            throw new Error('Failed to ensure valid JWT token: ' + error.message);
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
            
            // Build WebSocket URL with JWT authentication
            const wsUrl = this._buildJWTWebSocketURL(user, projectContext);
            this._log('Connecting to JWT WebSocket:', wsUrl);
            
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
                // Create WebSocket with JWT token in URL
                this.socket = new WebSocket(wsUrl);
                
                // Handle open
                this.socket.onopen = () => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`JWT WebSocket opened in ${connectionTime}ms`);
                    this.isConnected = true;
                };
                
                // Handle messages
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const messageTime = Date.now() - this.connectionStartTime;
                        this._log(`JWT Message received (${data.type}) after ${messageTime}ms`);
                        
                        // Handle JWT session establishment
                        if (data.type === 'session_established') {
                            this._log('JWT session established with server');
                            
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
                            this._log('JWT connection error:', data.message);
                            clearTimeout(timeout);
                            this.isConnecting = false;
                            this._cleanup();
                            
                            // Check if it's a JWT-specific error
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
                        this._error('JWT Message parse error:', e);
                        this._error('Raw message:', event.data);
                    }
                };
                
                // Handle close
                this.socket.onclose = (event) => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`JWT WebSocket closed after ${connectionTime}ms:`, event.code, event.reason);
                    
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
                    this._error('JWT WebSocket error:', event);
                    
                    if (this.isConnecting) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        this._cleanup();
                        reject(new Error('JWT WebSocket connection error'));
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
     * Send a message with JWT context integration
     */
    async sendMessage(text) {
        if (!text || !text.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const messageId = this._generateId();
        
        // Get current context from ProjectService
        let context = {
            user_id: this.authService.getCurrentUser()?.id
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
            auth_method: 'jwt_bearer' // Indicate JWT authentication
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
            // Queue message
            this._queueMessage(message);
            
            // Try to connect
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
     * Update project context (called by ProjectService)
     */
    setProjectContext(chatId, projectName) {
        this._log('JWT project context updated', { chatId, projectName });
        
        // Notify server about context change if connected
        if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'context_update',
                context: {
                    chat_id: chatId,
                    project_name: projectName,
                    user_id: this.authService.getCurrentUser()?.id
                },
                auth_method: 'jwt_bearer',
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    /**
     * Load chat history with JWT authentication
     */
    async loadChatHistory() {
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
     * Disconnect from WebSocket
     */
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
    
    /**
     * Force reconnect with fresh JWT token
     */
    async forceReconnect() {
        this._log('Force reconnecting with JWT authentication');
        
        // Ensure we have a valid token before reconnecting
        try {
            await this.authService._ensureValidToken();
        } catch (error) {
            throw new Error('Cannot reconnect: JWT token validation failed');
        }
        
        this.disconnect();
        this.reconnectAttempts = 0;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return this.connect();
    },
    
    /**
     * Handle JWT token expiration during WebSocket connection
     */
    async _handleTokenExpiration() {
        this._log('JWT token expired during WebSocket connection, refreshing...');
        
        try {
            // Refresh token
            await this.authService.refreshToken();
            
            // Reconnect with new token
            this.disconnect();
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.connect();
            
            this._log('JWT token refreshed and WebSocket reconnected');
        } catch (error) {
            this._error('JWT token refresh failed:', error);
            this._notifyErrorListeners({
                type: 'jwt_token_expired',
                message: 'Authentication expired, please login again'
            });
        }
    },
    
    /**
     * Get current status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            sessionId: this.sessionId,
            messageCount: this.messageCount,
            lastPongTime: this.lastPongTime,
            socketState: this.socket ? this.socket.readyState : null,
            pendingMessages: this.pendingMessages.size,
            deliveredMessages: this.deliveredMessages.size,
            authMethod: 'jwt_bearer',
            hasValidToken: this.authService ? this.authService._isTokenValid() : false
        };
    },
    
    // Event listeners
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
     * Build JWT WebSocket URL with authentication
     */
    _buildJWTWebSocketURL(user, projectContext = {}) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // Get JWT token for authentication
        const jwtToken = this.authService.getToken();
        if (!jwtToken) {
            throw new Error('No JWT token available for WebSocket authentication');
        }
        
        const params = new URLSearchParams({
            auth: 'jwt',
            token: jwtToken,
            email: encodeURIComponent(user.email),
            user_id: user.id,
            chat_id: projectContext.chat_id || '',
            reel_id: projectContext.reel_id || '',
            session_id: user.sessionId || 'jwt_session',
            t: Date.now()
        });
        
        const url = `${wsProtocol}//${wsHost}/ws/${user.id}?${params}`;
        
        // Log URL without exposing the full JWT token
        this._log('Built JWT WebSocket URL:', url.replace(/token=[^&]+/, 'token=***JWT_TOKEN***'));
        
        return url;
    },
    
    /**
     * Handle incoming messages with delivery tracking
     */
    _handleMessage(data) {
        this.messageCount++;
        
        if (data.type === 'session_established') {
            this.isAuthenticated = true;
            this._log('JWT session established with context:', data.context);
            this._notifyStatusChange('connected');
            return;
        }

        // Handle server heartbeat
        if (data.type === 'heartbeat' || data.type === 'ping') {
            this._log('Heartbeat from server');
            this._sendPong();
            return;
        }
        
        // Handle pong response
        if (data.type === 'pong') {
            this.lastPongTime = Date.now();
            return;
        }
        
        // Handle message queued confirmation
        if (data.type === 'message_queued' || data.type === 'message_status') {
            const messageId = data.message_id || data.messageId;
            this._log('Message status update:', data.status || 'queued', messageId);
            
            this.pendingMessages.set(messageId, {
                queuedAt: Date.now(),
                status: data.status || 'pending'
            });
            
            // Notify listeners about processing message
            if (!this.deliveredMessages.has(messageId)) {
                this._notifyMessageListeners({
                    type: 'message_queued',
                    messageId: messageId,
                    text: data.message || 'Processing your message...',
                    timestamp: Date.now()
                });
            }
            return;
        }
        
        // Handle chat response with delivery tracking
        if (data.type === 'chat_response') {
            const messageId = data.message_id;
            this._log('Chat response received:', messageId);
            
            // Check for duplicates
            if (this.deliveredMessages.has(messageId)) {
                this._log('Duplicate response ignored:', messageId);
                return;
            }
            
            // Mark as delivered
            this.deliveredMessages.add(messageId);
            this.pendingMessages.delete(messageId);
            
            // Parse response
            const response = data.response || {};
            const text = response.text || 'No response text';
            const processingTime = data.processing_time || 0;
            
            // Notify listeners
            this._notifyMessageListeners({
                type: 'chat_response',
                messageId: messageId,
                text: text,
                components: response.components || [],
                processingTime: processingTime,
                timestamp: Date.now(),
                context: data.context
            });
            
            // Confirm delivery to server
            this._confirmDelivery([messageId]);
            return;
        }
        
        // Handle chat error
        if (data.type === 'chat_error') {
            const messageId = data.message_id;
            this._log('Chat error received:', messageId);
            
            if (this.deliveredMessages.has(messageId)) {
                this._log('Duplicate error ignored:', messageId);
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
            
            this._confirmDelivery([messageId]);
            return;
        }
        
        // Handle pending messages response
        if (data.type === 'pending_messages') {
            this._log('Received pending messages:', data.messages?.length || 0);
            
            if (data.messages && data.messages.length > 0) {
                const messageIds = [];
                
                data.messages.forEach(message => {
                    const messageId = message.message_id;
                    
                    if (this.deliveredMessages.has(messageId)) {
                        return;
                    }
                    
                    this.deliveredMessages.add(messageId);
                    messageIds.push(messageId);
                    this.pendingMessages.delete(messageId);
                    
                    if (message.response) {
                        const response = typeof message.response === 'string' 
                            ? JSON.parse(message.response) 
                            : message.response;
                        
                        this._notifyMessageListeners({
                            type: 'bot_response',
                            messageId: messageId,
                            text: response.text || 'Response received',
                            components: response.components || [],
                            processingTime: response.metadata?.processing_time || 0,
                            timestamp: Date.now(),
                            metadata: response.metadata || {}
                        });
                    }
                });
                
                if (messageIds.length > 0) {
                    this._confirmDelivery(messageIds);
                }
            }
            return;
        }
        
        // Handle delivery confirmation
        if (data.type === 'delivery_confirmed') {
            this._log('Server confirmed delivery of messages:', data.message_ids);
            return;
        }
        
        // Handle general error messages
        if (data.type === 'error') {
            this._error('Server error:', data.message);
            this._notifyErrorListeners({
                type: 'server_error',
                message: data.message,
                errorId: data.error_id,
                retryAfter: data.retry_after
            });
            return;
        }
        
        // Handle unknown message types
        this._log('Unknown message type:', data.type, data);
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle connection close with JWT-specific logic
     */
    _handleClose(event) {
        this._cleanup();
        this._notifyStatusChange('disconnected');
        
        const shouldReconnect = event.code !== 1000 && // Normal closure
                              event.code !== 1001 && // Going away
                              event.code !== 4001 && // Authentication failed
                              event.code !== 4002 && // JWT token expired
                              this.reconnectAttempts < this.options.maxReconnectAttempts &&
                              this.authService.isAuthenticated();
        
        if (event.code === 4002) {
            // JWT token expired during connection
            this._log('WebSocket closed due to JWT token expiration');
            this._handleTokenExpiration().catch(error => {
                this._error('Token expiration handling failed:', error);
            });
            return;
        }
        
        if (shouldReconnect) {
            this._log(`JWT connection lost (code ${event.code}), attempting reconnect...`);
            this._scheduleReconnect();
        } else if (event.code === 4001) {
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
     * Request pending messages from server
     */
    _requestPendingMessages() {
        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this._log('Requesting pending messages from server');
            this.socket.send(JSON.stringify({
                type: 'get_pending_messages',
                user_id: this.authService.getCurrentUser()?.id,
                auth_method: 'jwt_bearer',
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    /**
     * Confirm message delivery to server
     */
    _confirmDelivery(messageIds) {
        if (!Array.isArray(messageIds) || messageIds.length === 0) return;
        
        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this._log('Confirming delivery of messages:', messageIds);
            this.socket.send(JSON.stringify({
                type: 'confirm_delivery',
                message_ids: messageIds,
                delivery_method: 'websocket',
                auth_method: 'jwt_bearer',
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    /**
     * Clear delivered messages cache
     */
    clearDeliveredCache() {
        const cacheSize = this.deliveredMessages.size;
        
        if (cacheSize > 1000) {
            const deliveredArray = Array.from(this.deliveredMessages);
            const keepRecent = deliveredArray.slice(-500);
            
            this.deliveredMessages.clear();
            keepRecent.forEach(id => this.deliveredMessages.add(id));
            
            this._log(`Cleared delivered cache: ${cacheSize} → ${this.deliveredMessages.size}`);
        }
    },
    
    _startHeartbeat() {
        this._stopHeartbeat();
        
        this._log('Starting heartbeat');
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this._log('Sending ping to server');
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
            this._log('Heartbeat stopped');
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
    
    _scheduleReconnect() {
        this.reconnectAttempts++;
        let delay = this.reconnectAttempts === 1 ? 1000 : (this.options.reconnectInterval * this.reconnectAttempts);
        delay = Math.min(delay, 10000);
        
        this._log(`JWT reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(() => {
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
    
    _queueMessage(message) {
        this.messageQueue.push(message);
        this._log('Message queued (total:', this.messageQueue.length, ')');
    },
    
    _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        this._log(`Processing ${messages.length} queued messages`);
        
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
    
    _cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._stopHeartbeat();
        
        this.isConnected = false;
        this.isAuthenticated = false;
        
        this.clearDeliveredCache();
    },
    
    _generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    _notifyMessageListeners(data) {
        this.messageListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                this._error('Error in message listener:', e);
            }
        });
    },
    
    _notifyStatusChange(status) {
        this._log(`Status change: ${status}`);
        this.statusListeners.forEach(callback => {
            try {
                callback(status, this.getStatus());
            } catch (e) {
                this._error('Error in status listener:', e);
            }
        });
    },
    
    _notifyErrorListeners(data) {
        this.errorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                this._error('Error in error listener:', e);
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

/**
 * Unified Chat Integration Manager
 * Handles UI integration with JWT WebSocket service
 */
const ChatIntegration = {
    // UI elements
    chatContainer: null,
    messageContainer: null,
    inputElement: null,
    statusElement: null,
    tempMessages: new Map(),
    
    // State
    isInitialized: false,
    currentProjectId: null,
    currentProjectName: null,
    
    /**
     * Initialize chat integration
     */
    init(chatContainerId = 'chat-container') {
        if (this.isInitialized) {
            console.log('💬 JWT ChatIntegration already initialized');
            return this;
        }
        
        // Find UI elements
        this.chatContainer = document.getElementById(chatContainerId);
        this.messageContainer = document.getElementById('chatBody') || 
                               document.getElementById('messages') || 
                               document.getElementById('chat-messages');
        this.inputElement = document.getElementById('messageInput') || 
                           document.getElementById('message-input') || 
                           document.querySelector('input[type="text"], textarea');
        this.statusElement = document.getElementById('connection-status');
        
        if (!this.messageContainer) {
            console.warn('💬 Message container not found - chat integration may not work properly');
        }
        
        // Set up ChatService listeners
        if (window.ChatService) {
            window.ChatService.onStatusChange((status) => this.updateConnectionStatus(status));
            window.ChatService.onMessage((data) => this.handleMessage(data));
            window.ChatService.onError((error) => this.handleError(error));
        }
        
        // Set up input handler
        this.setupInputHandler();
        
        this.isInitialized = true;
        
        console.log('💬 JWT ChatIntegration initialized successfully', {
            hasMessageContainer: !!this.messageContainer,
            hasInputElement: !!this.inputElement,
            hasStatusElement: !!this.statusElement
        });
        
        return this;
    },
    
    /**
     * Initialize with project context for JWT authentication
     */
    async initializeWithProject(projectId, projectName) {
        try {
            console.log('💬 Initializing JWT chat with project context:', { projectId, projectName });
            
            this.currentProjectId = projectId;
            this.currentProjectName = projectName;
            
            // Switch project context
            if (window.ProjectService) {
                const contextResult = await window.ProjectService.switchToProject(projectId, projectName);
                if (!contextResult.success) {
                    throw new Error('Failed to switch project context');
                }
                console.log('✅ Project context switched for JWT chat');
            }
            
            // Initialize/connect ChatService with JWT
            if (window.ChatService) {
                if (!window.ChatService.isInitialized) {
                    window.ChatService.init(window.AuthService);
                }
                
                // Connect if not connected
                if (!window.ChatService.isConnected) {
                    await window.ChatService.connect();
                }
                
                console.log('✅ JWT ChatService connected with project context');
            }
            
            // Load chat history
            await this.loadProjectChatHistory();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize JWT chat with project:', error);
            return false;
        }
    },
    
    /**
     * Load project chat history with JWT authentication
     */
    async loadProjectChatHistory() {
        try {
            if (!window.ChatService) {
                console.warn('ChatService not available for loading history');
                return;
            }
            
            const messages = await window.ChatService.loadChatHistory();
            console.log(`📚 Loaded ${messages.length} messages for project (JWT auth)`);
            
            // Display messages in chat
            if (this.messageContainer && messages.length > 0) {
                // Clear existing messages
                this.messageContainer.innerHTML = '';
                
                // Add each message
                messages.forEach(message => {
                    this.addMessage({
                        type: message.sender || 'system',
                        text: message.content,
                        timestamp: message.timestamp,
                        messageId: message.message_id
                    });
                });
                
                console.log('✅ JWT chat history displayed');
            }
            
        } catch (error) {
            console.error('❌ Failed to load JWT project chat history:', error);
        }
    },
    
    /**
     * Setup input handler
     */
    setupInputHandler() {
        const form = this.inputElement?.closest('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        } else if (this.inputElement) {
            this.inputElement.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    },
    
    /**
     * Send message with JWT authentication
     */
    async sendMessage() {
        const message = this.inputElement?.value?.trim();
        if (!message) return;
        
        try {
            // Add user message to chat immediately
            this.addMessage({
                type: 'user',
                text: message,
                timestamp: new Date().toISOString()
            });
            
            // Send via JWT ChatService
            const messageId = await window.ChatService.sendMessage(message);
            console.log('📤 JWT message sent with ID:', messageId);
            
            // Clear input
            if (this.inputElement) {
                this.inputElement.value = '';
            }
            
        } catch (error) {
            console.error('❌ Failed to send JWT message:', error);
            this.addMessage({
                type: 'error',
                text: `Failed to send: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    },
    
    /**
     * Handle incoming messages from JWT WebSocket
     */
    handleMessage(data) {
        console.log('💬 JWT chat integration - Message received:', data.type);
        
        switch (data.type) {
            case 'message_queued':
                // Show temporary processing message
                const tempMsg = {
                    type: 'system',
                    text: data.text || 'Processing your message...',
                    timestamp: new Date(data.timestamp).toISOString(),
                    isTemporary: true,
                    messageId: data.messageId
                };
                
                this.addMessage(tempMsg);
                this.tempMessages.set(data.messageId, tempMsg);
                break;
                
            case 'chat_response':
                // Remove processing message and add bot response
                if (data.messageId) {
                    this.removeTemporaryMessage(data.messageId);
                    this.tempMessages.delete(data.messageId);
                }
                
                // Check for duplicates
                if (!this.isDuplicateMessage(data.messageId)) {
                    let processingInfo = '';
                    if (data.processingTime) {
                        processingInfo = ` (${data.processingTime.toFixed(2)}s)`;
                    }
                    
                    this.addMessage({
                        type: 'bot',
                        text: data.text + processingInfo,
                        components: data.components,
                        timestamp: new Date(data.timestamp).toISOString(),
                        messageId: data.messageId
                    });
                } else {
                    console.log('🔄 Duplicate JWT response prevented:', data.messageId);
                }
                break;
                
            case 'chat_error':
                // Remove processing message and add error
                if (data.messageId) {
                    this.removeTemporaryMessage(data.messageId);
                    this.tempMessages.delete(data.messageId);
                }
                
                this.addMessage({
                    type: 'error',
                    text: `Error: ${data.error}`,
                    timestamp: new Date(data.timestamp).toISOString(),
                    messageId: data.messageId
                });
                break;
                
            default:
                console.log('💬 Unknown JWT message type in integration:', data.type);
                break;
        }
    },
    
    /**
     * Handle errors from JWT WebSocket
     */
    handleError(error) {
        console.error('💬 JWT chat integration error:', error);
        
        this.addMessage({
            type: 'error',
            text: error.message || 'An error occurred',
            timestamp: new Date().toISOString()
        });
    },
    
    /**
     * Add message to chat UI
     */
    addMessage(message) {
        if (!this.messageContainer) {
            console.warn('Message container not found');
            return;
        }
        
        // Check for duplicates
        if (message.messageId && this.isDuplicateMessage(message.messageId)) {
            console.log('🔄 Duplicate JWT message prevented in addMessage:', message.messageId);
            return;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${message.type || 'default'}`;
        
        if (message.messageId) {
            messageDiv.setAttribute('data-message-id', message.messageId);
        }
        
        if (message.isTemporary) {
            messageDiv.classList.add('temporary-message');
        }
        
        let content = `
            <div class="message-content">
                <div class="message-text">${this.escapeHtml(message.text)}</div>
                <div class="message-time">${this.formatTime(message.timestamp)}</div>
            </div>
        `;
        
        messageDiv.innerHTML = content;
        
        this.messageContainer.appendChild(messageDiv);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        
        console.log('✅ JWT message added to chat:', message.type, message.text.substring(0, 30), message.messageId || 'no-id');
        
        return messageDiv;
    },
    
    /**
     * Remove temporary message
     */
    removeTemporaryMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement && messageElement.classList.contains('temporary-message')) {
            messageElement.remove();
            console.log('🗑️ Removed JWT temporary message:', messageId);
        }
    },
    
    /**
     * Check for duplicate messages
     */
    isDuplicateMessage(messageId) {
        if (!messageId || !this.messageContainer) return false;
        
        const existingMessage = this.messageContainer.querySelector(`[data-message-id="${messageId}"]`);
        return !!existingMessage;
    },
    
    /**
     * Update connection status display for JWT
     */
    updateConnectionStatus(status) {
        if (!this.statusElement) return;
        
        const statusInfo = window.ChatService?.getStatus() || {};
        const pendingCount = statusInfo.pendingMessages || 0;
        const deliveredCount = statusInfo.deliveredMessages || 0;
        const hasValidToken = statusInfo.hasValidToken ? '✓' : '✗';
        
        const statusText = `${status} [JWT:${hasValidToken}]${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}${deliveredCount > 0 ? ` [${deliveredCount} delivered]` : ''}`;
        
        this.statusElement.textContent = statusText;
        this.statusElement.className = `connection-status ${status}`;
    },
    
    // Utility methods
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    formatTime(timestamp) {
        return new Date(timestamp).toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
};

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Only initialize if not on main chat page (which handles its own initialization)
    if (!document.getElementById('chatBody')) {
        ChatIntegration.init();
        console.log('💬 JWT chat integration initialized for embedded use');
    }
});

// Export for global access
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
    window.ChatIntegration = ChatIntegration;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChatService, ChatIntegration };
}