/**
 * JWT Authentication Service for AAAI Solutions
 * Complete implementation with Bearer tokens, localStorage, and automatic refresh
 */
const AuthService = {
    // Core authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    accessToken: null,
    tokenExpiry: null,
    
    // Auto-refresh management
    refreshTimer: null,
    refreshPromise: null,
    isRefreshing: false,
    
    // Configuration
    TOKEN_STORAGE_KEY: 'aaai_access_token',
    USER_STORAGE_KEY: 'aaai_user_info',
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
    
    // URLs (set during init)
    AUTH_BASE_URL: null,
    API_BASE_URL: null,
    
    /**
     * Initialize the JWT authentication service
     */
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
        
        // Initialize authentication state with SYNCHRONOUS approach
        const authRestored = this._initializeEnhancedAuthStateSync();
        
        // Set up enhanced session management ONLY if authenticated
        if (authRestored) {
            this._setupEnhancedTokenRefresh();
            this._setupVisibilityHandler();
            this._setupCookieMonitoring();
            
            // Schedule async validation in background (non-blocking)
            setTimeout(() => {
                this._validateAndRepairAsync().catch(error => {
                    console.warn('Background validation failed:', error);
                });
            }, 1000);
        }
        
        
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
       
    async _validateAndRepairAsync() {
        // Skip if not marked for background validation
        if (!this._needsBackgroundValidation) {
            console.log('🔧 Background validation not needed, skipping');
            return true;
        }
        
        try {
            console.log('🔧 ENHANCED: Background validation and repair (NON-AGGRESSIVE)...');
            
            // Don't validate if we don't have basic auth state
            if (!this.authenticated || !this.userEmail || !this.userId) {
                console.log('❌ Background validation: Basic auth state missing');
                return false;
            }
            
            // Only validate if we haven't done so recently
            const now = Date.now();
            if (this.lastTokenRefresh && (now - this.lastTokenRefresh) < 300000) { // 5 minutes
                console.log('✅ Background validation: Recently validated, skipping');
                this._needsBackgroundValidation = false;
                return true;
            }
            
            // Perform gentle session validation
            const isValid = await this._validateSessionAsync();
            if (isValid) {
                console.log('✅ Background validation successful');
                this._needsBackgroundValidation = false;
                return true;
            }
            
            console.log('⚠️ Background validation failed, attempting gentle repair...');
            
            // Try to refresh tokens (non-aggressive)
            const refreshSuccess = await this._gentleTokenRefresh();
            if (refreshSuccess) {
                console.log('✅ Authentication repaired via gentle token refresh');
                this._needsBackgroundValidation = false;
                return true;
            }
            
            // If we still have persistent session data, don't clear state
            if (this.hasPersistentSession()) {
                console.log('⚠️ Background validation failed but persistent session exists, keeping state');
                // Schedule another validation attempt later
                setTimeout(() => {
                    if (this.authenticated) {
                        this._validateAndRepairAsync().catch(() => {});
                    }
                }, 60000); // Try again in 1 minute
                return true;
            }
            
            // Only clear state if we have no persistent data at all
            console.log('❌ Background validation failed and no persistent session, clearing state');
            this._clearAuthState();
            return false;
            
        } catch (error) {
            console.error('Error during background validation and repair:', error);
            // Don't clear state on error - might be temporary network issue
            console.log('⚠️ Background validation error, keeping state (might be temporary)');
            return false;
        }
    },

    async _gentleTokenRefresh() {
        try {
            console.log('🔄 GENTLE: Attempting gentle token refresh...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // Shorter timeout
            
            // Try silent refresh only (less intrusive)
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh-silent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ GENTLE: Token refresh successful');
                
                // Update last refresh time
                this.lastTokenRefresh = Date.now();
                
                // Update authentication state if provided
                if (data.user) {
                    this.userEmail = data.user.email || this.userEmail;
                    this.userId = data.user.id || this.userId;
                    this.sessionId = data.session_id || this.sessionId;
                    this._syncToLocalStorage();
                }
                
                return true;
            } else {
                console.log('❌ GENTLE: Token refresh failed with status:', response.status);
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Gentle token refresh timed out');
            } else {
                console.error('Gentle token refresh error:', error);
            }
            return false;
        }
    },
    
    /**
     * Enhanced session validation with better error handling
     */
    async _validateSessionAsync() {
        try {
            // Check cache first (but with shorter cache time for background validation)
            if (this.sessionValidationCache && this.sessionValidationExpiry && 
                Date.now() < this.sessionValidationExpiry - 240000) { // 4 minutes instead of 5
                console.log('🔍 Using cached session validation result');
                return this.sessionValidationCache;
            }
            
            console.log('🔍 ENHANCED: Validating session with server...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // Shorter timeout for background
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                console.log('❌ Session validation failed with status:', response.status);
                return false;
            }
            
            const data = await response.json();
            
            console.log('ENHANCED Session validation response:', {
                ok: response.ok,
                status: response.status,
                valid: data.valid,
                source: data.source
            });
            
            const isValid = data.valid;
            
            // Cache the result for 4 minutes (shorter for background validation)
            this.sessionValidationCache = isValid;
            this.sessionValidationExpiry = Date.now() + 240000;
            
            if (isValid && data.user_info) {
                // Gently update user info if provided
                this.userEmail = data.user_info.email || this.userEmail;
                this.userId = data.user_info.id || this.userId;
                this.sessionId = data.user_info.session_id || this.sessionId;
                this._syncToLocalStorage();
            }
            
            return isValid;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Session validation timed out');
            } else {
                console.error('Enhanced session validation error:', error);
            }
            return false;
        }
    },
    
    _initializeEnhancedAuthStateSync() {
        console.log('🔍 ENHANCED: Initializing authentication state SYNCHRONOUSLY...');
        
        try {
            // Step 1: Check cookies first - SYNCHRONOUS ONLY
            const cookieAuth = this._restoreFromEnhancedCookiesSync();
            if (cookieAuth) {
                console.log('✅ Authentication restored from enhanced cookies');
                return true;
            }
            
            // Step 2: Check localStorage as fallback - SYNCHRONOUS ONLY
            const localAuth = this._restoreFromLocalStorageSync();
            if (localAuth) {
                console.log('✅ Authentication restored from localStorage');
                return true;
            }
            
            // Step 3: Check for partial authentication data - SYNCHRONOUS ONLY
            const partialAuth = this._attemptPartialRestoreSync();
            if (partialAuth) {
                console.log('⚠️ Partial authentication restored, will validate in background');
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

    _restoreFromEnhancedCookiesSync() {
        try {
            console.log('🍪 ENHANCED: Checking cookies for authentication (SYNC)...');
            
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            // Additional cookie validation
            const hasAccessToken = this._cookieExists('access_token');
            const hasRefreshToken = this._cookieExists('refresh_token');
            
            console.log('ENHANCED Cookie status (SYNC):', {
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
                        // Set auth state immediately
                        this._setAuthState(userInfo);
                        
                        // Mark for background validation if no tokens detected
                        if (!hasAccessToken && !hasRefreshToken) {
                            console.warn('⚠️ ENHANCED: User info valid but no auth tokens detected - will validate in background');
                            this._needsBackgroundValidation = true;
                        }
                        
                        return true;
                    }
                } catch (parseError) {
                    console.error('Failed to parse user info cookie:', parseError);
                }
            } else if (authCookie === 'true' && !userInfoCookie) {
                console.warn('⚠️ ENHANCED: authenticated=true but no user_info cookie');
                // Try to reconstruct from localStorage
                return this._attemptUserInfoReconstructionSync();
            }
            
            return false;
        } catch (error) {
            console.error('Error in enhanced cookie restoration (SYNC):', error);
            return false;
        }
    },
    
    /**
     * SYNCHRONOUS: Restore authentication from localStorage
     */
    _restoreFromLocalStorageSync() {
        try {
            console.log('💾 ENHANCED: Checking localStorage for authentication (SYNC)...');
            
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            const authCookie = this._getCookie('authenticated');
            
            console.log('ENHANCED LocalStorage status (SYNC):', {
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
                    this._needsBackgroundValidation = true; // Mark for validation
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error in enhanced localStorage restoration (SYNC):', error);
            return false;
        }
    },
    
    /**
     * SYNCHRONOUS: Attempt partial authentication restore
     */
    _attemptPartialRestoreSync() {
        try {
            console.log('🔧 ENHANCED: Attempting partial authentication restore (SYNC)...');
            
            const authCookie = this._getCookie('authenticated');
            const hasAnyStorage = this._getSecureItem('user_email') || this._getSecureItem('user_id');
            const hasAnyToken = this._cookieExists('access_token') || this._cookieExists('refresh_token');
            
            if (authCookie === 'true' && (hasAnyStorage || hasAnyToken)) {
                console.log('Found enhanced partial auth data, will validate in background');
                
                // Try to set basic auth state if we have storage data
                if (hasAnyStorage) {
                    const email = this._getSecureItem('user_email');
                    const userId = this._getSecureItem('user_id');
                    const sessionId = this._getSecureItem('session_id');
                    
                    if (email && userId) {
                        this._setAuthState({
                            email: email,
                            id: userId,
                            session_id: sessionId || 'partial_session'
                        });
                    } else {
                        this.authenticated = true; // Minimal state
                    }
                } else {
                    this.authenticated = true; // Minimal state
                }
                
                this._needsBackgroundValidation = true;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error in enhanced partial restore (SYNC):', error);
            return false;
        }
    },
    
    /**
     * SYNCHRONOUS: Attempt to reconstruct user info from other sources
     */
    _attemptUserInfoReconstructionSync() {
        try {
            console.log('🔧 ENHANCED: Attempting user info reconstruction (SYNC)...');
            
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
                    console.log('✅ User info reconstructed from localStorage (SYNC)');
                    this._setAuthState(reconstructedUserInfo);
                    
                    // Update the user_info cookie
                    this._setCookie('user_info', JSON.stringify(reconstructedUserInfo), 1);
                    
                    this._needsBackgroundValidation = true;
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error in user info reconstruction (SYNC):', error);
            return false;
        }
    },
    
    /**
     * Request OTP for authentication
     */
    async requestOTP(email) {
        try {
            console.log(`📧 Requesting OTP for: ${email}`);
            
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
                console.error('OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            console.log('✅ OTP request successful');
            return responseData;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    /**
     * Verify OTP and establish JWT authentication
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`🔐 Verifying OTP for: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                signal: controller.signal,
                credentials: 'include' // Include for refresh token cookie
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('✅ OTP verification successful - JWT tokens received');
            
            // Extract authentication data
            const { user, tokens, authentication } = data;
            
            if (!user || !tokens || !tokens.access_token) {
                throw new Error('Invalid authentication response');
            }
            
            // Store authentication state
            this._setAuthState({
                user: user,
                accessToken: tokens.access_token,
                tokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000))
            });
            
            // Schedule token refresh
            this._scheduleTokenRefresh();
            
            console.log('✅ JWT authentication established');
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    /**
     * Execute function with JWT Bearer authentication
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`🚀 Executing function with JWT: ${functionName}`);
            
            // Auto-refresh token if needed
            await this._ensureValidToken();
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const executeUrl = `${this.API_BASE_URL}/api/function/${functionName}`;
            
            console.log(`📡 Making JWT-authenticated request to: ${executeUrl}`);
            console.log(`📝 Function: ${functionName}`);
            console.log(`👤 User: ${this.userEmail}`);
            
            const response = await fetch(executeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include' // For refresh token cookie
            });
            
            clearTimeout(timeoutId);
            
            console.log(`📊 Response status: ${response.status}`);
            
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
                
                console.error(`💥 Function execution failed:`, errorData);
                
                // Handle token expiration
                if (response.status === 401 && errorData.expired) {
                    console.log('🔄 Token expired, attempting refresh...');
                    try {
                        await this.refreshToken();
                        // Retry the request once with new token
                        return await this.executeFunction(functionName, inputData);
                    } catch (refreshError) {
                        console.error('Token refresh failed:', refreshError);
                        this._clearAuthState();
                        throw new Error('Session expired. Please log in again.');
                    }
                }
                
                if (response.status === 401) {
                    console.warn('🔓 Authentication failed');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
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
            
            console.log(`✅ Function ${functionName} executed successfully with JWT`);
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`💀 JWT function execution failed (${functionName}):`, error);
            throw error;
        }
    },
    
    /**
     * Refresh JWT access token using httpOnly refresh token
     */
    async refreshToken() {
        if (this.isRefreshing) {
            console.log('Token refresh already in progress, waiting...');
            return this.refreshPromise;
        }
        
        this.isRefreshing = true;
        this.refreshPromise = this._performTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    },
    
    /**
     * Perform actual token refresh
     */
    async _performTokenRefresh() {
        try {
            console.log('🔄 Refreshing JWT access token...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Include httpOnly refresh token
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.log('❌ Token refresh failed:', response.status, errorData);
                
                if (response.status === 401) {
                    console.log('Refresh token expired or invalid, clearing auth state');
                    this._clearAuthState();
                    throw new Error('Please log in again');
                }
                
                throw new Error(errorData.error || 'Token refresh failed');
            }
            
            const data = await response.json();
            console.log('✅ Token refreshed successfully');
            
            // Update authentication state with new token
            this._updateAuthState({
                accessToken: data.tokens.access_token,
                tokenExpiry: new Date(Date.now() + (data.tokens.expires_in * 1000)),
                user: data.user
            });
            
            // Reschedule next refresh
            this._scheduleTokenRefresh();
            
            return true;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Token refresh timed out');
            } else {
                console.error('Token refresh error:', error);
            }
            
            // Clear auth state on refresh failure
            this._clearAuthState();
            throw error;
        }
    },
    
    /**
     * Ensure valid token (refresh if needed)
     */
    async _ensureValidToken() {
        if (!this.accessToken || !this.tokenExpiry) {
            throw new Error('No access token available');
        }
        
        // Check if token expires soon
        const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
        
        if (timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD) {
            console.log('🔄 Token expires soon, refreshing...');
            await this.refreshToken();
        }
    },
    
    /**
     * Logout and clear all authentication
     */
    async logout() {
        try {
            console.log('🚪 JWT logout starting...');
            
            // Clear refresh timer
            this._clearRefreshTimer();
            
            // Attempt server-side logout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.accessToken ? `Bearer ${this.accessToken}` : ''
                    },
                    credentials: 'include',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('✅ Server-side logout completed');
            } catch (error) {
                console.warn('Server-side logout failed or timed out:', error);
            }
            
            // Clear local authentication state
            this._clearAuthState();
            
            console.log('✅ JWT logout successful');
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this._clearAuthState();
        }
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
            return result.data?.credits || 0;
        } catch (error) {
            console.error('Error getting user credits:', error);
            return 0;
        }
    },
    
    // ============================================================
    // JWT UTILITY METHODS
    // ============================================================
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated && 
               !!this.userId && 
               !!this.userEmail && 
               !!this.accessToken &&
               this._isTokenValid();
    },
    
    /**
     * Check if current token is valid (not expired)
     */
    _isTokenValid() {
        if (!this.tokenExpiry) return false;
        return this.tokenExpiry.getTime() > Date.now();
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
            tokenExpiry: this.tokenExpiry,
            tokenValid: this._isTokenValid()
        };
    },
    
    /**
     * Get access token
     */
    getToken() {
        return this.accessToken;
    },
    
    /**
     * Get authorization header for API calls
     */
    getAuthHeader() {
        return {
            'Authorization': `Bearer ${this.accessToken}`
        };
    },
    
    /**
     * Get session information
     */
    getSessionInfo() {
        return {
            authenticated: this.authenticated,
            userId: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            tokenValid: this._isTokenValid(),
            tokenExpiry: this.tokenExpiry,
            refreshScheduled: !!this.refreshTimer,
            authMethod: 'jwt_bearer'
        };
    },
    
    /**
     * Check if user has a persistent session
     */
    hasPersistentSession() {
        // Check if we have stored authentication or refresh token cookie
        const hasStoredAuth = !!localStorage.getItem(this.TOKEN_STORAGE_KEY);
        const hasRefreshCookie = document.cookie.includes('refresh_token=');
        return hasStoredAuth || hasRefreshCookie;
    },
    
    // ============================================================
    // PRIVATE METHODS
    // ============================================================
    
    /**
     * Restore authentication from localStorage
     */
    _restoreAuthFromStorage() {
        try {
            console.log('💾 Restoring JWT auth from localStorage...');
            
            const storedToken = localStorage.getItem(this.TOKEN_STORAGE_KEY);
            const storedUser = localStorage.getItem(this.USER_STORAGE_KEY);
            
            if (!storedToken || !storedUser) {
                console.log('No stored authentication found');
                return false;
            }
            
            const userInfo = JSON.parse(storedUser);
            const tokenExpiry = new Date(userInfo.tokenExpiry);
            
            // Check if token is expired
            if (tokenExpiry.getTime() <= Date.now()) {
                console.log('Stored token is expired, clearing storage');
                this._clearStorage();
                return false;
            }
            
            // Restore authentication state
            this.authenticated = true;
            this.userEmail = userInfo.email;
            this.userId = userInfo.id;
            this.sessionId = userInfo.sessionId;
            this.accessToken = storedToken;
            this.tokenExpiry = tokenExpiry;
            
            console.log('✅ JWT authentication restored from storage');
            return true;
            
        } catch (error) {
            console.error('Error restoring auth from storage:', error);
            this._clearStorage();
            return false;
        }
    },
    
    /**
     * Set authentication state and persist to storage
     */
    _setAuthState({ user, accessToken, tokenExpiry }) {
        console.log('🔐 Setting JWT authentication state');
        
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        this.accessToken = accessToken;
        this.tokenExpiry = tokenExpiry;
        
        // Persist to localStorage
        this._saveToStorage();
    },
    
    /**
     * Update authentication state (for token refresh)
     */
    _updateAuthState({ accessToken, tokenExpiry, user }) {
        if (accessToken) this.accessToken = accessToken;
        if (tokenExpiry) this.tokenExpiry = tokenExpiry;
        if (user) {
            this.userEmail = user.email || this.userEmail;
            this.userId = user.user_id || this.userId;
            this.sessionId = user.session_id || this.sessionId;
        }
        
        // Update storage
        this._saveToStorage();
    },
    
    /**
     * Clear authentication state
     */
    _clearAuthState() {
        console.log('🧹 Clearing JWT authentication state');
        
        this.authenticated = false;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this._clearRefreshTimer();
        this._clearStorage();
    },
    
    /**
     * Save authentication to localStorage
     */
    _saveToStorage() {
        try {
            if (this.accessToken) {
                localStorage.setItem(this.TOKEN_STORAGE_KEY, this.accessToken);
            }
            
            if (this.userEmail && this.userId) {
                const userInfo = {
                    email: this.userEmail,
                    id: this.userId,
                    sessionId: this.sessionId,
                    tokenExpiry: this.tokenExpiry?.toISOString()
                };
                localStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(userInfo));
            }
        } catch (error) {
            console.error('Error saving auth to storage:', error);
        }
    },
    
    /**
     * Clear localStorage
     */
    _clearStorage() {
        try {
            localStorage.removeItem(this.TOKEN_STORAGE_KEY);
            localStorage.removeItem(this.USER_STORAGE_KEY);
        } catch (error) {
            console.error('Error clearing storage:', error);
        }
    },
    
    /**
     * Setup automatic token refresh
     */
    _setupTokenRefresh() {
        // Check for expiring tokens every minute
        setInterval(() => {
            if (this.isAuthenticated()) {
                const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
                
                // Refresh if token expires in the next 5 minutes
                if (timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD && timeUntilExpiry > 0) {
                    console.log('🔄 Auto-refreshing token due to upcoming expiry');
                    this.refreshToken().catch(error => {
                        console.error('Auto-refresh failed:', error);
                    });
                }
            }
        }, 60000); // Check every minute
    },
    
    /**
     * Schedule token refresh
     */
    _scheduleTokenRefresh() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) return;
        
        const timeUntilRefresh = this.tokenExpiry.getTime() - Date.now() - this.TOKEN_REFRESH_THRESHOLD;
        
        if (timeUntilRefresh > 0) {
            this.refreshTimer = setTimeout(() => {
                console.log('🔄 Scheduled token refresh triggered');
                this.refreshToken().catch(error => {
                    console.error('Scheduled refresh failed:', error);
                });
            }, timeUntilRefresh);
            
            console.log(`⏰ Token refresh scheduled for ${new Date(Date.now() + timeUntilRefresh).toLocaleTimeString()}`);
        }
    },
    
    /**
     * Clear refresh timer
     */
    _clearRefreshTimer() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    },
    
    /**
     * Setup page visibility change handler
     */
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Page became visible, check if token needs refresh
                const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
                if (timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD) {
                    console.log('🔄 Page visible and token expires soon, refreshing...');
                    this.refreshToken().catch(error => {
                        console.error('Visibility refresh failed:', error);
                    });
                }
            }
        });
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}