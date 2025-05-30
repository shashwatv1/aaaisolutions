/**
 * Enhanced WebSocket-Only Chat Service with Message Delivery Tracking
 * Handles all chat functionality exclusively through WebSockets with proper delivery confirmation
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
    sessionId: null,
    
    // Message handling with delivery tracking
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    pendingMessages: new Map(), // Track pending message IDs
    deliveredMessages: new Set(), // Track delivered messages to prevent duplicates
    chatResponseListeners: [], // Dedicated listeners for chat responses
    
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
        debug: true
    },
    
    // Context state - critical for proper data flow
    currentContext: {
        user_id: null,      // From authentication
        chat_id: null,      // From project selection (project_id)
        reel_id: null,      // From specific chat/conversation
        project_name: null,
        chat_name: null
    },

    /**
     * Initialize the service
     */
    init(authService, options = {}) {
        if (!authService) {
            throw new Error('AuthService is required');
        }
        
        this.authService = authService;
        
        // Set user context from auth
        const user = authService.getCurrentUser();
        if (user) {
            this.currentContext.user_id = user.id;
        }
        
        console.log('🚀 Enhanced ChatService initialized with delivery tracking:', this.currentContext);
        return this;
    },
    
    setProjectContext(projectId, projectName) {
        this.currentContext.chat_id = projectId;
        this.currentContext.project_name = projectName;
        
        console.log('📂 Project context set:', {
            chat_id: this.currentContext.chat_id,
            project_name: this.currentContext.project_name
        });
        
        // Notify orchestrator about context change
        this._notifyContextChange();
    },

    setChatContext(chatId, chatName) {
        this.currentContext.reel_id = chatId;
        this.currentContext.chat_name = chatName;
        
        console.log('💬 Chat context set:', {
            reel_id: this.currentContext.reel_id,
            chat_name: this.currentContext.chat_name
        });
        
        // Notify orchestrator about context change
        this._notifyContextChange();
    },
    
    async saveContext() {
        try {
            await this.authService.executeFunction('save_user_context', {
                user_id: this.currentContext.user_id,
                chat_id: this.currentContext.chat_id,
                reel_id: this.currentContext.reel_id,
                context_data: {
                    project_name: this.currentContext.project_name,
                    chat_name: this.currentContext.chat_name,
                    last_accessed: new Date().toISOString()
                }
            });
            
            console.log('💾 Context saved successfully');
            
        } catch (error) {
            console.error('❌ Failed to save context:', error);
        }
    },

    getCurrentContext() {
        return { ...this.currentContext };
    },

    /**
     * Connect to WebSocket
     */
    async connect() {
        if (this.isConnected && this.isAuthenticated) {
            this._log('✅ Already connected and authenticated');
            return true;
        }
        
        if (this.isConnecting) {
            this._log('⏳ Connection already in progress');
            return false;
        }
        
        this._log('🔌 Starting WebSocket connection...');
        
        // Check authentication
        if (!this.authService.isAuthenticated()) {
            throw new Error('Not authenticated - please login first');
        }
        
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('User information not available');
        }
        
        return new Promise((resolve, reject) => {
            this.isConnecting = true;
            this.connectionStartTime = Date.now();
            this._notifyStatusChange('connecting');
            
            // Build WebSocket URL with auth parameters
            const wsUrl = this._buildWebSocketURL(user);
            this._log('🌐 Connecting to:', wsUrl);
            
            // Connection timeout
            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._log('⏰ Connection timeout');
                    this._cleanup();
                    this.isConnecting = false;
                    this._notifyStatusChange('disconnected');
                    reject(new Error('Connection timeout after 15 seconds'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // Create WebSocket
                this.socket = new WebSocket(wsUrl);
                
                // Handle open
                this.socket.onopen = () => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`✅ WebSocket opened in ${connectionTime}ms`);
                    this.isConnected = true;
                    // Don't resolve here - wait for session_established
                };
                
                // Handle messages
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const messageTime = Date.now() - this.connectionStartTime;
                        this._log(`📨 Message received (${data.type}) after ${messageTime}ms`);
                        
                        // Handle session_established
                        if (data.type === 'session_established') {
                            this._log('🎯 Session established with server');
                            
                            // Update all connection states
                            this.isAuthenticated = true;
                            this.isConnecting = false;
                            this.reconnectAttempts = 0;
                            this.sessionId = data.session_id;
                            
                            // Log session info
                            this._log('Session ID:', data.session_id);
                            this._log('User ID:', data.user_id);
                            this._log('Server capabilities:', data.capabilities);
                            
                            clearTimeout(timeout);
                            this._notifyStatusChange('connected');
                            this._startHeartbeat();
                            this._processQueuedMessages();
                            
                            // Request any pending messages
                            this._requestPendingMessages();
                            
                            resolve(true);
                            return;
                        }
                        
                        // Handle authentication errors during connection
                        if (data.type === 'error' && this.isConnecting) {
                            this._log('❌ Connection error:', data.message);
                            clearTimeout(timeout);
                            this.isConnecting = false;
                            this._cleanup();
                            reject(new Error(`Authentication failed: ${data.message}`));
                            return;
                        }
                        
                        // Handle other messages
                        this._handleMessage(data);
                        
                    } catch (e) {
                        this._error('❌ Message parse error:', e);
                        this._error('Raw message:', event.data);
                    }
                };
                
                // Handle close
                this.socket.onclose = (event) => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`🔌 WebSocket closed after ${connectionTime}ms:`, event.code, event.reason);
                    
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
                    this._error('❌ WebSocket error:', event);
                    
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
     * Build WebSocket URL with authentication parameters
     */
    _buildWebSocketURL(user) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // Build URL with auth parameters
        const params = new URLSearchParams({
            auth: 'true',
            email: encodeURIComponent(user.email),
            user_id: user.id,
            chat_id: this.currentContext.chat_id || '',
            reel_id: this.currentContext.reel_id || '',
            session_id: user.sessionId || 'web_session',
            t: Date.now()
        });
        
        return `${wsProtocol}//${wsHost}/ws/${user.id}?${params}`;
    },
    
    _validateMessageContext(messageContext) {
        if (!messageContext) return true; // Allow messages without context
        
        return (
            messageContext.user_id === this.currentContext.user_id &&
            messageContext.chat_id === this.currentContext.chat_id &&
            (!messageContext.reel_id || messageContext.reel_id === this.currentContext.reel_id)
        );
    },
    
    _updateContextFromServer(serverContext) {
        if (serverContext.chat_id) {
            this.currentContext.chat_id = serverContext.chat_id;
        }
        if (serverContext.reel_id) {
            this.currentContext.reel_id = serverContext.reel_id;
        }
        
        console.log('🔄 Context updated from server:', this.currentContext);
    },

    _notifyContextChange() {
        // Send context update to server if connected
        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'context_update',
                context: this.currentContext,
                timestamp: new Date().toISOString()
            }));
        }
        
        // Save context
        this.saveContext();
    },

    async _loadProjectMessages() {
        try {
            const result = await this.authService.executeFunction('get_project_messages', {
                user_id: this.currentContext.user_id,
                chat_id: this.currentContext.chat_id,
                limit: 50
            });
            
            if (result?.data?.success) {
                return result.data.messages || [];
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ Failed to load project messages:', error);
            return [];
        }
    },
    
    _generateId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Enhanced message handling with delivery tracking
     */
    _handleMessage(data) {
        this.messageCount++;
        
        if (data.type === 'session_established') {
            this.isAuthenticated = true;
            console.log('🎯 Session established with context:', data.context);
            
            // Verify context matches
            if (data.context) {
                if (data.context.chat_id !== this.currentContext.chat_id) {
                    console.warn('⚠️ Context mismatch detected, updating...');
                    this._updateContextFromServer(data.context);
                }
            }
            
            this._notifyStatusChange('connected');
            return;
        }

        // Handle server heartbeat
        if (data.type === 'heartbeat') {
            this._log('💓 Heartbeat from server');
            this._sendPong();
            return;
        }
        
        // Handle ping from server
        if (data.type === 'ping') {
            this._log('🏓 Ping from server');
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
            this._log('📬 Message status update:', data.status || 'queued', messageId);
            
            // Track pending message
            this.pendingMessages.set(messageId, {
                queuedAt: Date.now(),
                status: data.status || 'pending'
            });
            
            // Show processing message (only if not already delivered)
            if (!this.deliveredMessages.has(messageId)) {
                this._notifyMessageListeners({
                    type: 'processing_message',
                    messageId: messageId,
                    text: data.message || 'Processing your message...',
                    timestamp: Date.now(),
                    isTemporary: true
                });
            }
            return;
        }
        
        // **ENHANCED: Handle chat response with delivery tracking**
        if (data.type === 'chat_response') {
            const messageId = data.message_id;
            this._log('💬 Chat response received:', messageId);
            
            // **CRITICAL: Check for duplicates**
            if (this.deliveredMessages.has(messageId)) {
                this._log('🔄 Duplicate response ignored:', messageId);
                return;
            }
            
            // Mark as delivered to prevent duplicates
            this.deliveredMessages.add(messageId);
            
            // Remove from pending messages
            this.pendingMessages.delete(messageId);
            
            // Parse response
            const response = data.response || {};
            const text = response.text || 'No response text';
            const processingTime = data.processing_time || 0;
            
            // Notify chat response listeners
            this._notifyChatResponseListeners({
                type: 'chat_response',
                messageId: messageId,
                text: text,
                components: response.components || [],
                processingTime: processingTime,
                timestamp: Date.now(),
                context: data.context
            });
            
            // Also notify regular message listeners for backward compatibility
            this._notifyMessageListeners({
                type: 'bot_response',
                messageId: messageId,
                text: text,
                components: response.components || [],
                processingTime: processingTime,
                timestamp: Date.now(),
                metadata: response.metadata || {}
            });
            
            // **NEW: Confirm delivery to server**
            this._confirmDelivery([messageId]);
            
            return;
        }
        
        // **ENHANCED: Handle chat error with delivery tracking**
        if (data.type === 'chat_error') {
            const messageId = data.message_id;
            this._log('❌ Chat error received:', messageId);
            
            // Check for duplicates
            if (this.deliveredMessages.has(messageId)) {
                this._log('🔄 Duplicate error ignored:', messageId);
                return;
            }
            
            // Mark as delivered
            this.deliveredMessages.add(messageId);
            
            // Remove from pending messages
            this.pendingMessages.delete(messageId);
            
            // Notify error
            this._notifyChatResponseListeners({
                type: 'chat_error',
                messageId: messageId,
                error: data.error || 'Unknown error occurred',
                timestamp: Date.now()
            });
            
            // Also notify regular message listeners
            this._notifyMessageListeners({
                type: 'error_response',
                messageId: messageId,
                text: `Error: ${data.error}`,
                timestamp: Date.now()
            });
            
            // Confirm delivery
            this._confirmDelivery([messageId]);
            
            return;
        }
        
        // **NEW: Handle pending messages response**
        if (data.type === 'pending_messages') {
            this._log('📥 Received pending messages:', data.messages?.length || 0);
            
            if (data.messages && data.messages.length > 0) {
                const messageIds = [];
                
                data.messages.forEach(message => {
                    const messageId = message.message_id;
                    
                    // Skip if already delivered
                    if (this.deliveredMessages.has(messageId)) {
                        return;
                    }
                    
                    // Mark as delivered
                    this.deliveredMessages.add(messageId);
                    messageIds.push(messageId);
                    
                    // Remove from pending
                    this.pendingMessages.delete(messageId);
                    
                    // Process the message
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
                
                // Confirm delivery of all processed messages
                if (messageIds.length > 0) {
                    this._confirmDelivery(messageIds);
                }
            }
            return;
        }
        
        // **NEW: Handle delivery confirmation from server**
        if (data.type === 'delivery_confirmed') {
            this._log('✅ Server confirmed delivery of messages:', data.message_ids);
            return;
        }
        
        // Handle general error messages
        if (data.type === 'error') {
            this._error('❌ Server error:', data.message);
            this._notifyErrorListeners({
                type: 'server_error',
                message: data.message,
                errorId: data.error_id,
                retryAfter: data.retry_after
            });
            return;
        }
        
        // Handle server shutdown notification
        if (data.type === 'server_shutdown') {
            this._log('🚨 Server shutdown notification:', data.message);
            this._notifyMessageListeners({
                type: 'server_shutdown',
                message: data.message,
                reconnectRecommended: data.reconnect_recommended
            });
            return;
        }
        
        // Handle session termination
        if (data.type === 'session_terminating') {
            this._log('⚠️ Session terminating:', data.reason);
            this._notifyMessageListeners({
                type: 'session_terminating',
                reason: data.reason,
                uptime: data.uptime
            });
            return;
        }
        
        // Handle unknown message types
        this._log('📨 Unknown message type:', data.type, data);
        this._notifyMessageListeners(data);
    },
    
    /**
     * NEW: Request pending messages from server
     */
    _requestPendingMessages() {
        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this._log('📥 Requesting pending messages from server');
            this.socket.send(JSON.stringify({
                type: 'get_pending_messages',
                user_id: this.currentContext.user_id,
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    /**
     * NEW: Confirm message delivery to server
     */
    _confirmDelivery(messageIds) {
        if (!Array.isArray(messageIds) || messageIds.length === 0) return;
        
        if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
            this._log('✅ Confirming delivery of messages:', messageIds);
            this.socket.send(JSON.stringify({
                type: 'confirm_delivery',
                message_ids: messageIds,
                delivery_method: 'websocket',
                timestamp: new Date().toISOString()
            }));
        }
    },
    
    /**
     * NEW: Clear delivered messages cache (prevent memory leaks)
     */
    clearDeliveredCache() {
        const cacheSize = this.deliveredMessages.size;
        
        // Keep only recent 1000 messages to prevent memory issues
        if (cacheSize > 1000) {
            const deliveredArray = Array.from(this.deliveredMessages);
            const keepRecent = deliveredArray.slice(-500); // Keep last 500
            
            this.deliveredMessages.clear();
            keepRecent.forEach(id => this.deliveredMessages.add(id));
            
            this._log(`🧹 Cleared delivered cache: ${cacheSize} → ${this.deliveredMessages.size}`);
        }
    },
    
    /**
     * Handle connection close
     */
    _handleClose(event) {
        this._cleanup();
        this._notifyStatusChange('disconnected');
        
        const shouldReconnect = event.code !== 1000 && // Normal closure
                              event.code !== 1001 && // Going away
                              event.code !== 4001 && // Authentication failed
                              this.reconnectAttempts < this.options.maxReconnectAttempts &&
                              this.authService.isAuthenticated();
        
        const isAbnormalClosure = event.code === 1006;
        
        if (shouldReconnect || (isAbnormalClosure && this.reconnectAttempts === 0)) {
            this._log(`🔄 Connection lost (code ${event.code}), attempting reconnect...`);
            this._scheduleReconnect();
        } else if (event.code === 4001) {
            this._error('❌ Authentication failed - please login again');
            this._notifyErrorListeners({
                type: 'auth_failed',
                message: 'Authentication failed, please login again'
            });
        } else {
            this._log(`🔌 Connection closed permanently (code ${event.code}): ${event.reason}`);
        }
    },
    
    /**
     * Send a message - WebSocket only with enhanced tracking
     */
    async sendMessage(text) {
        if (!text || !text.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const messageId = this._generateId();
        const message = {
            type: 'message',
            message: text.trim(),
            id: messageId,
            timestamp: new Date().toISOString(),
            context: {
                user_id: this.currentContext.user_id,
                chat_id: this.currentContext.chat_id,
                reel_id: this.currentContext.reel_id,
                project_name: this.currentContext.project_name,
                chat_name: this.currentContext.chat_name
            }
        };
        
        if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this._log('📤 Sending message:', messageId);
            this.socket.send(JSON.stringify(message));
            
            // Track as pending
            this.pendingMessages.set(messageId, {
                queuedAt: Date.now(),
                status: 'sent'
            });
            
            return messageId;
        } else if (this.isConnected && !this.isAuthenticated) {
            throw new Error('Connected but not authenticated');
        } else {
            // Queue message
            this._queueMessage(message);
            
            // Try to connect
            if (!this.isConnecting && !this.isConnected) {
                try {
                    await this.connect();
                } catch (e) {
                    throw new Error(`Connection failed: ${e.message}`);
                }
            }
            
            return messageId;
        }
    },
    
    async loadChatHistory() {
        if (!this.currentContext.chat_id || !this.currentContext.reel_id) {
            console.log('No specific chat context, loading project messages');
            return await this._loadProjectMessages();
        }
        
        try {
            console.log('📚 Loading chat history for context:', this.currentContext);
            
            const result = await this.authService.executeFunction('get_chat_messages', {
                user_id: this.currentContext.user_id,
                chat_id: this.currentContext.chat_id,
                reel_id: this.currentContext.reel_id,
                limit: 50
            });
            
            if (result?.data?.success) {
                return result.data.messages || [];
            }
            
            return [];
            
        } catch (error) {
            console.error('❌ Failed to load chat history:', error);
            return [];
        }
    },

    /**
     * Disconnect
     */
    disconnect() {
        this._log('🔌 Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        // Clear pending messages
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
        this._log('🔄 Force reconnecting');
        
        this.disconnect();
        this.reconnectAttempts = 0;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        return this.connect();
    },
    
    /**
     * Get current status with delivery info
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
            deliveredMessages: this.deliveredMessages.size // NEW
        };
    },
    
    /**
     * Get debug info with delivery tracking
     */
    getDebugInfo() {
        return {
            ...this.getStatus(),
            queuedMessages: this.messageQueue.length,
            uptime: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
            listeners: {
                message: this.messageListeners.length,
                status: this.statusListeners.length,
                error: this.errorListeners.length,
                chatResponse: this.chatResponseListeners.length
            },
            pendingMessageDetails: this.getPendingMessages(),
            deliveredMessageCount: this.deliveredMessages.size,
            recentDeliveredMessages: Array.from(this.deliveredMessages).slice(-10) // Last 10 for debugging
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
    
    onChatResponse(callback) {
        if (typeof callback === 'function') {
            this.chatResponseListeners.push(callback);
        }
    },
    
    // Helper methods
    _notifyChatResponseListeners(data) {
        this.chatResponseListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                this._error('❌ Error in chat response listener:', e);
            }
        });
    },
    
    getPendingMessages() {
        const pendingArray = [];
        this.pendingMessages.forEach((info, messageId) => {
            pendingArray.push({
                messageId: messageId,
                queuedAt: info.queuedAt,
                waitTime: Date.now() - info.queuedAt,
                status: info.status
            });
        });
        return pendingArray;
    },
    
    // Private methods
    _startHeartbeat() {
        this._stopHeartbeat();
        
        this._log('💓 Starting heartbeat');
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this._log('🏓 Sending ping to server');
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
            this._log('💓 Heartbeat stopped');
        }
    },
    
    _sendPong() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ 
                type: 'pong',
                timestamp: Date.now()
            }));
        }
    },
    
    _scheduleReconnect() {
        this.reconnectAttempts++;
        let delay = this.reconnectAttempts === 1 ? 1000 : (this.options.reconnectInterval * this.reconnectAttempts);
        delay = Math.min(delay, 10000);
        
        this._log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(e => {
                this._error('❌ Reconnect failed:', e.message);
                if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
                    this._scheduleReconnect();
                } else {
                    this._error('❌ Max reconnect attempts reached');
                    this._notifyErrorListeners({
                        type: 'max_reconnect_attempts',
                        message: 'Maximum reconnection attempts reached'
                    });
                }
            });
        }, delay);
    },
    
    _queueMessage(message) {
        this.messageQueue.push(message);
        this._log('📥 Message queued (total:', this.messageQueue.length, ')');
    },
    
    _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        this._log(`📤 Processing ${messages.length} queued messages`);
        
        messages.forEach(msg => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(msg));
                
                // Track as pending
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
        
        // Clean up delivered messages cache periodically
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
                this._error('❌ Error in message listener:', e);
            }
        });
    },
    
    _notifyStatusChange(status) {
        this._log(`📊 Status change: ${status}`);
        this.statusListeners.forEach(callback => {
            try {
                callback(status, this.getStatus());
            } catch (e) {
                this._error('❌ Error in status listener:', e);
            }
        });
    },
    
    _notifyErrorListeners(data) {
        this.errorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (e) {
                this._error('❌ Error in error listener:', e);
            }
        });
    },
    
    _log(...args) {
        if (this.options.debug) {
            console.log('[ChatService]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[ChatService]', ...args);
    }
};

