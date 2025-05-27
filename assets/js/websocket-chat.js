/**
 * FIXED WebSocket Chat Service - Resolves authentication and connection issues
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
    authTimeout: null,
    connectionPromise: null,
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    authSuccessListeners: [],
    authErrorListeners: [],
    
    // Configuration
    options: {
        reconnectInterval: 5000,
        maxReconnectAttempts: 3, // Reduced to avoid spam
        heartbeatInterval: 30000,
        connectionTimeout: 15000,
        authTimeout: 10000,
        messageQueueLimit: 20,
        socketReadyTimeout: 3000,
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
        
        // Bind methods to maintain context
        this._onOpen = this._onOpen.bind(this);
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('FIXED ChatService initialized');
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
        
        // Handle session expiration
        window.addEventListener('sessionExpired', () => {
            this._log('Session expired, disconnecting WebSocket');
            this._handleSessionExpired();
        });
        
        // Handle network changes
        window.addEventListener('online', () => {
            this._log('Network online');
            if (this.authService.isAuthenticated() && !this.isConnected) {
                setTimeout(() => this.connect().catch(err => console.warn('Reconnect failed:', err)), 1000);
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
     * FIXED: Connect with improved authentication flow
     */
    _isTokenValidForWebSocket(token) {
        try {
            if (!token) return false;
            
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            // WebSocket needs longer buffer (10 minutes instead of 5)
            return payload.exp && payload.exp > (now + 600);
        } catch (error) {
            this._error('Token validation error:', error);
            return false;
        }
    },

    _getEnhancedWebSocketURL() {
        const user = this.authService.getCurrentUser();
        if (!user || !user.id) {
            throw new Error('User ID not available for WebSocket connection');
        }
        
        const token = this.authService.getToken();
        if (!token) {
            throw new Error('Authentication token not available');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // Enhanced parameters
        const params = new URLSearchParams({
            token: token,
            t: Date.now().toString(),
            client: 'web',
            version: window.AAAI_CONFIG?.VERSION || '1.0',
            retry: this.reconnectAttempts.toString()
        });
        
        return `${wsProtocol}//${wsHost}/ws/${user.id}?${params.toString()}`;
    },

    _onEnhancedMessage(event, connectResolve, connectReject, overallTimeout) {
        try {
            const data = JSON.parse(event.data);
            this._log('📨 Enhanced message received:', data.type);
            
            // Handle authentication responses
            if (data.type === 'auth_success' || data.type === 'authenticated' || data.type === 'connection_established') {
                clearTimeout(overallTimeout);
                if (this.authTimeout) {
                    clearTimeout(this.authTimeout);
                    this.authTimeout = null;
                }
                
                this._log('✅ Enhanced WebSocket authentication successful');
                this.isAuthenticated = true;
                this.isConnecting = false;
                this.reconnectAttempts = 0;
                
                this._notifyStatusChange('connected');
                this._notifyAuthSuccess(data);
                this._startHeartbeat();
                this._processQueuedMessages();
                
                if (connectResolve) {
                    connectResolve(true);
                }
                return;
            }
            
            // Handle authentication errors
            if (data.type === 'auth_error' || data.type === 'authentication_failed' || data.type === 'error') {
                clearTimeout(overallTimeout);
                
                this._error('❌ Enhanced authentication error:', data);
                
                if (connectReject) {
                    connectReject(new Error(`Enhanced authentication failed: ${data.message || 'Unknown error'}`));
                }
                
                this._handleAuthenticationError(data);
                return;
            }
            
            // Handle other messages normally
            this._onMessage(event);
            
        } catch (error) {
            this._error('❌ Error processing enhanced message:', error);
            if (connectReject) {
                connectReject(error);
            }
        }
    },
    
    async _performEnhancedConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Increased timeouts for WebSocket
            const CONNECTION_TIMEOUT = 20000; // 20 seconds
            const AUTH_TIMEOUT = 15000; // 15 seconds
            
            const overallTimeout = setTimeout(() => {
                this._error('❌ Enhanced connection timeout');
                this._cleanupConnection();
                reject(new Error('WebSocket connection timeout (enhanced)'));
            }, CONNECTION_TIMEOUT + AUTH_TIMEOUT);
            
            try {
                // Get fresh URL with timestamp
                const wsUrl = this._getEnhancedWebSocketURL();
                this._log(`🔌 Enhanced connection to: ${this._maskUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // Enhanced open handler
                this.socket.addEventListener('open', async (event) => {
                    this._log('✅ WebSocket opened, beginning enhanced authentication...');
                    this.isConnected = true;
                    
                    try {
                        // Wait for socket stability with error detection
                        await this._waitForSocketStabilization();
                        
                        if (this.socket.readyState !== WebSocket.OPEN) {
                            throw new Error('Socket closed during stabilization');
                        }
                        
                        // Enhanced authentication
                        await this._performEnhancedAuthentication();
                        
                    } catch (error) {
                        this._error('❌ Enhanced authentication failed:', error);
                        clearTimeout(overallTimeout);
                        reject(error);
                    }
                });
                
                // Enhanced message handler
                this.socket.addEventListener('message', (event) => {
                    this._onEnhancedMessage(event, resolve, reject, overallTimeout);
                });
                
                this.socket.addEventListener('close', (event) => {
                    clearTimeout(overallTimeout);
                    this._onClose(event);
                });
                
                this.socket.addEventListener('error', (event) => {
                    clearTimeout(overallTimeout);
                    this._onError(event);
                    if (this.isConnecting) {
                        this.isConnecting = false;
                        reject(new Error('Enhanced WebSocket connection failed'));
                    }
                });
                
            } catch (error) {
                clearTimeout(overallTimeout);
                this.isConnecting = false;
                this._error('❌ Enhanced connection setup error:', error);
                reject(error);
            }
        });
    },


    async _performEnhancedAuthentication() {
        const token = this.authService.getToken();
        const user = this.authService.getCurrentUser();
        
        if (!token || !user.id) {
            throw new Error('Missing authentication credentials for enhanced auth');
        }
        
        // Enhanced authentication message
        const authMessage = {
            type: 'authenticate',
            token: token,
            userId: user.id,
            email: user.email,
            timestamp: new Date().toISOString(),
            client: 'web-enhanced',
            version: window.AAAI_CONFIG?.VERSION || '1.0',
            capabilities: ['message_queue', 'real_time', 'components'],
            reconnectAttempt: this.reconnectAttempts
        };
        
        this._log('🔐 Sending enhanced authentication message...');
        
        // Send with multiple attempts
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
            try {
                await this._sendMessageWithRetry(authMessage, 1);
                break;
            } catch (error) {
                attempts++;
                if (attempts >= maxAttempts) {
                    throw new Error(`Enhanced authentication failed after ${maxAttempts} attempts: ${error.message}`);
                }
                
                this._log(`⚠️ Auth attempt ${attempts} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            }
        }
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('❌ Enhanced authentication timeout - no response from server');
                if (this.socket) {
                    this.socket.close(4001, 'Enhanced authentication timeout');
                }
            }
        }, 15000); // 15 second timeout
    },

    async connect() {
        if (!this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }
    
        if (this.isConnected && this.isAuthenticated) {
            this._log('Already connected and authenticated');
            return true;
        }
    
        // If already connecting, return the existing promise
        if (this.isConnecting && this.connectionPromise) {
            this._log('Connection already in progress, waiting...');
            return this.connectionPromise;
        }
    
        // ENHANCED: More aggressive token refresh
        this._log('🔄 Performing comprehensive token validation before WebSocket connection...');
        try {
            // Check token expiration
            const token = this.authService.getToken();
            if (!token) {
                throw new Error('No authentication token available');
            }
    
            // Validate token expiration (more generous buffer)
            const isValid = this._isTokenValidForWebSocket(token);
            if (!isValid) {
                this._log('⚠️ Token expired or expiring soon, forcing refresh...');
                
                // Try multiple refresh methods
                let refreshed = false;
                
                // Method 1: Force refresh if available
                if (typeof this.authService.forceTokenRefresh === 'function') {
                    this._log('🔄 Attempting forceTokenRefresh...');
                    refreshed = await this.authService.forceTokenRefresh();
                }
                
                // Method 2: Standard refresh
                if (!refreshed) {
                    this._log('🔄 Attempting standard refresh...');
                    refreshed = await this.authService.refreshTokenIfNeeded();
                }
                
                // Method 3: Silent refresh
                if (!refreshed) {
                    this._log('🔄 Attempting silent refresh...');
                    try {
                        const response = await fetch('/auth/refresh-silent', {
                            method: 'POST',
                            credentials: 'include'
                        });
                        refreshed = response.ok;
                    } catch (error) {
                        this._log('❌ Silent refresh failed:', error.message);
                    }
                }
                
                if (!refreshed) {
                    throw new Error('All token refresh methods failed');
                }
                
                // Verify the new token
                const newToken = this.authService.getToken();
                if (!this._isTokenValidForWebSocket(newToken)) {
                    throw new Error('Token refresh resulted in invalid token');
                }
                
                this._log('✅ Token successfully refreshed and validated');
            } else {
                this._log('✅ Token is valid for WebSocket connection');
            }
            
        } catch (error) {
            this._error('❌ Token preparation failed:', error);
            // Continue anyway - the server will reject if truly invalid
            this._log('⚠️ Continuing with current token despite refresh failure');
        }
    
        // Create new connection promise
        this.connectionPromise = this._performEnhancedConnection();
        
        try {
            const result = await this.connectionPromise;
            this.connectionPromise = null;
            return result;
        } catch (error) {
            this.connectionPromise = null;
            throw error;
        }
    },
    
    /**
     * FIXED: Perform the actual connection with better error handling
     */
    async _performConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('Overall connection timeout');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // FIXED: Don't try to refresh token - use existing valid token
                if (!this.authService.isTokenValid()) {
                    throw new Error('Token is invalid or expired');
                }
                
                // Create WebSocket
                const wsUrl = this._getWebSocketURL();
                this._log(`Connecting to: ${this._maskUrl(wsUrl)}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // Enhanced event setup
                this.socket.addEventListener('open', async (event) => {
                    this._log('✅ WebSocket opened, waiting for ready state...');
                    this.isConnected = true;
                    
                    try {
                        // Wait for socket to be ready
                        await this._waitForSocketReady();
                        
                        // Send authentication immediately
                        await this._performAuthentication();
                        
                        // Don't resolve here - wait for auth success message
                        
                    } catch (error) {
                        clearTimeout(overallTimeout);
                        this._error('❌ Authentication setup failed:', error);
                        this._cleanupConnection();
                        reject(error);
                    }
                });
                
                this.socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('📨 Received message:', data.type);
                        
                        // Handle authentication success
                        if (data.type === 'auth_success' || data.type === 'authenticated') {
                            clearTimeout(overallTimeout);
                            this._handleAuthenticationSuccess(data);
                            resolve(true);
                            return;
                        }
                        
                        // Handle authentication error
                        if (data.type === 'auth_error' || data.type === 'authentication_failed' || 
                            (data.type === 'error' && data.code === 'AUTH_FAILED')) {
                            clearTimeout(overallTimeout);
                            this._handleAuthenticationError(data);
                            reject(new Error(data.message || 'Authentication failed'));
                            return;
                        }
                        
                        // Handle other messages normally
                        this._onMessage(event);
                        
                    } catch (parseError) {
                        this._error('Error parsing message:', parseError);
                    }
                });
                
                this.socket.addEventListener('close', this._onClose);
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection failed'));
                    }
                });
                
            } catch (error) {
                clearTimeout(overallTimeout);
                this.isConnecting = false;
                this._error('Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Wait for socket to be ready
     */
    async _waitForSocketReady() {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            const maxWaitTime = this.options.socketReadyTimeout;
            
            const checkReady = () => {
                const elapsed = Date.now() - startTime;
                
                if (!this.socket) {
                    reject(new Error('WebSocket is null'));
                    return;
                }
                
                const isReady = this.socket.readyState === WebSocket.OPEN;
                this._log(`🔍 Socket ready check: readyState=${this.socket.readyState}, elapsed=${elapsed}ms`);
                
                if (isReady) {
                    this._log('✅ WebSocket is ready');
                    resolve();
                } else if (elapsed > maxWaitTime) {
                    this._error('⏰ Socket ready timeout exceeded');
                    reject(new Error('Socket ready timeout'));
                } else {
                    setTimeout(checkReady, 50);
                }
            };
            
            checkReady();
        });
    },
    
    /**
     * FIXED: Perform authentication with current token
     */
    async _performAuthentication() {
        const token = this.authService.getToken();
        if (!token) {
            throw new Error('No authentication token available');
        }
        
        const authMessage = {
            type: 'authenticate',
            token: token,
            userId: this.authService.userId,
            timestamp: new Date().toISOString()
        };
        
        this._log('🔐 Sending authentication message...');
        
        // Send authentication message
        await this._sendMessageWithRetry(authMessage, 3);
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('❌ Authentication timeout - no response from server');
                if (this.socket) {
                    this.socket.close(4001, 'Authentication timeout');
                }
            }
        }, this.options.authTimeout);
    },
    
    /**
     * Send message with retry logic
     */
    async _sendMessageWithRetry(messageData, maxRetries = 1) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this._log(`📤 Sending message (attempt ${attempt}/${maxRetries}):`, messageData.type);
                
                if (this.socket?.readyState !== WebSocket.OPEN) {
                    throw new Error('WebSocket not ready');
                }
                
                const messageStr = JSON.stringify(messageData);
                this.socket.send(messageStr);
                
                this._log('✅ Message sent successfully:', messageData.type);
                return;
                
            } catch (error) {
                lastError = error;
                this._error(`❌ Send attempt ${attempt} failed:`, error);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                }
            }
        }
        
        throw lastError;
    },
    
    /**
     * FIXED: Get WebSocket URL (no token in URL)
     */
    _getWebSocketURL() {
        return this.authService.getWebSocketURL(this.authService.userId);
    },
    
    /**
     * Handle WebSocket message
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat
            if (data.type === 'ping') {
                this._sendMessageWithRetry({ type: 'pong' }).catch(err => 
                    this._error('Failed to send pong:', err)
                );
                return;
            }
            
            if (data.type === 'pong') {
                return; // Heartbeat acknowledged
            }
            
            // Handle regular messages (only if authenticated)
            if (this.isAuthenticated) {
                this._notifyMessageListeners(data);
            } else {
                this._log('⚠️ Received message before authentication, ignoring:', data.type);
            }
            
        } catch (error) {
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * Handle successful authentication
     */
    _handleAuthenticationSuccess(data) {
        this._log('✅ Authentication successful');
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        this._notifyStatusChange('connected');
        this._notifyAuthSuccess(data);
        
        // Start heartbeat
        this._startHeartbeat();
        
        // Process queued messages
        this._processQueuedMessages();
    },
    
    /**
     * FIXED: Handle authentication failure without token refresh
     */
    _handleAuthenticationError(data) {
        this._error('❌ Authentication failed:', data.message || data.error);
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // FIXED: Don't attempt token refresh - notify about session expiration instead
        this._handleAuthenticationFailure(data);
    },
    
    /**
     * FIXED: Handle authentication failure properly
     */
    _handleAuthenticationFailure(data) {
        this._log('🔑 Authentication failed, session may be expired');
        
        // Close connection
        if (this.socket) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        this._cleanupConnection();
        
        // Notify about session expiration
        const errorData = {
            error: 'Session expired - please refresh the page and log in again',
            requiresLogin: true,
            requiresPageRefresh: true,
            originalError: data
        };
        
        this._notifyErrorListeners(errorData);
        
        // Clear auth state in AuthService
        if (this.authService && typeof this.authService._handleTokenExpiration === 'function') {
            this.authService._handleTokenExpiration();
        }
    },
    
    /**
     * FIXED: Handle session expiration from AuthService
     */
    _handleSessionExpired() {
        this._log('🔑 Session expired event received');
        
        this.isAuthenticated = false;
        
        if (this.socket) {
            this.socket.close(4000, 'Session expired');
        }
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // Clear message queue
        this.messageQueue = [];
    },
    
    /**
     * Handle WebSocket close
     */
    _onClose(event) {
        this._log('🔌 WebSocket closed', { code: event.code, reason: event.reason });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // FIXED: Better reconnection logic
        const shouldReconnect = this._shouldReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated() && this.authService.isTokenValid()) {
            this._scheduleReconnect();
        } else {
            this._log('Not reconnecting', { 
                code: event.code, 
                authenticated: this.authService.isAuthenticated(),
                tokenValid: this.authService.isTokenValid()
            });
        }
    },
    
    /**
     * Handle WebSocket error
     */
    _onError(event) {
        this._error('💥 WebSocket error:', event);
        this._notifyStatusChange('error');
        this._notifyErrorListeners({ error: 'WebSocket error', event });
    },
    
    /**
     * Clean up connection state
     */
    _cleanupConnection() {
        this.isConnected = false;
        this.isConnecting = false;
        this.isAuthenticated = false;
        
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this._stopHeartbeat();
    },
    
    /**
     * Determine if we should attempt reconnection
     */
    _shouldReconnect(code) {
        // Don't reconnect on authentication failures or normal closures
        const noReconnectCodes = [1000, 1001, 1005, 4000, 4001, 4403];
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
        
        const delay = Math.min(
            this.options.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1),
            30000
        );
        
        this._log(`⏰ Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${delay}ms`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isAuthenticated && this.authService.isAuthenticated() && this.authService.isTokenValid()) {
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
                if (this.isAuthenticated) {
                    this._sendHeartbeat();
                }
            }, this.options.heartbeatInterval);
            
            this._log('💓 Heartbeat started');
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
            this._sendMessageWithRetry({ 
                type: 'ping', 
                timestamp: new Date().toISOString() 
            }).catch(error => {
                this._error('Heartbeat failed:', error);
            });
            
            this._log('💓 Heartbeat sent');
            
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
        
        if (this.isAuthenticated) {
            try {
                await this._sendMessageWithRetry(messageData);
                return messageData.id;
            } catch (error) {
                this._error('Send error:', error);
                throw error;
            }
        } else if (this.isConnected && !this.isAuthenticated) {
            // Connected but not authenticated yet - queue message
            this._queueMessage(messageData);
            return messageData.id;
        } else {
            // Not connected - queue message and try to connect
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
     * Queue message for later sending
     */
    _queueMessage(messageData) {
        if (this.messageQueue.length >= this.options.messageQueueLimit) {
            this.messageQueue.shift();
        }
        
        this.messageQueue.push({
            ...messageData,
            queued_at: Date.now()
        });
        
        this._log(`📥 Message queued (${this.messageQueue.length}/${this.options.messageQueueLimit})`);
    },
    
    /**
     * Process all queued messages
     */
    async _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        let sent = 0;
        for (const messageData of messages) {
            try {
                await this._sendMessageWithRetry(messageData);
                sent++;
            } catch (error) {
                this._error('Failed to send queued message:', error);
                this._queueMessage(messageData);
            }
        }
        
        this._log(`📤 Processed queued messages: ${sent} sent`);
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
        this._log('🔌 Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this._cleanupConnection();
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
        
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this._stopHeartbeat();
        this.connectionPromise = null;
    },
    
    /**
     * Event listener management
     */
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
    
    onAuthSuccess(callback) {
        if (typeof callback === 'function') {
            this.authSuccessListeners.push(callback);
        }
    },
    
    onAuthError(callback) {
        if (typeof callback === 'function') {
            this.authErrorListeners.push(callback);
        }
    },
    
    removeListener(type, callback) {
        const listeners = {
            'message': this.messageListeners,
            'status': this.statusListeners,
            'error': this.errorListeners,
            'authSuccess': this.authSuccessListeners,
            'authError': this.authErrorListeners
        };
        
        const array = listeners[type];
        if (array) {
            const index = array.indexOf(callback);
            if (index > -1) array.splice(index, 1);
        }
    },
    
    /**
     * Notification methods
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
    
    _notifyStatusChange(status) {
        this.statusListeners.forEach(callback => {
            try {
                callback(status);
            } catch (error) {
                this._error('Error in status listener:', error);
            }
        });
    },
    
    _notifyErrorListeners(data) {
        this.errorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in error listener:', error);
            }
        });
    },
    
    _notifyAuthSuccess(data) {
        this.authSuccessListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in auth success listener:', error);
            }
        });
    },
    
    _notifyAuthError(data) {
        this.authErrorListeners.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                this._error('Error in auth error listener:', error);
            }
        });
    },
    
    /**
     * Get connection status
     */
    getStatus() {
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null,
            authServiceValid: this.authService ? this.authService.isAuthenticated() : false,
            tokenValid: this.authService ? this.authService.isTokenValid() : false
        };
    },
    
    /**
     * FIXED: Force reconnect with fresh authentication
     */
    async forceReconnect() {
        this._log('🔄 Force reconnecting...');
        
        // Disconnect first
        this.disconnect();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check authentication
        if (!this.authService.isAuthenticated() || !this.authService.isTokenValid()) {
            throw new Error('Cannot reconnect: Authentication invalid');
        }
        
        // Reset reconnect attempts
        this.reconnectAttempts = 0;
        
        // Attempt connection
        return this.connect();
    },
    
    /**
     * Utility methods
     */
    _maskUrl(url) {
        return url.replace(/token=[^&]*/, 'token=***');
    },
    
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

// FIXED: Enhanced debug function
if (typeof window !== 'undefined') {
    window.debugChatService = function() {
        console.log('🔍 === FIXED ChatService Debug Information ===');
        
        if (!window.ChatService) {
            console.error('❌ ChatService not available');
            return;
        }
        
        const status = ChatService.getStatus();
        console.log('📊 Connection Status:', status);
        
        if (window.AuthService) {
            const authInfo = window.AuthService.getSessionInfo();
            console.log('🔑 Auth Status:', authInfo);
            
            if (authInfo.tokenValid && window.AuthService.getToken()) {
                try {
                    const token = window.AuthService.getToken();
                    const parts = token.split('.');
                    if (parts.length === 3) {
                        const payload = JSON.parse(atob(parts[1]));
                        const now = Math.floor(Date.now() / 1000);
                        console.log('🎫 Token Details:', {
                            expiresAt: new Date(payload.exp * 1000).toISOString(),
                            expiresIn: payload.exp - now,
                            isExpired: payload.exp <= now,
                            userId: payload.sub || payload.user_id
                        });
                    }
                } catch (e) {
                    console.warn('🎫 Could not parse token details');
                }
            }
        }
        
        console.log('⚙️ Configuration:', {
            environment: window.AAAI_CONFIG?.ENVIRONMENT,
            websocketsEnabled: window.AAAI_CONFIG?.ENABLE_WEBSOCKETS,
            debug: window.AAAI_CONFIG?.ENABLE_DEBUG
        });
        
        console.log('🔍 === End Debug Information ===');
    };
    
    // Auto-run debug after initialization
    setTimeout(() => {
        if (typeof window.debugChatService === 'function') {
            console.log('🔍 Auto-running FIXED ChatService debug...');
            window.debugChatService();
        }
    }, 3000);
}