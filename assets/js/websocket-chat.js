/**
 * FIXED WebSocket Chat Service - Simplified and Working
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
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    
    // Configuration
    options: {
        reconnectInterval: 3000,
        maxReconnectAttempts: 3,
        heartbeatInterval: 45000,
        connectionTimeout: 10000,
        debug: false
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
        
        this._log('ChatService initialized');
        return this;
    },
    
    /**
     * Connect to WebSocket
     */
    async connect() {
        if (this.isConnected) {
            this._log('Already connected');
            return true;
        }
        
        if (this.isConnecting) {
            this._log('Connection already in progress');
            return false;
        }
        
        this._log('Starting WebSocket connection...');
        
        // Check authentication
        if (!this.authService.isAuthenticated()) {
            throw new Error('Not authenticated');
        }
        
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('User information not available');
        }
        
        return new Promise((resolve, reject) => {
            this.isConnecting = true;
            this._notifyStatusChange('connecting');
            
            // Build WebSocket URL with auth parameters
            const wsUrl = this._buildWebSocketURL(user);
            this._log('Connecting to:', wsUrl);
            
            // Connection timeout
            const timeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._cleanup();
                    this.isConnecting = false;
                    this._notifyStatusChange('disconnected');
                    reject(new Error('Connection timeout'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // Create WebSocket
                this.socket = new WebSocket(wsUrl);
                
                // Handle open
                this.socket.onopen = () => {
                    this._log('WebSocket opened');
                    this.isConnected = true;
                    clearTimeout(timeout);
                };
                
                // Handle messages
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('Received:', data.type);
                        
                        // Handle connection established
                        if (data.type === 'connection_established') {
                            this._log('Connection established');
                            this.isAuthenticated = true;
                            this.isConnecting = false;
                            this.reconnectAttempts = 0;
                            
                            this._notifyStatusChange('connected');
                            this._startHeartbeat();
                            this._processQueuedMessages();
                            
                            resolve(true);
                            return;
                        }
                        
                        // Handle errors during connection
                        if (data.type === 'error' && this.isConnecting) {
                            this._log('Connection error:', data.message);
                            clearTimeout(timeout);
                            this.isConnecting = false;
                            this._cleanup();
                            reject(new Error(data.message));
                            return;
                        }
                        
                        // Handle other messages
                        this._handleMessage(data);
                        
                    } catch (e) {
                        this._error('Message parse error:', e);
                    }
                };
                
                // Handle close
                this.socket.onclose = (event) => {
                    this._log('WebSocket closed:', event.code, event.reason);
                    
                    if (this.isConnecting) {
                        clearTimeout(timeout);
                        this.isConnecting = false;
                        reject(new Error(`Connection closed: ${event.reason}`));
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
                        reject(new Error('WebSocket error'));
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
            email: user.email,
            user_id: user.id,
            session_id: user.sessionId || 'web_session',
            t: Date.now() // Cache buster
        });
        
        return `${wsProtocol}//${wsHost}/ws/${user.id}?${params}`;
    },
    
    /**
     * Handle incoming messages
     */
    _handleMessage(data) {
        // Handle heartbeat
        if (data.type === 'heartbeat' || data.type === 'ping') {
            this._sendPong();
            return;
        }
        
        if (data.type === 'pong') {
            return;
        }
        
        // Notify listeners
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle connection close
     */
    _handleClose(event) {
        this._cleanup();
        this._notifyStatusChange('disconnected');
        
        // Auto-reconnect logic
        const shouldReconnect = event.code !== 1000 && 
                              event.code !== 1001 && 
                              this.reconnectAttempts < this.options.maxReconnectAttempts &&
                              this.authService.isAuthenticated();
        
        if (shouldReconnect) {
            this._scheduleReconnect();
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
            this.socket.send(JSON.stringify(message));
            return message.id;
        } else {
            // Queue message
            this._queueMessage(message);
            
            // Try to connect
            if (!this.isConnecting) {
                try {
                    await this.connect();
                } catch (e) {
                    throw new Error('Not connected');
                }
            }
            
            return message.id;
        }
    },
    
    /**
     * Disconnect
     */
    disconnect() {
        this._log('Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this.isConnected = false;
        this.isAuthenticated = false;
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
            reconnectAttempts: this.reconnectAttempts
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
    _startHeartbeat() {
        this._stopHeartbeat();
        
        this.heartbeatTimer = setInterval(() => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({ type: 'ping' }));
            }
        }, this.options.heartbeatInterval);
    },
    
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    _sendPong() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'pong' }));
        }
    },
    
    _scheduleReconnect() {
        this.reconnectAttempts++;
        const delay = this.options.reconnectInterval * this.reconnectAttempts;
        
        this._log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(() => {
            this.connect().catch(e => {
                this._error('Reconnect failed:', e);
                if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
                    this._scheduleReconnect();
                }
            });
        }, delay);
    },
    
    _queueMessage(message) {
        this.messageQueue.push(message);
        this._log('Message queued');
    },
    
    _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        messages.forEach(msg => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify(msg));
            }
        });
        
        this._log(`Sent ${messages.length} queued messages`);
    },
    
    _cleanup() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._stopHeartbeat();
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
        this.statusListeners.forEach(callback => {
            try {
                callback(status);
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

// Export for use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}