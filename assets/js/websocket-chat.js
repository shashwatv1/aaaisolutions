/**
 * High-Performance WebSocket Chat Service for AAAI Solutions
 * FIXED: Enhanced message handling and event listener management
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
    
    // FIXED: Enhanced message handling with proper event management
    messageQueue: [],
    messageListeners: new Set(), // Use Set for better listener management
    statusListeners: new Set(),
    errorListeners: new Set(),
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
     * Fast connection with optimized authentication check
     */
    async connect() {
        if (this.isConnected && this.isAuthenticated) {
            return true;
        }
        
        if (this.isConnecting) {
            // Wait for existing connection attempt
            return new Promise((resolve, reject) => {
                const checkConnection = () => {
                    if (!this.isConnecting) {
                        if (this.isConnected && this.isAuthenticated) {
                            resolve(true);
                        } else {
                            reject(new Error('Connection failed'));
                        }
                    } else {
                        setTimeout(checkConnection, 100);
                    }
                };
                setTimeout(checkConnection, 100);
            });
        }
        
        this._log('Fast WebSocket connection starting...');
        
        // Quick auth check with cached values
        if (!this.authService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        const user = this.authService.getCurrentUser();
        if (!user?.id || !user?.email) {
            throw new Error('User information not available');
        }

        // Get token with caching
        const accessToken = this.authService.getToken();
        if (!accessToken) {
            // Try one quick refresh
            try {
                const refreshed = await Promise.race([
                    this.authService.refreshTokenIfNeeded(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Refresh timeout')), 3000))
                ]);
                
                if (!refreshed) {
                    throw new Error('No access token available');
                }
            } catch (error) {
                throw new Error('Token refresh failed');
            }
        }
        
        return new Promise((resolve, reject) => {
            this.isConnecting = true;
            this._notifyStatusChange('connecting');
            
            // Build WebSocket URL immediately
            const wsUrl = this._buildGatewayWebSocketURL(user, this.authService.getToken());
            
            this._log('Connecting to WebSocket URL:', wsUrl.replace(/token=[^&]+/, 'token=***'));
            
            // Shorter connection timeout for faster failure detection
            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._cleanup();
                    this.isConnecting = false;
                    this._notifyStatusChange('disconnected');
                    reject(new Error('WebSocket connection timeout'));
                }
            }, 8000); // Reduced from 15000 to 8000
            
            try {
                // Create WebSocket with optimized settings
                this.socket = new WebSocket(wsUrl);
                
                // Set binary type for better performance
                this.socket.binaryType = 'arraybuffer';
                
                this.socket.onopen = () => {
                    this.isConnected = true;
                    this.isAuthenticated = true;
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
                        this._handleMessageFixed(data);
                        
                    } catch (e) {
                        this._error('🔥 Message parse error:', e, 'Raw data:', event.data);
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
            fastMode: this.options.fastMode,
            listeners: {
                message: this.messageListeners.size,
                status: this.statusListeners.size,
                error: this.errorListeners.size
            }
        };
    },
    
    // FIXED: Enhanced event listeners with proper management
    onMessage(callback) {
        if (typeof callback === 'function') {
            this.messageListeners.add(callback);
            this._log('Message listener added, total:', this.messageListeners.size);
        } else {
            this._error('Invalid message listener callback');
        }
    },
    
    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.add(callback);
            this._log('Status listener added, total:', this.statusListeners.size);
        } else {
            this._error('Invalid status listener callback');
        }
    },
    
    onError(callback) {
        if (typeof callback === 'function') {
            this.errorListeners.add(callback);
            this._log('Error listener added, total:', this.errorListeners.size);
        } else {
            this._error('Invalid error listener callback');
        }
    },
    
    // FIXED: Add methods to remove listeners
    removeMessageListener(callback) {
        this.messageListeners.delete(callback);
        this._log('Message listener removed, remaining:', this.messageListeners.size);
    },
    
    removeStatusListener(callback) {
        this.statusListeners.delete(callback);
        this._log('Status listener removed, remaining:', this.statusListeners.size);
    },
    
    removeErrorListener(callback) {
        this.errorListeners.delete(callback);
        this._log('Error listener removed, remaining:', this.errorListeners.size);
    },
    
    setProjectContext(chatId, projectName) {
        this._log('Project context updated:', { chatId, projectName });
        
        // Update server if connected
        if (this.isConnected && this.socket?.readyState === WebSocket.OPEN && this.isAuthenticated) {
            try {
                this.socket.send(JSON.stringify({
                    type: 'context_update',
                    context: {
                        chat_id: chatId,
                        project_name: projectName,
                        user_id: this.authService.getCurrentUser()?.id
                    },
                    timestamp: new Date().toISOString()
                }));
                
                this._log('Context update sent to server');
            } catch (error) {
                this._error('Failed to send context update:', error);
            }
        }
    },
    
    /**
     * FIXED: Enhanced message handling with comprehensive logging and error handling
     */
    _handleMessageFixed(data) {
        this._log('FIXED: Received WebSocket message:', {
            type: data.type,
            messageId: data.message_id,
            hasResponse: !!data.response,
            hasText: !!data.text,
            timestamp: data.timestamp,
            fullData: data
        });
        
        try {
            switch (data.type) {
                case 'session_established':
                case 'auth_success':
                case 'authenticated':
                    this._log('FIXED: Session established:', data);
                    this.sessionId = data.session_id || this.sessionId;
                    break;
                    
                case 'heartbeat':
                case 'ping':
                    this._sendPong();
                    break;
                    
                case 'pong':
                    break;
                    
                case 'context_updated':
                    this._log('FIXED: Context updated successfully:', data.context);
                    break;
                    
                case 'context_update_error':
                    this._error('FIXED: Context update failed:', data.error);
                    this._notifyErrorListeners({
                        type: 'context_update_error',
                        message: data.error || 'Failed to update context',
                        details: data.details
                    });
                    break;
                    
                case 'message_queued':
                case 'message_queued_jwt':
                    this._log('FIXED: Message queued:', data.message_id);
                    this.pendingMessages.set(data.message_id, {
                        queuedAt: Date.now(),
                        status: 'pending'
                    });
                    this._notifyMessageListeners({
                        type: 'message_queued',
                        messageId: data.message_id,
                        text: 'Processing your message...',
                        timestamp: Date.now()
                    });
                    break;
                    
                case 'chat_response':
                    this._log('FIXED: Chat response received:', {
                        messageId: data.message_id,
                        hasResponse: !!data.response,
                        responseType: typeof data.response,
                        hasText: !!data.text,
                        responseKeys: data.response ? Object.keys(data.response) : [],
                        directText: data.text,
                        fullResponseData: data.response
                    });
                    
                    this.pendingMessages.delete(data.message_id);
                    
                    // FIXED: Enhanced response parsing with comprehensive fallbacks
                    let responseText = '';
                    let components = [];
                    
                    try {
                        // Priority 1: Direct text field
                        if (data.text && typeof data.text === 'string') {
                            responseText = data.text;
                            components = data.components || [];
                            this._log('FIXED: Using direct text field');
                        }
                        // Priority 2: Response object with text
                        else if (data.response) {
                            if (typeof data.response === 'string') {
                                responseText = data.response;
                                this._log('FIXED: Using response as string');
                            } else if (data.response && typeof data.response === 'object') {
                                if (data.response.text) {
                                    responseText = data.response.text;
                                    components = data.response.components || [];
                                    this._log('FIXED: Using response.text');
                                } else if (data.response.message) {
                                    responseText = data.response.message;
                                    this._log('FIXED: Using response.message');
                                } else if (data.response.content) {
                                    responseText = data.response.content;
                                    this._log('FIXED: Using response.content');
                                } else {
                                    // Try to extract any text-like fields
                                    responseText = JSON.stringify(data.response);
                                    this._log('FIXED: Using stringified response object');
                                }
                            }
                        }
                        // Priority 3: Message field
                        else if (data.message) {
                            responseText = data.message;
                            this._log('FIXED: Using message field');
                        }
                        // Priority 4: Fallback
                        else {
                            responseText = 'Response received but could not parse content';
                            this._error('FIXED: Could not parse response:', data);
                        }
                        
                        // Ensure we have some text
                        if (!responseText || responseText.trim() === '') {
                            responseText = 'Empty response received';
                            this._log('FIXED: Response was empty, using fallback');
                        }
                        
                    } catch (parseError) {
                        this._error('FIXED: Error parsing response:', parseError, data);
                        responseText = 'Error parsing response: ' + parseError.message;
                    }
                    
                    // FIXED: Create comprehensive message object
                    const messageData = {
                        type: 'chat_response',
                        messageId: data.message_id,
                        text: responseText,
                        components: components,
                        timestamp: data.timestamp || Date.now(),
                        deliveredAt: Date.now(),
                        metadata: {
                            originalData: data,
                            parseMethod: 'enhanced_parsing',
                            hasComponents: components.length > 0
                        }
                    };
                    
                    this._log('FIXED: Notifying message listeners with:', {
                        type: messageData.type,
                        messageId: messageData.messageId,
                        textLength: messageData.text.length,
                        componentCount: messageData.components.length,
                        listenerCount: this.messageListeners.size
                    });
                    
                    this._notifyMessageListeners(messageData);
                    break;
                    
                case 'chat_error':
                    this._log('FIXED: Chat error received:', data);
                    this.pendingMessages.delete(data.message_id);
                    this._notifyMessageListeners({
                        type: 'chat_error',
                        messageId: data.message_id,
                        error: data.error || 'Unknown error',
                        timestamp: data.timestamp || Date.now()
                    });
                    break;
                    
                case 'error':
                    this._error('FIXED: Server error received:', data);
                    this._notifyErrorListeners({
                        type: 'server_error',
                        message: data.message || 'Server error',
                        details: data.error_details
                    });
                    break;
                    
                default:
                    this._log('FIXED: Unhandled message type:', data.type, data);
                    // Still notify listeners for unknown message types
                    this._notifyMessageListeners(data);
                    break;
            }
        } catch (error) {
            this._error('FIXED: Error in message handling:', error, data);
            this._notifyErrorListeners({
                type: 'message_handling_error',
                message: 'Error processing WebSocket message',
                details: error.message,
                originalData: data
            });
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
    
    // FIXED: Enhanced notification methods with error handling
    _notifyMessageListeners(data) {
        this._log('FIXED: Notifying message listeners:', {
            type: data.type,
            listenerCount: this.messageListeners.size,
            messageId: data.messageId,
            hasText: !!data.text,
            textLength: data.text ? data.text.length : 0,
            listeners: Array.from(this.messageListeners).map(l => l.name || 'anonymous')
        });
        
        if (this.messageListeners.size === 0) {
            this._error('FIXED: No message listeners registered!');
            return;
        }
        
        let successCount = 0;
        let errorCount = 0;
        
        this.messageListeners.forEach((callback, index) => {
            try {
                this._log(`FIXED: Calling listener ${index + 1}/${this.messageListeners.size}:`, {
                    callbackName: callback.name || 'anonymous',
                    messageType: data.type,
                    messageId: data.messageId
                });
                
                callback(data);
                successCount++;
                
                this._log(`FIXED: Listener ${index + 1} executed successfully`);
            } catch (error) {
                errorCount++;
                this._error(`FIXED: Message listener ${index + 1} error:`, error);
            }
        });
        
        this._log(`FIXED: Message notification complete: ${successCount} success, ${errorCount} errors`);
    },
    
    _notifyStatusChange(status) {
        this._log('FIXED: Notifying status change:', status, 'to', this.statusListeners.size, 'listeners');
        
        let successCount = 0;
        let errorCount = 0;
        
        this.statusListeners.forEach(callback => {
            try {
                callback(status, this.getStatus());
                successCount++;
            } catch (error) {
                errorCount++;
                this._error('FIXED: Status listener error:', error);
            }
        });
        
        this._log(`FIXED: Status notification complete: ${successCount} success, ${errorCount} errors`);
    },
    
    _notifyErrorListeners(error) {
        this._log('FIXED: Notifying error listeners:', error.type, 'to', this.errorListeners.size, 'listeners');
        
        let successCount = 0;
        let errorCount = 0;
        
        this.errorListeners.forEach(callback => {
            try {
                callback(error);
                successCount++;
            } catch (callbackError) {
                errorCount++;
                this._error('FIXED: Error listener error:', callbackError);
            }
        });
        
        this._log(`FIXED: Error notification complete: ${successCount} success, ${errorCount} errors`);
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