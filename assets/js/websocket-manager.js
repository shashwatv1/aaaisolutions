/**
 * Production WebSocket Manager for AAAI Solutions
 * Ultra-fast, non-blocking, and self-healing WebSocket implementation
 */
class ProductionWebSocketManager {
    constructor() {
        this.state = 'disconnected';
        this.socket = null;
        this.sessionId = null;
        this.userId = null;
        this.projectId = null;
        this.projectName = null;
        
        // Message handling
        this.messageHandlers = new Map();
        this.pendingMessages = new Map();
        this.messageQueue = [];
        
        // Connection management - optimized for speed
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 3; // Reduced for faster failover
        this.reconnectDelay = 1000; // Reduced initial delay
        this.heartbeatInterval = null;
        this.heartbeatTimer = null;
        this.connectionTimeout = 5000; // Faster timeout
        
        // State management
        this.isAuthenticated = false;
        self.authService = null;
        this.currentReelId = null;
        this.currentReelName = null;
        
        // Performance optimization
        this.isConnecting = false;
        this.connectPromise = null;
        this.messageBuffer = [];
        this.lastHeartbeat = 0;
        
        // Bind methods to maintain context
        this.handleOpen = this.handleOpen.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
    }
    
    /**
     * Ultra-fast initialization
     */
    initialize(authService) {
        if (!authService) {
            throw new Error('AuthService is required');
        }
        
        this.authService = authService;
        this.setState('initialized');
        
        // Register optimized message handlers in parallel
        this.registerHandlersParallel();
        
        return this;
    }
    
    /**
     * Parallel handler registration
     */
    registerHandlersParallel() {
        const handlers = [
            ['session_established', this.handleSessionEstablished.bind(this)],
            ['message_queued', this.handleMessageQueued.bind(this)],
            ['chat_response', this.handleChatResponse.bind(this)],
            ['chat_error', this.handleChatError.bind(this)],
            ['ping', this.handlePing.bind(this)],
            ['pong', this.handlePong.bind(this)]
        ];
        
        // Register all handlers at once
        handlers.forEach(([type, handler]) => {
            this.registerHandler(type, handler);
        });
    }
    
    /**
     * Ultra-fast non-blocking connection
     */
    async connectParallel() {
        // Return existing connection promise if already connecting
        if (this.isConnecting && this.connectPromise) {
            return this.connectPromise;
        }
        
        // Return immediately if already connected
        if (this.state === 'connected') {
            return Promise.resolve(true);
        }
        
        // Quick auth check
        if (!this.authService?.isAuthenticated()) {
            return Promise.reject(new Error('Authentication required'));
        }
        
        this.isConnecting = true;
        this.setState('connecting');
        
        // Create connection promise for reuse
        this.connectPromise = this.createConnectionParallel();
        
        try {
            const result = await this.connectPromise;
            return result;
        } finally {
            this.isConnecting = false;
            this.connectPromise = null;
        }
    }
    
    /**
     * Create parallel connection with timeout and fallback
     */
    async createConnectionParallel() {
        try {
            const user = this.authService.getCurrentUser();
            this.userId = user.id;
            
            const wsUrl = this.buildWebSocketURL(user);
            
            // Create WebSocket with immediate setup
            this.socket = new WebSocket(wsUrl);
            
            // Set up event handlers immediately
            this.socket.onopen = this.handleOpen;
            this.socket.onmessage = this.handleMessage;
            this.socket.onclose = this.handleClose;
            this.socket.onerror = this.handleError;
            
            // Parallel connection with timeout
            const connectionResult = await Promise.race([
                this.waitForConnection(),
                this.createConnectionTimeout()
            ]);
            
            if (connectionResult === 'timeout') {
                this.cleanup();
                throw new Error('Connection timeout');
            }
            
            return true;
            
        } catch (error) {
            this.setState('disconnected');
            this.cleanup();
            throw error;
        }
    }
    
