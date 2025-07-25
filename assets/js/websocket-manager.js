/**
 * Production WebSocket Manager for AAAI Solutions
 * Robust, reliable, and self-healing WebSocket implementation
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
        
        // Connection management
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 5;
        this.reconnectDelay = 2000;
        this.heartbeatInterval = null;
        this.heartbeatTimer = null;
        
        // State management
        this.isAuthenticated = false;
        this.authService = null;
        this.currentReelId = null;
        this.currentReelName = null;
        
        // Bind methods to maintain context
        this.handleOpen = this.handleOpen.bind(this);
        this.handleMessage = this.handleMessage.bind(this);
        this.handleClose = this.handleClose.bind(this);
        this.handleError = this.handleError.bind(this);
    }
    
    /**
     * Initialize with authentication service
     */
    initialize(authService) {
        if (!authService) {
            throw new Error('AuthService is required');
        }
        
        console.log('[WebSocket] Initializing with AuthService:', {
            authServiceExists: !!authService,
            isAuthenticated: authService.isAuthenticated ? authService.isAuthenticated() : 'unknown',
            hasGetToken: typeof authService.getToken === 'function',
            hasGetCurrentUser: typeof authService.getCurrentUser === 'function'
        });
        
        this.authService = authService;
        this.setState('initialized');
        
        // Register default message handlers
        this.registerHandler('session_established', this.handleSessionEstablished.bind(this));
        this.registerHandler('message_queued', this.handleMessageQueued.bind(this));
        this.registerHandler('chat_response', this.handleChatResponse.bind(this));
        this.registerHandler('chat_error', this.handleChatError.bind(this));
        this.registerHandler('ping', this.handlePing.bind(this));
        this.registerHandler('pong', this.handlePong.bind(this));
        
        console.log('[WebSocket] Initialization complete');
        
        return this;
    }
    
    /**
     * MINIMAL CHANGE: Simplified connect with proper token handling
     */
    async connect() {
        if (this.state === 'connecting' || this.state === 'connected') {
            return this.state === 'connected';
        }
        
        // Simple authentication check
        if (!this.authService?.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        this.setState('connecting');
        
        try {
            const user = this.authService.getCurrentUser();
            this.userId = user.id;
            
            // MINIMAL CHANGE: Ensure we have a valid token before connecting
            const token = await this.authService.getToken();
            if (!token) {
                throw new Error('No valid access token available');
            }
            
            const wsUrl = this.buildWebSocketURL(user, token);
            this.socket = new WebSocket(wsUrl);
            
            // Set up event handlers
            this.socket.onopen = this.handleOpen;
            this.socket.onmessage = this.handleMessage;
            this.socket.onclose = this.handleClose;
            this.socket.onerror = this.handleError;
            
            // Wait for connection
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    this.cleanup();
                    reject(new Error('Connection timeout'));
                }, 10000);
                
                this.socket.addEventListener('open', () => {
                    clearTimeout(timeout);
                    resolve(true);
                }, { once: true });
                
                this.socket.addEventListener('error', () => {
                    clearTimeout(timeout);
                    reject(new Error('Connection failed'));
                }, { once: true });
            });
            
        } catch (error) {
            this.setState('disconnected');
            throw error;
        }
    }
    
    /**
     * Send message through WebSocket with reel context and saved message reference
     */
    async sendMessage(text, context = {}) {
        if (this.state !== 'connected') {
            throw new Error('WebSocket not connected');
        }

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
                saved_message_id: context.saved_message_id || null,  // Reference to already saved message
                ...context
            }
        };

        this.pendingMessages.set(messageId, {
            text: text.trim(),
            timestamp: Date.now(),
            status: 'sending',
            reel_id: context.reel_id,
            saved_message_id: context.saved_message_id
        });

        this.sendRawMessage(message);
        return messageId;
    }

    /**
     * Set project context
     */
    setProjectContext(projectId, projectName) {
        this.projectId = projectId;
        this.projectName = projectName;
        
        if (this.state === 'connected') {
            this.sendRawMessage({
                type: 'context_update',
                context: {
                    chat_id: projectId,
                    project_name: projectName,
                    user_id: this.userId
                },
                timestamp: new Date().toISOString()
            });
        }
    }

    setReelContext(reelId, reelName) {
        // Update local state
        this.currentReelId = reelId;
        this.currentReelName = reelName;
        
        // Send context update if connected
        if (this.state === 'connected') {
            this.sendRawMessage({
                type: 'context_update',
                context: {
                    user_id: this.userId,
                    chat_id: this.projectId,
                    project_name: this.projectName,
                    reel_id: reelId,
                    reel_name: reelName
                },
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('🎯 Reel context updated:', { reelId, reelName });
    }

    setCompleteContext(projectId, projectName, reelId = null, reelName = null) {
        this.projectId = projectId;
        this.projectName = projectName;
        this.currentReelId = reelId;
        this.currentReelName = reelName;
        
        if (this.state === 'connected') {
            this.sendRawMessage({
                type: 'context_update',
                context: {
                    user_id: this.userId,
                    chat_id: projectId,
                    project_name: projectName,
                    reel_id: reelId,
                    reel_name: reelName
                },
                timestamp: new Date().toISOString()
            });
        }
        
        console.log('🎯 Complete context updated:', { projectId, projectName, reelId, reelName });
    }
    
    /**
     * Register message handler
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
     * Disconnect WebSocket
     */
    disconnect() {
        this.cleanup();
        this.setState('disconnected');
    }
    
    /**
     * Get current state
     */
    getState() {
        return {
            state: this.state,
            sessionId: this.sessionId,
            userId: this.userId,
            projectId: this.projectId,
            projectName: this.projectName,
            pendingMessages: this.pendingMessages.size,
            isAuthenticated: this.isAuthenticated
        };
    }
    
    // Private methods
    
    handleOpen() {
        this.setState('connected');
        this.isAuthenticated = true;
        this.connectionAttempts = 0;
        this.startHeartbeat();
    }
    
    handleMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this.processMessage(data);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }
    
    handleClose(event) {
        this.setState('disconnected');
        this.cleanup();
        
        // Auto-reconnect for abnormal closures
        if (event.code !== 1000 && this.connectionAttempts < this.maxConnectionAttempts) {
            this.scheduleReconnect();
        }
    }
    
    handleError(error) {
        console.error('WebSocket error:', error);
    }
    
    processMessage(data) {
        const messageType = data.type;
        
        if (this.messageHandlers.has(messageType)) {
            const handlers = this.messageHandlers.get(messageType);
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Handler error for ${messageType}:`, error);
                }
            });
        }
    }
    
    handleSessionEstablished(data) {
        this.sessionId = data.session_id;
        
        // Set project context if available
        if (this.projectId && this.projectName) {
            this.setProjectContext(this.projectId, this.projectName);
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
        
        // Extract response text
        let responseText = data.text;
        if (!responseText && data.response) {
            if (typeof data.response === 'string') {
                responseText = data.response;
            } else if (data.response.text) {
                responseText = data.response.text;
            }
        }
        
        if (responseText) {
            this.notifyUI('chat_response', {
                messageId: messageId,
                text: responseText,
                timestamp: data.timestamp || Date.now(),
                components: data.components || []
            });
        }
    }
    
    handleChatError(data) {
        const messageId = data.message_id;
        this.pendingMessages.delete(messageId);
        
        this.notifyUI('chat_error', {
            messageId: messageId,
            error: data.error,
            timestamp: data.timestamp || Date.now()
        });
    }
    
    handlePing() {
        this.sendRawMessage({
            type: 'pong',
            timestamp: Date.now()
        });
    }
    
    handlePong() {
        // Heartbeat acknowledged
    }
    
    sendRawMessage(message) {
        if (this.state === 'connected' && this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }
    
    /**
     * FIXED: Build WebSocket URL with proper token validation
     */
    buildWebSocketURL(user, token) {
        if (!token || typeof token !== 'string') {
            throw new Error('Invalid token for WebSocket connection');
        }
        
        if (!user?.id || !user?.email) {
            throw new Error('Invalid user data for WebSocket connection');
        }
        
        // Check WebSocket configuration
        const wsHost = window.AAAI_CONFIG?.WEBSOCKET_BASE_URL || 'aaai.solutions';
        console.log('[WebSocket] Using WebSocket host:', wsHost);
        
        if (!wsHost || wsHost.trim() === '') {
            throw new Error('WebSocket host not configured');
        }
        
        // Build parameters with proper validation
        const params = new URLSearchParams();
        params.set('token', token.trim());
        params.set('user_id', user.id);
        params.set('email', user.email);
        params.set('chat_id', this.projectId || '');
        params.set('session_id', user.sessionId || 'production_session');
        params.set('auth_method', 'jwt_production');
        
        const wsUrl = `wss://${wsHost}/ws/${user.id}?${params.toString()}`;
        
        // Validate URL length and format
        if (wsUrl.length > 2000) {
            console.warn('[WebSocket] URL length is very long:', wsUrl.length);
        }
        
        console.log('[WebSocket] Built URL with parameters:', {
            user_id: user.id,
            email: user.email,
            chat_id: this.projectId || '',
            session_id: user.sessionId || 'production_session',
            token_length: token.length,
            wsHost: wsHost,
            total_url_length: wsUrl.length,
            url_preview: wsUrl.substring(0, 100) + '...[TOKEN_HIDDEN]'
        });
        
        return wsUrl;
    }
    
    setState(newState) {
        if (this.state !== newState) {
            this.state = newState;
            this.notifyUI('state_change', { state: newState });
        }
    }
    
    notifyUI(eventType, data) {
        const event = new CustomEvent('websocket_event', {
            detail: { type: eventType, data: data }
        });
        document.dispatchEvent(event);
    }
    
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            this.sendRawMessage({
                type: 'ping',
                timestamp: Date.now()
            });
        }, 45000);
    }
    
    scheduleReconnect() {
        this.connectionAttempts++;
        const delay = this.reconnectDelay * Math.pow(1.5, this.connectionAttempts - 1);
        
        console.log(`[WebSocket] Scheduling reconnect attempt ${this.connectionAttempts}/${this.maxConnectionAttempts} in ${Math.min(delay, 30000)}ms`);
        
        setTimeout(() => {
            if (this.state !== 'connected' && this.connectionAttempts <= this.maxConnectionAttempts) {
                console.log(`[WebSocket] Attempting reconnect ${this.connectionAttempts}/${this.maxConnectionAttempts}`);
                this.connect().catch(error => {
                    console.error(`[WebSocket] Reconnection attempt ${this.connectionAttempts} failed:`, error.message);
                    
                    if (this.connectionAttempts >= this.maxConnectionAttempts) {
                        console.error('[WebSocket] Max reconnection attempts reached, giving up');
                        this.setState('failed');
                    }
                });
            }
        }, Math.min(delay, 30000));
    }
    
    cleanup() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        if (this.socket) {
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onclose = null;
            this.socket.onerror = null;
            
            if (this.socket.readyState === WebSocket.OPEN) {
                this.socket.close(1000, 'Normal closure');
            }
            
            this.socket = null;
        }
        
        this.isAuthenticated = false;
        this.sessionId = null;
    }
    
    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

// Global instance
window.ProductionWebSocketManager = new ProductionWebSocketManager();