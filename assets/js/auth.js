/**
 * ENHANCED Authentication Service for AAAI Solutions - WebSocket Only
 * Removes HTTP chat functionality, keeps only WebSocket support
 */
const AuthService = {
    // Core state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    token: null,
    refreshToken: null,
    
    // Timers and promises
    tokenRefreshTimer: null,
    refreshPromise: null,
    isRefreshing: false,
    
    // Enhanced state tracking
    lastTokenRefresh: null,
    sessionValidationCache: null,
    sessionValidationExpiry: null,
    cookieMonitoringInterval: null,

    // Initialize the auth service
    init() {
        console.log('=== ENHANCED AuthService.init() START - WebSocket Only ===');
        console.log('window.location.hostname:', window.location.hostname);
        console.log('window.AAAI_CONFIG exists:', !!window.AAAI_CONFIG);
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        console.log('Environment from config:', window.AAAI_CONFIG.ENVIRONMENT);
        
        // Set up URLs based on environment
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            this.AUTH_BASE_URL = 'http://localhost:8080';
            this.API_BASE_URL = 'http://localhost:8080';
            this.WS_BASE_URL = 'ws://localhost:8080';
        } else {
            this.AUTH_BASE_URL = '';
            this.API_BASE_URL = '';
            this.WS_BASE_URL = window.location.origin;
        }
        
        console.log('AUTH_BASE_URL:', this.AUTH_BASE_URL);
        console.log('API_BASE_URL:', this.API_BASE_URL);
        
        // Initialize authentication state with enhanced approach
        const authRestored = this._initializeEnhancedAuthState();
        
        // Set up enhanced session management
        this._setupEnhancedTokenRefresh();
        this._setupVisibilityHandler();
        this._setupCookieMonitoring();
        
        window.AAAI_LOGGER?.info('ENHANCED AuthService initialized - WebSocket Only Mode', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: this.isAuthenticated(),
            hasPersistentSession: this.hasPersistentSession(),
            authRestored: authRestored,
            chatMode: 'websocket_only'
        });
        
        console.log('=== ENHANCED AuthService.init() END - WebSocket Only ===');
        console.log('Final auth state:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            hasTokens: !!this.token,
            websocketOnly: true
        });
        
        return this.isAuthenticated();
    },
    
    /**
     * Enhanced OTP verification with better state management
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`ENHANCED: Verifying OTP for email: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('✅ ENHANCED: OTP verification successful - WebSocket ready');
            
            // Set authentication state
            const userInfo = {
                email: email,
                id: data.id,
                session_id: data.session_id
            };
            
            this._setAuthState(userInfo);
            
            // Clear validation cache
            this.sessionValidationCache = null;
            this.sessionValidationExpiry = null;
            
            // Record successful authentication
            this.lastTokenRefresh = Date.now();
            
            console.log('✅ ENHANCED: Authentication state updated - Ready for WebSocket connections');
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('Enhanced OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    /**
     * Enhanced execute function with better error handling
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`ENHANCED: Executing function: ${functionName}`);
            
            if (this.lastTokenRefresh && (Date.now() - this.lastTokenRefresh) > 600000) {
                console.log('Token is getting old, refreshing before function call...');
                await this.refreshTokenIfNeeded();
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            // FIXED: Use Cloud Function endpoint
            const response = await fetch(`${this.AUTH_BASE_URL}/executeFunction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    function_name: functionName,
                    ...inputData
                }),
                signal: controller.signal,
                credentials: 'include' // Sends cookies
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`Function execution failed:`, data);
                
                if (response.status === 401) {
                    console.warn('Session expired during function execution');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(data.error || data.detail || `Failed to execute function: ${functionName}`);
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`Function execution error (${functionName}):`, error);
            throw error;
        }
    },
    
    // REMOVED: sendChatMessage method - WebSocket only now
    // Chat messages must go through WebSocket service only
    
    /**
     * Enhanced logout with comprehensive cleanup
     */
    async logout() {
        try {
            console.log('🚪 ENHANCED: Logging out - WebSocket Only Mode...');
            
            // Clear timers
            if (this.tokenRefreshTimer) {
                clearInterval(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
            }
            
            if (this.cookieMonitoringInterval) {
                clearInterval(this.cookieMonitoringInterval);
                this.cookieMonitoringInterval = null;
            }
            
            // Attempt server-side logout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('✅ Server-side logout completed');
            } catch (error) {
                console.warn('Server-side logout failed or timed out:', error);
            }
            
            // Clear all authentication data
            this.clearAuthData();
            
            console.log('✅ Enhanced logout successful - WebSocket connections will be terminated');
        } catch (error) {
            console.error('Enhanced logout error:', error);
            // Still clear local data even if server logout fails
            this.clearAuthData();
        }
    },
    
    /**
     * Enhanced WebSocket URL generation
     */
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        const url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        console.log(`ENHANCED WebSocket URL for chat: ${url}`);
        return url;
    },
    
    /**
     * Get user credits
     */
    async getUserCredits() {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const result = await this.executeFunction('get_user_creds', {
                email: this.userEmail
            });
            return result.data.credits;
        } catch (error) {
            console.error('Error getting user credits:', error);
            return 0;
        }
    },
    
    /**
     * Request OTP
     */
    async requestOTP(email) {
        try {
            console.log(`ENHANCED: Requesting OTP for email: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const responseData = await response.json();
            
            if (!response.ok) {
                console.error('Enhanced OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            console.log('✅ Enhanced OTP request successful');
            return responseData;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('Enhanced OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // REMOVED: All HTTP chat fallback methods
    // WebSocket-only mode means no HTTP chat functionality
    
    /**
     * Enhanced token refresh with better error handling
     */
    async refreshTokenIfNeeded() {
        if (!this.isAuthenticated()) {
            console.log('Not authenticated, no token to refresh');
            return false;
        }
        
        // Check if we recently refreshed (within last 5 minutes)
        if (this.lastTokenRefresh && (Date.now() - this.lastTokenRefresh) < 300000) {
            console.log('Recently refreshed token, skipping');
            return true;
        }
        
        // Prevent concurrent refresh attempts
        if (this.isRefreshing) {
            console.log('Token refresh already in progress, waiting...');
            return this.refreshPromise;
        }
        
        this.isRefreshing = true;
        this.refreshPromise = this._performEnhancedTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    },
    
    /**
     * ENHANCED: Perform token refresh with comprehensive error handling
     */
    async _performEnhancedTokenRefresh() {
        try {
            console.log('🔄 ENHANCED: Attempting comprehensive token refresh...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            // Try silent refresh first (uses httpOnly cookies)
            let response;
            try {
                response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh-silent`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // Critical for sending httpOnly cookies
                    signal: controller.signal
                });
            } catch (fetchError) {
                console.log('Silent refresh failed, trying standard refresh...');
                
                // Fallback to standard refresh
                response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    signal: controller.signal,
                    body: JSON.stringify({
                        silent: false
                    })
                });
            }
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ ENHANCED: Token refresh successful - WebSocket ready');
                
                // Update last refresh time
                this.lastTokenRefresh = Date.now();
                
                // Update authentication state if provided
                if (data.user) {
                    this.userEmail = data.user.email || this.userEmail;
                    this.userId = data.user.id || this.userId;
                    this.sessionId = data.session_id || this.sessionId;
                    this._syncToLocalStorage();
                    
                    // Update user_info cookie
                    const userInfo = {
                        email: this.userEmail,
                        id: this.userId,
                        session_id: this.sessionId
                    };
                    this._setCookie('user_info', JSON.stringify(userInfo), 1);
                }
                
                // Ensure authenticated cookie is set
                this._setCookie('authenticated', 'true', 1);
                
                // Clear any cached validation
                this.sessionValidationCache = null;
                this.sessionValidationExpiry = null;
                
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.log('❌ ENHANCED: Token refresh failed:', response.status, errorData);
                
                if (response.status === 401) {
                    console.log('Token refresh returned 401, clearing auth state');
                    this._clearAuthState();
                }
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Token refresh timed out');
            } else {
                console.error('Enhanced token refresh error:', error);
            }
            return false;
        }
    },
    
    /**
     * ENHANCED: Session validation with caching
     */
    async _validateSessionAsync() {
        try {
            // Check cache first
            if (this.sessionValidationCache && this.sessionValidationExpiry && 
                Date.now() < this.sessionValidationExpiry) {
                console.log('🔍 Using cached session validation result');
                return this.sessionValidationCache;
            }
            
            console.log('🔍 ENHANCED: Validating session with server...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            console.log('ENHANCED Session validation response:', {
                ok: response.ok,
                status: response.status,
                valid: data.valid,
                source: data.source,
                reason: data.reason
            });
            
            const isValid = response.ok && data.valid;
            
            // Cache the result for 5 minutes
            this.sessionValidationCache = isValid;
            this.sessionValidationExpiry = Date.now() + 300000;
            
            if (isValid) {
                console.log('✅ ENHANCED: Session validation successful - WebSocket ready');
                
                // Update authentication state with server response
                if (data.user_info) {
                    console.log('Updating user info from server validation:', data.user_info);
                    
                    this.userEmail = data.user_info.email || this.userEmail;
                    this.userId = data.user_info.id || this.userId;
                    this.sessionId = data.user_info.session_id || this.sessionId;
                    
                    if (!this.userEmail || !this.userId) {
                        console.warn('Server response missing required user info');
                        return false;
                    }
                    
                    this.authenticated = true;
                    this._syncToLocalStorage();
                    
                    // Ensure cookies are properly set
                    this._setCookie('authenticated', 'true', 1);
                    const userInfo = {
                        email: this.userEmail,
                        id: this.userId,
                        session_id: this.sessionId
                    };
                    this._setCookie('user_info', JSON.stringify(userInfo), 1);
                }
                
                return true;
            } else {
                console.log('❌ ENHANCED: Session validation failed:', data);
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Session validation timed out');
            } else {
                console.error('Enhanced session validation error:', error);
            }
            return false;
        }
    },
    
    // ============================================================
    // ENHANCED UTILITY METHODS - WebSocket Only
    // ============================================================
    
    /**
     * Enhanced authentication check
     */
    isAuthenticated() {
        const isAuth = this.authenticated && !!this.userId && !!this.userEmail;
        
        if (!isAuth && this.authenticated) {
            console.warn('Authentication state inconsistent:', {
                authenticated: this.authenticated,
                hasUserId: !!this.userId,
                hasUserEmail: !!this.userEmail
            });
        }
        
        return isAuth;
    },
    
    /**
     * Get current user information
     */
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated,
            websocketReady: this.isAuthenticated() // Indicates readiness for WebSocket
        };
    },
    
    /**
     * Get token (placeholder for cookie-stored tokens)
     */
    getToken() {
        return this.token;
    },
    
    /**
     * Check if user has a persistent session with enhanced validation
     */
    hasPersistentSession() {
        const hasAuthCookie = this._getCookie('authenticated') === 'true';
        const hasUserInfo = !!this._getCookie('user_info');
        const hasStoredUser = !!this._getSecureItem('user_id');
        const hasAccessToken = this._cookieExists('access_token');
        
        return hasAuthCookie || hasUserInfo || hasStoredUser || hasAccessToken;
    },
    
    /**
     * Get enhanced session information - WebSocket focused
     */
    getSessionInfo() {
        return {
            authenticated: this.authenticated,
            userId: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            hasRefreshToken: this.hasPersistentSession(),
            tokenValid: this.authenticated,
            lastTokenRefresh: this.lastTokenRefresh,
            sessionValidationCached: !!this.sessionValidationCache,
            websocketReady: this.isAuthenticated(),
            chatMode: 'websocket_only',
            cookieHealth: {
                authenticated: this._getCookie('authenticated') === 'true',
                userInfo: !!this._getCookie('user_info'),
                accessToken: this._cookieExists('access_token'),
                refreshToken: this._cookieExists('refresh_token')
            }
        };
    },
    
    /**
     * Enhanced clear all authentication data
     */
    clearAuthData() {
        // Clear localStorage
        ['auth_token', 'refresh_token', 'user_email', 'user_id', 'session_id'].forEach(key => {
            this._removeSecureItem(key);
        });

        // Clear instance data
        this.token = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.lastTokenRefresh = null;
        this.sessionValidationCache = null;
        this.sessionValidationExpiry = null;

        // Clear timers
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }
        
        if (this.cookieMonitoringInterval) {
            clearInterval(this.cookieMonitoringInterval);
            this.cookieMonitoringInterval = null;
        }

        // Clear JavaScript-accessible cookies
        this._deleteCookie('authenticated');
        this._deleteCookie('user_info');

        console.log('🧹 ENHANCED: All authentication data cleared - WebSocket connections will be terminated');
    },
    
    /**
     * Get authentication headers (for WebSocket connection if needed)
     */
    getAuthHeader() {
        return {
            'X-Session-ID': this.sessionId || '',
            'X-WebSocket-Ready': this.isAuthenticated() ? 'true' : 'false'
        };
    },
    
    // ============================================================
    // ENHANCED PRIVATE METHODS - Preserved from original
    // ============================================================
    
    /**
     * ENHANCED: Comprehensive authentication state initialization
     */
    _initializeEnhancedAuthState() {
        console.log('🔍 ENHANCED: Initializing authentication state...');
        
        try {
            // Step 1: Check cookies first with enhanced validation
            const cookieAuth = this._restoreFromEnhancedCookies();
            if (cookieAuth) {
                console.log('✅ Authentication restored from enhanced cookies');
                return true;
            }
            
            // Step 2: Check localStorage as fallback
            const localAuth = this._restoreFromLocalStorage();
            if (localAuth) {
                console.log('✅ Authentication restored from localStorage');
                return true;
            }
            
            // Step 3: Check for partial authentication data
            const partialAuth = this._attemptPartialRestore();
            if (partialAuth) {
                console.log('⚠️ Partial authentication restored, will validate in background');
                // Validate in background without blocking
                setTimeout(() => this._validateAndRepairAsync(), 100);
                return true;
            }
            
            console.log('❌ No authentication state found');
            this._clearAuthState();
            return false;
            
        } catch (error) {
            console.error('Error during enhanced auth initialization:', error);
            this._clearAuthState();
            return false;
        }
    },
    
    /**
     * ENHANCED: Restore authentication from cookies with validation
     */
    _restoreFromEnhancedCookies() {
        try {
            console.log('🍪 ENHANCED: Checking cookies for authentication...');
            
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            // Additional cookie validation
            const hasAccessToken = this._cookieExists('access_token');
            const hasRefreshToken = this._cookieExists('refresh_token');
            
            console.log('ENHANCED Cookie status:', {
                authenticated: authCookie,
                hasUserInfo: !!userInfoCookie,
                hasAccessToken: hasAccessToken,
                hasRefreshToken: hasRefreshToken,
                userInfoLength: userInfoCookie ? userInfoCookie.length : 0
            });
            
            if (authCookie === 'true' && userInfoCookie) {
                try {
                    let userInfo;
                    try {
                        userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
                    } catch (parseError) {
                        console.warn('Failed to parse user_info cookie, trying direct parse:', parseError);
                        userInfo = JSON.parse(userInfoCookie);
                    }
                    
                    if (this._validateUserInfo(userInfo)) {
                        // Enhanced validation - check if we have the httpOnly tokens
                        if (!hasAccessToken && !hasRefreshToken) {
                            console.warn('⚠️ ENHANCED: User info valid but no auth tokens detected');
                            // Still proceed but mark for validation
                            this._setAuthState(userInfo);
                            this._scheduleTokenValidation();
                            return true;
                        }
                        
                        this._setAuthState(userInfo);
                        return true;
                    }
                } catch (parseError) {
                    console.error('Failed to parse user info cookie:', parseError);
                }
            } else if (authCookie === 'true' && !userInfoCookie) {
                console.warn('⚠️ ENHANCED: authenticated=true but no user_info cookie');
                // Try to reconstruct from localStorage
                return this._attemptUserInfoReconstruction();
            }
            
            return false;
        } catch (error) {
            console.error('Error in enhanced cookie restoration:', error);
            return false;
        }
    },
    
    /**
     * Check if a cookie exists (works for httpOnly cookies too)
     */
    _cookieExists(name) {
        try {
            // For httpOnly cookies, we can't read the value but we can detect presence
            // by checking if the cookie name appears in document.cookie
            const cookieString = document.cookie;
            return cookieString.includes(`${name}=`);
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Attempt to reconstruct user info from other sources
     */
    _attemptUserInfoReconstruction() {
        try {
            console.log('🔧 ENHANCED: Attempting user info reconstruction...');
            
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            
            if (storedEmail && storedUserId) {
                const reconstructedUserInfo = {
                    email: storedEmail,
                    id: storedUserId,
                    session_id: storedSessionId || 'reconstructed_session'
                };
                
                if (this._validateUserInfo(reconstructedUserInfo)) {
                    console.log('✅ User info reconstructed from localStorage');
                    this._setAuthState(reconstructedUserInfo);
                    
                    // Update the user_info cookie
                    this._setCookie('user_info', JSON.stringify(reconstructedUserInfo), 1);
                    
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error in user info reconstruction:', error);
            return false;
        }
    },
    
    /**
     * Schedule token validation for background execution
     */
    _scheduleTokenValidation() {
        setTimeout(async () => {
            try {
                console.log('🔍 ENHANCED: Background token validation...');
                const isValid = await this._validateSessionAsync();
                if (!isValid) {
                    console.log('⚠️ Background validation failed, attempting refresh...');
                    await this.refreshTokenIfNeeded();
                }
            } catch (error) {
                console.warn('Background token validation failed:', error);
            }
        }, 2000); // 2 second delay
    },
    
    /**
     * Set up enhanced cookie monitoring
     */
    _setupCookieMonitoring() {
        // Monitor cookie changes every 30 seconds
        this.cookieMonitoringInterval = setInterval(() => {
            this._monitorCookieHealth();
        }, 30000);
    },
    
    /**
     * Monitor cookie health and auto-correct issues
     */
    _monitorCookieHealth() {
        if (!this.isAuthenticated()) return;
        
        try {
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            const hasAccessToken = this._cookieExists('access_token');
            
            // Check for inconsistencies
            if (this.authenticated && authCookie !== 'true') {
                console.warn('⚠️ ENHANCED: authenticated state mismatch, correcting...');
                this._setCookie('authenticated', 'true', 1);
            }
            
            if (this.authenticated && !userInfoCookie && this.userEmail && this.userId) {
                console.warn('⚠️ ENHANCED: missing user_info cookie, restoring...');
                const userInfo = {
                    email: this.userEmail,
                    id: this.userId,
                    session_id: this.sessionId
                };
                this._setCookie('user_info', JSON.stringify(userInfo), 1);
            }
            
            if (this.authenticated && !hasAccessToken) {
                console.warn('⚠️ ENHANCED: access_token cookie missing, may need refresh');
                this._scheduleTokenValidation();
            }
            
        } catch (error) {
            console.error('Error in cookie health monitoring:', error);
        }
    },
    
    /**
     * Set authentication state from user info
     */
    _setAuthState(userInfo) {
        console.log('🔐 ENHANCED: Setting authentication state:', {
            email: userInfo.email,
            id: userInfo.id,
            session_id: userInfo.session_id
        });
        
        this.authenticated = true;
        this.userEmail = userInfo.email;
        this.userId = userInfo.id;
        this.sessionId = userInfo.session_id;
        this.token = 'cookie_stored';
        this.refreshToken = 'cookie_stored';
        
        // Sync to localStorage
        this._syncToLocalStorage();
        
        // Ensure cookies are properly set
        this._setCookie('authenticated', 'true', 1);
        this._setCookie('user_info', JSON.stringify(userInfo), 1);
    },
    
    /**
     * Validate and repair authentication state asynchronously
     */
    async _validateAndRepairAsync() {
        try {
            console.log('🔧 ENHANCED: Background validation and repair...');
            
            const isValid = await this._validateSessionAsync();
            if (!isValid) {
                console.log('❌ Background validation failed, attempting repair...');
                
                // Try to refresh tokens
                const refreshSuccess = await this.refreshTokenIfNeeded();
                if (!refreshSuccess) {
                    console.log('❌ Token refresh failed, clearing state');
                    this._clearAuthState();
                } else {
                    console.log('✅ Authentication repaired via token refresh');
                }
            } else {
                console.log('✅ Background validation successful');
            }
            
            return isValid;
        } catch (error) {
            console.error('Error during background validation and repair:', error);
            return false;
        }
    },
    
    /**
     * Set up enhanced automatic token refresh
     */
    _setupEnhancedTokenRefresh() {
        // Check token every 3 minutes instead of 5
        this.tokenRefreshTimer = setInterval(() => {
            if (this.isAuthenticated()) {
                this.refreshTokenIfNeeded().catch(error => {
                    console.error('Scheduled enhanced token refresh failed:', error);
                });
            }
        }, 180000); // 3 minutes
        
        console.log('🔄 Enhanced token refresh scheduler started');
    },
    
    /**
     * Enhanced cookie management
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
            console.warn(`Enhanced error reading cookie ${name}:`, error);
        }
        return null;
    },
    
    _setCookie(name, value, days = 7) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        const secureFlag = window.location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax${secureFlag}`;
    },
    
    _deleteCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    },
    
    /**
     * Sync authentication state to localStorage
     */
    _syncToLocalStorage() {
        try {
            if (this.userEmail) this._setSecureItem('user_email', this.userEmail);
            if (this.userId) this._setSecureItem('user_id', this.userId);
            if (this.sessionId) this._setSecureItem('session_id', this.sessionId);
        } catch (error) {
            console.warn('Failed to sync to localStorage:', error);
        }
    },
    
    /**
     * Restore authentication from localStorage
     */
    _restoreFromLocalStorage() {
        try {
            console.log('💾 ENHANCED: Checking localStorage for authentication...');
            
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            const authCookie = this._getCookie('authenticated');
            
            console.log('ENHANCED LocalStorage status:', {
                email: !!storedEmail,
                userId: !!storedUserId,
                sessionId: !!storedSessionId,
                authCookie: authCookie
            });
            
            if (storedEmail && storedUserId && authCookie === 'true') {
                const userInfo = {
                    email: storedEmail,
                    id: storedUserId,
                    session_id: storedSessionId
                };
                
                if (this._validateUserInfo(userInfo)) {
                    this._setAuthState(userInfo);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error in enhanced localStorage restoration:', error);
            return false;
        }
    },
    
    /**
     * Attempt partial authentication restore
     */
    _attemptPartialRestore() {
        try {
            console.log('🔧 ENHANCED: Attempting partial authentication restore...');
            
            const authCookie = this._getCookie('authenticated');
            const hasAnyStorage = this._getSecureItem('user_email') || this._getSecureItem('user_id');
            const hasAnyToken = this._cookieExists('access_token') || this._cookieExists('refresh_token');
            
            if (authCookie === 'true' || hasAnyStorage || hasAnyToken) {
                console.log('Found enhanced partial auth data, will validate in background');
                this.authenticated = true;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error in enhanced partial restore:', error);
            return false;
        }
    },
    
    /**
     * Validate user info structure
     */
    _validateUserInfo(userInfo) {
        if (!userInfo || typeof userInfo !== 'object') {
            console.warn('Invalid user info: not an object');
            return false;
        }
        
        if (!userInfo.email || typeof userInfo.email !== 'string') {
            console.warn('Invalid user info: missing or invalid email');
            return false;
        }
        
        if (!userInfo.id || typeof userInfo.id !== 'string') {
            console.warn('Invalid user info: missing or invalid id');
            return false;
        }
        
        return true;
    },
    
    /**
     * Clear authentication state
     */
    _clearAuthState() {
        this.token = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        this.lastTokenRefresh = null;
        this.sessionValidationCache = null;
        this.sessionValidationExpiry = null;
        
        // Clear localStorage
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        this._removeSecureItem('session_id');
    },
    
    /**
     * Set up page visibility change handler
     */
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Page became visible, validate session
                this._validateSessionAsync().catch(error => {
                    console.error('Visibility session check failed:', error);
                });
            }
        });
    },
    
    /**
     * Secure storage methods
     */
    _setSecureItem(key, value) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.setItem(storageKey, value);
            return true;
        } catch (error) {
            console.error('Error storing secure item:', error);
            return false;
        }
    },
    
    _getSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            return localStorage.getItem(storageKey);
        } catch (error) {
            console.error('Error retrieving secure item:', error);
            return null;
        }
    },
    
    _removeSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.removeItem(storageKey);
            return true;
        } catch (error) {
            console.error('Error removing secure item:', error);
            return false;
        }
    }
};

// Export for global access - THIS WAS MISSING!
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}