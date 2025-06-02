/**
 * High-Performance WebSocket Chat Service for AAAI Solutions
 * Optimized for fast loading and minimal overhead
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
    
    // Connection management - simplified
    reconnectAttempts: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
    sessionId: null,
    
    // Message handling - optimized
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    pendingMessages: new Map(),
    
    // Configuration - performance optimized
    options: {
        reconnectInterval: 5000,
        maxReconnectAttempts: 3,
        heartbeatInterval: 90000,
        connectionTimeout: 15000, // Increased for WebSocket handshake
        debug: false,
        fastMode: true
    },
    
    /**
     * Fast initialization
     */
    init(authService, options = {}) {
        if (this.isInitialized) {
            return this;
        }
        
        if (!authService) {
            throw new Error('AuthService required');
        }
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        this.isInitialized = true;
        
        this._log('Fast ChatService initialized');
        return this;
    },

    /**
     * Fast connection with JWT token in query parameters
     */
    async connect() {
        if (this.isConnected && this.isAuthenticated) {
            return true;
        }
        
        if (this.isConnecting) {
            return false;
        }
        
        this._log('Fast WebSocket connection starting...');
        
        // Quick auth check
        if (!this.authService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        const user = this.authService.getCurrentUser();
        if (!user?.id || !user?.email) {
            throw new Error('User information not available');
        }

        // Get token quickly
        const accessToken = this.authService.getToken();
        if (!accessToken) {
            throw new Error('No access token available');
        }
        
        return new Promise((resolve, reject) => {
            this.isConnecting = true;
            this._notifyStatusChange('connecting');
            
            // Build WebSocket URL with token in query parameters
            const wsUrl = this._buildGatewayWebSocketURL(user, accessToken);
            
            this._log('Connecting to WebSocket URL:', wsUrl.replace(/token=[^&]+/, 'token=***'));
            
            // Connection timeout
            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._cleanup();
                    this.isConnecting = false;
                    this._notifyStatusChange('disconnected');
                    reject(new Error('WebSocket connection timeout'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // Create WebSocket with token in URL (no custom headers needed)
                this.socket = new WebSocket(wsUrl);
                
                this.socket.onopen = () => {
                    this._log('WebSocket opened successfully');
                    this.isConnected = true;
                    this.isAuthenticated = true; // Token is in URL, so authentication is handled by gateway
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    this.sessionId = user.sessionId || 'gateway_session';
                    
                    clearTimeout(timeout);
                    this._notifyStatusChange('connected');
                    this._startSimpleHeartbeat();
                    this._processQueuedMessagesFast();
                    
                    resolve(true);
                };
                
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._handleMessageFast(data);
                    } catch (e) {
                        this._error('Message parse error:', e);
                    }
                };
                
                this.socket.onclose = (event) => {
                    this._log('WebSocket closed:', event.code, event.reason);
                    
                    if (this.isConnecting) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        reject(new Error(`Connection closed during handshake: ${event.code} ${event.reason}`));
                        return;
                    }
                    
                    this._handleCloseFast(event);
                };
                
                this.socket.onerror = (event) => {
                    this._error('WebSocket error:', event);
                    this._notifyErrorListeners({
                        type: 'websocket_error',
                        message: 'WebSocket connection error',
                        event: event
                    });
                    
                    if (this.isConnecting) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        this._cleanup();
                        reject(new Error('WebSocket connection error'));
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
     * Build WebSocket URL for direct Cloud Run connection
     */
    _buildGatewayWebSocketURL(user, accessToken) {
        const wsHost = window.AAAI_CONFIG.WEBSOCKET_BASE_URL || 'aaai.solutions';
        
        const params = new URLSearchParams({
            token: accessToken, // JWT token in query parameter
            user_id: user.id,
            email: encodeURIComponent(user.email),
            chat_id: this._getCurrentChatId() || '',
            session_id: user.sessionId || 'direct_session',
            auth_method: 'jwt_direct'
        });
        
        return `wss://${wsHost}/ws/${user.id}?${params}`;
    },
    
    /**
     * Fast message sending
     */
    async sendMessage(text) {
        if (!text?.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const messageId = this._generateQuickId();
        const user = this.authService.getCurrentUser();
        
        const message = {
            type: 'message',
            message: text.trim(),
            id: messageId,
            timestamp: new Date().toISOString(),
            context: {
                user_id: user.id,
                chat_id: this._getCurrentChatId(),
                project_name: this._getCurrentProjectName()
            }
        };
        
        if (this.isAuthenticated && this.socket?.readyState === WebSocket.OPEN) {
            this._log('Sending message quickly:', messageId);
            this.socket.send(JSON.stringify(message));
            
            this.pendingMessages.set(messageId, {
                queuedAt: Date.now(),
                status: 'sent'
            });
            
            return messageId;
        } else {
            // Queue message
            this.messageQueue.push(message);
            
            if (!this.isConnecting && !this.isConnected) {
                // Try to connect asynchronously
                this.connect().catch(e => {
                    this._error('Connection failed:', e);
                });
            }
            
            return messageId;
        }
    },
    
    /**
     * Fast chat history loading
     */
    async loadChatHistory() {
        if (!this.authService?.isAuthenticated()) {
            return [];
        }
        
        try {
            const chatId = this._getCurrentChatId();
            if (!chatId) {
                return [];
            }
            
            const result = await this.authService.executeFunction('get_chat_messages', {
                user_id: this.authService.getCurrentUser().id,
                chat_id: chatId,
                limit: 30
            });
            
            return result?.data?.messages || [];
            
        } catch (error) {
            this._error('Failed to load chat history:', error);
            return [];
        }
    },
    
    /**
     * Fast disconnect
     */
    disconnect() {
        this._log('Quick disconnect');
        
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
     * Force reconnect
     */
    async forceReconnect() {
        this._log('Force reconnecting...');
        this.disconnect();
        this.reconnectAttempts = 0;
        return this.connect();
    },
    
    /**
     * Fast status check
     */
    getStatus() {
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            sessionId: this.sessionId,
            pendingMessages: this.pendingMessages.size,
            fastMode: this.options.fastMode
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
    
    setProjectContext(chatId, projectName) {
        this._log('Project context updated:', { chatId, projectName });
        
        // Update server if connected
        if (this.isConnected && this.socket?.readyState === WebSocket.OPEN && this.isAuthenticated) {
            this.socket.send(JSON.stringify({
                type: 'context_update',
                context: {
                    chat_id: chatId,
                    project_name: projectName,
                    user_id: this.authService.getCurrentUser()?.id
                },
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    // Private methods - optimized for speed
    
    _handleMessageFast(data) {
        switch (data.type) {
            case 'session_established':
            case 'auth_success':
            case 'authenticated':
                this._log('Session established:', data);
                this.sessionId = data.session_id || this.sessionId;
                break;
                
            case 'heartbeat':
            case 'ping':
                this._sendPong();
                break;
                
            case 'pong':
                break;
                
            case 'message_queued':
                this.pendingMessages.set(data.message_id, {
                    queuedAt: Date.now(),
                    status: 'pending'
                });
                this._notifyMessageListeners({
                    type: 'message_queued',
                    messageId: data.message_id,
                    text: 'Processing...',
                    timestamp: Date.now()
                });
                break;
                
            case 'chat_response':
                this.pendingMessages.delete(data.message_id);
                this._notifyMessageListeners({
                    type: 'chat_response',
                    messageId: data.message_id,
                    text: data.response?.text || 'No response',
                    components: data.response?.components || [],
                    timestamp: Date.now()
                });
                break;
                
            case 'chat_error':
                this.pendingMessages.delete(data.message_id);
                this._notifyMessageListeners({
                    type: 'chat_error',
                    messageId: data.message_id,
                    error: data.error || 'Unknown error',
                    timestamp: Date.now()
                });
                break;
                
            case 'error':
                this._notifyErrorListeners({
                    type: 'server_error',
                    message: data.message || 'Server error',
                    details: data.error_details
                });
                break;
                
            default:
                this._notifyMessageListeners(data);
                break;
        }
    },
    
    _handleCloseFast(event) {
        this._cleanup();
        this._notifyStatusChange('disconnected');
        
        const shouldReconnect = event.code !== 1000 && // Normal closure
                              event.code !== 1001 && // Going away
                              event.code !== 1006 && // Abnormal closure (might be temporary)
                              this.reconnectAttempts < this.options.maxReconnectAttempts &&
                              this.authService?.isAuthenticated();
        
        if (shouldReconnect) {
            this._scheduleReconnectFast();
        } else if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this._notifyErrorListeners({
                type: 'max_reconnect_attempts',
                message: 'Maximum reconnection attempts reached'
            });
        }
    },
    
    _scheduleReconnectFast() {
        this.reconnectAttempts++;
        const delay = Math.min(this.options.reconnectInterval * this.reconnectAttempts, 30000);
        
        this._log(`Fast reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(() => {
            if (this.authService?.isAuthenticated()) {
                this.connect().catch(e => {
                    this._error('Reconnect failed:', e);
                    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
                        this._scheduleReconnectFast();
                    } else {
                        this._notifyErrorListeners({
                            type: 'max_reconnect_attempts',
                            message: 'Maximum reconnection attempts reached'
                        });
                    }
                });
            }
        }, delay);
    },
    
    _startSimpleHeartbeat() {
        this._stopHeartbeat();
        
        this.heartbeatTimer = setInterval(() => {
            if (this.socket?.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ 
                    type: 'ping',
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
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ 
                type: 'pong',
                timestamp: Date.now()
            }));
        }
    },
    
    _processQueuedMessagesFast() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        messages.forEach(msg => {
            if (this.socket?.readyState === WebSocket.OPEN) {
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
    },
    
    _getCurrentChatId() {
        return window.ProjectService?.getContext?.()?.chat_id || '';
    },
    
    _getCurrentProjectName() {
        return window.ProjectService?.getContext?.()?.project_name || '';
    },
    
    _generateQuickId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    },
    
    _notifyMessageListeners(data) {
        this.messageListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                // Ignore errors
            }
        });
    },
    
    _notifyStatusChange(status) {
        this.statusListeners.forEach(callback => {
            try {
                callback(status, this.getStatus());
            } catch (e) {
                // Ignore errors
            }
        });
    },
    
    _notifyErrorListeners(error) {
        this.errorListeners.forEach(callback => {
            try {
                callback(error);
            } catch (e) {
                // Ignore errors
            }
        });
    },
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[FastChat]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[FastChat]', ...args);
    }
};

if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = ChatService;
}