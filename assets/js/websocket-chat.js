/**
 * Simplified WebSocket Chat Service for AAAI Solutions
 * Clean integration with AuthService, simplified reconnection logic
 */
const ChatService = {
    // Core state
    socket: null,
    isConnected: false,
    isConnecting: false,
    authService: null,
    
    // Connection management
    reconnectAttempts: 0,
    reconnectTimer: null,
    heartbeatTimer: null,
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    
    // Configuration
    options: {
        reconnectInterval: 5000,
        maxReconnectAttempts: 5,
        heartbeatInterval: 30000,
        connectionTimeout: 10000,
        messageQueueLimit: 20,
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
        
        // Bind methods
        this._onOpen = this._onOpen.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('ChatService initialized');
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
     * Connect to WebSocket
     */
    async connect() {
        if (!this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        if (this.isConnected) {
            this._log('Already connected');
            return true;
        }
        
        if (this.isConnecting) {
            this._log('Connection already in progress');
            return new Promise((resolve, reject) => {
                const checkConnection = () => {
                    if (this.isConnected) {
                        resolve(true);
                    } else if (!this.isConnecting) {
                        reject(new Error('Connection failed'));
                    } else {
                        setTimeout(checkConnection, 100);
                    }
                };
                setTimeout(checkConnection, 100);
            });
        }
        
        return new Promise((resolve, reject) => {
            this.isConnecting = true;
            this._notifyStatusChange('connecting');
            
            try {
                const wsUrl = this.authService.getWebSocketURL();
                this._log(`Connecting to: ${this._maskUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                this.socket.addEventListener('open', (event) => {
                    this._onOpen(event);
                    resolve(true);
                });
                this.socket.addEventListener('message', this._onMessage);
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection failed'));
                    }
                });
                
                // Connection timeout
                setTimeout(() => {
                    if (this.isConnecting) {
                        this._error('Connection timeout');
                        this.socket?.close();
                        this.isConnecting = false;
                        reject(new Error('Connection timeout'));
                    }
                }, this.options.connectionTimeout);
                
            } catch (error) {
                this.isConnecting = false;
                this._error('Connection error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Handle WebSocket open
     */
    _onOpen(event) {
        this._log('WebSocket connected');
        
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._notifyStatusChange('connected');
        
        // Start heartbeat
        this._startHeartbeat();
        
        // Process queued messages
        this._processQueuedMessages();
    },
    
    /**
     * Handle WebSocket message
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this._log('Received message:', data.type);
            
            // Handle heartbeat
            if (data.type === 'ping') {
                this._sendMessage({ type: 'pong' }, false);
                return;
            }
            
            if (data.type === 'pong') {
                return; // Heartbeat acknowledged
            }
            
            // Notify listeners
            this._notifyMessageListeners(data);
            
        } catch (error) {
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * Handle WebSocket close
     */
    _onClose(event) {
        this._log('WebSocket closed', { code: event.code, reason: event.reason });
        
        this.isConnected = false;
        this.isConnecting = false;
        
        this._stopHeartbeat();
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
        this._error('WebSocket error:', event);
        this._notifyStatusChange('error');
        this._notifyErrorListeners({ error: 'WebSocket error', event });
    },
    
    /**
     * Determine if we should attempt reconnection
     */
    _shouldReconnect(code) {
        // Don't reconnect for these codes
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
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
            30000 // Max 30 seconds
        );
        
        this._log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isConnected && this.authService.isAuthenticated()) {
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
                if (this.isConnected) {
                    this._sendHeartbeat();
                }
            }, this.options.heartbeatInterval);
            
            this._log('Heartbeat started');
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
            this._sendMessage({ 
                type: 'ping', 
                timestamp: new Date().toISOString() 
            }, false);
            
            this._log('Heartbeat sent');
            
        } catch (error) {
            this._error('Heartbeat failed:', error);
        }
    },
    
    /**
     * Send message through WebSocket
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
        
        if (this.isConnected) {
            try {
                this._sendMessage(messageData, true);
                return messageData.id;
            } catch (error) {
                this._error('Send error:', error);
                throw error;
            }
        } else {
            // Queue message and try to connect
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
     * Internal message sending
     */
    _sendMessage(messageData, allowQueue = true) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            if (allowQueue) {
                this._queueMessage(messageData);
            }
            return;
        }
        
        try {
            this.socket.send(JSON.stringify(messageData));
            this._log('Message sent:', messageData.type);
        } catch (error) {
            if (allowQueue) {
                this._queueMessage(messageData);
            }
            throw error;
        }
    },
    
    /**
     * Queue message for later sending
     */
    _queueMessage(messageData) {
        if (this.messageQueue.length >= this.options.messageQueueLimit) {
            this.messageQueue.shift(); // Remove oldest
        }
        
        this.messageQueue.push({
            ...messageData,
            queued_at: Date.now()
        });
        
        this._log(`Message queued (${this.messageQueue.length}/${this.options.messageQueueLimit})`);
    },
    
    /**
     * Process all queued messages
     */
    _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        let sent = 0;
        messages.forEach(messageData => {
            try {
                this._sendMessage(messageData, false);
                sent++;
            } catch (error) {
                this._error('Failed to send queued message:', error);
                this._queueMessage(messageData);
            }
        });
        
        this._log(`Processed queued messages: ${sent} sent`);
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
        this._log('Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this.isConnected = false;
        this.isConnecting = false;
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
        
        this._stopHeartbeat();
    },
    
    /**
     * Add message listener
     */
    onMessage(callback) {
        if (typeof callback === 'function') {
            this.messageListeners.push(callback);
        }
    },
    
    /**
     * Add status change listener
     */
    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.push(callback);
        }
    },
    
    /**
     * Add error listener  
     */
    onError(callback) {
        if (typeof callback === 'function') {
            this.errorListeners.push(callback);
        }
    },
    
    /**
     * Remove listener
     */
    removeListener(type, callback) {
        const listeners = {
            'message': this.messageListeners,
            'status': this.statusListeners,
            'error': this.errorListeners
        };
        
        const array = listeners[type];
        if (array) {
            const index = array.indexOf(callback);
            if (index > -1) array.splice(index, 1);
        }
    },
    
    /**
     * Notify message listeners
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
    
    /**
     * Notify status listeners
     */
    _notifyStatusChange(status) {
        this.statusListeners.forEach(callback => {
            try {
                callback(status);
            } catch (error) {
                this._error('Error in status listener:', error);
            }
        });
    },
    
    /**
     * Notify error listeners
     */
    _notifyErrorListeners(data) {
        this.errorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in error listener:', error);
            }
        });
    },
    
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null
        };
    },
    
    /**
     * Mask sensitive URL for logging
     */
    _maskUrl(url) {
        return url.replace(/token=[^&]*/, 'token=***');
    },
    
    /**
     * Logging methods
     */
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