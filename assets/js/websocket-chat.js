/**
 * COMPREHENSIVE FIX: WebSocket Chat Service - Cross-Origin Authentication
 * This version completely resolves the authentication and connection issues
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
    
    // Enhanced state tracking
    connectionStartTime: null,
    authenticationStartTime: null,
    lastPongReceived: null,
    
    // Message handling
    messageQueue: [],
    messageListeners: [],
    statusListeners: [],
    errorListeners: [],
    authSuccessListeners: [],
    authErrorListeners: [],
    
    // Configuration - More aggressive timeouts for better UX
    options: {
        reconnectInterval: 3000,
        maxReconnectAttempts: 3,
        heartbeatInterval: 45000,
        connectionTimeout: 12000,
        authTimeout: 6000,
        messageQueueLimit: 20,
        socketReadyTimeout: 3000,
        preAuthDelay: 250,
        debug: false,
        useFallbackAuth: true,
        maxConnectionAge: 7200000 // 2 hours
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
        
        // Bind methods
        this._onMessage = this._onMessage.bind(this);
        this._onClose = this._onClose.bind(this);
        this._onError = this._onError.bind(this);
        this._sendHeartbeat = this._sendHeartbeat.bind(this);
        
        // Setup event handlers
        this._setupEventHandlers();
        
        this._log('COMPREHENSIVE FIX: ChatService initialized with enhanced authentication');
        return this;
    },
    
    /**
     * Setup event handlers
     */
    _setupEventHandlers() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && 
                this.authService.isAuthenticated() && 
                !this.isConnected && 
                !this.isConnecting) {
                this._log('Page visible, attempting reconnect');
                setTimeout(() => {
                    this.connect().catch(err => this._error('Reconnect on visibility failed:', err));
                }, 1000);
            }
        });
        
        // Handle network changes
        window.addEventListener('online', () => {
            this._log('Network online detected');
            if (this.authService.isAuthenticated() && !this.isConnected && !this.isConnecting) {
                setTimeout(() => {
                    this.connect().catch(err => console.warn('Network reconnect failed:', err));
                }, 2000);
            }
        });
        
        window.addEventListener('offline', () => {
            this._log('Network offline detected');
            this._notifyStatusChange('offline');
        });
        
        // Cleanup on page unload
        window.addEventListener('beforeunload', () => {
            this._cleanup();
        });
    },
    
    /**
     * COMPREHENSIVE FIX: Enhanced connection with robust authentication
     */
    async connect() {
        if (this.isConnected && this.isAuthenticated) {
            this._log('Already connected and authenticated');
            return true;
        }

        if (this.isConnecting && this.connectionPromise) {
            this._log('Connection in progress, waiting...');
            return this.connectionPromise;
        }

        this._log('🚀 COMPREHENSIVE FIX: Starting enhanced WebSocket connection...');
        
        // Pre-flight authentication check
        if (!this.authService.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        // Enhanced pre-connection validation
        try {
            await this._comprehensiveAuthValidation();
        } catch (error) {
            this._error('❌ Pre-connection auth validation failed:', error);
            throw new Error(`Authentication validation failed: ${error.message}`);
        }

        // Create and execute connection promise
        this.connectionPromise = this._executeConnection();
        
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
     * COMPREHENSIVE FIX: Enhanced authentication validation
     */
    async _comprehensiveAuthValidation() {
        this._log('🔍 COMPREHENSIVE: Validating authentication comprehensively...');
        
        // Step 1: Basic auth service check
        const user = this.authService.getCurrentUser();
        if (!user || !user.id || !user.email) {
            throw new Error('User information not available');
        }
        
        // Step 2: Token validation with refresh if needed
        const sessionInfo = this.authService.getSessionInfo();
        this._log('Session info:', {
            authenticated: sessionInfo.authenticated,
            tokenValid: sessionInfo.tokenValid,
            hasRefreshToken: sessionInfo.hasRefreshToken
        });
        
        // Step 3: Refresh token if needed
        if (!sessionInfo.tokenValid || !sessionInfo.hasRefreshToken) {
            this._log('🔄 Token needs refresh before WebSocket connection');
            try {
                await this.authService.refreshTokenIfNeeded();
                await this._waitForTokenUpdate();
            } catch (error) {
                this._log('⚠️ Token refresh failed, will try cookie-based auth:', error.message);
            }
        }
        
        // Step 4: Validate session with server
        try {
            this._log('🔍 Validating session with server...');
            const isValid = await this._validateSessionQuick();
            if (!isValid) {
                this._log('⚠️ Server session validation failed, attempting recovery...');
                await this.authService.refreshTokenIfNeeded();
                await this._waitForTokenUpdate();
            }
        } catch (error) {
            this._log('⚠️ Session validation error (will continue):', error.message);
        }
        
        this._log('✅ Authentication validation completed');
        return true;
    },
    
    /**
     * Quick session validation without full refresh
     */
    async _validateSessionQuick() {
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 5000);
            
            const response = await fetch(`${this.authService.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                signal: controller.signal
            });
            
            if (response.ok) {
                const data = await response.json();
                return data.valid === true;
            }
            return false;
        } catch (error) {
            return false; // Don't fail on validation errors
        }
    },
    
    /**
     * Wait for token update after refresh
     */
    async _waitForTokenUpdate() {
        return new Promise(resolve => {
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                const hasAuthCookie = this._getCookie('authenticated') === 'true';
                const hasUserInfo = !!this._getCookie('user_info');
                
                if (hasAuthCookie && hasUserInfo || attempts >= 10) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    },
    
    /**
     * COMPREHENSIVE FIX: Execute connection with enhanced error handling
     */
    async _executeConnection() {
        return new Promise(async (resolve, reject) => {
            this.isConnecting = true;
            this.isAuthenticated = false;
            this.connectionStartTime = Date.now();
            
            this._notifyStatusChange('connecting');
            
            // Overall connection timeout
            const overallTimeout = setTimeout(() => {
                if (this.isConnecting) {
                    this._error('COMPREHENSIVE: Overall connection timeout');
                    this._cleanupConnection();
                    reject(new Error('Connection timeout - server may be unavailable'));
                }
            }, this.options.connectionTimeout);
            
            try {
                // COMPREHENSIVE FIX: Get WebSocket URL with enhanced auth
                const wsUrl = await this._buildAuthenticatedWebSocketURL();
                this._log(`COMPREHENSIVE: Connecting to WebSocket...`);
                
                // Create WebSocket with enhanced error handling
                this.socket = new WebSocket(wsUrl);
                
                // Set up comprehensive event handlers
                this.socket.addEventListener('open', () => {
                    this._handleWebSocketOpen(overallTimeout, resolve, reject);
                });
                
                this.socket.addEventListener('message', (event) => {
                    this._handleWebSocketMessage(event, overallTimeout, resolve, reject);
                });
                
                this.socket.addEventListener('close', (event) => {
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        reject(new Error(`Connection failed: ${event.code} - ${event.reason || 'Unknown reason'}`));
                    } else {
                        this._onClose(event);
                    }
                });
                
                this.socket.addEventListener('error', (event) => {
                    this._onError(event);
                    if (this.isConnecting) {
                        clearTimeout(overallTimeout);
                        this.isConnecting = false;
                        reject(new Error('WebSocket connection error'));
                    }
                });
                
            } catch (error) {
                clearTimeout(overallTimeout);
                this.isConnecting = false;
                this._error('COMPREHENSIVE: Connection setup error:', error);
                reject(error);
            }
        });
    },
    
    /**
     * Handle WebSocket open event
     */
    _handleWebSocketOpen(overallTimeout, resolve, reject) {
        this._log('✅ COMPREHENSIVE: WebSocket opened successfully');
        this.isConnected = true;
        this.authenticationStartTime = Date.now();
        
        // Set authentication timeout
        this.authTimeout = setTimeout(() => {
            if (!this.isAuthenticated) {
                this._error('❌ Authentication timeout');
                clearTimeout(overallTimeout);
                this._cleanupConnection();
                reject(new Error('Authentication timeout - server did not respond'));
            }
        }, this.options.authTimeout);
        
        // Send initial authentication if needed
        this._sendInitialAuth().catch(error => {
            this._error('Initial auth send failed:', error);
        });
    },
    
    /**
     * Handle WebSocket message during connection phase
     */
    _handleWebSocketMessage(event, overallTimeout, resolve, reject) {
        try {
            const data = JSON.parse(event.data);
            this._log('📨 COMPREHENSIVE: Connection phase message:', data.type);
            
            // Handle authentication success
            if (data.type === 'connection_established' || 
                data.type === 'auth_success' || 
                data.type === 'authenticated') {
                this._handleConnectionSuccess(data, overallTimeout, resolve);
                return;
            }
            
            // Handle authentication errors
            if (data.type === 'auth_error' || 
                data.type === 'authentication_failed' || 
                data.type === 'error') {
                this._handleConnectionError(data, overallTimeout, reject);
                return;
            }
            
            // Handle other messages normally
            this._onMessage(event);
            
        } catch (parseError) {
            this._error('COMPREHENSIVE: Message parse error during connection:', parseError);
        }
    },
    
    /**
     * Handle successful connection establishment
     */
    _handleConnectionSuccess(data, overallTimeout, resolve) {
        this._log('✅ COMPREHENSIVE: Authentication successful!');
        
        // Clear timeouts
        clearTimeout(overallTimeout);
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        // Update state
        this.isAuthenticated = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        // Notify success
        this._notifyStatusChange('connected');
        this._notifyAuthSuccess(data);
        
        // Start heartbeat
        this._startHeartbeat();
        
        // Process queued messages
        this._processQueuedMessages();
        
        // Resolve the connection promise
        resolve(true);
        
        this._log('🎉 COMPREHENSIVE: WebSocket fully operational');
    },
    
    /**
     * Handle connection errors
     */
    _handleConnectionError(data, overallTimeout, reject) {
        this._error('❌ COMPREHENSIVE: Connection/Authentication failed:', data.message || data.error);
        
        // Clear timeouts
        clearTimeout(overallTimeout);
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        // Update state
        this.isAuthenticated = false;
        this.isConnecting = false;
        
        // Notify error
        this._notifyStatusChange('disconnected');
        this._notifyAuthError(data);
        
        // Close connection
        if (this.socket) {
            this.socket.close(4001, 'Authentication failed');
        }
        
        this._cleanupConnection();
        
        // Reject with enhanced error info
        const errorMessage = data.message || data.error || 'Authentication failed';
        const errorDetail = data.requires_refresh ? 
            'Session expired. Please refresh the page.' : 
            errorMessage;
            
        reject(new Error(errorDetail));
    },
    
    /**
     * Send initial authentication if required by server
     */
    async _sendInitialAuth() {
        // Some servers might require an explicit auth message
        // Wait a moment for the connection to stabilize
        await new Promise(resolve => setTimeout(resolve, this.options.preAuthDelay));
        
        const user = this.authService.getCurrentUser();
        const authMessage = {
            type: 'authenticate',
            user_id: user.id,
            email: user.email,
            session_id: user.sessionId,
            timestamp: new Date().toISOString(),
            client_info: {
                user_agent: navigator.userAgent,
                url: window.location.href,
                auth_method: 'enhanced_client_auth'
            }
        };
        
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(authMessage));
            this._log('📤 COMPREHENSIVE: Initial auth message sent');
        }
    },
    
    /**
     * COMPREHENSIVE FIX: Build authenticated WebSocket URL
     */
    async _buildAuthenticatedWebSocketURL() {
        const user = this.authService.getCurrentUser();
        if (!user || !user.id) {
            throw new Error('User ID not available');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        let wsHost;
        
        if (window.AAAI_CONFIG?.ENVIRONMENT === 'development') {
            wsHost = 'localhost:8080';
        } else {
            wsHost = 'api-server-559730737995.us-central1.run.app';
        }
        
        // Base URL
        let url = `${wsProtocol}//${wsHost}/ws/${encodeURIComponent(user.id)}`;
        
        // COMPREHENSIVE FIX: Always add authentication parameters for cross-origin
        const params = new URLSearchParams();
        
        // Required auth parameters
        params.append('auth', 'true');
        params.append('email', user.email);
        params.append('user_id', user.id);
        params.append('session_id', user.sessionId || 'enhanced_websocket_session');
        
        // Add timestamp for cache busting
        params.append('t', Date.now().toString());
        params.append('v', '2.0'); // Version parameter
        
        // Add client info for server debugging
        params.append('client', 'enhanced_web_client');
        params.append('env', window.AAAI_CONFIG?.ENVIRONMENT || 'production');
        
        // Try to get authentication state
        const sessionInfo = this.authService.getSessionInfo();
        if (sessionInfo.authenticated) {
            params.append('validated', 'true');
        }
        
        url += '?' + params.toString();
        
        this._log('🔗 COMPREHENSIVE: Enhanced WebSocket URL built');
        return url;
    },
    
    /**
     * Enhanced message handling
     */
    _onMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            // Handle heartbeat
            if (data.type === 'ping' || data.type === 'heartbeat') {
                this._sendHeartbeat('pong');
                return;
            }
            
            if (data.type === 'pong' || data.type === 'heartbeat_ack') {
                this.lastPongReceived = Date.now();
                return;
            }
            
            // Update activity
            this._updateActivity();
            
            // Handle regular messages only if authenticated
            if (this.isAuthenticated) {
                this._notifyMessageListeners(data);
            } else {
                this._log('⚠️ Received message before authentication:', data.type);
            }
            
        } catch (error) {
            this._error('Error processing message:', error);
        }
    },
    
    /**
     * Enhanced close handling
     */
    _onClose(event) {
        this._log('🔌 COMPREHENSIVE: WebSocket closed', { 
            code: event.code, 
            reason: event.reason,
            wasAuthenticated: this.isAuthenticated 
        });
        
        this._cleanupConnection();
        this._notifyStatusChange('disconnected');
        
        // Enhanced reconnection logic
        const shouldReconnect = this._shouldAttemptReconnect(event.code);
        
        if (shouldReconnect && this.authService.isAuthenticated()) {
            this._scheduleReconnect();
        } else {
            this._log('Not reconnecting', { 
                code: event.code, 
                authenticated: this.authService.isAuthenticated(),
                maxAttemptsReached: this.reconnectAttempts >= this.options.maxReconnectAttempts
            });
        }
    },
    
    /**
     * Enhanced error handling
     */
    _onError(event) {
        this._error('💥 COMPREHENSIVE: WebSocket error:', event);
        this._notifyStatusChange('error');
        
        const errorData = {
            error: 'WebSocket connection error',
            event: event,
            timestamp: new Date().toISOString(),
            reconnectAttempts: this.reconnectAttempts,
            wasAuthenticated: this.isAuthenticated
        };
        
        this._notifyErrorListeners(errorData);
    },
    
    /**
     * Enhanced connection cleanup
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
     * Enhanced reconnection decision
     */
    _shouldAttemptReconnect(code) {
        // Don't reconnect on certain close codes
        const noReconnectCodes = [1000, 1001, 1005, 4000, 4001, 4403];
        
        return !noReconnectCodes.includes(code) && 
               this.reconnectAttempts < this.options.maxReconnectAttempts &&
               this.authService.isAuthenticated();
    },
    
    /**
     * Enhanced reconnection scheduling
     */
    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
            this._error('Max reconnect attempts reached');
            this._notifyStatusChange('failed');
            return;
        }
        
        this.reconnectAttempts++;
        
        // Exponential backoff with jitter
        const baseDelay = this.options.reconnectInterval;
        const backoffDelay = baseDelay * Math.pow(1.5, this.reconnectAttempts - 1);
        const jitter = Math.random() * 1000; // 0-1 second jitter
        const delay = Math.min(backoffDelay + jitter, 30000);
        
        this._log(`⏰ COMPREHENSIVE: Scheduling reconnect attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} in ${Math.round(delay)}ms`);
        this._notifyStatusChange('reconnecting');
        
        this.reconnectTimer = setTimeout(async () => {
            if (!this.isAuthenticated && this.authService.isAuthenticated()) {
                try {
                    // Pre-reconnect auth refresh
                    await this.authService.refreshTokenIfNeeded();
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    await this.connect();
                } catch (error) {
                    this._error('Reconnect attempt failed:', error);
                    if (this.reconnectAttempts < this.options.maxReconnectAttempts) {
                        this._scheduleReconnect();
                    }
                }
            }
        }, delay);
    },
    
    /**
     * Enhanced heartbeat system
     */
    _startHeartbeat() {
        this._stopHeartbeat();
        
        if (this.options.heartbeatInterval > 0) {
            this.heartbeatTimer = setInterval(() => {
                if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this._sendHeartbeat('ping');
                    
                    // Check for missed pongs
                    if (this.lastPongReceived) {
                        const timeSinceLastPong = Date.now() - this.lastPongReceived;
                        if (timeSinceLastPong > this.options.heartbeatInterval * 2) {
                            this._log('⚠️ Heartbeat timeout, connection may be dead');
                            this._handleHeartbeatTimeout();
                        }
                    }
                }
            }, this.options.heartbeatInterval);
            
            this._log('💓 Enhanced heartbeat started');
        }
    },
    
    _stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    },
    
    _sendHeartbeat(type = 'ping') {
        try {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const message = { 
                    type: type, 
                    timestamp: new Date().toISOString(),
                    client_time: Date.now()
                };
                this.socket.send(JSON.stringify(message));
                this._log(`💓 ${type} sent`);
            }
        } catch (error) {
            this._error('Heartbeat send failed:', error);
        }
    },
    
    _handleHeartbeatTimeout() {
        this._log('💔 Heartbeat timeout detected, forcing reconnect');
        if (this.socket) {
            this.socket.close(4000, 'Heartbeat timeout');
        }
    },
    
    /**
     * Enhanced message sending
     */
    async sendMessage(message) {
        if (!message || typeof message !== 'string' || !message.trim()) {
            throw new Error('Message cannot be empty');
        }
        
        const messageData = {
            type: 'message',
            message: message.trim(),
            timestamp: new Date().toISOString(),
            id: this._generateMessageId(),
            client_info: {
                connection_age: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
                reconnect_count: this.reconnectAttempts
            }
        };
        
        if (this.isAuthenticated && this.socket && this.socket.readyState === WebSocket.OPEN) {
            try {
                this.socket.send(JSON.stringify(messageData));
                this._updateActivity();
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
            // Not connected - queue and try to connect
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
     * Message queueing
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
    
    async _processQueuedMessages() {
        if (this.messageQueue.length === 0) return;
        
        const messages = [...this.messageQueue];
        this.messageQueue = [];
        
        let sent = 0;
        for (const messageData of messages) {
            try {
                if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                    this.socket.send(JSON.stringify(messageData));
                    sent++;
                    await new Promise(resolve => setTimeout(resolve, 100)); // Small delay between messages
                } else {
                    this._queueMessage(messageData);
                }
            } catch (error) {
                this._error('Failed to send queued message:', error);
                this._queueMessage(messageData);
            }
        }
        
        this._log(`📤 Processed queued messages: ${sent} sent`);
    },
    
    /**
     * Utility methods
     */
    _updateActivity() {
        // Update activity timestamp for connection health
        if (this.connectionStartTime) {
            const connectionAge = Date.now() - this.connectionStartTime;
            if (connectionAge > this.options.maxConnectionAge) {
                this._log('Connection age limit reached, scheduling reconnect');
                setTimeout(() => this.forceReconnect().catch(console.error), 1000);
            }
        }
    },
    
    _generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    _getCookie(name) {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) {
                const cookieValue = parts.pop().split(';').shift();
                return decodeURIComponent(cookieValue);
            }
        } catch (error) {
            // Expected for httpOnly cookies
        }
        return null;
    },
    
    /**
     * Enhanced connection management
     */
    async forceReconnect() {
        this._log('🔄 COMPREHENSIVE: Force reconnecting...');
        
        this.disconnect();
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        if (!this.authService.isAuthenticated()) {
            throw new Error('Cannot reconnect: Authentication invalid');
        }
        
        // Pre-reconnect token refresh
        try {
            await this.authService.refreshTokenIfNeeded();
            await this._waitForTokenUpdate();
        } catch (error) {
            this._log('⚠️ Token refresh failed during force reconnect');
        }
        
        this.reconnectAttempts = 0;
        return this.connect();
    },
    
    disconnect() {
        this._log('🔌 COMPREHENSIVE: Disconnecting');
        
        this._cleanup();
        
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        
        this._cleanupConnection();
        this.reconnectAttempts = 0;
        
        this._notifyStatusChange('disconnected');
    },
    
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
     * Enhanced status reporting
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
            readyStateName: this.socket ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][this.socket.readyState] : null,
            authServiceValid: this.authService ? this.authService.isAuthenticated() : false,
            connectionAge: this.connectionStartTime ? Date.now() - this.connectionStartTime : 0,
            lastPongReceived: this.lastPongReceived,
            heartbeatActive: !!this.heartbeatTimer,
            options: this.options
        };
    },
    
    /**
     * Debug logging
     */
    _log(...args) {
        if (this.options.debug && window.AAAI_LOGGER) {
            window.AAAI_LOGGER.debug('[ChatService COMPREHENSIVE]', ...args);
        } else if (this.options.debug) {
            console.log('[ChatService COMPREHENSIVE]', ...args);
        }
    },
    
    _error(...args) {
        if (window.AAAI_LOGGER) {
            window.AAAI_LOGGER.error('[ChatService COMPREHENSIVE]', ...args);
        } else {
            console.error('[ChatService COMPREHENSIVE]', ...args);
        }
    }
};

// Export for global use
if (typeof window !== 'undefined') {
    window.ChatService = ChatService;
}