// Enhanced WebSocket-Only Chat Integration with Delivery Tracking
const EnhancedChatIntegration = {
    chatContainer: null,
    messageContainer: null,
    inputElement: null,
    statusElement: null,
    tempMessages: new Map(),
    
    init(chatContainerId = 'chat-container') {
        this.chatContainer = document.getElementById(chatContainerId);
        this.messageContainer = document.getElementById('chatBody') || document.getElementById('messages') || document.getElementById('chat-messages');
        this.inputElement = document.getElementById('messageInput') || document.getElementById('message-input') || document.querySelector('input[type="text"], textarea');
        this.statusElement = document.getElementById('connection-status');
        
        // Set up ChatService listeners
        ChatService.onStatusChange((status) => this.updateConnectionStatus(status));
        
        // Handle all message types in one place with delivery tracking
        ChatService.onMessage((data) => {
            console.log('📨 Enhanced Chat - Message received:', data.type, data);
            
            if (data.type === 'processing_message') {
                // Show temporary processing message
                const tempMsg = {
                    type: 'system',
                    text: data.text,
                    timestamp: new Date(data.timestamp).toISOString(),
                    isTemporary: true,
                    messageId: data.messageId
                };
                
                this.addMessage(tempMsg);
                this.tempMessages.set(data.messageId, tempMsg);
                
            } else if (data.type === 'bot_response') {
                // **ENHANCED: Remove processing message and add bot response**
                if (data.messageId) {
                    this.removeTemporaryMessage(data.messageId);
                    this.tempMessages.delete(data.messageId);
                }
                
                let processingInfo = '';
                if (data.processingTime) {
                    processingInfo = ` (${data.processingTime.toFixed(2)}s)`;
                }
                
                // **NEW: Check for duplicate messages in DOM**
                if (!this.isDuplicateMessage(data.messageId)) {
                    this.addMessage({
                        type: 'bot',
                        text: data.text + processingInfo,
                        components: data.components,
                        timestamp: new Date(data.timestamp).toISOString(),
                        metadata: data.metadata,
                        messageId: data.messageId
                    });
                } else {
                    console.log('🔄 Duplicate bot response prevented:', data.messageId);
                }
                
            } else if (data.type === 'error_response') {
                // Remove processing message and add error
                if (data.messageId) {
                    this.removeTemporaryMessage(data.messageId);
                    this.tempMessages.delete(data.messageId);
                }
                
                this.addMessage({
                    type: 'error',
                    text: data.text,
                    timestamp: new Date(data.timestamp).toISOString(),
                    messageId: data.messageId
                });
            }
        });
        
        // Also handle dedicated chat response listener with delivery tracking
        ChatService.onChatResponse((data) => {
            console.log('💬 Enhanced Chat - Chat response:', data);
            this.handleChatResponse(data);
        });
        
        ChatService.onError((error) => this.handleError(error));
        
        // Set up input handler
        this.setupInputHandler();
        
        // **NEW: Periodic cleanup of delivered messages**
        setInterval(() => {
            ChatService.clearDeliveredCache();
        }, 300000); // Every 5 minutes
        
        console.log('🎯 Enhanced WebSocket-Only Chat Integration initialized with delivery tracking');
    },
    
    async initializeWithProject(projectId, projectName) {
        try {
            console.log('🎯 Initializing chat with project context:', { projectId, projectName });
            
            // Switch to project context first
            if (window.EnhancedProjectService) {
                const contextResult = await window.EnhancedProjectService.switchToProject(projectId, projectName);
                if (!contextResult.success) {
                    throw new Error('Failed to switch project context');
                }
                console.log('✅ Project context switched successfully');
            }
            
            // Initialize chat service if not already done
            if (window.ChatService && window.AuthService) {
                if (!window.ChatService.authService) {
                    window.ChatService.init(window.AuthService);
                }
                
                // Set project context in chat service
                window.ChatService.setProjectContext(projectId, projectName);
                
                // Connect if not connected
                if (!window.ChatService.isConnected) {
                    await window.ChatService.connect();
                }
                
                console.log('✅ Chat service initialized with project context');
            }
            
            // Load chat history for this project
            await this.loadProjectChatHistory();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize chat with project:', error);
            return false;
        }
    },
    
    async loadProjectChatHistory() {
        try {
            if (!window.ChatService) return;
            
            const messages = await window.ChatService.loadChatHistory();
            console.log(`📚 Loaded ${messages.length} messages for project`);
            
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
                
                console.log('✅ Chat history displayed');
            }
            
        } catch (error) {
            console.error('❌ Failed to load project chat history:', error);
        }
    },

    setupInputHandler() {
        const form = this.inputElement?.closest('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.sendMessage();
            });
        } else if (this.inputElement) {
            this.inputElement.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
        }
    },
    
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
            
            // Send via WebSocket
            const messageId = await ChatService.sendMessage(message);
            console.log('📤 Message sent with ID:', messageId);
            
            // Clear input
            if (this.inputElement) {
                this.inputElement.value = '';
            }
            
        } catch (error) {
            console.error('❌ Failed to send message:', error);
            this.addMessage({
                type: 'error',
                text: `Failed to send: ${error.message}`,
                timestamp: new Date().toISOString()
            });
        }
    },
    
    handleChatResponse(data) {
        // Remove temporary message if exists
        if (data.messageId && this.tempMessages.has(data.messageId)) {
            this.removeTemporaryMessage(data.messageId);
            this.tempMessages.delete(data.messageId);
        }
        
        if (data.type === 'chat_response') {
            // **NEW: Check for duplicates before adding**
            if (this.isDuplicateMessage(data.messageId)) {
                console.log('🔄 Duplicate chat response prevented:', data.messageId);
                return;
            }
            
            // Add bot response
            let processingInfo = '';
            if (data.processingTime) {
                processingInfo = ` (${data.processingTime.toFixed(2)}s)`;
            }
            
            this.addMessage({
                type: 'bot',
                text: data.text + processingInfo,
                components: data.components,
                timestamp: new Date(data.timestamp).toISOString(),
                metadata: data.metadata,
                messageId: data.messageId
            });
            
        } else if (data.type === 'chat_error') {
            // Add error message
            this.addMessage({
                type: 'error',
                text: `Error: ${data.error}`,
                timestamp: new Date(data.timestamp).toISOString(),
                messageId: data.messageId
            });
        }
    },
    
    handleError(error) {
        this.addMessage({
            type: 'error',
            text: error.message || 'An error occurred',
            timestamp: new Date().toISOString()
        });
    },
    
    /**
     * NEW: Check if message already exists in DOM to prevent duplicates
     */
    isDuplicateMessage(messageId) {
        if (!messageId || !this.messageContainer) return false;
        
        const existingMessage = this.messageContainer.querySelector(`[data-message-id="${messageId}"]`);
        return !!existingMessage;
    },
    
    addMessage(message) {
        if (!this.messageContainer) {
            console.warn('Message container not found');
            return;
        }
        
        // **ENHANCED: Additional duplicate check with message ID**
        if (message.messageId && this.isDuplicateMessage(message.messageId)) {
            console.log('🔄 Duplicate message prevented in addMessage:', message.messageId);
            return;
        }
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${message.type || 'default'}`;
        
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
        `;
        
        if (message.processingInfo) {
            content += `<div class="processing-info">${message.processingInfo}</div>`;
        }
        
        content += '</div>';
        messageDiv.innerHTML = content;
        
        this.messageContainer.appendChild(messageDiv);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
        
        console.log('✅ Added message to chat:', message.type, message.text.substring(0, 30), message.messageId || 'no-id');
    },
    
    removeTemporaryMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement && messageElement.classList.contains('temporary-message')) {
            messageElement.remove();
            console.log('🗑️ Removed temporary message:', messageId);
        }
    },
    
    updateConnectionStatus(status) {
        if (!this.statusElement) return;
        
        const pendingCount = ChatService.getPendingMessages().length;
        const deliveredCount = ChatService.getStatus().deliveredMessages;
        const statusText = `${status}${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}${deliveredCount > 0 ? ` [${deliveredCount} delivered]` : ''}`;
        
        this.statusElement.textContent = statusText;
        this.statusElement.className = `connection-status ${status}`;
    },
    
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

