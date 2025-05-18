/**
 * Enhanced WebSocket-based Chat Service for AAAI Solutions
 * Uses configuration system for environment-aware connection
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
            debug: window.AAAI_CONFIG.ENABLE_DEBUG || false
        }, options);
        
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.messageListeners = [];
        this.statusListeners = [];
        this.messageQueue = [];
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onOpen = this._onOpen.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        
        window.AAAI_LOGGER.info('ChatService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
            debug: this.options.debug
        });
        
        // Return this for chaining
        return this;
    },
    
    /**
     * Connect to the WebSocket server
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
                const wsUrl = this.authService.getWebSocketURL(user.id);
                
                window.AAAI_LOGGER.info(`Connecting to WebSocket: ${wsUrl.replace(/token=[^&]*/, 'token=***')}`);
                
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
                    if (this.socket.readyState === WebSocket.CONNECTING) {
                        window.AAAI_LOGGER.error('WebSocket connection timeout');
                        this.socket.close();
                        reject(new Error('Connection timeout'));
                    }
                }, 10000);
                
            } catch (error) {
                window.AAAI_LOGGER.error('Connection error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.socket) {
            window.AAAI_LOGGER.info('Disconnecting from WebSocket');
            this.socket.close(1000, 'Client disconnected');
            this.socket = null;
            this.isConnected = false;
            this._notifyStatusChange('disconnected');
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
            window.AAAI_LOGGER.debug('Received WebSocket message:', data);
            
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
        window.AAAI_LOGGER.warn('WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        // Notify status listeners
        this._notifyStatusChange('disconnected');
        
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
        return {
            connected: this.isConnected,
            reconnectAttempts: this.reconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null,
            url: this.socket ? this.socket.url : null
        };
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
            const testWsUrl = this.authService.getWebSocketURL(user.id).replace('/ws/', '/ws/debug/');
            
            window.AAAI_LOGGER.info(`Testing WebSocket connection: ${testWsUrl.replace(/token=[^&]*/, 'token=***')}`);
            
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