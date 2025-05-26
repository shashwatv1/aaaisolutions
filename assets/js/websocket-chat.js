/**
 * Enhanced WebSocket-based Chat Service for AAAI Solutions
 * Fixed version with improved stability, error handling, and performance
 */
const ChatService = {
    /**
     * Initialize the enhanced chat service
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
            reconnectInterval: 5000,           // Increased base interval
            maxReconnectAttempts: 8,          // Reduced attempts
            heartbeatInterval: 45000,         // Increased to 45 seconds
            connectionTimeout: 10000,         // Reduced to 10 seconds
            maxConnectionAge: 3600000,        // 1 hour max age
            messageQueueLimit: 50,            // Reduced queue size
            persistentConnection: true,
            debug: window.AAAI_CONFIG.ENABLE_DEBUG || false,
            cacheExpiry: 1800000,            // 30 minutes cache expiry
            maxCacheSize: 500,               // Reduced cache size
            enableCompression: false,         // Disabled for stability
            enableBatching: false,           // Disabled for simplicity
            retryOnError: true,
            gracefulReconnect: true
        }, options);
        
        // Connection state
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.connectionId = null;
        this.reconnectToken = null;
        this.userId = null;
        
        // Reconnection management
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.lastDisconnectReason = null;
        this.connectionStartTime = null;
        this.lastActivityTime = null;
        
        // Event listeners
        this.messageListeners = [];
        this.statusListeners = [];
        this.errorListeners = [];
        
        // Message management
        this.messageQueue = [];
        this.pendingMessages = new Map();
        this.messageHistory = [];
        this.lastMessageSent = null;
        
        // Timing and heartbeat
        this.heartbeatTimer = null;
        this.heartbeatIntervalId = null;
        this.lastHeartbeatSent = null;
        this.lastHeartbeatReceived = null;
        this.heartbeatFailures = 0;
        
        // Performance tracking
        this.stats = {
            totalConnections: 0,
            totalReconnections: 0,
            totalMessagesSent: 0,
            totalMessagesReceived: 0,
            connectionUptime: 0,
            averageLatency: 0,
            lastLatency: 0,
            errorsIgnored: 0,
            heartbeatsSent: 0,
            heartbeatsReceived: 0
        };
        
        // Simple cache system
        this.cache = new Map();
        this.cacheTimestamps = new Map();
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onOpen = this._onOpen.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Set up event handlers
        this._setupEventHandlers();
        
        // Initialize persistent connection
        this._initializePersistentConnection();
        
        this._log('Enhanced ChatService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            options: this.options
        });
        
        return this;
    },
    
    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // Page visibility change handler
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this._log('Page became visible');
                if (this.authService.isAuthenticated() && !this.isConnected && !this.isConnecting) {
                    this._log('Attempting to reconnect on page visible');
                    this.connect().catch(err => {
                        this._error('Failed to reconnect on page visible:', err);
                    });
                }
            } else {
                this._log('Page became hidden');
                // Reduce activity but don't disconnect
                this._updateLastActivity();
            }
        });
        
        // Handle page unload
        window.addEventListener('beforeunload', () => {
            this._savePersistentConnection();
            if (this.isConnected) {
                this.disconnect();
            }
        });
        
        // Handle connection errors at window level
        window.addEventListener('online', () => {
            this._log('Network came back online');
            if (!this.isConnected && this.authService.isAuthenticated()) {
                setTimeout(() => this.connect(), 1000);
            }
        });
        
        window.addEventListener('offline', () => {
            this._log('Network went offline');
            this._notifyStatusChange('offline');
        });
    },
    
    /**
     * Initialize persistent connection data
     */
    _initializePersistentConnection() {
        if (!this.options.persistentConnection) return;
        
        try {
            const savedData = localStorage.getItem('aaai_websocket_data');
            if (savedData) {
                const data = JSON.parse(savedData);
                
                // Only restore if data is recent (within 24 hours)
                const dataAge = Date.now() - (data.lastSaved || 0);
                if (dataAge < 86400000) { // 24 hours
                    this.connectionId = data.connectionId;
                    this.reconnectToken = data.reconnectToken;
                    this.messageHistory = (data.messageHistory || []).slice(-20); // Keep only recent history
                    
                    // Restore relevant stats
                    if (data.stats) {
                        this.stats.totalConnections = data.stats.totalConnections || 0;
                        this.stats.totalReconnections = data.stats.totalReconnections || 0;
                    }
                    
                    this._log('Persistent connection data restored', {
                        connectionId: this.connectionId,
                        hasReconnectToken: !!this.reconnectToken,
                        messageHistoryCount: this.messageHistory.length
                    });
                } else {
                    this._log('Persistent data too old, clearing');
                    localStorage.removeItem('aaai_websocket_data');
                }
            }
        } catch (error) {
            this._warn('Failed to restore persistent connection data:', error);
            localStorage.removeItem('aaai_websocket_data');
        }
    },
    
    /**
     * Save persistent connection data
     */
    _savePersistentConnection() {
        if (!this.options.persistentConnection) return;
        
        try {
            const data = {
                connectionId: this.connectionId,
                reconnectToken: this.reconnectToken,
                messageHistory: this.messageHistory.slice(-20), // Keep only recent messages
                stats: {
                    totalConnections: this.stats.totalConnections,
                    totalReconnections: this.stats.totalReconnections
                },
                lastSaved: Date.now()
            };
            
            localStorage.setItem('aaai_websocket_data', JSON.stringify(data));
        } catch (error) {
            this._warn('Failed to save persistent connection data:', error);
        }
    },
    
    /**
     * Connect to WebSocket
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (!this.authService.isAuthenticated()) {
                const error = new Error('Authentication required for WebSocket connection');
                this._error(error.message);
                reject(error);
                return;
            }
            
            if (this.isConnected) {
                this._log('Already connected to WebSocket');
                resolve(true);
                return;
            }
            
            if (this.isConnecting) {
                this._log('Connection already in progress');
                // Wait for connection to complete
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
                return;
            }
            
            this.isConnecting = true;
            
            try {
                const user = this.authService.getCurrentUser();
                this.userId = user.id || user.user_id;
                
                if (!this.userId) {
                    throw new Error('Invalid user data - no user ID found');
                }
                
                const wsUrl = this._buildWebSocketUrl(this.userId);
                
                this._log(`Connecting to WebSocket: ${this._maskSensitiveUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                this.connectionStartTime = Date.now();
                
                // Set up event listeners
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
                        reject(new Error('WebSocket connection error'));
                    }
                });
                
                // Connection timeout
                setTimeout(() => {
                    if (this.isConnecting && this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                        this._error('WebSocket connection timeout');
                        this.socket.close();
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
     * Build WebSocket URL with authentication
     */
    _buildWebSocketUrl(userId) {
        // Determine WebSocket URL based on environment
        let wsHost;
        if (window.AAAI_CONFIG.WS_BASE_URL) {
            wsHost = window.AAAI_CONFIG.WS_BASE_URL.replace(/^https?:\/\//, '').replace(/^wss?:\/\//, '');
        } else if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            // Production WebSocket URL
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        
        // Add authentication token
        const token = this.authService.getToken();
        if (token) {
            url += `?token=${encodeURIComponent(token)}`;
        }
        
        // Add reconnect token if available
        if (this.reconnectToken) {
            const separator = token ? '&' : '?';
            url += `${separator}reconnect_token=${encodeURIComponent(this.reconnectToken)}`;
        }
        
        return url;
    },
    
    /**
     * Mask sensitive information in URLs for logging
     */
    _maskSensitiveUrl(url) {
        return url.replace(/token=[^&]*/, 'token=***').replace(/reconnect_token=[^&]*/, 'reconnect_token=***');
    },
    
    /**
     * Handle WebSocket open event
     */
    _onOpen(event) {
        this._log('WebSocket connected successfully');
        
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.heartbeatFailures = 0;
        this._updateLastActivity();
        this.stats.totalConnections++;
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._notifyStatusChange('connected');
        
        // Start heartbeat after connection is stable
        setTimeout(() => {
            if (this.isConnected) {
                this._startHeartbeat();
            }
        }, 3000);
        
        // Process queued messages
        this._processQueuedMessages();
        
        // Save connection state
        this._savePersistentConnection();
    },
    
    /**
     * Handle WebSocket message event
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            this.stats.totalMessagesReceived++;
            this._updateLastActivity();
            
            this._log('Received WebSocket message:', data.type || 'unknown type');
            
            // Handle specific message types
            switch (data.type) {
                case 'connection_established':
                    this._handleConnectionEstablished(data);
                    break;
                    
                case 'heartbeat':
                    this._handleHeartbeat(data);
                    break;
                    
                case 'heartbeat_ack':
                case 'pong':
                    this._handleHeartbeatAck(data);
                    break;
                    
                case 'message':
                    this._handleChatMessage(data);
                    break;
                    
                case 'message_queued':
                    this._handleMessageQueued(data);
                    break;
                    
                case 'history_loaded':
                case 'history_response':
                    this._handleHistoryLoaded(data);
                    break;
                    
                case 'error':
                    this._handleServerError(data);
                    break;
                    
                case 'token_refresh_recommended':
                    this._handleTokenRefreshRecommended(data);
                    break;
                    
                case 'disconnect_notice':
                    this._handleDisconnectNotice(data);
                    break;
                    
                default:
                    // Pass through unknown message types to listeners
                    this._notifyMessageListeners(data);
                    break;
            }
            
            // Add to message history (excluding heartbeats and errors)
            if (!['heartbeat', 'heartbeat_ack', 'pong', 'ping', 'error'].includes(data.type)) {
                this._addToHistory(data);
            }
            
        } catch (error) {
            this._error('Error processing WebSocket message:', error, event.data);
        }
    },
    
    /**
     * Handle connection established message
     */
    _handleConnectionEstablished(data) {
        this.connectionId = data.connection_id;
        this.reconnectToken = data.reconnect_token;
        
        this._log('WebSocket connection established', {
            connectionId: this.connectionId,
            hasReconnectToken: !!this.reconnectToken
        });
        
        this._savePersistentConnection();
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle heartbeat message
     */
    _handleHeartbeat(data) {
        // Respond to server heartbeat
        this._sendMessage({
            type: 'heartbeat_ack',
            timestamp: new Date().toISOString(),
            server_timestamp: data.timestamp
        }, false, false);
        
        this.stats.heartbeatsReceived++;
    },
    
    /**
     * Handle heartbeat acknowledgment
     */
    _handleHeartbeatAck(data) {
        this.lastHeartbeatReceived = Date.now();
        this.heartbeatFailures = 0;
        
        // Calculate latency if we have client timestamp
        if (data.client_timestamp || data.timestamp) {
            try {
                const sentTime = new Date(data.client_timestamp || data.timestamp).getTime();
                const latency = Date.now() - sentTime;
                if (latency > 0 && latency < 60000) { // Reasonable latency range
                    this.stats.lastLatency = latency;
                    this.stats.averageLatency = this.stats.averageLatency 
                        ? (this.stats.averageLatency + latency) / 2 
                        : latency;
                }
            } catch (e) {
                // Ignore timestamp parsing errors
            }
        }
        
        this._log('Heartbeat acknowledged', { latency: this.stats.lastLatency });
    },
    
    /**
     * Handle chat message
     */
    _handleChatMessage(data) {
        // Remove from pending messages if this is a response
        if (data.message_id && this.pendingMessages.has(data.message_id)) {
            this.pendingMessages.delete(data.message_id);
        }
        
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle message queued confirmation
     */
    _handleMessageQueued(data) {
        if (data.message_id) {
            this.pendingMessages.set(data.message_id, {
                queued_at: Date.now(),
                user_message: data.user_message
            });
        }
        
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle message history
     */
    _handleHistoryLoaded(data) {
        this._log(`Loaded ${data.messages?.length || 0} messages from history`);
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle server errors
     */
    _handleServerError(data) {
        // Filter out known non-critical errors
        const ignorableErrors = [
            'Message cannot be empty',
            'Invalid message format'
        ];
        
        if (ignorableErrors.some(err => data.message && data.message.includes(err))) {
            this._log('Ignoring non-critical server error:', data.message);
            this.stats.errorsIgnored++;
            return;
        }
        
        // Handle authentication errors
        if (data.code === 'AUTH_FAILED' || data.message?.toLowerCase().includes('authentication')) {
            this._error('Authentication failed, redirecting to login');
            this.authService.logout();
            return;
        }
        
        // Log and notify other errors
        this._error('Server error:', data.message);
        this._notifyErrorListeners(data);
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle token refresh recommendation
     */
    _handleTokenRefreshRecommended(data) {
        this._warn('Token refresh recommended:', data.message);
        
        // Attempt silent token refresh
        if (this.authService.refreshTokenSilently) {
            this.authService.refreshTokenSilently()
                .then(() => {
                    this._log('Token refreshed successfully');
                })
                .catch(error => {
                    this._warn('Failed to refresh token:', error);
                });
        }
    },
    
    /**
     * Handle disconnect notice
     */
    _handleDisconnectNotice(data) {
        this._warn('Server disconnect notice:', data.message);
        
        if (data.reconnect_recommended) {
            // Schedule reconnection after a delay
            setTimeout(() => {
                if (!this.isConnected && this.authService.isAuthenticated()) {
                    this.connect();
                }
            }, 5000);
        }
    },
    
    /**
     * Handle WebSocket close event
     */
    _onClose(event) {
        this.isConnected = false;
        this.isConnecting = false;
        
        this._stopHeartbeat();
        
        // Calculate uptime
        if (this.connectionStartTime) {
            const uptime = Date.now() - this.connectionStartTime;
            this.stats.connectionUptime += uptime;
        }
        
        this.lastDisconnectReason = event.reason || 'Unknown';
        
        this._log('WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        this._notifyStatusChange('disconnected');
        
        // Determine if we should attempt to reconnect
        const shouldReconnect = this._shouldAttemptReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('Not attempting to reconnect', { code: event.code, authenticated: this.authService.isAuthenticated() });
            if (!this.authService.isAuthenticated()) {
                this._clearPersistentConnection();
            }
        }
    },
    
    /**
     * Determine if we should attempt to reconnect based on close code
     */
    _shouldAttemptReconnect(code) {
        // Don't reconnect for these codes
        const noReconnectCodes = [
            1000, // Normal closure
            1001, // Going away
            1005, // No status code (browser initiated)
            4001, // Custom: Authentication failed
            4403  // Custom: Forbidden
        ];
        
        return !noReconnectCodes.includes(code) && this.reconnectAttempts < this.options.maxReconnectAttempts;
    },
    
    /**
     * Handle WebSocket error event
     */
    _onError(event) {
        this._error('WebSocket error:', event);
        this._updateLastActivity();
        this._notifyStatusChange('error');
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
        
        // Clear any existing timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        
        this.reconnectAttempts++;
        this.stats.totalReconnections++;
        
        // Calculate delay with exponential backoff and jitter
        const baseDelay = this.options.reconnectInterval;
        const backoffDelay = Math.min(baseDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
        const jitter = Math.random() * 2000; // 0-2 seconds jitter
        const delay = backoffDelay + jitter;
        
        this._log(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${Math.round(delay)}ms`);
        
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isConnected && this.authService.isAuthenticated()) {
                try {
                    await this.connect();
                    this._log('Reconnected successfully');
                } catch (err) {
                    this._error('Reconnect failed:', err);
                    // Will schedule another attempt if within limits
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
        
        if (!this.options.heartbeatInterval || this.options.heartbeatInterval <= 0) {
            return;
        }
        
        this.lastHeartbeatSent = Date.now();
        this.lastHeartbeatReceived = Date.now();
        this.heartbeatFailures = 0;
        
        this.heartbeatIntervalId = setInterval(() => {
            if (this.isConnected) {
                this._sendHeartbeat();
            }
        }, this.options.heartbeatInterval);
        
        this._log('Started heartbeat mechanism');
    },
    
    /**
     * Stop heartbeat mechanism
     */
    _stopHeartbeat() {
        if (this.heartbeatIntervalId) {
            clearInterval(this.heartbeatIntervalId);
            this.heartbeatIntervalId = null;
        }
        
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    /**
     * Send heartbeat message
     */
    _sendHeartbeat() {
        try {
            // Check for missed heartbeats
            const now = Date.now();
            const timeSinceLastReceived = now - (this.lastHeartbeatReceived || now);
            
            if (timeSinceLastReceived > this.options.heartbeatInterval * 2) {
                this.heartbeatFailures++;
                this._warn(`Heartbeat failure ${this.heartbeatFailures} - no response in ${timeSinceLastReceived}ms`);
                
                if (this.heartbeatFailures >= 3) {
                    this._error('Multiple heartbeat failures, closing connection');
                    this.socket?.close(1002, 'Heartbeat timeout');
                    return;
                }
            }
            
            this._sendMessage({
                type: 'ping',
                timestamp: new Date().toISOString(),
                client_timestamp: new Date().toISOString()
            }, false, false);
            
            this.lastHeartbeatSent = now;
            this.stats.heartbeatsSent++;
            
            this._log('Sent heartbeat');
        } catch (error) {
            this._error('Error sending heartbeat:', error);
            this.heartbeatFailures++;
        }
    },
    
    /**
     * Send a message through WebSocket
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!message || typeof message !== 'string' || message.trim() === '') {
                reject(new Error('Message cannot be empty or invalid'));
                return;
            }
            
            const trimmedMessage = message.trim();
            this.lastMessageSent = trimmedMessage;
            
            const messageData = {
                type: 'message',
                message: trimmedMessage,
                timestamp: new Date().toISOString(),
                id: this._generateMessageId()
            };
            
            if (this.isConnected) {
                try {
                    this._sendMessage(messageData, true, true);
                    this.stats.totalMessagesSent++;
                    resolve(messageData.id);
                } catch (error) {
                    this._error('Send error:', error);
                    reject(error);
                }
            } else {
                // Queue message and attempt to connect
                this._queueMessage(messageData);
                
                if (!this.isConnecting) {
                    this.connect()
                        .then(() => {
                            this._log('Connected and will send queued message');
                            resolve(messageData.id);
                        })
                        .catch(err => {
                            this._error('Failed to connect for message send:', err);
                            reject(new Error('Not connected and failed to connect'));
                        });
                } else {
                    resolve(messageData.id);
                }
            }
        });
    },
    
    /**
     * Generate unique message ID
     */
    _generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    /**
     * Internal message sending
     */
    _sendMessage(messageData, allowQueue = true, isUserMessage = false) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            if (allowQueue && isUserMessage) {
                this._queueMessage(messageData);
            }
            return;
        }
        
        try {
            const jsonString = JSON.stringify(messageData);
            this.socket.send(jsonString);
            this._updateLastActivity();
            
            if (this.options.debug) {
                this._log('Sent message:', messageData.type, jsonString.length + ' bytes');
            }
        } catch (error) {
            if (allowQueue && isUserMessage) {
                this._queueMessage(messageData);
            }
            throw error;
        }
    },
    
    /**
     * Queue message for later sending
     */
    _queueMessage(messageData) {
        // Prevent queue overflow
        if (this.messageQueue.length >= this.options.messageQueueLimit) {
            this.messageQueue.shift(); // Remove oldest message
            this._warn('Message queue full, removed oldest message');
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
        
        const messagesToSend = [...this.messageQueue];
        this.messageQueue = [];
        
        let sentCount = 0;
        let failedCount = 0;
        
        messagesToSend.forEach(messageData => {
            try {
                this._sendMessage(messageData, false, true);
                this.stats.totalMessagesSent++;
                sentCount++;
            } catch (error) {
                this._error('Error sending queued message:', error);
                this._queueMessage(messageData); // Re-queue failed messages
                failedCount++;
            }
        });
        
        this._log(`Processed queued messages: ${sentCount} sent, ${failedCount} failed`);
    },
    
    /**
     * Add message to history
     */
    _addToHistory(data) {
        this.messageHistory.push({
            ...data,
            received_at: Date.now()
        });
        
        // Keep history size manageable
        if (this.messageHistory.length > 50) {
            this.messageHistory = this.messageHistory.slice(-30);
        }
    },
    
    /**
     * Update last activity timestamp
     */
    _updateLastActivity() {
        this.lastActivityTime = Date.now();
    },
    
    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        this._log('Disconnecting from WebSocket');
        
        // Clear timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._stopHeartbeat();
        
        // Close socket
        if (this.socket) {
            this.socket.close(1000, 'Client disconnected');
            this.socket = null;
        }
        
        // Update state
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        this._notifyStatusChange('disconnected');
        this._savePersistentConnection();
    },
    
    /**
     * Clear persistent connection data
     */
    _clearPersistentConnection() {
        try {
            localStorage.removeItem('aaai_websocket_data');
            this._log('Cleared persistent connection data');
        } catch (error) {
            this._warn('Failed to clear persistent connection data:', error);
        }
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
        const now = Date.now();
        const connectionAge = this.connectionStartTime ? now - this.connectionStartTime : 0;
        
        return {
            // Connection Status
            connected: this.isConnected,
            connecting: this.isConnecting,
            connectionId: this.connectionId,
            reconnectToken: this.reconnectToken,
            userId: this.userId,
            
            // Reconnection Status
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            lastDisconnectReason: this.lastDisconnectReason,
            
            // Message Status
            queuedMessages: this.messageQueue.length,
            pendingMessages: this.pendingMessages.size,
            messageHistoryCount: this.messageHistory.length,
            
            // WebSocket Status
            readyState: this.socket ? this.socket.readyState : null,
            readyStateName: this.socket ? this._getReadyStateName(this.socket.readyState) : null,
            
            // Timing
            connectionAge: connectionAge,
            lastActivityTime: this.lastActivityTime,
            lastHeartbeatSent: this.lastHeartbeatSent,
            lastHeartbeatReceived: this.lastHeartbeatReceived,
            heartbeatFailures: this.heartbeatFailures,
            
            // Performance
            stats: { ...this.stats },
            
            // Configuration
            options: { ...this.options }
        };
    },
    
    /**
     * Get WebSocket ready state name
     */
    _getReadyStateName(readyState) {
        const states = {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED'
        };
        return states[readyState] || 'UNKNOWN';
    },
    
    /**
     * Test connection
     */
    async testConnection() {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            const user = this.authService.getCurrentUser();
            const userId = user.id || user.user_id;
            const testWsUrl = this._buildWebSocketUrl(userId);
            
            this._log(`Testing WebSocket connection: ${this._maskSensitiveUrl(testWsUrl)}`);
            
            return new Promise((resolve, reject) => {
                const testSocket = new WebSocket(testWsUrl);
                const startTime = Date.now();
                
                const cleanup = () => {
                    testSocket.onopen = null;
                    testSocket.onerror = null;
                    testSocket.onclose = null;
                };
                
                testSocket.onopen = () => {
                    const latency = Date.now() - startTime;
                    this._log(`✅ Test WebSocket connected in ${latency}ms`);
                    cleanup();
                    testSocket.close();
                    resolve({
                        success: true,
                        latency: latency,
                        timestamp: new Date().toISOString()
                    });
                };
                
                testSocket.onerror = (error) => {
                    this._error('❌ Test WebSocket failed:', error);
                    cleanup();
                    reject(new Error('Test connection failed'));
                };
                
                testSocket.onclose = (event) => {
                    if (event.code !== 1000) {
                        cleanup();
                        reject(new Error(`Test connection closed with code: ${event.code}`));
                    }
                };
                
                // Timeout
                setTimeout(() => {
                    if (testSocket.readyState === WebSocket.CONNECTING) {
                        cleanup();
                        testSocket.close();
                        reject(new Error('Test connection timeout'));
                    }
                }, 5000);
            });
        } catch (error) {
            this._error('Test connection error:', error);
            throw error;
        }
    },
    
    /**
     * Logging methods
     */
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService]', ...args);
        }
    },
    
    _warn(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.warn('[ChatService]', ...args);
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