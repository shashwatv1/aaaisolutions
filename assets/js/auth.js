/**
 * JWT-Based Authentication Service for AAAI Solutions
 * Implements dual-token system with access tokens and refresh tokens
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
        console.log('🔐 Initializing JWT Authentication Service...');
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        // Set debug mode
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Set up URLs based on environment
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            this.AUTH_BASE_URL = 'http://localhost:8080';
        } else {
            this.AUTH_BASE_URL = '';
        }
        
        // Initialize authentication state
        const authResult = this._initializeAuthState();
        
        if (authResult.success) {
            this._setupAutoRefresh();
            this._log('JWT Authentication initialized successfully', {
                authenticated: this.authenticated,
                hasAccessToken: !!this.accessToken,
                hasRefreshToken: this._hasRefreshTokenCookie()
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
                this._setAccessToken(storedToken.token, storedToken.expiresIn);
                this._setUserInfo(storedToken.user);
                
                this._log('Authentication state restored from storage');
                return { success: true };
            } else {
                // We have refresh token but no valid access token
                // This will be handled by silent refresh when needed
                this._log('Refresh token available, access token will be refreshed on demand');
                return { success: true };
            }
            
        } catch (error) {
            console.error('Error initializing auth state:', error);
            this._clearAuthState();
            return { success: false };
        }
    },

    /**
     * Request OTP for authentication
     */
    async requestOTP(email) {
        try {
            this._log(`Requesting OTP for: ${email}`);
            
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
            
            this._log('OTP request successful');
            return data;
            
        } catch (error) {
            console.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },

    /**
     * Verify OTP and establish JWT session
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Verifying OTP for: ${email}`);
            
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
            
            // Set access token and user information
            this._setAccessToken(tokens.access_token, tokens.expires_in);
            this._setUserInfo(user);
            
            // Store for persistence across page refresh
            this._storeAccessToken(tokens.access_token, tokens.expires_in, user);
            
            // Setup auto-refresh
            this._setupAutoRefresh();
            
            this._log('JWT authentication successful', {
                userId: user.id,
                email: user.email,
                expiresIn: tokens.expires_in
            });
            
            return data;
            
        } catch (error) {
            console.error('OTP Verification error:', error);
            this._clearAuthState();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Execute authenticated function calls
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            // Ensure we have a valid access token
            const accessToken = await this._ensureValidAccessToken();
            
            this._log(`Executing function: ${functionName}`);
            
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
                    // Token expired, try refresh
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
            this._log(`Function ${functionName} executed successfully`);
            return result;
            
        } catch (error) {
            console.error(`Function execution failed (${functionName}):`, error);
            throw error;
        }
    },

    /**
     * Refresh access token using refresh token
     */
    async refreshTokenIfNeeded() {
        // Check if refresh is already in progress
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }
        
        // Check if token needs refresh
        if (this.accessToken && this._isAccessTokenValid()) {
            return true;
        }
        
        return this._performTokenRefresh();
    },

    /**
     * Perform token refresh
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
     * Execute the actual token refresh
     */
    async _doTokenRefresh() {
        try {
            this._log('Performing token refresh...');
            
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
            
            // Update access token
            this._setAccessToken(data.tokens.access_token, data.tokens.expires_in);
            
            // Update stored token
            if (this.userEmail && this.userId) {
                this._storeAccessToken(data.tokens.access_token, data.tokens.expires_in, {
                    id: this.userId,
                    email: this.userEmail,
                    session_id: this.sessionId
                });
            }
            
            // Setup next refresh
            this._setupAutoRefresh();
            
            this._log('Token refresh successful');
            return true;
            
        } catch (error) {
            console.error('Token refresh failed:', error);
            this._clearAuthState();
            return false;
        }
    },

    /**
     * Logout user
     */
    async logout() {
        try {
            this._log('Logging out user...');
            
            // Clear auto-refresh timer
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            
            // Call logout endpoint to invalidate refresh token
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
            
            this._log('Logout completed');
            
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
        return this.authenticated && this.userEmail && this.userId;
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
            return this.accessToken;
        }
        return null;
    },

    /**
     * Check if user has persistent session
     */
    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
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
     * Ensure we have a valid access token
     */
    async _ensureValidAccessToken() {
        if (this._isAccessTokenValid()) {
            return this.accessToken;
        }
        
        // Try to refresh token
        const refreshed = await this.refreshTokenIfNeeded();
        if (!refreshed) {
            throw new Error('Unable to obtain valid access token');
        }
        
        return this.accessToken;
    },

    /**
     * Store access token in sessionStorage
     */
    _storeAccessToken(token, expiresIn, user) {
        try {
            const tokenData = {
                token: token,
                expiry: Date.now() + (expiresIn * 1000),
                expiresIn: expiresIn,
                user: user,
                stored: Date.now()
            };
            
            sessionStorage.setItem('aaai_access_token', JSON.stringify(tokenData));
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