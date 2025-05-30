/**
 * Unified WebSocket Chat Service for AAAI Solutions
 * Integrates seamlessly with ProjectService and NavigationManager
 * Removes duplicates and provides clean communication layer
 */
const ChatService = {
    // Core state
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
     * Initialize the chat service with dependencies
     */
    init(authService, options = {}) {
        if (this.isInitialized) {
            console.log('💬 ChatService already initialized');
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
            this._log('ChatService initialized for user:', user.email);
        }
        
        this.isInitialized = true;
        
        this._log('ChatService initialized successfully', {
            userId: user?.id,
            hasProjectService: !!this.projectService,
            maxReconnectAttempts: this.options.maxReconnectAttempts
        });
        
        return this;
    },
    
    /**
     * Connect to WebSocket with context integration
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
        
        this._log('Starting WebSocket connection...');
        
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
            
            // Build WebSocket URL with context
            const wsUrl = this._buildWebSocketURL(user, projectContext);
            this._log('Connecting to:', wsUrl);
            
            // Connection timeout
            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._log('Connection timeout');
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
                    this._log(`WebSocket opened in ${connectionTime}ms`);
                    this.isConnected = true;
                };
                
                // Handle messages
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const messageTime = Date.now() - this.connectionStartTime;
                        this._log(`Message received (${data.type}) after ${messageTime}ms`);
                        
                        // Handle session establishment
                        if (data.type === 'session_established') {
                            this._log('Session established with server');
                            
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
                        
                        // Handle connection errors
                        if (data.type === 'error' && this.isConnecting) {
                            this._log('Connection error:', data.message);
                            clearTimeout(timeout);
                            this.isConnecting = false;
                            this._cleanup();
                            reject(new Error(`Authentication failed: ${data.message}`));
                            return;
                        }
                        
                        // Handle other messages
                        this._handleMessage(data);
                        
                    } catch (e) {
                        this._error('Message parse error:', e);
                        this._error('Raw message:', event.data);
                    }
                };
                
                // Handle close
                this.socket.onclose = (event) => {
                    const connectionTime = Date.now() - this.connectionStartTime;
                    this._log(`WebSocket closed after ${connectionTime}ms:`, event.code, event.reason);
                    
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
                    this._error('WebSocket error:', event);
                    
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
     * Send a message with context integration
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
            context: context
        };
        
        if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
            this._log('Sending message:', messageId);
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
    
    /**
     * Update project context (called by ProjectService)
     */
    setProjectContext(chatId, projectName) {
        this._log('Project context updated', { chatId, projectName });
        
        // Notify server about context change if connected
        if (this.isConnected && this.socket?.readyState === WebSocket.OPEN) {
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
    
    /**
     * Load chat history with project integration
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
            
            this._log('Loading chat history for context:', context);
            
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
            this._error('Failed to load chat history:', error);
            return [];
        }
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
        this._log('Force reconnecting');
        
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
            pendingMessages: this.pendingMessages.size,
            deliveredMessages: this.deliveredMessages.size
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
     * Build WebSocket URL with context
     */
    _buildWebSocketURL(user, projectContext = {}) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        const params = new URLSearchParams({
            auth: 'true',
            email: encodeURIComponent(user.email),
            user_id: user.id,
            chat_id: projectContext.chat_id || '',
            reel_id: projectContext.reel_id || '',
            session_id: user.sessionId || 'web_session',
            t: Date.now()
        });
        
        return `${wsProtocol}//${wsHost}/ws/${user.id}?${params}`;
    },
    
    /**
     * Handle incoming messages with delivery tracking
     */
    _handleMessage(data) {
        this.messageCount++;
        
        if (data.type === 'session_established') {
            this.isAuthenticated = true;
            this._log('Session established with context:', data.context);
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
        
        if (shouldReconnect) {
            this._log(`Connection lost (code ${event.code}), attempting reconnect...`);
            this._scheduleReconnect();
        } else if (event.code === 4001) {
            this._error('Authentication failed - please login again');
            this._notifyErrorListeners({
                type: 'auth_failed',
                message: 'Authentication failed, please login again'
            });
        } else {
            this._log(`Connection closed permanently (code ${event.code}): ${event.reason}`);
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
                timestamp: Date.now()
            }));
        }
    },
    
    _scheduleReconnect() {
        this.reconnectAttempts++;
        let delay = this.reconnectAttempts === 1 ? 1000 : (this.options.reconnectInterval * this.reconnectAttempts);
        delay = Math.min(delay, 10000);
        
        this._log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(e => {
                this._error('Reconnect failed:', e.message);
                if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
                    this._scheduleReconnect();
                } else {
                    this._error('Max reconnect attempts reached');
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
            console.log('[ChatService]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[ChatService]', ...args);
    }
};

/**
 * Unified Chat Integration Manager
 * Handles UI integration without duplicating ChatService functionality
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
            console.log('💬 ChatIntegration already initialized');
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
        
        console.log('💬 ChatIntegration initialized successfully', {
            hasMessageContainer: !!this.messageContainer,
            hasInputElement: !!this.inputElement,
            hasStatusElement: !!this.statusElement
        });
        
        return this;
    },
    
    /**
     * Initialize with project context
     */
    async initializeWithProject(projectId, projectName) {
        try {
            console.log('💬 Initializing chat with project context:', { projectId, projectName });
            
            this.currentProjectId = projectId;
            this.currentProjectName = projectName;
            
            // Switch project context
            if (window.ProjectService) {
                const contextResult = await window.ProjectService.switchToProject(projectId, projectName);
                if (!contextResult.success) {
                    throw new Error('Failed to switch project context');
                }
                console.log('✅ Project context switched for chat');
            }
            
            // Initialize/connect ChatService
            if (window.ChatService) {
                if (!window.ChatService.isInitialized) {
                    window.ChatService.init(window.AuthService);
                }
                
                // Connect if not connected
                if (!window.ChatService.isConnected) {
                    await window.ChatService.connect();
                }
                
                console.log('✅ ChatService connected with project context');
            }
            
            // Load chat history
            await this.loadProjectChatHistory();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize chat with project:', error);
            return false;
        }
    },
    
    /**
     * Load project chat history
     */
    async loadProjectChatHistory() {
        try {
            if (!window.ChatService) {
                console.warn('ChatService not available for loading history');
                return;
            }
            
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
     * Send message
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
            
            // Send via ChatService
            const messageId = await window.ChatService.sendMessage(message);
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
    
    /**
     * Handle incoming messages
     */
    handleMessage(data) {
        console.log('💬 Chat integration - Message received:', data.type);
        
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
                    console.log('🔄 Duplicate response prevented:', data.messageId);
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
                console.log('💬 Unknown message type in integration:', data.type);
                break;
        }
    },
    
    /**
     * Handle errors
     */
    handleError(error) {
        console.error('💬 Chat integration error:', error);
        
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
            console.log('🔄 Duplicate message prevented in addMessage:', message.messageId);
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
        
        console.log('✅ Message added to chat:', message.type, message.text.substring(0, 30), message.messageId || 'no-id');
        
        return messageDiv;
    },
    
    /**
     * Remove temporary message
     */
    removeTemporaryMessage(messageId) {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
        if (messageElement && messageElement.classList.contains('temporary-message')) {
            messageElement.remove();
            console.log('🗑️ Removed temporary message:', messageId);
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
     * Update connection status display
     */
    updateConnectionStatus(status) {
        if (!this.statusElement) return;
        
        const pendingCount = window.ChatService?.pendingMessages?.size || 0;
        const deliveredCount = window.ChatService?.getStatus()?.deliveredMessages || 0;
        const statusText = `${status}${pendingCount > 0 ? ` (${pendingCount} pending)` : ''}${deliveredCount > 0 ? ` [${deliveredCount} delivered]` : ''}`;
        
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
        console.log('💬 Chat integration initialized for embedded use');
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