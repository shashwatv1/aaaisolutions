/**
 * FIXED - Enhanced Authentication module for AAAI Solutions
 * Properly handles httpOnly cookies and authentication state
 */
const AuthService = {
    // Initialize the auth service with configuration
    init() {
        console.log('=== AuthService.init() FIXED START ===');
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
        
        // FIXED: Initialize authentication state with proper cookie handling
        const authRestored = this._initializeFromCookies();
        
        // Set up periodic token refresh and session management
        this._setupTokenRefresh();
        this._setupVisibilityHandler();
        
        window.AAAI_LOGGER?.info('FIXED AuthService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: this.isAuthenticated(),
            hasPersistentSession: this.hasPersistentSession(),
            authRestored: authRestored
        });
        
        console.log('=== FIXED AuthService.init() END ===');
        return this.isAuthenticated();
    },
    
    /**
     * FIXED: Initialize authentication state from cookies with proper httpOnly handling
     */
    _initializeFromCookies() {
        try {
            console.log('🔍 FIXED: Initializing from cookies...');
            
            // Get authentication status from cookies
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            console.log('FIXED Cookie check:', {
                authenticated: !!authCookie,
                userInfo: !!userInfoCookie,
                authValue: authCookie,
                userInfoValue: userInfoCookie ? userInfoCookie.substring(0, 50) + '...' : null
            });
            
            // FIXED: Check authentication based on accessible cookies only
            // access_token and refresh_token are httpOnly, so we can't read them with JS
            if (authCookie === 'true' && userInfoCookie) {
                try {
                    const userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
                    
                    // FIXED: Validate user info structure
                    if (!userInfo.email || !userInfo.id) {
                        console.warn('Invalid user info structure in cookie:', userInfo);
                        this._clearAuthState();
                        return false;
                    }
                    
                    // FIXED: Restore authentication state without requiring direct token access
                    this.userEmail = userInfo.email;
                    this.userId = userInfo.id;
                    this.sessionId = userInfo.session_id;
                    this.authenticated = true;
                    
                    // Set placeholder for tokens (they exist as httpOnly cookies)
                    this.token = 'cookie_stored'; // Placeholder - real token is in httpOnly cookie
                    this.refreshToken = 'cookie_stored'; // Placeholder
                    
                    // Store user info in localStorage as backup
                    this._setSecureItem('user_email', userInfo.email);
                    this._setSecureItem('user_id', userInfo.id);
                    this._setSecureItem('session_id', userInfo.session_id);
                    
                    console.log('✅ FIXED: Authentication state restored from cookies:', {
                        email: userInfo.email,
                        userId: userInfo.id,
                        sessionId: userInfo.session_id
                    });
                    
                    // FIXED: Validate session with server since we can't read tokens directly
                    // Do this asynchronously to not block initialization
                    setTimeout(() => {
                        this._validateSessionAsync().catch(error => {
                            console.warn('Session validation failed:', error);
                        });
                    }, 100);
                    
                    return true;
                } catch (parseError) {
                    console.error('Failed to parse user info cookie:', parseError);
                    this._clearAuthState();
                }
            }
            
            // FIXED: Try to restore from localStorage as fallback
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            
            if (storedEmail && storedUserId && authCookie === 'true') {
                console.log('⚠️ Restoring authentication from localStorage fallback');
                
                this.userEmail = storedEmail;
                this.userId = storedUserId;
                this.sessionId = storedSessionId;
                this.authenticated = true;
                this.token = 'cookie_stored';
                this.refreshToken = 'cookie_stored';
                
                // Validate this fallback state
                setTimeout(() => {
                    this._validateSessionAsync().catch(error => {
                        console.warn('Fallback session validation failed:', error);
                        this._clearAuthState();
                    });
                }, 100);
                
                return true;
            }
            
            console.log('⚠️ No valid cookie-based or localStorage authentication found');
            this._clearAuthState();
            return false;
            
        } catch (error) {
            console.error('Error initializing from cookies:', error);
            this._clearAuthState();
            return false;
        }
    },
    
    /**
     * FIXED: Async session validation for httpOnly cookie scenarios
     */
    async _validateSessionAsync() {
        try {
            console.log('🔍 Validating session with server...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Include httpOnly cookies
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (response.ok && data.valid) {
                console.log('✅ Session validation successful');
                
                // Update user info if server provides it
                if (data.user_info) {
                    this.userEmail = data.user_info.email || this.userEmail;
                    this.userId = data.user_info.id || this.userId;
                    this.sessionId = data.user_info.session_id || this.sessionId;
                    
                    // Update localStorage backup
                    this._setSecureItem('user_email', this.userEmail);
                    this._setSecureItem('user_id', this.userId);
                    this._setSecureItem('session_id', this.sessionId);
                }
                
                // Update token placeholder if server provides it
                if (data.token) {
                    this.token = data.token;
                }
                
                this.authenticated = true;
                return true;
            } else {
                console.log('❌ Session validation failed:', data);
                this._clearAuthState();
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Session validation timed out');
            } else {
                console.error('Session validation error:', error);
            }
            return false;
        }
    },
    
    /**
     * FIXED: OTP verification with proper state management
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
                credentials: 'include' // FIXED: Include credentials for cookie setting
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('✅ FIXED: OTP verification successful');
            
            // FIXED: Update authentication state (tokens are in httpOnly cookies now)
            this.userEmail = email;
            this.userId = data.id;
            this.sessionId = data.session_id;
            this.authenticated = true;
            
            // Set placeholders for tokens (they're in httpOnly cookies)
            this.token = 'cookie_stored';
            this.refreshToken = 'cookie_stored';
            
            // Store user info in localStorage as backup
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', data.id);
            this._setSecureItem('session_id', data.session_id);
            
            console.log('✅ FIXED: Authentication state updated');
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
     * FIXED: Token refresh with proper cookie handling
     */
    async refreshTokenIfNeeded() {
        if (!this.isAuthenticated()) {
            console.log('Not authenticated, no token to refresh');
            return false;
        }
        
        try {
            console.log('🔄 FIXED: Attempting token refresh...');
            
            // Try silent refresh first (uses httpOnly cookies)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
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
                console.log('✅ Token refresh successful');
                
                // Update authentication state if user info is provided
                if (data.user) {
                    this.userEmail = data.user.email || this.userEmail;
                    this.userId = data.user.id || this.userId;
                    this.sessionId = data.session_id || this.sessionId;
                    
                    // Update localStorage backup
                    this._setSecureItem('user_email', this.userEmail);
                    this._setSecureItem('user_id', this.userId);
                    this._setSecureItem('session_id', this.sessionId);
                }
                
                return true;
            } else {
                console.log('Token refresh failed:', response.status);
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
                console.error('Error refreshing token:', error);
            }
            return false;
        }
    },
    
    /**
     * FIXED: Execute function with proper authentication
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`FIXED: Executing function: ${functionName}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const response = await fetch(`${this.API_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include' // FIXED: Use cookies for authentication
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`Function execution failed:`, data);
                
                // Handle token expiration
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
    
    /**
     * FIXED: Send chat message with cookie authentication
     */
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            
            const response = await fetch(`${this.API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message }),
                signal: controller.signal,
                credentials: 'include' // FIXED: Use cookies for authentication
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('Chat message failed:', data);
                
                if (response.status === 401) {
                    console.warn('Session expired during chat message');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
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
     * FIXED: Logout with proper cleanup
     */
    async logout() {
        try {
            console.log('🚪 FIXED: Logging out...');
            
            // Clear token refresh timer
            if (this.tokenRefreshTimer) {
                clearInterval(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
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
            } catch (error) {
                console.warn('Server-side logout failed or timed out:', error);
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
     * FIXED: Check authentication status
     */
    isAuthenticated() {
        return this.authenticated && !!this.userId && !!this.userEmail;
    },
    
    /**
     * FIXED: Get current user information
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
     * FIXED: Get token for API requests (for WebSocket URL construction)
     */
    getToken() {
        // For WebSocket connections, we need to get the actual token
        // Since httpOnly cookies can't be read by JS, we'll make a request to get it
        return this.token;
    },
    
    /**
     * FIXED: Get WebSocket URL with proper token handling
     */
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        // FIXED: For WebSocket, we'll let the server handle authentication via cookies
        // No token in URL needed since server can read httpOnly cookies
        const url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        console.log(`FIXED WebSocket URL: ${url}`);
        return url;
    },
    
    /**
     * FIXED: Get user credits
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
     * FIXED: Request OTP (unchanged)
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
    
    // ============================================================
    // UTILITY METHODS (Enhanced for cookie handling)
    // ============================================================
    
    /**
     * Check if user has a persistent session
     */
    hasPersistentSession() {
        return !!(this._getCookie('authenticated') === 'true' || this._getSecureItem('user_id'));
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
            tokenValid: this.authenticated // Since we can't read httpOnly tokens
        };
    },
    
    /**
     * FIXED: Clear all authentication data
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

        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }

        console.log('🧹 All authentication data cleared');
    },
    
    // ============================================================
    // PRIVATE METHODS
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
                // Page became visible, validate session
                this._validateSessionAsync().catch(error => {
                    console.error('Visibility session check failed:', error);
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
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        this._removeSecureItem('session_id');
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
            'X-Session-ID': this.sessionId || ''
        };
    }
};

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}