/**
 * WebSocket-based Chat Service for AAAI Solutions - Environment-aware Configuration
 * Provides real-time messaging capabilities with configuration-based URL management
 */
const ChatService = {
    /**
     * Initialize the chat service
     * @param {Object} authService - Authentication service instance
     * @param {Object} options - Configuration options (will be merged with global config)
     */
    init(authService, options = {}) {
        // Ensure configuration is loaded
        if (!window.AAAI_CONFIG) {
            throw new Error('Configuration not loaded. Please include config.js before websocket-chat.js');
        }
        
        this.authService = authService;
        
        // Merge options with global configuration
        this.options = Object.assign({
            reconnectInterval: window.AAAI_CONFIG.WS_RECONNECT_INTERVAL || 3000,
            maxReconnectAttempts: window.AAAI_CONFIG.WS_MAX_RECONNECT_ATTEMPTS || 5,
            heartbeatInterval: window.AAAI_CONFIG.WS_HEARTBEAT_INTERVAL || 30000,
            timeout: window.AAAI_CONFIG.WS_TIMEOUT || 5000,
            debug: window.AAAI_CONFIG.ENABLE_DEBUG || false
        }, options);
        
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.messageListeners = [];
        this.statusListeners = [];
        this.messageQueue = [];
        this.heartbeatTimer = null;
        this.connectionTimeout = null;
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onOpen = this._onOpen.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        window.AAAI_LOGGER.info('ChatService initialized with configuration:', {
            wsUrl: this._getWebSocketURL(),
            options: this.options
        });
        
        // Return this for chaining
        return this;
    },
    
    /**
     * Get WebSocket URL with proper protocol and endpoint
     * @private
     */
    _getWebSocketURL() {
        const baseUrl = window.AAAI_CONFIG.WS_BASE_URL;
        
        // Ensure the URL uses the correct WebSocket protocol
        let wsUrl = baseUrl;
        if (baseUrl.startsWith('https://')) {
            wsUrl = baseUrl.replace('https://', 'wss://');
        } else if (baseUrl.startsWith('http://')) {
            wsUrl = baseUrl.replace('http://', 'ws://');
        }
        
        return wsUrl;
    },
    
    /**
     * Connect to the WebSocket server
     * @returns {Promise<boolean>} - Connection result
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (!this.authService.isAuthenticated()) {
                const error = new Error('Authentication required');
                window.AAAI_LOGGER.error('WebSocket connection failed:', error.message);
                reject(error);
                return;
            }
            
            if (this.isConnected) {
                window.AAAI_LOGGER.debug('Already connected to WebSocket');
                resolve(true);
                return;
            }
            
            // Clear any existing connection timeout
            if (this.connectionTimeout) {
                clearTimeout(this.connectionTimeout);
            }
            
            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                const error = new Error('WebSocket connection timeout');
                window.AAAI_LOGGER.error(error.message);
                reject(error);
                
                if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                    this.socket.close();
                }
            }, this.options.timeout);
            
            try {
                const user = this.authService.getCurrentUser();
                const token = this.authService.token;
                
                // Construct WebSocket URL with authentication
                const wsBaseUrl = this._getWebSocketURL();
                const wsUrl = `${wsBaseUrl}/ws/${user.id}?token=${encodeURIComponent(token)}`;
                
                window.AAAI_LOGGER.debug('Connecting to WebSocket:', {
                    url: wsBaseUrl, // Log base URL without token
                    userId: user.id
                });
                
                this.socket = new WebSocket(wsUrl);
                
                // Set up event listeners
                this.socket.addEventListener('open', (event) => {
                    clearTimeout(this.connectionTimeout);
                    this._onOpen(event);
                    resolve(true);
                });
                
                this.socket.addEventListener('message', this._onMessage);
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    clearTimeout(this.connectionTimeout);
                    this._onError(event);
                    reject(new Error('WebSocket connection error'));
                });
                
            } catch (error) {
                clearTimeout(this.connectionTimeout);
                window.AAAI_LOGGER.error('Error creating WebSocket connection:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        // Clear timers
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnected');
            this.socket = null;
        }
        
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this._notifyStatusChange('disconnected');
        
        window.AAAI_LOGGER.info('WebSocket disconnected');
    },
    
    /**
     * Send a message through the WebSocket
     * @param {string} message - Message to send
     * @returns {Promise<boolean>} - Send result
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!message || message.trim() === '') {
                reject(new Error('Message cannot be empty'));
                return;
            }
            
            if (!this.isConnected) {
                // Queue message and try to reconnect
                this.messageQueue.push(message);
                
                if (window.AAAI_CONFIG.ENABLE_WEBSOCKETS) {
                    this.connect()
                        .then(() => window.AAAI_LOGGER.debug('Connected and queued message'))
                        .catch(err => {
                            window.AAAI_LOGGER.error('Failed to connect for queued message:', err);
                            reject(new Error('Not connected and unable to reconnect'));
                        });
                } else {
                    reject(new Error('WebSockets are disabled'));
                }
                return;
            }
            
            try {
                const payload = {
                    message,
                    timestamp: new Date().toISOString(),
                    client_id: this._generateClientId()
                };
                
                this.socket.send(JSON.stringify(payload));
                window.AAAI_LOGGER.debug('Message sent:', { messageId: payload.client_id });
                resolve(true);
                
            } catch (error) {
                window.AAAI_LOGGER.error('Error sending message:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Add a message listener
     * @param {Function} callback - Message callback function
     */
    onMessage(callback) {
        if (typeof callback === 'function') {
            this.messageListeners.push(callback);
        }
    },
    
    /**
     * Add a status listener
     * @param {Function} callback - Status callback function
     */
    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.push(callback);
        }
    },
    
    /**
     * Handle WebSocket open event
     * @private
     */
    _onOpen(event) {
        window.AAAI_LOGGER.info('WebSocket connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Start heartbeat
        this._startHeartbeat();
        
        // Notify status listeners
        this._notifyStatusChange('connected');
        
        // Send queued messages
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message)
                .catch(err => window.AAAI_LOGGER.error('Failed to send queued message:', err));
        }
    },
    
    /**
     * Handle WebSocket message event
     * @private
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat pong
            if (data.type === 'pong') {
                window.AAAI_LOGGER.debug('Received heartbeat pong');
                return;
            }
            
            window.AAAI_LOGGER.debug('Received message:', data);
            
            // Notify listeners
            this._notifyMessageListeners(data);
            
        } catch (error) {
            window.AAAI_LOGGER.error('Error processing message:', error);
        }
    },
    
    /**
     * Handle WebSocket close event
     * @private
     */
    _onClose(event) {
        this.isConnected = false;
        
        // Stop heartbeat
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        
        window.AAAI_LOGGER.warn('WebSocket disconnected', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        // Notify status listeners
        this._notifyStatusChange('disconnected');
        
        // Try to reconnect if not a normal closure and WebSockets are enabled
        if (event.code !== 1000 && event.code !== 1001 && window.AAAI_CONFIG.ENABLE_WEBSOCKETS) {
            this._tryReconnect();
        }
    },
    
    /**
     * Handle WebSocket error event
     * @private
     */
    _onError(event) {
        window.AAAI_LOGGER.error('WebSocket error:', event);
        
        // Notify status listeners
        this._notifyStatusChange('error');
    },
    
    /**
     * Try to reconnect to the WebSocket server
     * @private
     */
    _tryReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            window.AAAI_LOGGER.error('Max reconnect attempts reached');
            this._notifyStatusChange('failed');
            return;
        }
        
        this.reconnectAttempts++;
        window.AAAI_LOGGER.info(`Reconnecting (${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${this.options.reconnectInterval}ms`);
        
        // Notify status listeners
        this._notifyStatusChange('reconnecting');
        
        setTimeout(() => {
            if (!this.isConnected && this.authService.isAuthenticated()) {
                this.connect()
                    .then(() => window.AAAI_LOGGER.info('Reconnected successfully'))
                    .catch(err => {
                        window.AAAI_LOGGER.error('Reconnect failed:', err);
                        this._tryReconnect();
                    });
            }
        }, this.options.reconnectInterval);
    },
    
    /**
     * Start heartbeat to keep connection alive
     * @private
     */
    _startHeartbeat() {
        if (this.heartbeatTimer || !this.options.heartbeatInterval) {
            return;
        }
        
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.socket.readyState === WebSocket.OPEN) {
                this._sendHeartbeat();
            }
        }, this.options.heartbeatInterval);
    },
    
    /**
     * Send heartbeat ping
     * @private
     */
    _sendHeartbeat() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify({ type: 'ping', timestamp: new Date().toISOString() }));
                window.AAAI_LOGGER.debug('Sent heartbeat ping');
            } catch (error) {
                window.AAAI_LOGGER.error('Error sending heartbeat:', error);
            }
        }
    },
    
    /**
     * Generate unique client ID for message tracking
     * @private
     */
    _generateClientId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Notify message listeners
     * @private
     */
    _notifyMessageListeners(data) {
        this.messageListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                window.AAAI_LOGGER.error('Error in message listener:', error);
            }
        });
    },
    
    /**
     * Notify status listeners
     * @private
     */
    _notifyStatusChange(status) {
        this.statusListeners.forEach(callback => {
            try {
                callback(status);
            } catch (error) {
                window.AAAI_LOGGER.error('Error in status listener:', error);
            }
        });
    }
};

// Export the ChatService
typeof module !== 'undefined' && (module.exports = ChatService);