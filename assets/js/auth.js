/**
 * FIXED Authentication Service for AAAI Solutions - WebSocket Only
 * WITH IMPROVED COOKIE DETECTION AND LESS AGGRESSIVE VALIDATION
 */
const AuthService = {
    // Core state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    token: null,
    refreshToken: null,
    
    // NEW: Authentication readiness state
    authenticationReady: false,
    authenticationPromise: null,
    
    // Timers and promises
    tokenRefreshTimer: null,
    refreshPromise: null,
    isRefreshing: false,
    
    // Enhanced state tracking
    lastTokenRefresh: null,
    sessionValidationCache: null,
    sessionValidationExpiry: null,
    cookieMonitoringInterval: null,

    // NEW: Prevent aggressive validation
    validationInProgress: false,
    lastValidationAttempt: null,
    validationCooldown: 10000, // 10 seconds between validation attempts

    // Initialize the auth service with proper async waiting
    init() {
        console.log('=== FIXED AuthService.init() START - WebSocket Only ===');
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
        
        window.AAAI_LOGGER?.info('FIXED AuthService initialized - WebSocket Only Mode', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: this.isAuthenticated(),
            hasPersistentSession: this.hasPersistentSession(),
            authRestored: authRestored,
            chatMode: 'websocket_only'
        });
        
        console.log('=== FIXED AuthService.init() END - WebSocket Only ===');
        console.log('Final auth state:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            hasTokens: !!this.token,
            websocketOnly: true,
            authenticationReady: this.authenticationReady
        });
        
        return this.isAuthenticated();
    },

    /**
     * IMPROVED: Wait for authentication to be ready with less aggressive validation
     */
    async waitForAuthentication(timeoutMs = 15000) {
        console.log('🔍 FIXED: Waiting for authentication to be fully ready...');
        
        // If already ready, return immediately
        if (this.authenticationReady) {
            console.log('✅ Authentication already ready');
            return true;
        }
        
        // If not authenticated at all, return false
        if (!this.isAuthenticated()) {
            console.log('❌ Not authenticated');
            return false;
        }
        
        // Check cooldown to prevent aggressive validation
        if (this.lastValidationAttempt && 
            (Date.now() - this.lastValidationAttempt) < this.validationCooldown) {
            console.log('⏳ Validation cooldown active, assuming ready');
            this.authenticationReady = true;
            return true;
        }
        
        // If there's already a promise in progress, wait for it
        if (this.authenticationPromise) {
            console.log('⏳ Authentication validation already in progress, waiting...');
            return this.authenticationPromise;
        }
        
        // Create new authentication validation promise
        this.authenticationPromise = this._performImprovedAuthValidation(timeoutMs);
        
        try {
            const result = await this.authenticationPromise;
            return result;
        } finally {
            this.authenticationPromise = null;
        }
    },

    /**
     * IMPROVED: Less aggressive authentication validation
     */
    async _performImprovedAuthValidation(timeoutMs = 15000) {
        console.log('🔧 FIXED: Performing improved authentication validation...');
        
        if (this.validationInProgress) {
            console.log('⏳ Validation already in progress');
            return false;
        }
        
        this.validationInProgress = true;
        this.lastValidationAttempt = Date.now();
        
        try {
            const startTime = Date.now();
            
            // Step 1: Check if we have valid session info
            if (!this.userEmail || !this.userId) {
                console.log('❌ Missing user credentials');
                this._clearAuthState();
                return false;
            }
            
            // Step 2: IMPROVED cookie detection - try actual API call instead of cookie detection
            console.log('🔍 Testing authentication with lightweight API call...');
            
            try {
                // Try a simple API call to test if tokens work
                const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include', // This will send httpOnly cookies
                    signal: AbortSignal.timeout(8000) // 8 second timeout
                });
                
                if (response.ok) {
                    const data = await response.json();
                    
                    if (data.valid) {
                        console.log('✅ FIXED: Authentication validation successful via API test!');
                        this.authenticationReady = true;
                        this.lastTokenRefresh = Date.now();
                        
                        // Update user info if provided
                        if (data.user_info) {
                            this.userEmail = data.user_info.email || this.userEmail;
                            this.userId = data.user_info.id || this.userId;
                            this.sessionId = data.user_info.session_id || this.sessionId;
                            this._syncToLocalStorage();
                        }
                        
                        return true;
                    }
                }
                
                console.log('⚠️ API validation failed, but continuing anyway');
                
            } catch (apiError) {
                console.log('⚠️ API validation error (might be network):', apiError.message);
                // Don't fail completely on network errors
            }
            
            // Step 3: Fallback - if we have user info and it's been less than 30 minutes, assume ready
            const lastRefresh = this.lastTokenRefresh || this._getStoredRefreshTime();
            const timeSinceRefresh = Date.now() - (lastRefresh || 0);
            
            if (timeSinceRefresh < 1800000) { // 30 minutes
                console.log('✅ FIXED: Assuming authentication ready based on recent activity');
                this.authenticationReady = true;
                return true;
            }
            
            // Step 4: Try token refresh as last resort
            console.log('🔄 Attempting token refresh as fallback...');
            const refreshSuccess = await this.refreshTokenIfNeeded();
            
            if (refreshSuccess) {
                console.log('✅ FIXED: Authentication ready after token refresh');
                this.authenticationReady = true;
                return true;
            }
            
            // If we get here, authentication failed
            console.log('❌ FIXED: Authentication validation failed, but not clearing state immediately');
            // Don't clear auth state immediately - let user try to refresh page
            return false;
            
        } catch (error) {
            console.error('❌ Error during authentication validation:', error);
            return false;
        } finally {
            this.validationInProgress = false;
        }
    },

    /**
     * IMPROVED: More conservative authentication readiness check
     */
    isAuthenticationReady() {
        // If explicitly marked as ready, return true
        if (this.authenticationReady) {
            return true;
        }
        
        // If authenticated and recent activity, assume ready
        if (this.authenticated && this.userId && this.userEmail) {
            const lastRefresh = this.lastTokenRefresh || this._getStoredRefreshTime();
            const timeSinceRefresh = Date.now() - (lastRefresh || 0);
            
            // If recent activity (within 30 minutes), assume ready
            if (timeSinceRefresh < 1800000) {
                this.authenticationReady = true;
                return true;
            }
        }
        
        return false;
    },

    /**
     * Enhanced execute function with improved authentication waiting
     */
    async executeFunction(functionName, inputData) {
        // First check basic authentication
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        // IMPROVED: More conservative auth ready check
        console.log('🔄 FIXED: Ensuring authentication is ready for API call...');
        
        // Quick check - if recently validated, proceed
        if (this.isAuthenticationReady()) {
            console.log('✅ Authentication ready (cached)');
        } else {
            // Only do full validation if necessary
            console.log('⏳ Need to validate authentication...');
            const authReady = await this.waitForAuthentication(10000); // Shorter timeout
            
            if (!authReady) {
                // Try once more with refresh
                console.log('🔄 Attempting token refresh before failing...');
                const refreshed = await this.refreshTokenIfNeeded();
                
                if (!refreshed) {
                    this._clearAuthState();
                    throw new Error('Authentication validation failed. Please log in again.');
                }
            }
        }
        
        try {
            console.log(`🚀 Executing function via API Gateway: ${functionName}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const executeUrl = `${this.AUTH_BASE_URL}/api/function/${functionName}`;
            
            console.log(`📡 Making request to API Gateway: ${executeUrl}`);
            console.log(`📝 Function: ${functionName}`);
            console.log(`📊 Input data:`, inputData);
            console.log(`👤 User: ${this.userEmail}`);
            
            const response = await fetch(executeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            
            console.log(`📊 API Gateway response status: ${response.status}`);
            
            if (!response.ok) {
                let errorData;
                try {
                    const responseText = await response.text();
                    console.log(`💥 Error response:`, responseText.substring(0, 300));
                    
                    if (responseText.trim().startsWith('<')) {
                        throw new Error(`Received HTML instead of JSON (status: ${response.status}). Check API Gateway configuration.`);
                    }
                    
                    errorData = JSON.parse(responseText);
                } catch (parseError) {
                    throw new Error(`HTTP ${response.status}: Failed to parse error response`);
                }
                
                console.error(`💥 API Gateway execution failed:`, errorData);
                
                if (response.status === 401) {
                    console.warn('🔓 Authentication failed');
                    this.authenticationReady = false;
                    
                    // Try one more token refresh before giving up
                    console.log('🔄 Attempting final token refresh...');
                    const finalRefresh = await this.refreshTokenIfNeeded();
                    
                    if (!finalRefresh) {
                        this._clearAuthState();
                        throw new Error('Session expired. Please log in again.');
                    }
                    
                    throw new Error('Authentication was refreshed. Please retry the operation.');
                }
                
                throw new Error(errorData.error || errorData.detail || errorData.message || `Failed to execute function: ${functionName}`);
            }
            
            // Parse successful response
            let data;
            try {
                const responseText = await response.text();
                
                if (responseText.trim().startsWith('<')) {
                    throw new Error('Received HTML instead of JSON - API Gateway route may not be configured properly');
                }
                
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('💥 Failed to parse successful response:', parseError);
                throw new Error(`Invalid response format: ${parseError.message}`);
            }
            
            console.log(`✅ Function ${functionName} executed successfully via API Gateway`);
            
            // Mark as ready after successful API call
            this.authenticationReady = true;
            this.lastTokenRefresh = Date.now();
            this._storeRefreshTime();
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`💀 API Gateway execution failed (${functionName}):`, error);
            throw error;
        }
    },

    /**
     * Enhanced OTP verification with better state management
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`FIXED: Verifying OTP for email: ${email}`);
            
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
            
            console.log('✅ FIXED: OTP verification successful - WebSocket ready');
            
            // Set authentication state
            const userInfo = {
                email: email,
                id: data.id,
                session_id: data.session_id
            };
            
            this._setAuthState(userInfo);
            
            // Clear validation cache and mark as ready
            this.sessionValidationCache = null;
            this.sessionValidationExpiry = null;
            this.authenticationReady = true; // Mark as ready after successful OTP
            
            // Record successful authentication
            this.lastTokenRefresh = Date.now();
            this._storeRefreshTime();
            
            console.log('✅ FIXED: Authentication state updated - Ready for API calls');
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('Fixed OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Request OTP
     */
    async requestOTP(email) {
        try {
            console.log(`FIXED: Requesting OTP for email: ${email}`);
            
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
                console.error('Fixed OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            console.log('✅ Fixed OTP request successful');
            return responseData;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('Fixed OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },

    /**
     * Enhanced logout with comprehensive cleanup
     */
    async logout() {
        try {
            console.log('🚪 FIXED: Logging out - WebSocket Only Mode...');
            
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
            
            console.log('✅ Fixed logout successful - WebSocket connections will be terminated');
        } catch (error) {
            console.error('Fixed logout error:', error);
            // Still clear local data even if server logout fails
            this.clearAuthData();
        }
    },

    /**
     * Enhanced WebSocket URL generation
     */
    getWebSocketURL(userId) {
        if (!this.isAuthenticationReady()) {
            console.warn('⚠️ WebSocket URL requested but authentication not fully ready');
            // Allow WebSocket creation even if not fully validated
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        const url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        console.log(`FIXED WebSocket URL for chat: ${url}`);
        return url;
    },

    /**
     * Get user credits
     */
    async getUserCredits() {
        if (!this.isAuthenticationReady()) {
            console.warn('⚠️ Getting user credits but auth not fully ready');
            // Try anyway
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
        this.refreshPromise = this._performFixedTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            if (result) {
                this.authenticationReady = true;
                this._storeRefreshTime();
            }
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    },

    /**
     * FIXED: Perform token refresh with better error handling
     */
    async _performFixedTokenRefresh() {
        try {
            console.log('🔄 FIXED: Attempting token refresh...');
            
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
                    credentials: 'include',
                    signal: controller.signal
                });
            } catch (fetchError) {
                console.log('Silent refresh failed, trying standard refresh...');
                
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
                console.log('✅ FIXED: Token refresh successful');
                
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
                console.log('❌ FIXED: Token refresh failed:', response.status, errorData);
                
                if (response.status === 401) {
                    console.log('Token refresh returned 401, but not clearing state immediately');
                    // Don't clear state immediately - let user try to refresh
                }
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Token refresh timed out');
            } else {
                console.error('Fixed token refresh error:', error);
            }
            return false;
        }
    },

    // Helper methods for storing/retrieving refresh time
    _storeRefreshTime() {
        try {
            localStorage.setItem('aaai_last_refresh', Date.now().toString());
        } catch (error) {
            console.warn('Could not store refresh time:', error);
        }
    },

    _getStoredRefreshTime() {
        try {
            const stored = localStorage.getItem('aaai_last_refresh');
            return stored ? parseInt(stored, 10) : null;
        } catch (error) {
            return null;
        }
    },

    // ============================================================
    // UTILITY METHODS - Updated for better behavior
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
            authenticationReady: this.authenticationReady,
            websocketReady: this.isAuthenticationReady()
        };
    },

    /**
     * Get token (placeholder for cookie-stored tokens)
     */
    getToken() {
        return this.token;
    },

    /**
     * Check if user has a persistent session
     */
    hasPersistentSession() {
        const hasAuthCookie = this._getCookie('authenticated') === 'true';
        const hasUserInfo = !!this._getCookie('user_info');
        const hasStoredUser = !!this._getSecureItem('user_id');
        
        return hasAuthCookie || hasUserInfo || hasStoredUser;
    },

    /**
     * Get enhanced session information
     */
    getSessionInfo() {
        return {
            authenticated: this.authenticated,
            authenticationReady: this.authenticationReady,
            userId: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            hasRefreshToken: this.hasPersistentSession(),
            tokenValid: this.authenticated,
            lastTokenRefresh: this.lastTokenRefresh,
            sessionValidationCached: !!this.sessionValidationCache,
            websocketReady: this.isAuthenticationReady(),
            chatMode: 'websocket_only',
            cookieHealth: {
                authenticated: this._getCookie('authenticated') === 'true',
                userInfo: !!this._getCookie('user_info')
            }
        };
    },

    /**
     * Enhanced clear all authentication data
     */
    clearAuthData() {
        // Clear localStorage
        ['auth_token', 'refresh_token', 'user_email', 'user_id', 'session_id', 'aaai_last_refresh'].forEach(key => {
            this._removeSecureItem(key);
        });

        // Clear instance data
        this.token = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        this.authenticationReady = false;
        this.isRefreshing = false;
        this.refreshPromise = null;
        this.authenticationPromise = null;
        this.validationInProgress = false;
        this.lastTokenRefresh = null;
        this.lastValidationAttempt = null;
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

        console.log('🧹 FIXED: All authentication data cleared');
    },

    /**
     * Get authentication headers
     */
    getAuthHeader() {
        return {
            'X-Session-ID': this.sessionId || '',
            'X-WebSocket-Ready': this.isAuthenticationReady() ? 'true' : 'false'
        };
    },

    // ============================================================
    // PRIVATE METHODS - Improved for better stability
    // ============================================================

    /**
     * FIXED: More conservative authentication state initialization
     */
    _initializeEnhancedAuthState() {
        console.log('🔍 FIXED: Initializing authentication state...');
        
        try {
            // Step 1: Check cookies first
            const cookieAuth = this._restoreFromFixedCookies();
            if (cookieAuth) {
                console.log('✅ Authentication restored from cookies');
                return true;
            }
            
            // Step 2: Check localStorage as fallback
            const localAuth = this._restoreFromLocalStorage();
            if (localAuth) {
                console.log('✅ Authentication restored from localStorage');
                return true;
            }
            
            console.log('❌ No authentication state found');
            this._clearAuthState();
            return false;
            
        } catch (error) {
            console.error('Error during fixed auth initialization:', error);
            this._clearAuthState();
            return false;
        }
    },

    /**
     * FIXED: Better cookie restoration
     */
    _restoreFromFixedCookies() {
        try {
            console.log('🍪 FIXED: Checking cookies for authentication...');
            
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            console.log('FIXED Cookie status:', {
                authenticated: authCookie,
                hasUserInfo: !!userInfoCookie,
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
                        this._setAuthState(userInfo);
                        
                        // IMPROVED: If we have user info and recent activity, mark as ready
                        const storedRefresh = this._getStoredRefreshTime();
                        if (storedRefresh && (Date.now() - storedRefresh) < 1800000) { // 30 minutes
                            console.log('✅ Marking as ready based on recent activity');
                            this.authenticationReady = true;
                        }
                        
                        return true;
                    }
                } catch (parseError) {
                    console.error('Failed to parse user info cookie:', parseError);
                }
            } else if (authCookie === 'true' && !userInfoCookie) {
                console.warn('⚠️ FIXED: authenticated=true but no user_info cookie');
                return this._attemptUserInfoReconstruction();
            }
            
            return false;
        } catch (error) {
            console.error('Error in fixed cookie restoration:', error);
            return false;
        }
    },

    /**
     * Attempt to reconstruct user info from other sources
     */
    _attemptUserInfoReconstruction() {
        try {
            console.log('🔧 FIXED: Attempting user info reconstruction...');
            
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
     * Set up less aggressive cookie monitoring
     */
    _setupCookieMonitoring() {
        this.cookieMonitoringInterval = setInterval(() => {
            this._monitorCookieHealth();
        }, 60000); // Check every 60 seconds instead of 30
    },

    /**
     * Monitor cookie health with less aggressive corrections
     */
    _monitorCookieHealth() {
        if (!this.isAuthenticated()) return;
        
        try {
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            // Check for basic inconsistencies only
            if (this.authenticated && authCookie !== 'true') {
                console.warn('⚠️ FIXED: authenticated state mismatch, correcting...');
                this._setCookie('authenticated', 'true', 1);
            }
            
            if (this.authenticated && !userInfoCookie && this.userEmail && this.userId) {
                console.warn('⚠️ FIXED: missing user_info cookie, restoring...');
                const userInfo = {
                    email: this.userEmail,
                    id: this.userId,
                    session_id: this.sessionId
                };
                this._setCookie('user_info', JSON.stringify(userInfo), 1);
            }
            
        } catch (error) {
            console.error('Error in cookie health monitoring:', error);
        }
    },

    /**
     * Set authentication state from user info
     */
    _setAuthState(userInfo) {
        console.log('🔐 FIXED: Setting authentication state:', {
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
     * Set up less aggressive automatic token refresh
     */
    _setupEnhancedTokenRefresh() {
        this.tokenRefreshTimer = setInterval(() => {
            if (this.isAuthenticated()) {
                // Only refresh if it's been a while
                const timeSinceRefresh = Date.now() - (this.lastTokenRefresh || 0);
                if (timeSinceRefresh > 600000) { // 10 minutes
                    this.refreshTokenIfNeeded().catch(error => {
                        console.error('Scheduled token refresh failed:', error);
                    });
                }
            }
        }, 300000); // Check every 5 minutes instead of 3
        
        console.log('🔄 Less aggressive token refresh scheduler started');
    },

    /**
     * Cookie management
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
            console.warn(`Error reading cookie ${name}:`, error);
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
            console.log('💾 FIXED: Checking localStorage for authentication...');
            
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            const authCookie = this._getCookie('authenticated');
            
            console.log('FIXED LocalStorage status:', {
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
            console.error('Error in localStorage restoration:', error);
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
        this.authenticationReady = false;
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
                // Only validate if it's been a while
                const timeSinceLastValidation = Date.now() - (this.lastValidationAttempt || 0);
                if (timeSinceLastValidation > 300000) { // 5 minutes
                    this.waitForAuthentication(5000).catch(error => {
                        console.error('Visibility session check failed:', error);
                    });
                }
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

// Export for global access
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}