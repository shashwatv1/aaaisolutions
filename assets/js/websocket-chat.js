/**
 * Enhanced WebSocket-based Chat Service for AAAI Solutions
 * Features persistent connections, automatic reconnection, robust error handling, and advanced caching
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
            reconnectInterval: 3000,
            maxReconnectAttempts: 10,
            heartbeatInterval: 30000, // 30 seconds heartbeat
            connectionTimeout: 15000, // 15 seconds connection timeout
            maxConnectionAge: 86400000, // 24 hours in milliseconds
            messageQueueLimit: 100, // Maximum queued messages
            persistentConnection: true,
            debug: window.AAAI_CONFIG.ENABLE_DEBUG || false,
            cacheExpiry: 3600000, // 1 hour cache expiry
            maxCacheSize: 1000, // Maximum cached items
            enableCompression: true,
            enableBatching: true,
            batchSize: 10,
            batchTimeout: 1000
        }, options);
        
        // Connection state
        this.socket = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.connectionId = null;
        this.reconnectToken = null;
        
        // Reconnection management
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.lastDisconnectReason = null;
        
        // Event listeners
        this.messageListeners = [];
        this.statusListeners = [];
        this.errorListeners = [];
        
        // Message management
        this.messageQueue = [];
        this.pendingMessages = new Map(); // Track messages waiting for response
        this.messageHistory = [];
        this.messageBatch = []; // For batching messages
        this.batchTimer = null;
        
        // Timing and heartbeat
        this.heartbeatTimer = null;
        this.connectionStartTime = null;
        this.lastActivityTime = null;
        this.lastHeartbeatTime = null;
        
        // Performance tracking
        this.stats = {
            totalConnections: 0,
            totalReconnections: 0,
            totalMessagesSent: 0,
            totalMessagesReceived: 0,
            connectionUptime: 0,
            averageLatency: 0,
            lastLatency: 0,
            cacheHits: 0,
            cacheMisses: 0,
            messagesFromCache: 0,
            bandwidthSaved: 0
        };
        
        // Enhanced Cache System
        this.cache = new Map();
        this.cacheIndex = new Map(); // For quick lookups
        this.cacheTimestamps = new Map();
        this.cacheAccessCount = new Map();
        this.compressionCache = new Map();
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onOpen = this._onOpen.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        this._processBatch = this._processBatch.bind(this);
        
        // Set up persistent connection data
        this._initializePersistentConnection();
        
        // Set up visibility change handler
        this._setupVisibilityHandler();
        
        // Start cache maintenance
        this._startCacheMaintenance();
        
        window.AAAI_LOGGER.info('Enhanced ChatService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            websocketsEnabled: window.AAAI_CONFIG.ENABLE_WEBSOCKETS,
            persistentConnection: this.options.persistentConnection,
            cacheEnabled: true,
            debug: this.options.debug
        });
        
        return this;
    },
    
    /**
     * Initialize persistent connection data with enhanced caching
     */
    _initializePersistentConnection() {
        if (!this.options.persistentConnection) return;
        
        try {
            // Restore connection data
            const savedData = localStorage.getItem('aaai_websocket_data');
            if (savedData) {
                const data = JSON.parse(savedData);
                this.connectionId = data.connectionId;
                this.reconnectToken = data.reconnectToken;
                this.messageHistory = data.messageHistory || [];
                
                // Restore cache data
                if (data.cache) {
                    this._restoreCache(data.cache);
                }
                
                // Restore stats
                if (data.stats) {
                    Object.assign(this.stats, data.stats);
                }
                
                window.AAAI_LOGGER.info('Persistent connection data restored', {
                    connectionId: this.connectionId,
                    hasReconnectToken: !!this.reconnectToken,
                    messageHistoryCount: this.messageHistory.length,
                    cacheSize: this.cache.size
                });
            }
        } catch (error) {
            window.AAAI_LOGGER.warn('Failed to restore persistent connection data:', error);
        }
    },
    
    /**
     * Restore cache from persistent storage
     */
    _restoreCache(cacheData) {
        try {
            const now = Date.now();
            
            for (const [key, item] of Object.entries(cacheData)) {
                // Check if cache item is still valid
                if (item.timestamp && (now - item.timestamp) < this.options.cacheExpiry) {
                    this.cache.set(key, item.data);
                    this.cacheTimestamps.set(key, item.timestamp);
                    this.cacheAccessCount.set(key, item.accessCount || 0);
                    
                    // Restore cache index
                    if (item.index) {
                        this.cacheIndex.set(key, item.index);
                    }
                }
            }
            
            window.AAAI_LOGGER.info(`Restored ${this.cache.size} items from cache`);
        } catch (error) {
            window.AAAI_LOGGER.warn('Failed to restore cache:', error);
        }
    },
    
    /**
     * Save persistent connection data with cache
     */
    _savePersistentConnection() {
        if (!this.options.persistentConnection) return;
        
        try {
            const data = {
                connectionId: this.connectionId,
                reconnectToken: this.reconnectToken,
                messageHistory: this.messageHistory.slice(-50),
                cache: this._serializeCache(),
                stats: this.stats,
                lastSaved: Date.now()
            };
            
            localStorage.setItem('aaai_websocket_data', JSON.stringify(data));
        } catch (error) {
            window.AAAI_LOGGER.warn('Failed to save persistent connection data:', error);
        }
    },
    
    /**
     * Serialize cache for persistent storage
     */
    _serializeCache() {
        const serialized = {};
        const now = Date.now();
        
        for (const [key, value] of this.cache.entries()) {
            const timestamp = this.cacheTimestamps.get(key) || now;
            
            // Only serialize non-expired items
            if ((now - timestamp) < this.options.cacheExpiry) {
                serialized[key] = {
                    data: value,
                    timestamp: timestamp,
                    accessCount: this.cacheAccessCount.get(key) || 0,
                    index: this.cacheIndex.get(key)
                };
            }
        }
        
        return serialized;
    },
    
    /**
     * Start cache maintenance tasks
     */
    _startCacheMaintenance() {
        // Clean up expired cache items every 5 minutes
        setInterval(() => {
            this._cleanupCache();
        }, 300000);
        
        // Save cache periodically
        setInterval(() => {
            if (this.options.persistentConnection) {
                this._savePersistentConnection();
            }
        }, 60000); // Every minute
    },
    
    /**
     * Clean up expired cache items
     */
    _cleanupCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, timestamp] of this.cacheTimestamps.entries()) {
            if ((now - timestamp) > this.options.cacheExpiry) {
                expiredKeys.push(key);
            }
        }
        
        // Remove expired items
        expiredKeys.forEach(key => {
            this.cache.delete(key);
            this.cacheTimestamps.delete(key);
            this.cacheAccessCount.delete(key);
            this.cacheIndex.delete(key);
            this.compressionCache.delete(key);
        });
        
        // If cache is still too large, remove least recently used items
        if (this.cache.size > this.options.maxCacheSize) {
            this._evictLeastRecentlyUsed();
        }
        
        if (expiredKeys.length > 0) {
            window.AAAI_LOGGER.debug(`Cleaned up ${expiredKeys.length} expired cache items. Cache size: ${this.cache.size}`);
        }
    },
    
    /**
     * Evict least recently used cache items
     */
    _evictLeastRecentlyUsed() {
        const entries = Array.from(this.cacheAccessCount.entries())
            .sort((a, b) => a[1] - b[1]) // Sort by access count
            .slice(0, Math.floor(this.options.maxCacheSize * 0.1)); // Remove 10%
        
        entries.forEach(([key]) => {
            this.cache.delete(key);
            this.cacheTimestamps.delete(key);
            this.cacheAccessCount.delete(key);
            this.cacheIndex.delete(key);
            this.compressionCache.delete(key);
        });
        
        window.AAAI_LOGGER.debug(`Evicted ${entries.length} LRU cache items`);
    },
    
    /**
     * Set up page visibility change handler
     */
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (this.authService.isAuthenticated() && !this.isConnected && !this.isConnecting) {
                    window.AAAI_LOGGER.info('Page visible, attempting to reconnect WebSocket');
                    this.connect().catch(err => {
                        window.AAAI_LOGGER.error('Failed to reconnect on page visible:', err);
                    });
                }
            } else {
                if (this.isConnected) {
                    window.AAAI_LOGGER.debug('Page hidden, reducing WebSocket activity');
                    // Flush any pending batches
                    this._processBatch();
                }
            }
        });
    },
    
    /**
     * Connect to WebSocket with enhanced persistence
     */
    connect() {
        return new Promise((resolve, reject) => {
            if (!this.authService.isAuthenticated()) {
                const error = new Error('Authentication required for WebSocket connection');
                window.AAAI_LOGGER.error(error.message);
                reject(error);
                return;
            }
            
            if (this.isConnected) {
                window.AAAI_LOGGER.debug('Already connected to WebSocket');
                resolve(true);
                return;
            }
            
            if (this.isConnecting) {
                window.AAAI_LOGGER.debug('Connection already in progress');
                setTimeout(() => {
                    if (this.isConnected) {
                        resolve(true);
                    } else {
                        reject(new Error('Connection attempt timed out'));
                    }
                }, this.options.connectionTimeout);
                return;
            }
            
            this.isConnecting = true;
            
            try {
                const user = this.authService.getCurrentUser();
                const wsUrl = this._buildWebSocketUrl(user.id);
                
                window.AAAI_LOGGER.info(`Connecting to WebSocket: ${this._maskSensitiveUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                this.connectionStartTime = Date.now();
                
                this.socket.addEventListener('open', (event) => {
                    this._onOpen(event);
                    resolve(true);
                });
                
                this.socket.addEventListener('message', this._onMessage);
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    if (this.isConnecting) {
                        reject(new Error('WebSocket connection error'));
                    }
                });
                
                setTimeout(() => {
                    if (this.isConnecting && this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                        window.AAAI_LOGGER.error('WebSocket connection timeout');
                        this.socket.close();
                        this.isConnecting = false;
                        reject(new Error('Connection timeout'));
                    }
                }, this.options.connectionTimeout);
                
            } catch (error) {
                this.isConnecting = false;
                window.AAAI_LOGGER.error('Connection error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Build WebSocket URL with authentication
     */
    _buildWebSocketUrl(userId) {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : window.location.host;
        
        let url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        
        const token = this.authService.getToken();
        if (token) {
            url += `?token=${token}`;
        }
        
        if (this.reconnectToken) {
            url += token ? `&reconnect_token=${this.reconnectToken}` : `?reconnect_token=${this.reconnectToken}`;
        }
        
        return url;
    },
    
    /**
     * Mask sensitive information in URLs
     */
    _maskSensitiveUrl(url) {
        return url.replace(/token=[^&]*/, 'token=***').replace(/reconnect_token=[^&]*/, 'reconnect_token=***');
    },
    
    /**
     * Handle WebSocket open event
     */
    _onOpen(event) {
        window.AAAI_LOGGER.info('WebSocket connected successfully');
        
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.lastActivityTime = Date.now();
        this.stats.totalConnections++;
        
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._notifyStatusChange('connected');
        
        // Start heartbeat AFTER a short delay
        setTimeout(() => {
            this._startHeartbeat();
        }, 2000); // 2 second delay before starting heartbeat
        
        // Process any queued messages, but NOT empty batches
        if (this.messageQueue.length > 0) {
            this._sendQueuedMessages();
        }
        
        this._savePersistentConnection();
    },
    
    /**
     * Handle WebSocket message event with caching
     */
    _onMessage(event) {
        try {
            // Debug logging
            console.log('WebSocket raw message:', event.data);
            
            const data = JSON.parse(event.data);
            this.stats.totalMessagesReceived++;
            this.lastActivityTime = Date.now();
            
            // IMPORTANT: Check for and ignore the empty message errors
            if (data.type === "error" && data.message === "Message cannot be empty") {
                // Completely ignore these errors - they're caused by system messages
                console.log('Ignoring "Message cannot be empty" error - this is a known issue');
                return;
            }
            
            window.AAAI_LOGGER.debug('Received WebSocket message:', data.type || 'unknown type');
            
            // Cache the message if it's cacheable
            this._cacheMessage(data);
            
            // Handle different message types
            switch (data.type) {
                case 'connection_established':
                    this._handleConnectionEstablished(data);
                    break;
                    
                case 'heartbeat':
                case 'ping':
                    this._handleHeartbeat(data);
                    break;
                    
                case 'pong':
                case 'heartbeat_ack':
                    this._handleHeartbeatAck(data);
                    break;
                    
                case 'message':
                    this._handleChatMessage(data);
                    break;
                    
                case 'message_queued':
                    this._handleMessageQueued(data);
                    break;
                    
                case 'history_loaded':
                    this._handleHistoryLoaded(data);
                    break;
                    
                case 'error':
                    this._handleError(data);
                    break;
                    
                default:
                    this._notifyMessageListeners(data);
                    break;
            }
            
            // Add to message history (only add non-error messages)
            if (data.type !== "error") {
                this.messageHistory.push({
                    ...data,
                    received_at: Date.now()
                });
                
                if (this.messageHistory.length > 100) {
                    this.messageHistory = this.messageHistory.slice(-50);
                }
            }
            
        } catch (error) {
            window.AAAI_LOGGER.error('Error processing WebSocket message:', error);
        }
    },
    
    /**
     * Cache message data
     */
    _cacheMessage(data) {
        if (!data || !data.type) return;
        
        // Don't cache ephemeral messages
        const ephemeralTypes = ['heartbeat', 'ping', 'pong', 'heartbeat_ack'];
        if (ephemeralTypes.includes(data.type)) return;
        
        const cacheKey = this._generateCacheKey(data);
        const now = Date.now();
        
        // Check if we already have this message
        if (this.cache.has(cacheKey)) {
            this.stats.cacheHits++;
            this.cacheAccessCount.set(cacheKey, (this.cacheAccessCount.get(cacheKey) || 0) + 1);
            return;
        }
        
        // Compress data if enabled
        let cacheData = data;
        if (this.options.enableCompression) {
            cacheData = this._compressData(data);
            if (cacheData.compressed) {
                this.stats.bandwidthSaved += JSON.stringify(data).length - JSON.stringify(cacheData).length;
            }
        }
        
        // Store in cache
        this.cache.set(cacheKey, cacheData);
        this.cacheTimestamps.set(cacheKey, now);
        this.cacheAccessCount.set(cacheKey, 1);
        
        // Create index for quick lookups
        if (data.message_id) {
            this.cacheIndex.set(data.message_id, cacheKey);
        }
        
        this.stats.cacheMisses++;
        
        // Cleanup if cache is too large
        if (this.cache.size > this.options.maxCacheSize) {
            this._evictLeastRecentlyUsed();
        }
    },
    
    /**
     * Generate cache key for message
     */
    _generateCacheKey(data) {
        if (data.message_id) {
            return `msg_${data.message_id}`;
        }
        
        if (data.type && data.timestamp) {
            return `${data.type}_${data.timestamp}`;
        }
        
        return `generic_${Date.now()}_${Math.random()}`;
    },
    
    /**
     * Compress data for caching
     */
    _compressData(data) {
        try {
            const jsonStr = JSON.stringify(data);
            
            // Simple compression - remove unnecessary whitespace and compress common patterns
            const compressed = jsonStr
                .replace(/\s+/g, ' ')
                .replace(/": "/g, '":"')
                .replace(/", "/g, '","')
                .replace(/\{ "/g, '{"')
                .replace(/" \}/g, '"}');
            
            if (compressed.length < jsonStr.length * 0.8) {
                return {
                    compressed: true,
                    data: compressed
                };
            }
            
            return data;
        } catch (error) {
            return data;
        }
    },
    
    /**
     * Decompress cached data
     */
    _decompressData(cachedData) {
        if (cachedData && cachedData.compressed) {
            try {
                return JSON.parse(cachedData.data);
            } catch (error) {
                return cachedData;
            }
        }
        return cachedData;
    },
    
    /**
     * Get message from cache
     */
    getCachedMessage(messageId) {
        const cacheKey = this.cacheIndex.get(messageId);
        if (!cacheKey) return null;
        
        const cachedData = this.cache.get(cacheKey);
        if (!cachedData) return null;
        
        // Check if expired
        const timestamp = this.cacheTimestamps.get(cacheKey);
        if (timestamp && (Date.now() - timestamp) > this.options.cacheExpiry) {
            this.cache.delete(cacheKey);
            this.cacheTimestamps.delete(cacheKey);
            this.cacheAccessCount.delete(cacheKey);
            this.cacheIndex.delete(messageId);
            return null;
        }
        
        // Update access count
        this.cacheAccessCount.set(cacheKey, (this.cacheAccessCount.get(cacheKey) || 0) + 1);
        this.stats.messagesFromCache++;
        
        return this._decompressData(cachedData);
    },
    
    /**
     * Handle connection established message
     */
    _handleConnectionEstablished(data) {
        this.connectionId = data.connection_id;
        this.reconnectToken = data.reconnect_token;
        
        window.AAAI_LOGGER.info('WebSocket connection established', {
            connectionId: this.connectionId,
            hasReconnectToken: !!this.reconnectToken
        });
        
        this._savePersistentConnection();
    },
    
    /**
     * Handle heartbeat/ping messages
     */
    _handleHeartbeat(data) {
        this._sendMessage({
            type: 'pong',
            timestamp: new Date().toISOString()
        }, false);
    },
    
    /**
     * Handle heartbeat acknowledgment
     */
    _handleHeartbeatAck(data) {
        this.lastHeartbeatTime = Date.now();
        
        if (data.client_timestamp) {
            const latency = Date.now() - new Date(data.client_timestamp).getTime();
            this.stats.lastLatency = latency;
            this.stats.averageLatency = (this.stats.averageLatency + latency) / 2;
        }
    },
    
    /**
     * Handle chat messages
     */
    _handleChatMessage(data) {
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
        window.AAAI_LOGGER.info(`Loaded ${data.messages?.length || 0} messages from history`);
        
        // Cache history messages
        if (data.messages) {
            data.messages.forEach(msg => this._cacheMessage(msg));
        }
        
        this._notifyMessageListeners(data);
    },
    
    /**
     * Handle error messages
     */
    _handleError(data) {
        // Ignore empty message errors if they come right after connection
        // or if they're near heartbeat timing
        const now = Date.now();
        const timeSinceConnection = now - (this.connectionStartTime || now);
        const timeSinceLastHeartbeat = now - (this.lastHeartbeatTime || now);
        
        if (data.message === "Message cannot be empty" && 
            (timeSinceConnection < 5000 || timeSinceLastHeartbeat < 2000)) {
            
            window.AAAI_LOGGER.debug('Ignoring empty message error - likely system message', {
                timeSinceConnection,
                timeSinceLastHeartbeat
            });
            return;
        }
        
        // For real errors, log and notify listeners
        window.AAAI_LOGGER.error('WebSocket error message:', data.message);
        this._notifyErrorListeners(data);
    },
    
    /**
     * Handle WebSocket close event
     */
    _onClose(event) {
        this.isConnected = false;
        this.isConnecting = false;
        
        this._stopHeartbeat();
        this._processBatch(); // Flush any pending batches
        
        if (this.connectionStartTime) {
            const uptime = Date.now() - this.connectionStartTime;
            this.stats.connectionUptime += uptime;
        }
        
        this.lastDisconnectReason = event.reason || 'Unknown';
        
        window.AAAI_LOGGER.warn('WebSocket disconnected', { 
            code: event.code, 
            reason: event.reason,
            wasClean: event.wasClean
        });
        
        this._notifyStatusChange('disconnected');
        
        if (event.code !== 1000 && event.code !== 1001 && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else if (this.options.persistentConnection) {
            localStorage.removeItem('aaai_websocket_data');
        }
    },
    
    /**
     * Handle WebSocket error event
     */
    _onError(event) {
        window.AAAI_LOGGER.error('WebSocket error:', event);
        this.lastActivityTime = Date.now();
        this._notifyStatusChange('error');
    },
    
    /**
     * Schedule reconnection attempt
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            window.AAAI_LOGGER.error('Max reconnect attempts reached');
            this._notifyStatusChange('failed');
            return;
        }
        
        this.reconnectAttempts++;
        this.stats.totalReconnections++;
        
        const baseDelay = this.options.reconnectInterval;
        const backoffDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        const jitter = Math.random() * 1000;
        const delay = backoffDelay + jitter;
        
        window.AAAI_LOGGER.info(`Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${Math.round(delay)}ms`);
        
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isConnected && this.authService.isAuthenticated()) {
                try {
                    await this.connect();
                    window.AAAI_LOGGER.info('Reconnected successfully');
                } catch (err) {
                    window.AAAI_LOGGER.error('Reconnect failed:', err);
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
        
        // Initialize heartbeat status
        this.lastHeartbeatTime = Date.now();
        this.heartbeatSent = false;
        
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected) {
                // Only send heartbeat if we've waited at least the full interval
                const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatTime;
                if (timeSinceLastHeartbeat >= this.options.heartbeatInterval - 1000) {
                    this._sendHeartbeat();
                } else {
                    window.AAAI_LOGGER.debug(`Skipping heartbeat, only ${timeSinceLastHeartbeat}ms since last one`);
                }
            }
        }, this.options.heartbeatInterval);
        
        window.AAAI_LOGGER.debug('Started heartbeat mechanism');
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
            // Use a specific type that won't be confused with user messages
            this._sendMessage({
                type: 'heartbeat',
                timestamp: new Date().toISOString(),
                client_timestamp: new Date().toISOString(),
                is_heartbeat: true  // Add explicit flag
            }, false);
            
            window.AAAI_LOGGER.debug('Sent heartbeat');
        } catch (error) {
            window.AAAI_LOGGER.error('Error sending heartbeat:', error);
        }
    },
    
    /**
     * Send a message through WebSocket with batching support
     */
    sendMessage(message) {
        return new Promise((resolve, reject) => {
            if (!message || message.trim() === '') {
                reject(new Error('Message cannot be empty'));
                return;
            }
            
            // Store the last message sent for error validation
            this.lastMessageSent = message.trim();
            
            const messageData = {
                type: 'message',          // Explicitly mark as user message
                message: this.lastMessageSent,
                timestamp: new Date().toISOString(),
                id: this._generateMessageId(),
                is_user_message: true     // Add this flag to distinguish from system messages
            };
            
            if (this.options.enableBatching && this.messageBatch.length < this.options.batchSize) {
                this._addToBatch(messageData);
                resolve(true);
                return;
            }
            
            if (this.isConnected) {
                try {
                    this._sendMessage(messageData);
                    this.stats.totalMessagesSent++;
                    resolve(true);
                } catch (error) {
                    window.AAAI_LOGGER.error('Send error:', error);
                    reject(error);
                }
            } else {
                this._queueMessage(messageData);
                
                if (!this.isConnecting) {
                    this.connect()
                        .then(() => {
                            window.AAAI_LOGGER.info('Connected and will send queued message');
                            resolve(true);
                        })
                        .catch(err => {
                            window.AAAI_LOGGER.error('Failed to connect for message send:', err);
                            reject(new Error('Not connected and failed to connect'));
                        });
                } else {
                    resolve(true);
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
     * Add message to batch
     */
    _addToBatch(messageData) {
        this.messageBatch.push(messageData);
        
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        
        this.batchTimer = setTimeout(() => {
            this._processBatch();
        }, this.options.batchTimeout);
        
        if (this.messageBatch.length >= this.options.batchSize) {
            this._processBatch();
        }
    },
    
    /**
     * Process batched messages
     */
    _processBatch() {
        if (!this.messageBatch || this.messageBatch.length === 0) {
            // Skip empty batches entirely
            return;
        }
        
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        
        const batch = [...this.messageBatch];
        this.messageBatch = [];
        
        if (this.isConnected) {
            try {
                // Only send if we actually have messages
                if (batch.length > 0) {
                    // Send as a single batch message with explicit type
                    this._sendMessage({
                        type: 'message_batch',
                        messages: batch,
                        timestamp: new Date().toISOString(),
                        batch_count: batch.length,
                        is_user_batch: true  // Flag to identify user batches
                    });
                    
                    this.stats.totalMessagesSent += batch.length;
                    window.AAAI_LOGGER.debug(`Sent batch of ${batch.length} messages`);
                }
            } catch (error) {
                // Re-queue messages on error
                batch.forEach(msg => this._queueMessage(msg));
                window.AAAI_LOGGER.error('Error sending batch:', error);
            }
        } else {
            // Queue all messages if not connected
            batch.forEach(msg => this._queueMessage(msg));
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
            // Debug logging to see exactly what's being sent
            console.log('Sending WebSocket message:', JSON.stringify(messageData));
            
            this.socket.send(JSON.stringify(messageData));
            this.lastActivityTime = Date.now();
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
            this.messageQueue.shift(); // Remove oldest message
        }
        
        this.messageQueue.push({
            ...messageData,
            queued_at: Date.now()
        });
        
        window.AAAI_LOGGER.debug(`Message queued (${this.messageQueue.length}/${this.options.messageQueueLimit})`);
    },
    
    /**
     * Send all queued messages
     */
    _sendQueuedMessages() {
        const messagesToSend = [...this.messageQueue];
        this.messageQueue = [];
        
        messagesToSend.forEach(messageData => {
            try {
                this._sendMessage(messageData, false);
                this.stats.totalMessagesSent++;
            } catch (error) {
                window.AAAI_LOGGER.error('Error sending queued message:', error);
                this._queueMessage(messageData);
            }
        });
        
        if (messagesToSend.length > 0) {
            window.AAAI_LOGGER.info(`Sent ${messagesToSend.length} queued messages`);
        }
    },
    
    /**
     * Disconnect from WebSocket
     */
    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = null;
        }
        
        // Process any pending batch before disconnecting
        this._processBatch();
        
        this._stopHeartbeat();
        
        if (this.socket) {
            window.AAAI_LOGGER.info('Disconnecting from WebSocket');
            this.socket.close(1000, 'Client disconnected');
            this.socket = null;
        }
        
        this.isConnected = false;
        this.isConnecting = false;
        this._notifyStatusChange('disconnected');
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
        switch (type) {
            case 'message':
                const msgIndex = this.messageListeners.indexOf(callback);
                if (msgIndex > -1) this.messageListeners.splice(msgIndex, 1);
                break;
            case 'status':
                const statusIndex = this.statusListeners.indexOf(callback);
                if (statusIndex > -1) this.statusListeners.splice(statusIndex, 1);
                break;
            case 'error':
                const errorIndex = this.errorListeners.indexOf(callback);
                if (errorIndex > -1) this.errorListeners.splice(errorIndex, 1);
                break;
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
                window.AAAI_LOGGER.error('Error in message listener:', error);
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
                window.AAAI_LOGGER.error('Error in status listener:', error);
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
                window.AAAI_LOGGER.error('Error in error listener:', error);
            }
        });
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
     * Get comprehensive connection status with cache information
     */
    getStatus() {
        const now = Date.now();
        let connectionAge = 0;
        
        if (this.connectionStartTime) {
            connectionAge = now - this.connectionStartTime;
        }
        
        return {
            // Connection Status
            connected: this.isConnected,
            connecting: this.isConnecting,
            connectionId: this.connectionId,
            reconnectToken: this.reconnectToken,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            
            // Message Queue Status
            queuedMessages: this.messageQueue.length,
            pendingMessages: this.pendingMessages.size,
            batchedMessages: this.messageBatch.length,
            
            // WebSocket Status
            readyState: this.socket ? this.socket.readyState : null,
            readyStateName: this.socket ? this._getReadyStateName(this.socket.readyState) : null,
            url: this.socket ? this._maskSensitiveUrl(this.socket.url) : null,
            
            // Connection Timing
            connectionAge: {
                ms: connectionAge,
                seconds: Math.floor(connectionAge / 1000),
                minutes: Math.floor(connectionAge / (1000 * 60)),
                hours: Math.floor(connectionAge / (1000 * 60 * 60)),
                days: Math.floor(connectionAge / (1000 * 60 * 60 * 24))
            },
            lastDisconnectReason: this.lastDisconnectReason,
            lastActivityTime: this.lastActivityTime,
            lastHeartbeatTime: this.lastHeartbeatTime,
            
            // Cache Status
            cache: {
                size: this.cache.size,
                maxSize: this.options.maxCacheSize,
                usage: Math.round((this.cache.size / this.options.maxCacheSize) * 100),
                hits: this.stats.cacheHits,
                misses: this.stats.cacheMisses,
                hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
                    ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100) 
                    : 0,
                messagesFromCache: this.stats.messagesFromCache,
                bandwidthSaved: this.stats.bandwidthSaved,
                compressionEnabled: this.options.enableCompression
            },
            
            // Performance Stats
            stats: {
                totalConnections: this.stats.totalConnections,
                totalReconnections: this.stats.totalReconnections,
                totalMessagesSent: this.stats.totalMessagesSent,
                totalMessagesReceived: this.stats.totalMessagesReceived,
                connectionUptime: this.stats.connectionUptime,
                averageLatency: Math.round(this.stats.averageLatency),
                lastLatency: this.stats.lastLatency
            },
            
            // Feature Status
            features: {
                persistentConnection: this.options.persistentConnection,
                hasPersistentData: this.options.persistentConnection && !!(this.connectionId || this.reconnectToken),
                batchingEnabled: this.options.enableBatching,
                compressionEnabled: this.options.enableCompression,
                cacheEnabled: true
            },
            
            // Configuration
            config: {
                heartbeatInterval: this.options.heartbeatInterval,
                reconnectInterval: this.options.reconnectInterval,
                connectionTimeout: this.options.connectionTimeout,
                messageQueueLimit: this.options.messageQueueLimit,
                batchSize: this.options.batchSize,
                batchTimeout: this.options.batchTimeout,
                cacheExpiry: this.options.cacheExpiry
            }
        };
    },
    
    /**
     * Get cache statistics
     */
    getCacheStats() {
        const totalAccesses = Array.from(this.cacheAccessCount.values()).reduce((sum, count) => sum + count, 0);
        const avgAccessCount = this.cacheAccessCount.size > 0 ? totalAccesses / this.cacheAccessCount.size : 0;
        
        return {
            totalItems: this.cache.size,
            maxItems: this.options.maxCacheSize,
            usagePercent: Math.round((this.cache.size / this.options.maxCacheSize) * 100),
            totalAccesses: totalAccesses,
            averageAccessCount: Math.round(avgAccessCount),
            hits: this.stats.cacheHits,
            misses: this.stats.cacheMisses,
            hitRate: this.stats.cacheHits + this.stats.cacheMisses > 0 
                ? Math.round((this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100) 
                : 0,
            bandwidthSaved: this.stats.bandwidthSaved,
            compressionEnabled: this.options.enableCompression,
            oldestItem: Math.min(...Array.from(this.cacheTimestamps.values())),
            newestItem: Math.max(...Array.from(this.cacheTimestamps.values()))
        };
    },
    
    /**
     * Clear cache manually
     */
    clearCache() {
        const clearedItems = this.cache.size;
        
        this.cache.clear();
        this.cacheIndex.clear();
        this.cacheTimestamps.clear();
        this.cacheAccessCount.clear();
        this.compressionCache.clear();
        
        // Reset cache stats
        this.stats.cacheHits = 0;
        this.stats.cacheMisses = 0;
        this.stats.messagesFromCache = 0;
        this.stats.bandwidthSaved = 0;
        
        window.AAAI_LOGGER.info(`Cleared ${clearedItems} items from cache`);
        
        return clearedItems;
    },
    
    /**
     * Prefill cache with common data
     */
    prefillCache(data) {
        if (!Array.isArray(data)) return;
        
        let cached = 0;
        
        data.forEach(item => {
            if (item && typeof item === 'object') {
                this._cacheMessage(item);
                cached++;
            }
        });
        
        window.AAAI_LOGGER.info(`Prefilled cache with ${cached} items`);
        
        return cached;
    },
    
    /**
     * Export cache for debugging
     */
    exportCache() {
        const exported = {
            items: {},
            timestamps: {},
            accessCounts: {},
            index: {}
        };
        
        for (const [key, value] of this.cache.entries()) {
            exported.items[key] = this._decompressData(value);
            exported.timestamps[key] = this.cacheTimestamps.get(key);
            exported.accessCounts[key] = this.cacheAccessCount.get(key);
        }
        
        for (const [messageId, cacheKey] of this.cacheIndex.entries()) {
            exported.index[messageId] = cacheKey;
        }
        
        return exported;
    },
    
    /**
     * Test connection with debug information
     */
    async testConnection() {
        try {
            if (!this.authService.isAuthenticated()) {
                throw new Error('Authentication required');
            }
            
            const user = this.authService.getCurrentUser();
            const testWsUrl = this._buildWebSocketUrl(user.id);
            
            window.AAAI_LOGGER.info(`Testing WebSocket connection: ${this._maskSensitiveUrl(testWsUrl)}`);
            
            return new Promise((resolve, reject) => {
                const testSocket = new WebSocket(testWsUrl);
                const startTime = Date.now();
                
                testSocket.onopen = (event) => {
                    const latency = Date.now() - startTime;
                    window.AAAI_LOGGER.info(`✅ Test WebSocket connected in ${latency}ms`);
                    testSocket.close();
                    resolve({
                        success: true,
                        latency: latency,
                        timestamp: new Date().toISOString()
                    });
                };
                
                testSocket.onerror = (event) => {
                    window.AAAI_LOGGER.error('❌ Test WebSocket failed');
                    reject(new Error('Test connection failed'));
                };
                
                testSocket.onclose = (event) => {
                    if (event.code !== 1000) {
                        reject(new Error(`Test connection closed with code: ${event.code}`));
                    }
                };
                
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
    },
    
    /**
     * Get detailed diagnostics
     */
    getDiagnostics() {
        const now = Date.now();
        
        return {
            timestamp: new Date().toISOString(),
            uptime: now - (this.connectionStartTime || now),
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            userAgent: navigator.userAgent,
            connection: this.getStatus(),
            cache: this.getCacheStats(),
            messageHistory: {
                count: this.messageHistory.length,
                oldest: this.messageHistory.length > 0 ? this.messageHistory[0].received_at : null,
                newest: this.messageHistory.length > 0 ? this.messageHistory[this.messageHistory.length - 1].received_at : null
            },
            performance: {
                memoryUsage: performance.memory ? {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024)
                } : 'Not available',
                timing: performance.timing ? {
                    pageLoad: performance.timing.loadEventEnd - performance.timing.navigationStart,
                    domReady: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart
                } : 'Not available'
            }
        };
    }
};