    /**
     * Wait for connection with proper event handling
     */
    waitForConnection() {
        return new Promise((resolve, reject) => {
            const onOpen = () => {
                this.socket.removeEventListener('error', onError);
                resolve('connected');
            };
            
            const onError = (error) => {
                this.socket.removeEventListener('open', onOpen);
                reject(error);
            };
            
            this.socket.addEventListener('open', onOpen, { once: true });
            this.socket.addEventListener('error', onError, { once: true });
        });
    }
    
    /**
     * Create connection timeout
     */
    createConnectionTimeout() {
        return new Promise((resolve) => {
            setTimeout(() => resolve('timeout'), this.connectionTimeout);
        });
    }
    
    /**
     * Legacy connect method for backward compatibility
     */
    async connect() {
        return this.connectParallel();
    }
    
    /**
     * Ultra-fast message sending with queue management
     */
    async sendMessage(text, context = {}) {
        if (!text?.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const messageId = this.generateMessageId();
        const message = {
            type: 'message',
            message: text.trim(),
            id: messageId,
            timestamp: new Date().toISOString(),
            context: {
                user_id: this.userId,
                chat_id: this.projectId,
                project_name: this.projectName,
                reel_id: context.reel_id || null,
                reel_name: context.reel_name || null,
                saved_message_id: context.saved_message_id || null,
                ...context
            }
        };
        
        // Add to pending messages immediately
        this.pendingMessages.set(messageId, {
            text: text.trim(),
            timestamp: Date.now(),
            status: 'sending',
            reel_id: context.reel_id,
            saved_message_id: context.saved_message_id
        });
        
        // Send immediately if connected, otherwise queue
        if (this.state === 'connected') {
            this.sendRawMessage(message);
        } else {
            // Queue message and try to connect in parallel
            this.messageQueue.push(message);
            this.connectParallel().then(() => {
                this.flushMessageQueue();
            }).catch(error => {
                console.error('Failed to connect for queued message:', error);
            });
        }
        
        return messageId;
    }
    
    /**
     * Flush queued messages after connection
     */
    flushMessageQueue() {
        if (this.state === 'connected' && this.messageQueue.length > 0) {
            const queuedMessages = [...this.messageQueue];
            this.messageQueue = [];
            
            // Send all queued messages in batch
            queuedMessages.forEach(message => {
                this.sendRawMessage(message);
            });
            
            console.log(`✅ Flushed ${queuedMessages.length} queued messages`);
        }
    }
    
    /**
     * Ultra-fast context updates
     */
    setProjectContext(projectId, projectName) {
        this.projectId = projectId;
        this.projectName = projectName;
        
        // Send context update immediately if connected
        this.sendContextUpdateOptimized({
            chat_id: projectId,
            project_name: projectName,
            user_id: this.userId
        });
    }
    
    setReelContext(reelId, reelName) {
        this.currentReelId = reelId;
        this.currentReelName = reelName;
        
        // Send optimized context update
        this.sendContextUpdateOptimized({
            user_id: this.userId,
            chat_id: this.projectId,
            project_name: this.projectName,
            reel_id: reelId,
            reel_name: reelName
        });
        
        console.log('🎯 Reel context updated:', { reelId, reelName });
    }
    
    setCompleteContext(projectId, projectName, reelId = null, reelName = null) {
        this.projectId = projectId;
        this.projectName = projectName;
        this.currentReelId = reelId;
        this.currentReelName = reelName;
        
        // Send complete context update
        this.sendContextUpdateOptimized({
            user_id: this.userId,
            chat_id: projectId,
            project_name: projectName,
            reel_id: reelId,
            reel_name: reelName
        });
        
        console.log('🎯 Complete context updated:', { projectId, projectName, reelId, reelName });
    }
    
    /**
     * Optimized context update sending
     */
    sendContextUpdateOptimized(context) {
        if (this.state === 'connected') {
            this.sendRawMessage({
                type: 'context_update',
                context: context,
                timestamp: new Date().toISOString()
            });
        } else {
            // Queue context update for when connected
            this.messageQueue.push({
                type: 'context_update',
                context: context,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    /**
     * Optimized message handler registration
     */
    registerHandler(messageType, handler) {
        if (typeof handler !== 'function') {
            throw new Error('Handler must be a function');
        }
        
        if (!this.messageHandlers.has(messageType)) {
            this.messageHandlers.set(messageType, new Set());
        }
        
        this.messageHandlers.get(messageType).add(handler);
    }
    
    /**
     * Unregister message handler
     */
    unregisterHandler(messageType, handler) {
        if (this.messageHandlers.has(messageType)) {
            this.messageHandlers.get(messageType).delete(handler);
        }
    }
    
    /**
     * Fast disconnect with cleanup
     */
    disconnect() {
        this.cleanup();
        this.setState('disconnected');
        this.messageQueue = [];
        this.pendingMessages.clear();
    }
    
    /**
     * Get current state efficiently
     */
    getState() {
        return {
            state: this.state,
            sessionId: this.sessionId,
            userId: this.userId,
            projectId: this.projectId,
            projectName: this.projectName,
            pendingMessages: this.pendingMessages.size,
            queuedMessages: this.messageQueue.length,
            isAuthenticated: this.isAuthenticated,
            lastHeartbeat: this.lastHeartbeat
        };
    }
    
    // Optimized private methods
    
    handleOpen() {
        this.setState('connected');
        this.isAuthenticated = true;
        this.connectionAttempts = 0;
        this.startOptimizedHeartbeat();
        
        // Flush any queued messages
        setTimeout(() => this.flushMessageQueue(), 0);
    }
    
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Process message immediately
            this.processMessageOptimized(data);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }
    
    handleClose(event) {
        this.setState('disconnected');
        this.cleanup();
        
        // Smart auto-reconnect
        if (event.code !== 1000 && this.connectionAttempts < this.maxConnectionAttempts) {
            this.scheduleSmartReconnect();
        }
    }
    
    handleError(error) {
        console.error('WebSocket error:', error);
        
        // Don't change state here, let handleClose deal with it
    }
    
    /**
     * Optimized message processing with batching
     */
    processMessageOptimized(data) {
        const messageType = data.type;
        
        if (this.messageHandlers.has(messageType)) {
            const handlers = this.messageHandlers.get(messageType);
            
            // Process handlers in next tick to avoid blocking
            requestAnimationFrame(() => {
                handlers.forEach(handler => {
                    try {
                        handler(data);
                    } catch (error) {
                        console.error(`Handler error for ${messageType}:`, error);
                    }
                });
            });
        }
    }
    
    handleSessionEstablished(data) {
        this.sessionId = data.session_id;
        
        // Set project context if available
        if (this.projectId && this.projectName) {
            setTimeout(() => {
                this.setProjectContext(this.projectId, this.projectName);
            }, 0);
        }
    }
    
    handleMessageQueued(data) {
        const messageId = data.message_id;
        if (this.pendingMessages.has(messageId)) {
            this.pendingMessages.get(messageId).status = 'queued';
        }
    }
    
    handleChatResponse(data) {
        const messageId = data.message_id;
        this.pendingMessages.delete(messageId);
        
        // Extract response text efficiently
        let responseText = data.text;
        if (!responseText && data.response) {
            if (typeof data.response === 'string') {
                responseText = data.response;
            } else if (data.response.text) {
                responseText = data.response.text;
            }
        }
        
        if (responseText) {
            this.notifyUIOptimized('chat_response', {
                messageId: messageId,
                text: responseText,
                timestamp: data.timestamp || Date.now(),
                components: data.components || [],
                saved_bot_message_id: data.saved_bot_message_id,
                context: data.context,
                processing_time: data.processing_time
            });
        }
    }
    
    handleChatError(data) {
        const messageId = data.message_id;
        this.pendingMessages.delete(messageId);
        
        this.notifyUIOptimized('chat_error', {
            messageId: messageId,
            error: data.error,
            timestamp: data.timestamp || Date.now()
        });
    }
    
    handlePing() {
        // Respond immediately
        this.sendRawMessage({
            type: 'pong',
            timestamp: Date.now()
        });
    }
    
    handlePong() {
        this.lastHeartbeat = Date.now();
    }
    
    /**
     * Optimized raw message sending
     */
    sendRawMessage(message) {
        if (this.state === 'connected' && this.socket?.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(message));
            } catch (error) {
                console.error('Failed to send WebSocket message:', error);
                // Queue message for retry
                this.messageQueue.push(message);
            }
        } else {
            // Queue message for when connected
            this.messageQueue.push(message);
        }
    }
    
    /**
     * Optimized WebSocket URL building
     */
    buildWebSocketURL(user) {
        const wsHost = window.AAAI_CONFIG.WEBSOCKET_BASE_URL || 'aaai.solutions';
        const token = this.authService.getToken();
        
        // Build URL efficiently
        const baseUrl = `wss://${wsHost}/ws/${user.id}`;
        const params = new URLSearchParams({
            token: token,
            user_id: user.id,
            email: encodeURIComponent(user.email),
            chat_id: this.projectId || '',
            session_id: user.sessionId || 'production_session',
            auth_method: 'jwt_production'
        });
        
        return `${baseUrl}?${params}`;
    }
    
    /**
     * Optimized state management
     */
    setState(newState) {
        if (this.state !== newState) {
            const oldState = this.state;
            this.state = newState;
            
            // Notify UI asynchronously
            requestAnimationFrame(() => {
                this.notifyUIOptimized('state_change', { 
                    state: newState, 
                    previousState: oldState,
                    timestamp: Date.now()
                });
            });
        }
    }
    
    /**
     * Optimized UI notification
     */
    notifyUIOptimized(eventType, data) {
        // Use requestAnimationFrame for non-blocking UI updates
        requestAnimationFrame(() => {
            const event = new CustomEvent('websocket_event', {
                detail: { type: eventType, data: data }
            });
            document.dispatchEvent(event);
        });
    }
    
    /**
     * Optimized heartbeat with smarter intervals
     */
    startOptimizedHeartbeat() {
        // Clear existing timer
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
        }
        
        // Start heartbeat with optimized interval
        this.heartbeatTimer = setInterval(() => {
            if (this.state === 'connected') {
                this.sendRawMessage({
                    type: 'ping',
                    timestamp: Date.now()
                });
            }
        }, 30000); // Reduced to 30 seconds for more responsive connection monitoring
    }
    
    /**
     * Smart reconnection with exponential backoff
     */
    scheduleSmartReconnect() {
        this.connectionAttempts++;
        
        // Exponential backoff with jitter
        const baseDelay = this.reconnectDelay;
        const exponentialDelay = baseDelay * Math.pow(1.5, this.connectionAttempts - 1);
        const jitter = Math.random() * 1000; // Add up to 1 second jitter
        const delay = Math.min(exponentialDelay + jitter, 10000); // Max 10 seconds
        
        console.log(`Scheduling reconnect attempt ${this.connectionAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            if (this.state !== 'connected') {
                this.connectParallel().catch(error => {
                    console.error('Smart reconnection failed:', error);
                });
            }
        }, delay);
    }
    
    /**
     * Optimized cleanup
     */
    cleanup() {
        // Clear timers
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        // Close socket properly
        if (this.socket) {
            // Remove event listeners to prevent memory leaks
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            
            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.close(1000, 'Normal closure');
            }
            
            this.socket = null;
        }
        
        // Reset state
        this.isAuthenticated = false;
        this.sessionId = null;
        this.lastHeartbeat = 0;
    }
    
    /**
     * Optimized message ID generation
     */
    generateMessageId() {
        // Use performance.now() for better precision
        const timestamp = Math.floor(performance.now() * 1000);
        const random = Math.random().toString(36).substr(2, 9);
        return `msg_${timestamp}_${random}`;
    }
    
    /**
     * Get connection statistics
     */
    getConnectionStats() {
        return {
            state: this.state,
            connectionAttempts: this.connectionAttempts,
            pendingMessages: this.pendingMessages.size,
            queuedMessages: this.messageQueue.length,
            lastHeartbeat: this.lastHeartbeat,
            uptime: this.sessionId ? Date.now() - this.lastHeartbeat : 0,
            isConnecting: this.isConnecting
        };
    }
}

// Global instance
window.ProductionWebSocketManager = new ProductionWebSocketManager();