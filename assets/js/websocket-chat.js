/**
 * FIXED WebSocket Chat Service - Enhanced Cookie Authentication
 * Addresses WebSocket cookie transmission issues
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
        maxReconnectAttempts: 3,
        heartbeatInterval: 45000,  // Increased to 45 seconds
        connectionTimeout: 20000,  // Increased to 20 seconds
        authTimeout: 15000,        // Increased to 15 seconds
        messageQueueLimit: 20,
        socketReadyTimeout: 5000,  // Increased to 5 seconds
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
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('FIXED ChatService initialized with enhanced cookie authentication');
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
                setTimeout(() => this.connect().catch(err => console.warn('Reconnect failed:', err)), 2000);
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
     * FIXED: Connect with enhanced cookie handling
     */
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

        this._log('🔄 FIXED: Starting WebSocket connection with enhanced cookie support...');

        // FIXED: Enhanced pre-connection validation
        try {
            await this._validateAndPrepareAuthentication();
        } catch (error) {
            this._error('❌ FIXED: Pre-connection preparation failed:', error);
            throw new Error(`Authentication preparation failed: ${error.message}`);
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
     * FIXED: Enhanced authentication validation and preparation
     */
    async _validateAndPrepareAuthentication() {
        this._log('🔍 FIXED: Validating and preparing authentication...');
        
        // Check AuthService state
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('Missing user information from AuthService');
        }
        
        // FIXED: Ensure we have fresh tokens
        try {
            this._log('🔄 FIXED: Ensuring fresh authentication tokens...');
            const refreshResult = await this.authService.refreshTokenIfNeeded();
            this._log(`🔄 FIXED: Token refresh result: ${refreshResult}`);
            
            // Wait for cookies to be set after refresh
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (refreshError) {
            this._log('⚠️ FIXED: Token refresh had issues:', refreshError.message);
            // Continue anyway - the server might still accept existing auth
        }
        
        // FIXED: Check cookie status
        const cookieStatus = this._checkCookieStatus();
        this._log('🍪 FIXED: Cookie status:', cookieStatus);
        
        // FIXED: If no basic cookies, try one more refresh
        if (!cookieStatus.hasBasicAuth) {
            this._log('🔄 FIXED: No basic auth cookies found, attempting additional refresh...');
            try {
                // Force a session validation to ensure cookies are set
                const response = await fetch('/auth/validate-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include'
                });
                
                if (response.ok) {
                    const data = await response.json();
                    this._log('✅ FIXED: Session validation successful:', data.valid);
                    await new Promise(resolve => setTimeout(resolve, 500));
                } else {
                    this._log('⚠️ FIXED: Session validation failed, but continuing...');
                }
            } catch (validationError) {
                this._log('⚠️ FIXED: Session validation error:', validationError.message);
            }
        }
        
        this._log('✅ FIXED: Authentication preparation complete');
        return true;
    },
    
    /**
     * FIXED: Check cookie status for debugging
     */
    _checkCookieStatus() {
        const authenticated = this._getCookie('authenticated');
        const userInfo = this._getCookie('user_info');
        const hasRefreshToken = document.cookie.includes('refresh_token=');
        
        return {
            hasAuthenticated: authenticated === 'true',
            hasUserInfo: !!userInfo,
            hasRefreshToken: hasRefreshToken,
            hasBasicAuth: authenticated === 'true' && !!userInfo,
            cookieCount: document.cookie.split(';').length,
            note: 'access_token is httpOnly - not visible to JavaScript'
        };
    },
    
    /**
     * Get cookie value (for non-httpOnly cookies)
     */
    _getCookie(name) {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) {
                const cookieValue = parts.pop().split(';').shift();
                return decodeURIComponent(cookieValue);
            }
        } catch (error) {
            this._error(`Error reading cookie ${name}:`, error);
        }
        return null;
    },
    
    /**
     * FIXED: Perform connection with enhanced error handling
     */
    async _performEnhancedConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout (increased)
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('FIXED: Overall connection timeout after', this.options.connectionTimeout, 'ms');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout - server may be unavailable'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // FIXED: Create WebSocket with enhanced URL
                const wsUrl = await this._buildEnhancedWebSocketURL();
                this._log(`FIXED: Connecting to: ${wsUrl.replace(/user_id=[^&]+/, 'user_id=***')}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // FIXED: Set up connection timeout specifically for WebSocket open
                const openTimeout = setTimeout(() => {
                    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
                        this._error('FIXED: WebSocket open timeout');
                        this.socket.close();
                        clearTimeout(overallTimeout);
                        reject(new Error('WebSocket open timeout'));
                    }
                }, this.options.socketReadyTimeout);
                
                // FIXED: Enhanced event setup
                this.socket.addEventListener('open', (event) => {
                    clearTimeout(openTimeout);
                    this._log('✅ FIXED: WebSocket opened successfully');
                    this.isConnected = true;
                    
                    // Wait a moment for server to send initial messages
                    setTimeout(() => {
                        if (!this.isAuthenticated && this.isConnecting) {
                            this._log('⚠️ FIXED: No auth confirmation received after open, waiting longer...');
                        }
                    }, 2000);
                });
                
                this.socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('📨 FIXED: Received message:', data.type);
                        
                        // FIXED: Handle immediate connection establishment
                        if (data.type === 'connection_established') {
                            clearTimeout(overallTimeout);
                            clearTimeout(openTimeout);
                            this._handleConnectionEstablished(data);
                            resolve(true);
                            return;
                        }
                        
                        // Handle authentication errors with detailed logging
                        if (data.type === 'error' && this._isAuthError(data)) {
                            clearTimeout(overallTimeout);
                            clearTimeout(openTimeout);
                            this._handleAuthenticationError(data);
                            reject(new Error(this._formatAuthError(data)));
                            return;
                        }
                        
                        // Handle token refresh recommendations
                        if (data.type === 'token_refresh_recommended') {
                            this._log('⚠️ FIXED: Server recommends token refresh');
                            this._refreshTokenInBackground();
                        }
                        
                        // Handle other messages normally
                        this._onMessage(event);
                        
                    } catch (parseError) {
                        this._error('FIXED: Error parsing message:', parseError);
                    }
                });
                
                this.socket.addEventListener('close', (event) => {
                    clearTimeout(openTimeout);
                    this._onClose(event);
                    
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        reject(new Error(`WebSocket closed during connection: ${event.code} - ${event.reason || 'No reason'}`));
                    }
                });
                
                this.socket.addEventListener('error', (event) => {
                    clearTimeout(openTimeout);
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
                this._error('FIXED: Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * FIXED: Build enhanced WebSocket URL with better token handling
     */
    async _buildEnhancedWebSocketURL() {
        const user = this.authService.getCurrentUser();
        if (!user || !user.id) {
            throw new Error('User ID not available for WebSocket connection');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // FIXED: Build base URL
        let url = `${wsProtocol}//${wsHost}/ws/${encodeURIComponent(user.id)}`;
        
        // FIXED: Add fallback token in query params if cookies might not work
        const cookieStatus = this._checkCookieStatus();
        if (!cookieStatus.hasBasicAuth) {
            this._log('⚠️ FIXED: Limited cookie support detected, adding token to URL');
            
            // Get token from AuthService (this might be a placeholder if using cookies)
            const token = this.authService.getToken();
            if (token && token !== 'cookie_stored') {
                url += `?token=${encodeURIComponent(token)}`;
                this._log('🔗 FIXED: Added token to WebSocket URL as fallback');
            } else {
                this._log('🔗 FIXED: Using cookie-only authentication (no URL token)');
            }
        } else {
            this._log('🔗 FIXED: Good cookie support detected, using cookie-only auth');
        }
        
        return url;
    },
    
    /**
     * FIXED: Format authentication error for better user experience
     */
    _formatAuthError(data) {
        const baseMessage = 'Authentication failed';
        
        if (data.debug_info) {
            const debug = data.debug_info;
            
            if (debug.cookies_available && debug.cookies_available.length === 0) {
                return `${baseMessage} - no authentication cookies found. Please refresh the page.`;
            }
            
            if (!debug.has_authenticated_cookie) {
                return `${baseMessage} - session cookie missing. Please refresh the page.`;
            }
            
            if (!debug.has_user_info) {
                return `${baseMessage} - user information missing. Please refresh the page.`;
            }
        }
        
        if (data.message) {
            if (data.message.includes('cookies')) {
                return `${baseMessage} - cookie authentication failed. Please refresh the page.`;
            }
            if (data.message.includes('expired')) {
                return `${baseMessage} - session expired. Please refresh the page.`;
            }
        }
        
        return `${baseMessage} - please refresh the page and try again.`;
    },
    
    /**
     * FIXED: Handle successful connection establishment
     */
    _handleConnectionEstablished(data) {
        this._log('✅ FIXED: Connection established successfully!');
        
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
        
        this._log('🎉 FIXED: WebSocket fully connected and authenticated via', data.auth_method || 'unknown method');
    },
    
    /**
     * FIXED: Handle authentication error with enhanced recovery
     */
    _handleAuthenticationError(data) {
        this._error('❌ FIXED: Authentication failed:', data.message || data.error);
        
        // Clear timeouts
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // FIXED: Enhanced error recovery based on error type
        this._handleAuthenticationFailure(data);
    },
    
    /**
     * FIXED: Enhanced authentication failure handling
     */
    _handleAuthenticationFailure(data) {
        this._log('🔑 FIXED: Processing authentication failure...');
        
        // Close connection
        if (this.socket) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        this._cleanupConnection();
        
        // Analyze the error
        const errorAnalysis = this._analyzeAuthError(data);
        this._log('🔍 FIXED: Error analysis:', errorAnalysis);
        
        // Create appropriate error response
        let errorData = {
            error: 'Authentication failed. Please refresh the page to reconnect.',
            requiresLogin: false,
            requiresPageRefresh: true,
            reason: 'authentication_failed',
            originalError: data,
            analysis: errorAnalysis
        };
        
        if (errorAnalysis.likelyTokenExpired) {
            errorData.error = 'Your session has expired. Please refresh the page to reconnect.';
            errorData.reason = 'session_expired';
        } else if (errorAnalysis.likelyCookieIssue) {
            errorData.error = 'Cookie authentication failed. Please refresh the page to reconnect.';
            errorData.reason = 'cookie_authentication_failed';
        }
        
        this._notifyErrorListeners(errorData);
    },
    
    /**
     * FIXED: Analyze authentication error for better handling
     */
    _analyzeAuthError(data) {
        const analysis = {
            likelyTokenExpired: false,
            likelyCookieIssue: false,
            likleyNetworkIssue: false,
            hasDebugInfo: !!data.debug_info,
            serverResponse: !!data.message
        };
        
        if (data.message) {
            const msg = data.message.toLowerCase();
            analysis.likelyTokenExpired = msg.includes('expired') || msg.includes('invalid');
            analysis.likelyCookieIssue = msg.includes('cookie') || msg.includes('session');
        }
        
        if (data.debug_info) {
            const debug = data.debug_info;
            analysis.noCookiesReceived = debug.cookies_available && debug.cookies_available.length === 0;
            analysis.noAuthCookie = !debug.has_authenticated_cookie;
            analysis.noUserInfo = !debug.has_user_info;
            analysis.likelyCookieIssue = analysis.noCookiesReceived || analysis.noAuthCookie;
        }
        
        if (data.code === 'AUTH_FAILED' || data.code === 'NO_AUTH') {
            analysis.likelyCookieIssue = true;
        }
        
        return analysis;
    },
    
    /**
     * Check if error is authentication related
     */
    _isAuthError(data) {
        if (data.code === 'AUTH_FAILED' || data.code === 'NO_AUTH') return true;
        if (data.message && data.message.toLowerCase().includes('authentication')) return true;
        if (data.message && data.message.toLowerCase().includes('token')) return true;
        if (data.message && data.message.toLowerCase().includes('expired')) return true;
        if (data.message && data.message.toLowerCase().includes('session')) return true;
        if (data.message && data.message.toLowerCase().includes('cookie')) return true;
        return false;
    },
    
    /**
     * FIXED: Refresh token in background
     */
    async _refreshTokenInBackground() {
        try {
            this._log('🔄 FIXED: Background token refresh started');
            await this.authService.refreshTokenIfNeeded();
            this._log('✅ FIXED: Background token refresh completed');
        } catch (error) {
            this._error('❌ FIXED: Background token refresh failed:', error);
        }
    },
    
    /**
     * Handle WebSocket message
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat
            if (data.type === 'ping' || data.type === 'heartbeat') {
                this._sendMessageWithRetry({ 
                    type: 'pong',
                    timestamp: data.timestamp 
                }).catch(err => 
                    this._error('Failed to send pong:', err)
                );
                return;
            }
            
            if (data.type === 'pong' || data.type === 'heartbeat_ack') {
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
     * Handle session expiration
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
        this._log('🔌 FIXED: WebSocket closed', { code: event.code, reason: event.reason });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // FIXED: Better reconnection logic based on close codes
        const shouldReconnect = this._shouldReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('FIXED: Not reconnecting', { 
                code: event.code, 
                reason: event.reason,
                authenticated: this.authService.isAuthenticated(),
                shouldReconnect: shouldReconnect
            });
        }
    },
    
    /**
     * Handle WebSocket error
     */
    _onError(event) {
        this._error('💥 FIXED: WebSocket error:', event);
        this._notifyStatusChange('error');
        this._notifyErrorListeners({ 
            error: 'WebSocket connection error', 
            event: event,
            type: 'websocket_error'
        });
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
     * FIXED: Determine if we should attempt reconnection
     */
    _shouldReconnect(code) {
        // Don't reconnect on authentication failures or normal closures
        const noReconnectCodes = [
            1000,  // Normal closure
            1001,  // Going away
            1005,  // No status received
            4000,  // Session expired
            4001,  // Authentication failed
            4002,  // User ID mismatch
            4403   // Forbidden
        ];
        
        const shouldReconnect = !noReconnectCodes.includes(code) && 
                               this.reconnectAttempts < this.options.maxReconnectAttempts;
        
        this._log(`FIXED: Reconnect decision for code ${code}: ${shouldReconnect} (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);
        
        return shouldReconnect;
    },
    
    /**
     * FIXED: Schedule reconnection attempt with better timing
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this._error('FIXED: Max reconnect attempts reached');
            this._notifyStatusChange('failed');
            return;
        }
        
        this.reconnectAttempts++;
        
        // FIXED: Better backoff strategy with jitter
        const baseDelay = this.options.reconnectInterval;
        const exponentialDelay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
        const jitter = Math.random() * 2000; // 0-2 seconds random jitter
        const delay = exponentialDelay + jitter;
        
        this._log(`⏰ FIXED: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${Math.round(delay)}ms`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isAuthenticated && this.authService.isAuthenticated()) {
                try {
                    this._log(`🔄 FIXED: Attempting reconnect ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}`);
                    await this.connect();
                } catch (error) {
                    this._error('FIXED: Reconnect failed:', error);
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
                if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this._sendHeartbeat();
                }
            }, this.options.heartbeatInterval);
            
            this._log('💓 FIXED: Heartbeat started with', this.options.heartbeatInterval, 'ms interval');
        }
    },
    
    /**
     * Stop heartbeat mechanism
     */
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
            this._log('💓 Heartbeat stopped');
        }
    },
    
    /**
     * Send heartbeat message
     */
    _sendHeartbeat() {
        try {
            this._sendMessageWithRetry({ 
                type: 'ping', 
                timestamp: new Date().toISOString(),
                connection_age: Date.now() - (this.connectionStartTime || Date.now())
            }).catch(error => {
                this._error('Heartbeat failed:', error);
            });
            
            this._log('💓 Heartbeat sent');
            
        } catch (error) {
            this._error('Heartbeat failed:', error);
        }
    },
    
    /**
     * Send message through WebSocket with retry logic
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
     * Send message with retry logic
     */
    async _sendMessageWithRetry(messageData, maxRetries = 3) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
                    throw new Error('WebSocket not ready');
                }
                
                const messageStr = JSON.stringify(messageData);
                this.socket.send(messageStr);
                
                this._log('✅ FIXED: Message sent successfully:', messageData.type);
                return;
                
            } catch (error) {
                lastError = error;
                this._error(`❌ FIXED: Send attempt ${attempt} failed:`, error);
                
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 500 * attempt)); // Increased delay
                }
            }
        }
        
        throw lastError || new Error('Failed to send message after retries');
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
        this._log('🔌 FIXED: Disconnecting');
        
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
    
    // Event listener management methods remain the same...
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
    
    // Notification methods remain the same...
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
     * FIXED: Get enhanced connection status
     */
    getStatus() {
        const cookieStatus = this._checkCookieStatus();
        
        return {
            connected: this.isConnected,
            authenticated: this.isAuthenticated,
            connecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            maxReconnectAttempts: this.options.maxReconnectAttempts,
            queuedMessages: this.messageQueue.length,
            readyState: this.socket ? this.socket.readyState : null,
            readyStateName: this.socket ? this._getReadyStateName(this.socket.readyState) : 'NONE',
            authServiceValid: this.authService ? this.authService.isAuthenticated() : false,
            cookieStatus: cookieStatus,
            lastError: this.lastError || null,
            connectionAge: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0
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
     * FIXED: Force reconnect with enhanced preparation
     */
    async forceReconnect() {
        this._log('🔄 FIXED: Force reconnecting with enhanced preparation...');
        
        // Disconnect first
        this.disconnect();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check authentication
        if (!this.authService.isAuthenticated()) {
            throw new Error('Cannot reconnect: Authentication invalid');
        }
        
        // FIXED: Try to refresh authentication before reconnecting
        try {
            this._log('🔄 FIXED: Refreshing authentication before force reconnect...');
            await this.authService.refreshTokenIfNeeded();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cookies
        } catch (error) {
            this._log('⚠️ FIXED: Auth refresh failed during force reconnect:', error.message);
        }
        
        // Reset reconnect attempts
        this.reconnectAttempts = 0;
        
        // Attempt connection
        return this.connect();
    },
    
    /**
     * Utility methods
     */
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService FIXED]', ...args);
        } else if (this.options.debug) {
            console.log('[ChatService FIXED]', ...args);
        }
    },
    
    _error(...args) {
        this.lastError = args.join(' ');
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService FIXED]', ...args);
        } else {
            console.error('[ChatService FIXED]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}