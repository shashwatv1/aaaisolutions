/**
 * WebSocket-based Chat Service for AAAI Solutions
 * Provides real-time messaging capabilities
 */
const ChatService = {
    /**
     * Initialize the chat service
     * @param {Object} authService - Authentication service instance
     * @param {Object} options - Configuration options
     */
    init(authService, options = {}) {
        this.authService = authService;
        this.options = Object.assign({
            reconnectInterval: 3000,
            maxReconnectAttempts: 5,
            debug: false
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
                this._debug('Authentication required');
                reject(new Error('Authentication required'));
                return;
            }
            
            if (this.isConnected) {
                this._debug('Already connected');
                resolve(true);
                return;
            }
            
            try {
                const user = this.authService.getCurrentUser();
                const token = this.authService.token;
                
                // Use token in the WebSocket URL for authentication
                const wsUrl = `${this.authService.WS_BASE_URL}/ws/${user.id}?token=${token}`;
                
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
                
            } catch (error) {
                this._debug('Connection error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Disconnect from the WebSocket server
     */
    disconnect() {
        if (this.socket) {
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
                this.connect()
                    .then(() => this._debug('Connected and queued message'))
                    .catch(err => {
                        this._debug('Failed to connect:', err);
                        reject(new Error('Not connected'));
                    });
                return;
            }
            
            try {
                const payload = {
                    message,
                    timestamp: new Date().toISOString()
                };
                
                this.socket.send(JSON.stringify(payload));
                resolve(true);
                
            } catch (error) {
                this._debug('Send error:', error);
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
        this._debug('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Notify status listeners
        this._notifyStatusChange('connected');
        
        // Send queued messages
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.sendMessage(message)
                .catch(err => this._debug('Failed to send queued message:', err));
        }
    },
    
    /**
     * Handle WebSocket message event
     * @private
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this._debug('Received message:', data);
            
            // Notify listeners
            this._notifyMessageListeners(data);
            
        } catch (error) {
            this._debug('Error processing message:', error);
        }
    },
    
    /**
     * Handle WebSocket close event
     * @private
     */
    _onClose(event) {
        this.isConnected = false;
        this._debug('WebSocket disconnected, code:', event.code, 'reason:', event.reason);
        
        // Notify status listeners
        this._notifyStatusChange('disconnected');
        
        // Try to reconnect if not a normal closure
        if (event.code !== 1000 && event.code !== 1001) {
            this._tryReconnect();
        }
    },
    
    /**
     * Handle WebSocket error event
     * @private
     */
    _onError(event) {
        this._debug('WebSocket error:', event);
        // Notify status listeners
        this._notifyStatusChange('error');
    },
    
    /**
     * Try to reconnect to the WebSocket server
     * @private
     */
    _tryReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this._debug('Max reconnect attempts reached');
            return;
        }
        
        this.reconnectAttempts++;
        this._debug(`Reconnecting (${this.reconnectAttempts}/${this.options.maxReconnectAttempts}) in ${this.options.reconnectInterval}ms`);
        
        // Notify status listeners
        this._notifyStatusChange('reconnecting');
        
        setTimeout(() => {
            if (!this.isConnected) {
                this.connect()
                    .then(() => this._debug('Reconnected successfully'))
                    .catch(err => {
                        this._debug('Reconnect failed:', err);
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
                this._debug('Error in message listener:', error);
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
                this._debug('Error in status listener:', error);
            }
        });
    },
    
    /**
     * Debug log
     * @private
     */
    _debug(...args) {
        if (this.options.debug) {
            console.log('[ChatService]', ...args);
        }
    }
};