/**
 * ENHANCED WebSocket Chat Service with Robust Cookie Authentication
 * Fixes authentication failures and improves connection reliability
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
        heartbeatInterval: 30000,
        connectionTimeout: 15000,
        authTimeout: 10000,
        messageQueueLimit: 20,
        socketReadyTimeout: 3000,
        preAuthValidationDelay: 1000,
        cookieWaitTime: 2000,
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
        
        this._log('ENHANCED ChatService initialized for robust cookie authentication');
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
     * ENHANCED: Connect with comprehensive authentication validation
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

        this._log('🔄 ENHANCED: Starting comprehensive WebSocket connection process...');

        // ENHANCED: Multi-step authentication validation
        try {
            await this._performComprehensiveAuthValidation();
        } catch (error) {
            this._error('❌ ENHANCED: Comprehensive auth validation failed:', error);
            throw new Error(`Authentication validation failed: ${error.message}`);
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
     * ENHANCED: Comprehensive authentication validation before connection
     */
    async _performComprehensiveAuthValidation() {
        this._log('🔍 ENHANCED: Starting comprehensive authentication validation...');
        
        // Step 1: Basic AuthService validation
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('Missing user information from AuthService');
        }
        
        this._log('✅ Step 1: AuthService user validation passed');
        
        // Step 2: Check for JavaScript-accessible cookies
        const hasAuthCookie = this._getCookie('authenticated') === 'true';
        const hasUserInfo = !!this._getCookie('user_info');
        
        this._log('🍪 Step 2: Cookie status check:', {
            authenticated: hasAuthCookie,
            userInfo: hasUserInfo,
            note: 'access_token is httpOnly - server validates it'
        });
        
        // Step 3: If missing basic indicators, perform refresh
        if (!hasAuthCookie || !hasUserInfo) {
            this._log('🔄 Step 3: Missing basic indicators, performing token refresh...');
            
            try {
                const refreshResult = await this.authService.refreshTokenIfNeeded();
                this._log('🔄 Token refresh result:', refreshResult);
                
                // Wait for cookies to be properly set
                await new Promise(resolve => setTimeout(resolve, this.options.cookieWaitTime));
                
                // Recheck cookies after refresh
                const newHasAuthCookie = this._getCookie('authenticated') === 'true';
                const newHasUserInfo = !!this._getCookie('user_info');
                
                this._log('🍪 Post-refresh cookie status:', {
                    authenticated: newHasAuthCookie,
                    userInfo: newHasUserInfo
                });
                
                if (!newHasAuthCookie && !newHasUserInfo) {
                    this._log('⚠️ Still missing basic indicators, but proceeding (server handles httpOnly cookies)');
                }
                
            } catch (refreshError) {
                this._error('❌ Token refresh failed:', refreshError);
                throw new Error(`Token refresh failed: ${refreshError.message}`);
            }
        }
        
        // Step 4: Server-side session validation
        try {
            this._log('🔍 Step 4: Validating session with server...');
            const validationResult = await this._validateSessionWithServer();
            
            if (!validationResult.valid) {
                throw new Error(`Server session validation failed: ${validationResult.reason}`);
            }
            
            this._log('✅ Step 4: Server session validation passed');
            
        } catch (validationError) {
            this._error('❌ Server validation failed:', validationError);
            
            if (validationError.message.includes('expired') || validationError.message.includes('unauthorized')) {
                // Try one more refresh
                this._log('🔄 Attempting recovery refresh...');
                try {
                    await this.authService.refreshTokenIfNeeded();
                    await new Promise(resolve => setTimeout(resolve, this.options.cookieWaitTime));
                    
                    // Try validation again
                    const retryValidation = await this._validateSessionWithServer();
                    if (!retryValidation.valid) {
                        throw new Error('Session validation failed after refresh');
                    }
                    
                    this._log('✅ Recovery refresh successful');
                    
                } catch (recoveryError) {
                    throw new Error(`Session recovery failed: ${recoveryError.message}`);
                }
            } else {
                throw validationError;
            }
        }
        
        // Step 5: Additional delay to ensure all cookies are properly set
        this._log('⏱️ Step 5: Final cookie stabilization delay...');
        await new Promise(resolve => setTimeout(resolve, this.options.preAuthValidationDelay));
        
        this._log('✅ ENHANCED: Comprehensive authentication validation completed successfully');
        return true;
    },
    
    /**
     * ENHANCED: Validate session with server
     */
    async _validateSessionWithServer() {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        try {
            const response = await fetch('/auth/validate-session', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Important: include cookies
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            this._log('📋 Server validation result:', {
                valid: data.valid,
                source: data.source,
                reason: data.reason
            });
            
            return data;
            
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('Session validation timed out');
            }
            throw error;
        }
    },
    
    /**
     * Get cookie value with enhanced error handling
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
            // Only log non-httpOnly cookie errors
            if (name !== 'access_token' && name !== 'refresh_token') {
                this._error(`Error reading cookie ${name}:`, error);
            }
        }
        return null;
    },
    
    /**
     * ENHANCED: Perform connection with improved error handling
     */
    async _performEnhancedConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this._notifyStatusChange('connecting');
            
            // Set overall timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('ENHANCED: Overall connection timeout');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout - server may be unavailable'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // Create WebSocket with enhanced URL
                const wsUrl = this._getEnhancedWebSocketURL();
                this._log(`ENHANCED: Connecting to: ${wsUrl.replace(/user_id=[^&]*/, 'user_id=***')}`);
                
                this.socket = new WebSocket(wsUrl);
                
                // ENHANCED: Comprehensive event handling
                this.socket.addEventListener('open', (event) => {
                    this._log('✅ ENHANCED: WebSocket opened successfully');
                    this.isConnected = true;
                    
                    // The server should automatically validate cookies and respond
                    // Set a timeout for authentication response
                    this.authTimeout = setTimeout(() => {
                        if (!this.isAuthenticated) {
                            this._error('❌ ENHANCED: Authentication timeout - no response from server');
                            this._cleanupConnection();
                            reject(new Error('Authentication timeout - server did not confirm authentication'));
                        }
                    }, this.options.authTimeout);
                });
                
                this.socket.addEventListener('message', (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        this._log('📨 ENHANCED: Received message:', data.type);
                        
                        // ENHANCED: Handle authentication responses
                        if (data.type === 'connection_established' || data.type === 'authenticated') {
                            clearTimeout(overallTimeout);
                            clearTimeout(this.authTimeout);
                            this._handleEnhancedAuthenticationSuccess(data);
                            resolve(true);
                            return;
                        }
                        
                        // Handle authentication errors with detailed analysis
                        if (data.type === 'error' && this._isAuthError(data)) {
                            clearTimeout(overallTimeout);
                            clearTimeout(this.authTimeout);
                            this._handleEnhancedAuthenticationError(data);
                            reject(new Error(this._formatAuthError(data)));
                            return;
                        }
                        
                        // Handle token refresh recommendations
                        if (data.type === 'token_refresh_recommended') {
                            this._log('⚠️ ENHANCED: Server recommends token refresh');
                            this._refreshTokenInBackground();
                        }
                        
                        // Handle other messages normally
                        this._onMessage(event);
                        
                    } catch (parseError) {
                        this._error('ENHANCED: Error parsing message:', parseError);
                    }
                });
                
                this.socket.addEventListener('close', (event) => {
                    this._log('🔌 ENHANCED: WebSocket closed:', { code: event.code, reason: event.reason });
                    this._onClose(event);
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        clearTimeout(this.authTimeout);
                        this.isConnecting = false;
                        reject(new Error(`WebSocket closed during connection: ${event.code} - ${event.reason}`));
                    }
                });
                
                this.socket.addEventListener('error', (event) => {
                    this._error('❌ ENHANCED: WebSocket error:', event);
                    this._onError(event);
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        clearTimeout(this.authTimeout);
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection failed'));
                    }
                });
                
            } catch (error) {
                clearTimeout(overallTimeout);
                clearTimeout(this.authTimeout);
                this.isConnecting = false;
                this._error('ENHANCED: Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * ENHANCED: Get WebSocket URL with better parameter handling
     */
    _getEnhancedWebSocketURL() {
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
        
        // ENHANCED: Add additional parameters for better authentication
        const params = new URLSearchParams({
            t: Date.now().toString(), // Timestamp to prevent caching
            v: '2.0' // Version identifier
        });
        
        const url = `${wsProtocol}//${wsHost}/ws/${encodeURIComponent(user.id)}?${params}`;
        
        this._log('🔗 ENHANCED: WebSocket URL generated:', url.replace(user.id, user.id.substring(0, 8) + '...'));
        return url;
    },
    
    /**
     * Format authentication error with helpful information
     */
    _formatAuthError(data) {
        let errorMessage = 'Authentication failed';
        
        if (data.message) {
            errorMessage += ': ' + data.message;
        }
        
        // Add helpful context based on debug info
        if (data.debug_info) {
            const debug = data.debug_info;
            if (!debug.has_authenticated_cookie && !debug.has_user_info) {
                errorMessage += ' - No authentication cookies found. Please refresh the page.';
            } else if (debug.cookies_available && debug.cookies_available.length === 0) {
                errorMessage += ' - No cookies were sent with the request. This may be a cross-origin issue.';
            }
        }
        
        return errorMessage;
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
     * ENHANCED: Handle successful authentication
     */
    _handleEnhancedAuthenticationSuccess(data) {
        this._log('✅ ENHANCED: Authentication successful!', {
            connectionId: data.connection_id,
            reconnectToken: !!data.reconnect_token,
            authMethod: data.auth_method
        });
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Store connection info
        if (data.reconnect_token) {
            this._storeReconnectToken(data.reconnect_token);
        }
        
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
        
        this._log('🎉 ENHANCED: WebSocket fully connected and authenticated');
    },
    
    /**
     * ENHANCED: Handle authentication failure
     */
    _handleEnhancedAuthenticationError(data) {
        this._error('❌ ENHANCED: Authentication failed:', data);
        
        // Clear auth timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // ENHANCED: Detailed authentication failure handling
        this._handleEnhancedAuthenticationFailure(data);
    },
    
    /**
     * ENHANCED: Handle authentication failure with detailed analysis
     */
    _handleEnhancedAuthenticationFailure(data) {
        this._log('🔑 ENHANCED: Analyzing authentication failure...');
        
        // Close connection
        if (this.socket) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        this._cleanupConnection();
        
        // Analyze the error for better user feedback
        const analysis = this._analyzeAuthError(data);
        
        this._log('📊 Error analysis:', analysis);
        
        // Create enhanced error data
        const errorData = {
            error: this._getEnhancedErrorMessage(analysis),
            requiresLogin: analysis.likelyTokenExpired,
            requiresPageRefresh: analysis.likelyCookieIssue || analysis.likelyTokenExpired,
            reason: analysis.primaryReason,
            originalError: data,
            analysis: analysis
        };
        
        this._notifyErrorListeners(errorData);
    },
    
    /**
     * Analyze authentication error for better user experience
     */
    _analyzeAuthError(data) {
        const analysis = {
            hasDebugInfo: !!data.debug_info,
            serverResponse: !!data.message,
            likelyTokenExpired: false,
            likelyCookieIssue: false,
            likleyNetworkIssue: false,
            primaryReason: 'unknown',
            confidence: 'low'
        };
        
        if (data.debug_info) {
            const debug = data.debug_info;
            
            // Check for cookie issues
            if (!debug.has_authenticated_cookie && !debug.has_user_info) {
                analysis.likelyCookieIssue = true;
                analysis.primaryReason = 'missing_cookies';
                analysis.confidence = 'high';
            } else if (debug.cookies_available && debug.cookies_available.length === 0) {
                analysis.likelyCookieIssue = true;
                analysis.primaryReason = 'no_cookies_sent';
                analysis.confidence = 'high';
            }
        }
        
        // Check message content
        if (data.message) {
            const msg = data.message.toLowerCase();
            if (msg.includes('expired') || msg.includes('invalid token')) {
                analysis.likelyTokenExpired = true;
                analysis.primaryReason = 'token_expired';
                analysis.confidence = 'high';
            } else if (msg.includes('cookie') || msg.includes('session')) {
                analysis.likelyCookieIssue = true;
                analysis.primaryReason = 'cookie_authentication_failed';
                analysis.confidence = 'medium';
            }
        }
        
        return analysis;
    },
    
    /**
     * Get enhanced error message based on analysis
     */
    _getEnhancedErrorMessage(analysis) {
        switch (analysis.primaryReason) {
            case 'missing_cookies':
                return 'Authentication cookies are missing. Please refresh the page to reconnect.';
            case 'no_cookies_sent':
                return 'Cookies were not sent with the connection. Please refresh the page and try again.';
            case 'token_expired':
                return 'Your session has expired. Please refresh the page to log in again.';
            case 'cookie_authentication_failed':
                return 'Cookie authentication failed. Please refresh the page to reconnect.';
            default:
                return 'Authentication failed. Please refresh the page and try again.';
        }
    },
    
    /**
     * Store reconnect token for future use
     */
    _storeReconnectToken(token) {
        try {
            sessionStorage.setItem('ws_reconnect_token', token);
            this._log('🔑 Reconnect token stored');
        } catch (error) {
            this._error('Failed to store reconnect token:', error);
        }
    },
    
    /**
     * Get stored reconnect token
     */
    _getReconnectToken() {
        try {
            return sessionStorage.getItem('ws_reconnect_token');
        } catch (error) {
            this._error('Failed to get reconnect token:', error);
            return null;
        }
    },
    
    /**
     * ENHANCED: Refresh token in background
     */
    async _refreshTokenInBackground() {
        try {
            this._log('🔄 Background token refresh started');
            await this.authService.refreshTokenIfNeeded();
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for cookies
            this._log('✅ Background token refresh completed');
        } catch (error) {
            this._error('❌ Background token refresh failed:', error);
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
                this._sendMessageWithRetry({ type: 'pong' }).catch(err => 
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
     * Handle WebSocket close
     */
    _onClose(event) {
        this._log('🔌 WebSocket closed', { code: event.code, reason: event.reason });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // Better reconnection logic
        const shouldReconnect = this._shouldReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('Not reconnecting', { 
                code: event.code, 
                authenticated: this.authService.isAuthenticated()
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
            if (!this.isAuthenticated && this.authService.isAuthenticated()) {
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
     * Send message with retry logic
     */
    async _sendMessageWithRetry(messageData, maxRetries = 2) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                this._log(`📤 ENHANCED: Sending message (attempt ${attempt}/${maxRetries}):`, messageData.type);
                
                if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
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
                    await new Promise(resolve => setTimeout(resolve, 200 * attempt));
                }
            }
        }
        
        throw lastError || new Error('Failed to send message after retries');
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
            hasCookies: {
                authenticated: this._getCookie('authenticated') === 'true',
                userInfo: !!this._getCookie('user_info'),
                note: 'access_token is httpOnly (not readable by JS)'
            },
            lastError: this.lastError || null
        };
    },
    
    /**
     * Force reconnect with comprehensive validation
     */
    async forceReconnect() {
        this._log('🔄 ENHANCED: Force reconnecting with comprehensive validation...');
        
        // Disconnect first
        this.disconnect();
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check and refresh authentication
        if (!this.authService.isAuthenticated()) {
            throw new Error('Cannot reconnect: Authentication invalid');
        }
        
        // Force token refresh before reconnecting
        try {
            this._log('🔄 Forcing token refresh before reconnect...');
            await this.authService.refreshTokenIfNeeded();
            await new Promise(resolve => setTimeout(resolve, this.options.cookieWaitTime));
        } catch (error) {
            this._log('⚠️ Token refresh failed during force reconnect:', error);
            throw new Error(`Token refresh failed: ${error.message}`);
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
            window.AAAI_LOGGER.debug('[ChatService ENHANCED]', ...args);
        } else if (this.options.debug) {
            console.log('[ChatService ENHANCED]', ...args);
        }
    },
    
    _error(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService ENHANCED]', ...args);
        } else {
            console.error('[ChatService ENHANCED]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}