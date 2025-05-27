/**
 * DEBUG VERSION - Enhanced Authentication module for AAAI Solutions
 * This version includes extensive logging to identify the URL construction issue
 */
const AuthService = {
    // Initialize the auth service with configuration
    init() {
        // DEBUG: Log initial state
        console.log('=== AuthService.init() DEBUG START ===');
        console.log('window.location.hostname:', window.location.hostname);
        console.log('window.AAAI_CONFIG exists:', !!window.AAAI_CONFIG);
        console.log('window.AAAI_CONFIG:', window.AAAI_CONFIG);
        
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
        
        // Initialize authentication state from cookies
        this._initializeFromCookies();
        
        // Set up periodic token refresh and session management
        this._setupTokenRefresh();
        this._setupVisibilityHandler();
        
        window.AAAI_LOGGER?.info('Enhanced AuthService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: this.isAuthenticated(),
            hasPersistentSession: this.hasPersistentSession()
        });
        
        console.log('=== Enhanced AuthService.init() END ===');
        return this.isAuthenticated();
    },
    
    /**
     * ENHANCED: Initialize authentication state from cookies with better parsing
     */
    _initializeFromCookies() {
        try {
            console.log('🔍 Initializing from cookies...');
            
            // Get authentication status from cookies
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            const accessTokenCookie = this._getCookie('access_token');
            const refreshTokenCookie = this._getCookie('refresh_token');
            
            console.log('Cookie check:', {
                authenticated: !!authCookie,
                userInfo: !!userInfoCookie,
                accessToken: !!accessTokenCookie,
                refreshToken: !!refreshTokenCookie
            });
            
            if (authCookie === 'true' && userInfoCookie && accessTokenCookie) {
                try {
                    const userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
                    
                    // Restore authentication state
                    this.token = accessTokenCookie;
                    this.refreshToken = refreshTokenCookie;
                    this.userEmail = userInfo.email;
                    this.userId = userInfo.id;
                    this.sessionId = userInfo.session_id;
                    this.authenticated = true;
                    
                    // Also store in localStorage as backup
                    this._setSecureItem('auth_token', accessTokenCookie);
                    if (this.refreshToken) {
                        this._setSecureItem('refresh_token', this.refreshToken);
                    }
                    this._setSecureItem('user_email', userInfo.email);
                    this._setSecureItem('user_id', userInfo.id);
                    
                    console.log('✅ Authentication state restored from cookies:', {
                        email: userInfo.email,
                        userId: userInfo.id,
                        hasRefreshToken: !!this.refreshToken
                    });
                    
                    // Validate token
                    if (!this._isTokenValid(this.token)) {
                        console.warn('⚠️ Stored token is invalid or expired, attempting refresh');
                        this._refreshTokenIfNeeded().catch(() => {
                            console.warn('Token refresh failed, clearing auth state');
                            this._clearAuthState();
                        });
                    }
                    
                    return true;
                } catch (parseError) {
                    console.error('Failed to parse user info cookie:', parseError);
                }
            }
            
            console.log('⚠️ No valid cookie-based authentication found');
            return false;
            
        } catch (error) {
            console.error('Error initializing from cookies:', error);
            this._clearAuthState();
            return false;
        }
    },
    
    /**
     * ENHANCED: Token refresh with better error handling and silent refresh support
     */
    async refreshTokenIfNeeded() {
        if (!this.token) {
            console.log('No token to refresh');
            return false;
        }
        
        try {
            // Check if token needs refresh (within 10 minutes of expiry)
            const tokenParts = this.token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                const timeUntilExpiry = payload.exp - (Date.now() / 1000);
                
                if (timeUntilExpiry > 600) { // More than 10 minutes left
                    console.log('Token still valid, no refresh needed');
                    return true;
                }
                
                console.log(`Token expires in ${Math.round(timeUntilExpiry)} seconds, refreshing...`);
            }
            
            // Prevent concurrent refresh attempts
            if (this.isRefreshing && this.refreshPromise) {
                console.log('Refresh already in progress, waiting...');
                return await this.refreshPromise;
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
            
        } catch (error) {
            console.error('Error in refreshTokenIfNeeded:', error);
            return false;
        }
    },
    
    /**
     * ENHANCED: Perform the actual token refresh with silent refresh support
     */
    async _performTokenRefresh() {
        console.log('🔄 Performing token refresh...');
        
        try {
            // Try silent refresh first (using cookies)
            console.log('Attempting silent refresh...');
            const silentResponse = await fetch(`${this.AUTH_BASE_URL}/auth/refresh-silent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (silentResponse.ok) {
                const data = await silentResponse.json();
                console.log('✅ Silent refresh successful');
                
                // Update tokens from cookies (they should be set automatically)
                const newAccessToken = this._getCookie('access_token');
                const newRefreshToken = this._getCookie('refresh_token');
                
                if (newAccessToken) {
                    this.token = newAccessToken;
                    this._setSecureItem('auth_token', newAccessToken);
                }
                
                if (newRefreshToken) {
                    this.refreshToken = newRefreshToken; 
                    this._setSecureItem('refresh_token', newRefreshToken);
                }
                
                return true;
            } else {
                console.log('Silent refresh failed, trying standard refresh...');
            }
        } catch (silentError) {
            console.log('Silent refresh error:', silentError.message);
        }
        
        // Fall back to standard refresh if silent refresh fails
        if (this.refreshToken) {
            try {
                console.log('Attempting standard refresh...');
                const standardResponse = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        refresh_token: this.refreshToken,
                        silent: false
                    }),
                    credentials: 'include'
                });
                
                if (standardResponse.ok) {
                    const data = await standardResponse.json();
                    console.log('✅ Standard refresh successful');
                    
                    // Update tokens
                    this.token = data.access_token;
                    if (data.refresh_token) {
                        this.refreshToken = data.refresh_token;
                    }
                    
                    // Store updated tokens
                    this._setSecureItem('auth_token', data.access_token);
                    if (data.refresh_token) {
                        this._setSecureItem('refresh_token', data.refresh_token);
                    }
                    
                    return true;
                } else {
                    const errorData = await standardResponse.json().catch(() => ({}));
                    console.error('Standard refresh failed:', errorData);
                }
            } catch (standardError) {
                console.error('Standard refresh error:', standardError);
            }
        }
        
        // If all refresh attempts fail
        console.error('❌ All token refresh attempts failed');
        this._clearAuthState();
        return false;
    },
    
    /**
     * ENHANCED: Force token refresh - tries all available methods
     */
    async forceTokenRefresh() {
        console.log('🔄 Forcing token refresh...');
        
        // Clear any existing refresh promise
        this.isRefreshing = false;
        this.refreshPromise = null;
        
        try {
            return await this.refreshTokenIfNeeded();
        } catch (error) {
            console.error('Force token refresh failed:', error);
            return false;
        }
    },
    
    /**
     * ENHANCED: OTP verification with better error handling
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`Verifying OTP for email: ${email}`);
            
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
            
            console.log('✅ OTP verification successful');
            
            // Update authentication state
            this.token = data.access_token;
            this.refreshToken = data.refresh_token;
            this.userEmail = email;
            this.userId = data.id;
            this.sessionId = data.session_id;
            this.authenticated = true;
            
            // Store in localStorage as backup
            this._setSecureItem('auth_token', data.access_token);
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', data.id);
            if (data.refresh_token) {
                this._setSecureItem('refresh_token', data.refresh_token);
            }
            
            console.log('✅ Authentication state updated');
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
     * ENHANCED: Execute function with automatic token refresh
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        // Ensure token is valid before making request
        const refreshed = await this.refreshTokenIfNeeded();
        if (!refreshed) {
            throw new Error('Unable to refresh authentication token');
        }
        
        try {
            console.log(`Executing function: ${functionName}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const response = await fetch(`${this.API_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`Function execution failed:`, data);
                
                // Handle token expiration
                if (response.status === 401) {
                    console.warn('Token expired during function execution, refreshing...');
                    const refreshed = await this.refreshTokenIfNeeded();
                    if (refreshed) {
                        throw new Error('Session expired. Please try again.');
                    } else {
                        throw new Error('Authentication failed. Please log in again.');
                    }
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
    
    /**
     * ENHANCED: Session validation with multiple auth methods
     */
    async validateSession() {
        try {
            console.log('🔍 Validating session...');
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok && data.valid) {
                console.log('✅ Session is valid');
                return data;
            } else {
                console.log('❌ Session validation failed:', data);
                return { valid: false, reason: data.reason || 'Unknown' };
            }
            
        } catch (error) {
            console.error('Session validation error:', error);
            return { valid: false, reason: 'Validation request failed' };
        }
    },
    
    /**
     * ENHANCED: Logout with proper cleanup
     */
    async logout() {
        try {
            console.log('🚪 Logging out...');
            
            // Clear token refresh timer
            if (this.tokenRefreshTimer) {
                clearInterval(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
            }
            
            // Attempt server-side logout
            try {
                await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.token}`
                    },
                    body: JSON.stringify({
                        refresh_token: this.refreshToken
                    }),
                    credentials: 'include'
                });
            } catch (error) {
                console.warn('Server-side logout failed:', error);
            }
            
            // Clear local auth data
            this.clearAuthData();
            
            console.log('✅ Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this.clearAuthData();
        }
    },
    
    /**
     * ENHANCED: Clear all authentication data
     */
    clearAuthData() {
        // Clear cookies
        const cookiesToClear = [
            'access_token', 'refresh_token', 'csrf_token',
            'user_info', 'user_preferences', 'websocket_id',
            'session_id', 'authenticated'
        ];

        cookiesToClear.forEach(cookieName => {
            this._deleteCookie(cookieName);
        });

        // Clear localStorage
        ['auth_token', 'refresh_token', 'user_email', 'user_id'].forEach(key => {
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

        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }

        console.log('🧹 All authentication data cleared');
    },
    
    // ============================================================
    // UTILITY METHODS (Enhanced)
    // ============================================================
    
    /**
     * Check if user has a persistent session (refresh token available)
     */
    hasPersistentSession() {
        return !!(this.refreshToken || this._getCookie('refresh_token') || this._getSecureItem('refresh_token'));
    },
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated && !!this.token && !!this.userId;
    },
    
    /**
     * Get current user information
     */
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },
    
    /**
     * Get token for API requests
     */
    getToken() {
        return this.token;
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
            hasRefreshToken: this.hasPersistentSession(),
            tokenValid: this.token ? this._isTokenValid(this.token) : false
        };
    },
    
    /**
     * Request OTP (unchanged)
     */
    async requestOTP(email) {
        try {
            console.log(`Requesting OTP for email: ${email}`);
            
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
     * Send chat message via HTTP API
     */
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        // Ensure token is valid
        await this.refreshTokenIfNeeded();
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            
            const response = await fetch(`${this.API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ message }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('Chat message failed:', data);
                
                if (response.status === 401) {
                    console.warn('Token expired during chat message');
                    await this.refreshTokenIfNeeded();
                    throw new Error('Session expired. Please try again.');
                }
                
                throw new Error(data.error || 'Failed to send message');
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error('Chat error:', error);
            throw error;
        }
    },
    
    /**
     * Get WebSocket URL
     */
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        const url = `${wsProtocol}//${wsHost}/ws/${userId}?token=${this.token}`;
        console.log(`WebSocket URL: ${url.replace(/token=[^&]*/, 'token=***')}`);
        return url;
    },
    
    // ============================================================
    // PRIVATE METHODS (Enhanced)
    // ============================================================
    
    /**
     * Set up automatic token refresh
     */
    _setupTokenRefresh() {
        // Check token every 5 minutes
        this.tokenRefreshTimer = setInterval(() => {
            if (this.isAuthenticated()) {
                this.refreshTokenIfNeeded().catch(error => {
                    console.error('Scheduled token refresh failed:', error);
                });
            }
        }, 300000); // 5 minutes
        
        console.log('🔄 Token refresh scheduler started');
    },
    
    /**
     * Set up page visibility change handler
     */
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Page became visible, check if token needs refresh
                this.refreshTokenIfNeeded().catch(error => {
                    console.error('Visibility refresh failed:', error);
                });
            }
        });
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
        
        // Clear localStorage
        this._removeSecureItem('auth_token');
        this._removeSecureItem('refresh_token');
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
    },
    
    /**
     * Validate token format and expiration
     */
    _isTokenValid(token) {
        try {
            if (!token) return false;
            
            const tokenParts = token.split('.');
            if (tokenParts.length !== 3) return false;
            
            const payload = JSON.parse(atob(tokenParts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            // Token is valid if it expires in the future (with 30-second buffer)
            return payload.exp && payload.exp > (now + 30);
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    },
    
    /**
     * Enhanced cookie management
     */
    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return decodeURIComponent(parts.pop().split(';').shift());
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
    },
    
    /**
     * Get authentication headers
     */
    getAuthHeader() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'X-Session-ID': this.sessionId || ''
        };
    }
};

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}