/**
 * FIXED WebSocket Chat Service - Response Polling Ready
 * Clean version that handles all message types properly
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
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    pendingMessages: new Map(), // Track pending message IDs
    chatResponseListeners: [], // Dedicated listeners for chat responses
    
    // Performance tracking
    connectionStartTime: 0,
    lastPongTime: 0,
    messageCount: 0,
    
    // Configuration
    options: {
        reconnectInterval: 3000,
        maxReconnectAttempts: 3,
        heartbeatInterval: 60000,
        connectionTimeout: 15000,
        debug: true
    },
    
    /**
     * Initialize the service
     */
    init(authService, options = {}) {
        if (!authService) {
            throw new Error('AuthService is required');
        }
        
        this.authService = authService;
        this.options = { ...this.options, ...options };
        
        this._log('🚀 ChatService initialized with response polling support');
        return this;
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
            session_id: user.sessionId || 'web_session',
            t: Date.now()
        });
        
        return `${wsProtocol}//${wsHost}/ws/${user.id}?${params}`;
    },
    
    /**
     * FIXED: Handle incoming messages - clean version
     */
    _handleMessage(data) {
        this.messageCount++;
        
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
        if (data.type === 'message_queued') {
            this._log('📬 Message queued:', data.message_id);
            
            // Track pending message
            this.pendingMessages.set(data.message_id, {
                queuedAt: Date.now(),
                status: 'pending'
            });
            
            // Notify listeners
            this._notifyMessageListeners({
                type: 'processing_message',
                messageId: data.message_id,
                text: data.message || 'Processing your message...',
                timestamp: Date.now(),
                isTemporary: true
            });
            return;
        }
        
        // Handle message status updates (from your current system)
        if (data.type === 'message_status') {
            this._log('📬 Message status update:', data.status, data.messageId);
            
            if (data.status === 'queued') {
                // Track pending message
                this.pendingMessages.set(data.messageId, {
                    queuedAt: Date.now(),
                    status: 'pending'
                });
                
                // Show processing message
                this._notifyMessageListeners({
                    type: 'processing_message',
                    messageId: data.messageId,
                    text: data.message || 'Processing your message...',
                    timestamp: Date.now(),
                    isTemporary: true
                });
            }
            return;
        }
        
        // Handle chat response from orchestrator (this is what you need!)
        if (data.type === 'chat_response') {
            this._log('💬 Chat response received:', data.message_id);
            
            // Remove from pending messages
            this.pendingMessages.delete(data.message_id);
            
            // Parse response
            const response = data.response || {};
            const text = response.text || 'No response text';
            const processingTime = data.processing_time || 0;
            
            // Notify chat response listeners
            this._notifyChatResponseListeners({
                type: 'chat_response',
                messageId: data.message_id,
                text: text,
                components: response.components || [],
                processingTime: processingTime,
                timestamp: Date.now(),
                metadata: response.metadata || {}
            });
            
            // Also notify regular message listeners for backward compatibility
            this._notifyMessageListeners({
                type: 'bot_response',
                messageId: data.message_id,
                text: text,
                components: response.components || [],
                processingTime: processingTime,
                timestamp: Date.now(),
                metadata: response.metadata || {}
            });
            return;
        }
        
        // Handle chat error from orchestrator
        if (data.type === 'chat_error') {
            this._log('❌ Chat error received:', data.message_id);
            
            // Remove from pending messages
            this.pendingMessages.delete(data.message_id);
            
            // Notify error
            this._notifyChatResponseListeners({
                type: 'chat_error',
                messageId: data.message_id,
                error: data.error || 'Unknown error occurred',
                timestamp: Date.now()
            });
            
            // Also notify regular message listeners
            this._notifyMessageListeners({
                type: 'error_response',
                messageId: data.message_id,
                text: `Error: ${data.error}`,
                timestamp: Date.now()
            });
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
     * Send a message
     */
    async sendMessage(text) {
        if (!text || !text.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const message = {
            type: 'message',
            message: text.trim(),
            id: this._generateId(),
            timestamp: new Date().toISOString()
        };
        
        if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this._log('📤 Sending message:', message.id);
            this.socket.send(JSON.stringify(message));
            return message.id;
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
            
            return message.id;
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
            pendingMessages: this.pendingMessages.size
        };
    },
    
    /**
     * Get debug info
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
            pendingMessageDetails: this.getPendingMessages()
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

// FIXED Enhanced Chat Integration
const EnhancedChatIntegration = {
    chatContainer: null,
    messageContainer: null,
    inputElement: null,
    statusElement: null,
    tempMessages: new Map(),
    
    init(chatContainerId = 'chat-container') {
        this.chatContainer = document.getElementById(chatContainerId);
        this.messageContainer = document.getElementById('messages') || document.getElementById('chat-messages');
        this.inputElement = document.getElementById('message-input') || document.querySelector('input[type="text"]');
        this.statusElement = document.getElementById('connection-status');
        
        // Set up ChatService listeners - FIXED to handle all message types
        ChatService.onStatusChange((status) => this.updateConnectionStatus(status));
        
        // Handle all message types in one place
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
                // Remove processing message and add bot response
                if (data.messageId) {
                    this.removeTemporaryMessage(data.messageId);
                    this.tempMessages.delete(data.messageId);
                }
                
                let processingInfo = '';
                if (data.processingTime) {
                    processingInfo = ` (${data.processingTime.toFixed(2)}s)`;
                }
                
                this.addMessage({
                    type: 'bot',
                    text: data.text + processingInfo,
                    components: data.components,
                    timestamp: new Date(data.timestamp).toISOString(),
                    metadata: data.metadata
                });
                
            } else if (data.type === 'error_response') {
                // Remove processing message and add error
                if (data.messageId) {
                    this.removeTemporaryMessage(data.messageId);
                    this.tempMessages.delete(data.messageId);
                }
                
                this.addMessage({
                    type: 'error',
                    text: data.text,
                    timestamp: new Date(data.timestamp).toISOString()
                });
            }
        });
        
        // Also handle dedicated chat response listener
        ChatService.onChatResponse((data) => {
            console.log('💬 Enhanced Chat - Chat response:', data);
            this.handleChatResponse(data);
        });
        
        ChatService.onError((error) => this.handleError(error));
        
        // Set up input handler
        this.setupInputHandler();
        
        console.log('🎯 Enhanced Chat Integration initialized');
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
                metadata: data.metadata
            });
            
        } else if (data.type === 'chat_error') {
            // Add error message
            this.addMessage({
                type: 'error',
                text: `Error: ${data.error}`,
                timestamp: new Date(data.timestamp).toISOString()
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
    
    addMessage(message) {
        if (!this.messageContainer) {
            console.warn('Message container not found');
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
        
        console.log('✅ Added message to chat:', message.type, message.text.substring(0, 30));
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
        const statusText = `${status}${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}`;
        
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

// Enhanced CSS Styles
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
</style>
`;

// Initialize everything
document.addEventListener('DOMContentLoaded', function() {
    // Add styles
    document.head.insertAdjacentHTML('beforeend', enhancedChatStyles);
    
    // Add connection status indicator if it doesn't exist
    if (!document.getElementById('connection-status')) {
        document.body.insertAdjacentHTML('beforeend', 
            '<div id="connection-status" class="connection-status">Initializing...</div>'
        );
    }
    
    // Initialize enhanced chat integration
    EnhancedChatIntegration.init();
    
    console.log('🚀 Enhanced chat system ready');
});

// Export for global access
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
    window.EnhancedChatIntegration = EnhancedChatIntegration;
}