// Enhanced CSS Styles with delivery tracking indicators
const enhancedChatStyles = `
<style>
.connection-status {
    position: fixed;
    top: 10px;
    right: 10px;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: bold;
    z-index: 1000;
    transition: all 0.3s ease;
}

.connection-status.connected { 
    background: #4CAF50; 
    color: white; 
}

.connection-status.connecting { 
    background: #FFC107; 
    color: black; 
}

.connection-status.reconnecting { 
    background: #FF9800; 
    color: white; 
}

.connection-status.disconnected { 
    background: #F44336; 
    color: white; 
}

.temporary-message { 
    opacity: 0.7; 
    font-style: italic; 
    animation: pulse 2s infinite;
    border-left-color: #FFC107 !important;
}

@keyframes pulse {
    0% { opacity: 0.7; }
    50% { opacity: 1; }
    100% { opacity: 0.7; }
}

.processing-info { 
    font-size: 0.75em; 
    color: #666; 
    margin-top: 4px; 
    font-style: italic;
}

.message {
    margin: 8px 0;
    padding: 8px 12px;
    border-radius: 8px;
    position: relative;
}

.message[data-message-id]::before {
    content: "✓";
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 10px;
    color: #4CAF50;
    opacity: 0.7;
}

.message.error {
    background: #ffebee;
    border-left: 3px solid #f44336;
    color: #c62828;
}

.message.system {
    background: #f3f4f6;
    border-left: 3px solid #6b7280;
    color: #374151;
    font-size: 0.9em;
}

.message.bot {
    background: #f0f9ff;
    border-left: 3px solid #0ea5e9;
}

.message.user {
    background: #ecfdf5;
    border-left: 3px solid #10b981;
}

.message-time {
    font-size: 0.75em;
    color: #666;
    margin-top: 4px;
}

/* Delivery status indicators */
.message.delivered {
    border-right: 3px solid #4CAF50;
}

.message.pending {
    border-right: 3px solid #FFC107;
    animation: pendingPulse 3s infinite;
}

@keyframes pendingPulse {
    0%, 100% { border-right-color: #FFC107; }
    50% { border-right-color: #FF9800; }
}
</style>
`;

// Initialize everything with delivery tracking
document.addEventListener('DOMContentLoaded', function() {
    // Add styles
    document.head.insertAdjacentHTML('beforeend', enhancedChatStyles);
    
    // Add connection status indicator if it doesn't exist
    if (!document.getElementById('connection-status')) {
        document.body.insertAdjacentHTML('beforeend', 
            '<div id="connection-status" class="connection-status">Initializing with delivery tracking...</div>'
        );
    }
    
    // Only initialize enhanced chat integration if there's no main chat app
    // (The main chat app in chat.html will handle messages directly)
    if (!document.getElementById('chatBody')) {
        EnhancedChatIntegration.init();
        console.log('🚀 Enhanced WebSocket-only chat system ready with delivery tracking (Enhanced Integration)');
    } else {
        console.log('🚀 Enhanced WebSocket-only chat system ready with delivery tracking (Main App Integration)');
    }
});

// Export for global access
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
    window.EnhancedChatIntegration = EnhancedChatIntegration;
}