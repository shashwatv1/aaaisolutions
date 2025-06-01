/**
 * JWT-Based Authentication Service for AAAI Solutions
 * Fixed to use Gateway routing and proper token refresh
 */
const AuthService = {
    // Core authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    
    // Token management
    accessToken: null,
    tokenExpiry: null,
    refreshInProgress: false,
    refreshPromise: null,
    
    // Auto-refresh timer
    refreshTimer: null,
    
    // Configuration
    options: {
        refreshBufferTime: 2 * 60 * 1000, // 2 minutes before expiry
        maxRetryAttempts: 3,
        debug: false
    },

    /**
     * Initialize the authentication service
     */
    init() {
        console.log('🔐 Initializing JWT Authentication Service with Gateway routing...');
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        // Set debug mode
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Use Gateway URLs from config
        this.AUTH_BASE_URL = '';
        
        // Initialize authentication state
        const authResult = this._initializeAuthState();
        
        if (authResult.success) {
            this._setupAutoRefresh();
            this._log('JWT Authentication initialized successfully with Gateway', {
                authenticated: this.authenticated,
                hasAccessToken: !!this.accessToken,
                hasRefreshToken: this._hasRefreshTokenCookie(),
                gatewayURL: this.AUTH_BASE_URL
            });
        }
        
        return authResult.success;
    },

    /**
     * Initialize authentication state from stored tokens
     */
    _initializeAuthState() {
        try {
            // Check for refresh token cookie indicator
            const hasRefreshToken = this._hasRefreshTokenCookie();
            
            if (!hasRefreshToken) {
                this._log('No refresh token found');
                return { success: false };
            }
            
            // Try to restore access token from sessionStorage
            const storedToken = this._getStoredAccessToken();
            
            if (storedToken && this._isTokenValid(storedToken)) {
                // Validate that stored token is a user token
                const validationResult = this._validateUserToken(storedToken.token);
                if (validationResult.valid) {
                    this._setAccessToken(storedToken.token, storedToken.expiresIn);
                    this._setUserInfo(storedToken.user);
                    
                    this._log('Authentication state restored from storage');
                    return { success: true };
                } else {
                    this._log('Stored token is not a valid user token:', validationResult.reason);
                    sessionStorage.removeItem('aaai_access_token');
                }
            }
            
            // We have refresh token but no valid access token
            // This will be handled by silent refresh when needed
            this._log('Refresh token available, access token will be refreshed on demand');
            return { success: true };
            
        } catch (error) {
            console.error('Error initializing auth state:', error);
            this._clearAuthState();
            return { success: false };
        }
    },

    /**
     * Enhanced user token validation
     */
    _validateUserToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return { valid: false, reason: 'Invalid token format' };
            }
            
            // Parse token payload
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, reason: 'Invalid JWT format' };
            }
            
            // Decode payload
            let payload;
            try {
                const paddedPayload = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
                const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
                payload = JSON.parse(decoded);
            } catch (error) {
                return { valid: false, reason: 'Failed to decode token payload' };
            }
            
            // Check for required user claims
            if (!payload.email) {
                return { valid: false, reason: 'Token missing email claim' };
            }
            
            if (!payload.user_id) {
                return { valid: false, reason: 'Token missing user_id claim' };
            }
            
            // Check that this is NOT a service account token
            if (payload.email.includes('@developer.gserviceaccount.com') || 
                payload.email.includes('.gserviceaccount.com')) {
                return { valid: false, reason: 'Service account token not allowed' };
            }
            
            // Check issuer
            if (payload.iss && payload.iss.includes('serviceaccount')) {
                return { valid: false, reason: 'Service account issued token not allowed' };
            }
            
            // Check token type
            if (payload.token_type === 'service_account') {
                return { valid: false, reason: 'Explicit service account token not allowed' };
            }
            
            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return { valid: false, reason: 'Token expired' };
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(payload.email)) {
                return { valid: false, reason: 'Invalid email format' };
            }
            
            return { valid: true, payload: payload };
            
        } catch (error) {
            return { valid: false, reason: `Token validation error: ${error.message}` };
        }
    },

    /**
     * Request OTP for authentication via Gateway
     */
    async requestOTP(email) {
        try {
            this._log(`Requesting OTP for: ${email} via Gateway`);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Failed to request OTP');
            }
            
            this._log('OTP request successful via Gateway');
            return data;
            
        } catch (error) {
            console.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },

    /**
     * Verify OTP and establish JWT session via Gateway
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Verifying OTP for: ${email} via Gateway`);
            
            // Clear any existing state
            this._clearAuthState();
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                credentials: 'include' // Important: includes HTTP-only cookies
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            // Extract tokens and user info
            const { user, tokens, authentication } = data;
            
            // Validate that we received a user access token
            const validationResult = this._validateUserToken(tokens.access_token);
            if (!validationResult.valid) {
                this._log('Received invalid user token from authentication:', validationResult.reason);
                throw new Error(`Invalid token received: ${validationResult.reason}`);
            }
            
            this._log('Valid user token received from authentication:', {
                email: validationResult.payload.email,
                user_id: validationResult.payload.user_id
            });
            
            // Set access token and user information
            this._setAccessToken(tokens.access_token, tokens.expires_in);
            this._setUserInfo(user);
            
            // Store for persistence across page refresh
            this._storeAccessToken(tokens.access_token, tokens.expires_in, user);
            
            // Setup auto-refresh
            this._setupAutoRefresh();
            
            this._log('JWT authentication successful via Gateway', {
                userId: user.id,
                email: user.email,
                expiresIn: tokens.expires_in,
                tokenType: 'user_access_token'
            });
            
            return data;
            
        } catch (error) {
            console.error('OTP Verification error:', error);
            this._clearAuthState();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Execute authenticated function calls via Gateway
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            // Ensure we have a valid access token
            const accessToken = await this._ensureValidAccessToken();
            
            // Double-check token validity before using
            const validationResult = this._validateUserToken(accessToken);
            if (!validationResult.valid) {
                this._log('Current token validation failed:', validationResult.reason);
                this._clearAuthState();
                throw new Error(`Invalid token: ${validationResult.reason}`);
            }
            
            this._log(`Executing function: ${functionName} via Gateway with user token for:`, validationResult.payload.email);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(inputData),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 401) {
                    // Token expired or invalid, try refresh
                    this._log('401 error, attempting token refresh');
                    const refreshed = await this.refreshTokenIfNeeded();
                    if (refreshed) {
                        // Retry with new token
                        return this.executeFunction(functionName, inputData);
                    } else {
                        this._clearAuthState();
                        throw new Error('Session expired. Please log in again.');
                    }
                }
                
                throw new Error(errorData.error || errorData.detail || `Function execution failed: ${functionName}`);
            }
            
            const result = await response.json();
            this._log(`Function ${functionName} executed successfully via Gateway`);
            return result;
            
        } catch (error) {
            console.error(`Function execution failed (${functionName}):`, error);
            throw error;
        }
    },

    /**
     * Refresh access token using refresh token via Gateway
     */
    async refreshTokenIfNeeded() {
        // Check if refresh is already in progress
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }
        
        // Check if token needs refresh
        if (this.accessToken && this._isAccessTokenValid()) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (validationResult.valid) {
                return true;
            } else {
                this._log('Current token invalid, forcing refresh:', validationResult.reason);
            }
        }
        
        return this._performTokenRefresh();
    },

    /**
     * Perform token refresh via Gateway
     */
    async _performTokenRefresh() {
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }
        
        this.refreshInProgress = true;
        this.refreshPromise = this._doTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.refreshInProgress = false;
            this.refreshPromise = null;
        }
    },

    /**
     * Execute the actual token refresh via Gateway
     */
    async _doTokenRefresh() {
        try {
            this._log('Performing token refresh via Gateway...');
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include' // Include HTTP-only refresh token cookie
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    this._log('Refresh token expired, clearing session');
                    this._clearAuthState();
                    return false;
                }
                throw new Error(data.error || 'Token refresh failed');
            }
            
            // Handle different response formats
            let accessToken, expiresIn;
            
            if (data.tokens) {
                // New format: { tokens: { access_token, expires_in } }
                accessToken = data.tokens.access_token;
                expiresIn = data.tokens.expires_in;
            } else if (data.access_token) {
                // Direct format: { access_token, expires_in }
                accessToken = data.access_token;
                expiresIn = data.expires_in;
            } else {
                throw new Error('Invalid refresh response format');
            }
            
            // Validate that we received a user access token
            const validationResult = this._validateUserToken(accessToken);
            if (!validationResult.valid) {
                this._log('Received invalid user token from refresh:', validationResult.reason);
                this._clearAuthState();
                return false;
            }
            
            this._log('Valid user token received from refresh:', {
                email: validationResult.payload.email,
                user_id: validationResult.payload.user_id
            });
            
            // Update access token
            this._setAccessToken(accessToken, expiresIn);
            
            // Update stored token
            if (this.userEmail && this.userId) {
                this._storeAccessToken(accessToken, expiresIn, {
                    id: this.userId,
                    email: this.userEmail,
                    session_id: this.sessionId
                });
            }
            
            // Setup next refresh
            this._setupAutoRefresh();
            
            this._log('Token refresh successful via Gateway');
            return true;
            
        } catch (error) {
            console.error('Token refresh failed:', error);
            this._clearAuthState();
            return false;
        }
    },

    /**
     * Logout user via Gateway
     */
    async logout() {
        try {
            this._log('Logging out user via Gateway...');
            
            // Clear auto-refresh timer
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            
            // Call logout endpoint to invalidate refresh token via Gateway
            if (this.accessToken) {
                try {
                    await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.accessToken}`
                        },
                        credentials: 'include'
                    });
                } catch (error) {
                    console.warn('Logout API call failed:', error);
                }
            }
            
            // Clear local state
            this._clearAuthState();
            
            this._log('Logout completed via Gateway');
            
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local state even if server logout fails
            this._clearAuthState();
        }
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const hasBasicAuth = this.authenticated && this.userEmail && this.userId && this.accessToken;
        
        if (!hasBasicAuth) {
            return false;
        }
        
        // Additional validation that token is a user token
        const validationResult = this._validateUserToken(this.accessToken);
        if (!validationResult.valid) {
            this._log('Authentication invalid due to token validation:', validationResult.reason);
            this._clearAuthState();
            return false;
        }
        
        return true;
    },

    /**
     * Get current user information
     */
    getCurrentUser() {
        if (!this.isAuthenticated()) {
            return null;
        }
        
        return {
            id: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },

    /**
     * Get valid access token
     */
    getToken() {
        if (this._isAccessTokenValid()) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (validationResult.valid) {
                return this.accessToken;
            } else {
                this._log('Token invalid during getToken():', validationResult.reason);
                return null;
            }
        }
        return null;
    },

    /**
     * Check if user has persistent session
     */
    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
    },

    /**
     * Ensure we have a valid access token
     */
    async _ensureValidAccessToken() {
        // Check if current token is valid
        if (this._isAccessTokenValid()) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (validationResult.valid) {
                return this.accessToken;
            } else {
                this._log('Current token validation failed:', validationResult.reason);
                this.accessToken = null;
                this.tokenExpiry = null;
            }
        }
        
        // Try to restore from session storage
        const storedToken = this._getStoredAccessToken();
        if (storedToken && this._isTokenValid(storedToken)) {
            const validationResult = this._validateUserToken(storedToken.token);
            if (validationResult.valid) {
                this._log('Restoring valid user token from session storage');
                this._setAccessToken(storedToken.token, storedToken.expiresIn);
                this._setUserInfo(storedToken.user);
                return this.accessToken;
            } else {
                this._log('Stored token validation failed:', validationResult.reason);
                sessionStorage.removeItem('aaai_access_token');
            }
        }
        
        // Try to refresh token
        const refreshed = await this.refreshTokenIfNeeded();
        if (!refreshed) {
            throw new Error('Unable to obtain valid user access token');
        }
        
        return this.accessToken;
    },
        
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated && this.userEmail && this.userId;
    },

    /**
     * Enhanced authentication check - validates complete authentication state
     */
    _isAuthenticationComplete() {
        return this.authenticated && 
               this.userEmail && 
               this.userId && 
               this.accessToken && 
               this._isAccessTokenValid();
    },

    /**
     * Wait for authentication to be ready
     */
    async _waitForAuthReady(timeout = 5000) {
        const startTime = Date.now();
        
        while (!this._isAuthenticationComplete() && (Date.now() - startTime) < timeout) {
            // Try to refresh token if we have refresh capability
            if (this._hasRefreshTokenCookie() && !this.refreshInProgress) {
                try {
                    const refreshed = await this.refreshTokenIfNeeded();
                    if (refreshed && this._isAuthenticationComplete()) {
                        return true;
                    }
                } catch (error) {
                    console.warn('Auth refresh failed during wait:', error);
                }
            }
            
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return this._isAuthenticationComplete();
    },

    /**
     * Ensure authentication is ready before proceeding
     */
    async _ensureAuthReady() {
        if (this._isAuthenticationComplete()) {
            return true;
        }
        
        if (this._hasRefreshTokenCookie()) {
            try {
                const refreshed = await this.refreshTokenIfNeeded();
                return refreshed && this._isAuthenticationComplete();
            } catch (error) {
                console.error('Failed to ensure auth ready:', error);
                return false;
            }
        }
        
        return false;
    },

    // Private methods

    /**
     * Set access token and expiry
     */
    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
    },

    /**
     * Set user information
     */
    _setUserInfo(user) {
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
    },

    /**
     * Clear all authentication state
     */
    _clearAuthState() {
        this.authenticated = false;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        
        // Clear stored tokens
        sessionStorage.removeItem('aaai_access_token');
        
        // Clear refresh timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        
        this._log('Authentication state cleared');
    },

    /**
     * Check if access token is valid
     */
    _isAccessTokenValid() {
        return this.accessToken && 
               this.tokenExpiry && 
               Date.now() < (this.tokenExpiry - this.options.refreshBufferTime);
    },

    /**
     * Check if stored token is valid
     */
    _isTokenValid(storedToken) {
        return storedToken && 
               storedToken.token && 
               storedToken.expiry && 
               Date.now() < storedToken.expiry;
    },

    /**
     * Store access token in sessionStorage
     */
    _storeAccessToken(token, expiresIn, user) {
        try {
            // Validate token before storing
            const validationResult = this._validateUserToken(token);
            if (!validationResult.valid) {
                this._log('Refusing to store invalid user token:', validationResult.reason);
                return;
            }
            
            const tokenData = {
                token: token,
                expiry: Date.now() + (expiresIn * 1000),
                expiresIn: expiresIn,
                user: user,
                stored: Date.now()
            };
            
            sessionStorage.setItem('aaai_access_token', JSON.stringify(tokenData));
            this._log('Valid user token stored successfully');
        } catch (error) {
            console.warn('Failed to store access token:', error);
        }
    },

    /**
     * Get stored access token
     */
    _getStoredAccessToken() {
        try {
            const stored = sessionStorage.getItem('aaai_access_token');
            if (!stored) return null;
            
            const tokenData = JSON.parse(stored);
            
            // Check if token is expired
            if (Date.now() >= tokenData.expiry) {
                sessionStorage.removeItem('aaai_access_token');
                return null;
            }
            
            return tokenData;
        } catch (error) {
            console.warn('Failed to retrieve stored token:', error);
            sessionStorage.removeItem('aaai_access_token');
            return null;
        }
    },

    /**
     * Check if refresh token cookie exists
     */
    _hasRefreshTokenCookie() {
        return document.cookie.includes('authenticated=true') || 
               document.cookie.includes('refresh_token=');
    },

    /**
     * Setup automatic token refresh
     */
    _setupAutoRefresh() {
        // Clear existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        if (!this.tokenExpiry) return;
        
        // Calculate when to refresh (2 minutes before expiry)
        const refreshTime = this.tokenExpiry - Date.now() - this.options.refreshBufferTime;
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(() => {
                this._performTokenRefresh().catch(error => {
                    console.error('Automatic token refresh failed:', error);
                });
            }, refreshTime);
            
            this._log(`Auto-refresh scheduled in ${Math.round(refreshTime / 1000)} seconds`);
        }
    },

    /**
     * Debug logging
     */
    _log(...args) {
        if (this.options.debug) {
            console.log('[AuthService]', ...args);
        }
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}