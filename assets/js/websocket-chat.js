/**
 * Enhanced WebSocket-based Chat Service for AAAI Solutions
 * Uses configuration system for environment-aware connection
 * Supports cookie-based authentication and persistent connections
 */
const ChatService = {
    /**
     * Initialize the chat service
     * @param {Object} authService - Authentication service instance
     * @param {Object} options - Configuration options
     */
    init(authService, options = {}) {
        // Validate dependencies
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        if (!window.AAAI_CONFIG.ENABLE_WEBSOCKETS) {
            throw new Error('WebSockets are disabled in configuration');
        }
        
        this.authService = authService;
        this.options = Object.assign({
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            heartbeatInterval: 300000, // 5 minutes heartbeat to keep connection alive
            debug: window.AAAI_CONFIG.ENABLE_DEBUG || false,
            connectionTimeout: 10000, // 10 seconds connection timeout
            maxConnectionAge: 604800000 // 7 days in milliseconds
        }, options);
        
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.messageListeners = [];
        this.statusListeners = [];
        this.messageQueue = [];
        this.heartbeatTimer = null;
        this.connectionStartTime = null;
        this.lastActivityTime = null;
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onOpen = this._onOpen.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        window.AAAI_LOGGER.info('ChatService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
            debug: this.options.debug
        });
        
        // Return this for chaining
        return this;
    },
    
    /**
     * Connect to the WebSocket server with cookie-based authentication
     * @returns {Promise<boolean>} - Connection result
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (!this.authService.isAuthenticated()) {
                window.AAAI_LOGGER.error('Authentication required for WebSocket connection');
                reject(new Error('Authentication required'));
                return;
            }
            
            if (this.isConnected) {
                window.AAAI_LOGGER.debug('Already connected to WebSocket');
                resolve(true);
                return;
            }
            
            try {
                const user = this.authService.getCurrentUser();
                let wsUrl = null;
                
                // Try to get the cached connection ID
                const connectionId = this._getCookie('websocket_id');
                if (connectionId) {
                    window.AAAI_LOGGER.info(`Found cached WebSocket connection ID: ${connectionId}`);
                    // If we have a cached connection, we don't need to pass the token in URL
                    wsUrl = this._buildWebSocketUrl(user.id, null, connectionId);
                } else {
                    // No cached connection, use token authentication
                    wsUrl = this._buildWebSocketUrl(user.id);
                }
                
                window.AAAI_LOGGER.info(`Connecting to WebSocket: ${this._maskSensitiveUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // Set up event listeners
                this.socket.addEventListener('open', (event) => {
                    this._onOpen(event);
                    resolve(true);
                });
                
                this.socket.addEventListener('message', this._onMessage);
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    reject(new Error('WebSocket connection error'));
                });
                
                // Connection timeout
                setTimeout(() => {
                    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                        window.AAAI_LOGGER.error('WebSocket connection timeout');
                        this.socket.close();
                        reject(new Error('Connection timeout'));
                    }
                }, this.options.connectionTimeout);
                
            } catch (error) {
                window.AAAI_LOGGER.error('Connection error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Build WebSocket URL with appropriate authentication
     * @private
     */
    _buildWebSocketUrl(userId, token = null, connectionId = null) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const baseUrl = `${wsProtocol}//${window.location.host}/ws/${userId}`;
        
        // If we have a connection ID but no token, we'll rely on cookies
        if (connectionId && !token) {
            return baseUrl;
        }
        
        // If we don't have a token, get it from the auth service
        if (!token) {
            token = this.authService.getToken();
        }
        
        return `${baseUrl}?token=${token}`;
    },
    
    /**
     * Mask sensitive information in URLs for logging
     * @private
     */
    _maskSensitiveUrl(url) {
        return url.replace(/token=[^&]*/, 'token=***');
    },
    
    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.socket) {
            window.AAAI_LOGGER.info('Disconnecting from WebSocket');
            
            // Clear heartbeat
            this._clearHeartbeat();
            
            // Close socket
            this.socket.close(1000, 'Client disconnected');
            this.socket = null;
            this.isConnected = false;
            this._notifyStatusChange('disconnected');
            
            // Clear connection cookie
            this._deleteCookie('websocket_id');
        }
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
                window.AAAI_LOGGER.warn('Not connected, queueing message and attempting reconnect');
                this.connect()
                    .then(() => {
                        window.AAAI_LOGGER.info('Connected and will send queued message');
                        resolve(true);
                    })
                    .catch(err => {
                        window.AAAI_LOGGER.error('Failed to connect:', err);
                        reject(new Error('Not connected'));
                    });
                return;
            }
            
            try {
                const payload = {
                    message: message.trim(),
                    timestamp: new Date().toISOString()
                };
                
                this.socket.send(JSON.stringify(payload));
                window.AAAI_LOGGER.debug('Message sent:', message);
                
                // Update last activity time
                this.lastActivityTime = Date.now();
                
                resolve(true);
                
            } catch (error) {
                window.AAAI_LOGGER.error('Send error:', error);
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
        this.connectionStartTime = Date.now();
        this.lastActivityTime = Date.now();
        
        // Notify status listeners
        this._notifyStatusChange('connected');
        
        // Send queued messages
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message)
                .catch(err => window.AAAI_LOGGER.error('Failed to send queued message:', err));
        }
        
        // Start heartbeat
        this._startHeartbeat();
    },
    
    /**
     * Handle WebSocket message event
     * @private
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            window.AAAI_LOGGER.debug('Received WebSocket message:', data.type || 'unknown type');
            
            // Update last activity time
            this.lastActivityTime = Date.now();
            
            // Handle connection established message with connection ID
            if (data.type === 'connection_established' && data.connection_id) {
                this._setCookie('websocket_id', data.connection_id, 7); // Store for 7 days
                window.AAAI_LOGGER.info('WebSocket connection ID stored in cookie:', data.connection_id);
            }
            
            // Handle ping messages for keeping connection alive
            if (data.type === 'ping') {
                this._sendPong();
                return; // Don't forward ping messages to listeners
            }
            
            // Notify listeners
            this._notifyMessageListeners(data);
            
        } catch (error) {
            window.AAAI_LOGGER.error('Error processing WebSocket message:', error);
        }
    },
    
    /**
     * Handle WebSocket close event
     * @private
     */
    _onClose(event) {
        this.isConnected = false;
        
        // Clear heartbeat
        this._clearHeartbeat();
        
        window.AAAI_LOGGER.warn('WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        // Notify status listeners
        this._notifyStatusChange('disconnected');
        
        // Clear connection cookie if it was a normal closure
        if (event.code === 1000 || event.code === 1001) {
            this._deleteCookie('websocket_id');
        }
        
        // Try to reconnect if not a normal closure and still authenticated
        if (event.code !== 1000 && event.code !== 1001 && this.authService.isAuthenticated()) {
            this._tryReconnect();
        }
    },
    
    /**
     * Handle WebSocket error event
     * @private
     */
    _onError(event) {
        window.AAAI_LOGGER.error('WebSocket error:', event);
        
        // Update last activity time
        this.lastActivityTime = Date.now();
        
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
            this._notifyStatusChange('disconnected');
            // Clear the connection cookie after max attempts
            this._deleteCookie('websocket_id');
            return;
        }
        
        this.reconnectAttempts++;
        window.AAAI_LOGGER.info(`Attempting reconnect ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${this.options.reconnectInterval}ms`);
        
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
     * Send heartbeat to keep connection alive
     * @private
     */
    _sendHeartbeat() {
        if (!this.isConnected || !this.socket) {
            this._clearHeartbeat();
            return;
        }
        
        const now = Date.now();
        
        // Check if connection is too old (7 days)
        if (this.connectionStartTime && (now - this.connectionStartTime > this.options.maxConnectionAge)) {
            window.AAAI_LOGGER.info('Connection reached maximum age, reconnecting...');
            this.disconnect();
            setTimeout(() => this.connect(), 1000);
            return;
        }
        
        // Check if there's been activity recently (within heartbeat interval)
        if (this.lastActivityTime && (now - this.lastActivityTime < this.options.heartbeatInterval)) {
            // No need to send heartbeat if there was recent activity
            this._scheduleNextHeartbeat();
            return;
        }
        
        // Send heartbeat message
        try {
            const heartbeat = {
                type: 'heartbeat',
                timestamp: new Date().toISOString()
            };
            
            this.socket.send(JSON.stringify(heartbeat));
            this.lastActivityTime = now;
            
            window.AAAI_LOGGER.debug('Sent heartbeat');
            this._scheduleNextHeartbeat();
            
        } catch (error) {
            window.AAAI_LOGGER.error('Error sending heartbeat:', error);
            this._clearHeartbeat();
            
            // Try to reconnect if socket error
            if (this.socket.readyState !== WebSocket.OPEN) {
                this._tryReconnect();
            }
        }
    },
    
    /**
     * Send pong response to server ping
     * @private
     */
    _sendPong() {
        if (!this.isConnected || !this.socket) {
            return;
        }
        
        try {
            const pong = {
                type: 'pong',
                timestamp: new Date().toISOString()
            };
            
            this.socket.send(JSON.stringify(pong));
            window.AAAI_LOGGER.debug('Sent pong response');
            
        } catch (error) {
            window.AAAI_LOGGER.error('Error sending pong:', error);
        }
    },
    
    /**
     * Schedule next heartbeat
     * @private
     */
    _scheduleNextHeartbeat() {
        this._clearHeartbeat();
        this.heartbeatTimer = setTimeout(this._sendHeartbeat, this.options.heartbeatInterval);
    },
    
    /**
     * Clear heartbeat timer
     * @private
     */
    _clearHeartbeat() {
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    /**
     * Start heartbeat mechanism
     * @private
     */
    _startHeartbeat() {
        this._clearHeartbeat();
        this.heartbeatTimer = setTimeout(this._sendHeartbeat, this.options.heartbeatInterval);
        window.AAAI_LOGGER.debug('Started heartbeat mechanism');
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
    },
    
    /**
     * Get connection status
     * @returns {Object} - Connection status information
     */
    getStatus() {
        let connectionAgeMs = 0;
        if (this.connectionStartTime) {
            connectionAgeMs = Date.now() - this.connectionStartTime;
        }
        
        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null,
            url: this.socket ? this._maskSensitiveUrl(this.socket.url) : null,
            connectionAge: {
                ms: connectionAgeMs,
                seconds: Math.floor(connectionAgeMs / 1000),
                minutes: Math.floor(connectionAgeMs / (1000 * 60)),
                hours: Math.floor(connectionAgeMs / (1000 * 60 * 60)),
                days: Math.floor(connectionAgeMs / (1000 * 60 * 60 * 24))
            },
            hasStoredConnection: !!this._getCookie('websocket_id')
        };
    },
    
    /**
     * Cookie utilities for connection persistence
     * @private
     */
    _setCookie(name, value, days = 7) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        const secureFlag = window.location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax${secureFlag}`;
    },
    
    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return decodeURIComponent(parts.pop().split(';').shift());
        }
        return null;
    },
    
    _deleteCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    },
    
    /**
     * Test connection with debug endpoint
     * @returns {Promise<boolean>} - Test result
     */
    async testConnection() {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            const user = this.authService.getCurrentUser();
            const testWsUrl = this._buildWebSocketUrl(user.id).replace('/ws/', '/ws/debug/');
            
            window.AAAI_LOGGER.info(`Testing WebSocket connection: ${this._maskSensitiveUrl(testWsUrl)}`);
            
            return new Promise((resolve, reject) => {
                const testSocket = new WebSocket(testWsUrl);
                
                testSocket.onopen = (event) => {
                    window.AAAI_LOGGER.info('✅ Test WebSocket connected');
                    testSocket.close();
                    resolve(true);
                };
                
                testSocket.onerror = (event) => {
                    window.AAAI_LOGGER.error('❌ Test WebSocket failed');
                    reject(new Error('Test connection failed'));
                };
                
                // Timeout for test
                setTimeout(() => {
                    if (testSocket.readyState === WebSocket.CONNECTING) {
                        testSocket.close();
                        reject(new Error('Test connection timeout'));
                    }
                }, 5000);
            });
        } catch (error) {
            window.AAAI_LOGGER.error('Test connection error:', error);
            throw error;
        }
    }
};