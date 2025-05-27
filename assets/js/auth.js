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
        console.log('WS_BASE_URL:', this.WS_BASE_URL);
        console.log('=== AuthService.init() DEBUG END ===');
        
        // Initialize authentication state from cookies
        this._initializeFromCookies();
        
        // Set up periodic token refresh
        this._setupTokenRefresh();
        
        // Set up visibility change handler for session management
        this._setupVisibilityHandler();
        
        window.AAAI_LOGGER.info('Enhanced AuthService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            apiBaseUrl: this.API_BASE_URL,
            wsBaseUrl: this.WS_BASE_URL,
            authenticated: this.isAuthenticated(),
            persistentSession: this.hasPersistentSession()
        });
        
        return this.isAuthenticated();
    },
    
    // Initialize authentication state from cookies
    _initializeFromCookies() {
        try {
            // Get authentication status from cookie
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            const accessTokenCookie = this._getCookie('access_token');
            const refreshTokenCookie = this._getCookie('refresh_token');
            
            if (authCookie === 'true' && userInfoCookie && accessTokenCookie) {
                const userInfo = JSON.parse(userInfoCookie);
                
                // Restore authentication state
                this.token = accessTokenCookie;
                this.refreshToken = refreshTokenCookie || this._getSecureItem('refresh_token');
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
                
                window.AAAI_LOGGER.info('Authentication state restored from cookies', {
                    email: userInfo.email,
                    userId: userInfo.id,
                    hasRefreshToken: !!this.refreshToken
                });
                
                return true;
            } else {
                // Check localStorage as fallback
                this.token = this._getSecureItem('auth_token');
                this.refreshToken = this._getSecureItem('refresh_token');
                this.userEmail = this._getSecureItem('user_email');
                this.userId = this._getSecureItem('user_id');
                this.authenticated = !!(this.token && this.userId);
                
                if (this.authenticated) {
                    window.AAAI_LOGGER.info('Authentication state restored from localStorage');
                }
            }
            
            // Validate token if present
            if (this.token) {
                if (!this._isTokenValid(this.token)) {
                    window.AAAI_LOGGER.warn('Stored token is invalid or expired');
                    // Force immediate refresh if we have refresh token
                    if (this.refreshToken) {
                        this._refreshAccessToken(this.refreshToken).catch(() => {
                            this._clearAuthState();
                        });
                    } else {
                        this._clearAuthState();
                    }
                    return false;
                }
            }
            
            return this.authenticated;
            
        } catch (error) {
            window.AAAI_LOGGER.error('Error initializing from cookies:', error);
            this._clearAuthState();
            return false;
        }
    },
    
    // FIXED: Enhanced token refresh with proper refresh token handling
    async _checkAndRefreshToken() {
        if (!this.token) return false;
        
        try {
            const tokenParts = this.token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                const timeUntilExpiry = payload.exp - (Date.now() / 1000);
                
                // Refresh if token expires in less than 10 minutes
                if (timeUntilExpiry < 600) {
                    if (this.refreshToken) {
                        return await this._refreshAccessToken(this.refreshToken);
                    } else {
                        window.AAAI_LOGGER.warn('Token expiring soon but no refresh token available');
                        // Try to get a new refresh token by re-authenticating silently
                        return await this._attemptSilentRefresh();
                    }
                }
            }
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error checking token expiration:', error);
            if (this.refreshToken) {
                return await this._refreshAccessToken(this.refreshToken);
            }
            this.logout();
            return false;
        }
    },
    
    // FIXED: Proper refresh access token implementation
    async _refreshAccessToken(refreshToken) {
        try {
            window.AAAI_LOGGER.info('Refreshing access token...');
            
            const url = `${this.AUTH_BASE_URL}/auth/refresh`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    refresh_token: refreshToken,
                    grant_type: 'refresh_token'
                }),
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Update tokens
                this.token = data.access_token;
                if (data.refresh_token) {
                    this.refreshToken = data.refresh_token;
                }
                
                // Store updated tokens
                this._setSecureItem('auth_token', data.access_token);
                if (data.refresh_token) {
                    this._setSecureItem('refresh_token', data.refresh_token);
                    this._setCookie('refresh_token', data.refresh_token, 7); // 7 days
                }
                this._setCookie('access_token', data.access_token, 1); // 1 day
                
                window.AAAI_LOGGER.info('Access token refreshed successfully');
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                window.AAAI_LOGGER.warn('Failed to refresh access token:', errorData);
                
                // Try silent refresh as fallback
                return await this._attemptSilentRefresh();
            }
        } catch (error) {
            window.AAAI_LOGGER.error('Error refreshing access token:', error);
            // Try silent refresh as fallback
            return await this._attemptSilentRefresh();
        }
    },
    
    // FIXED: Add silent refresh capability
    async _attemptSilentRefresh() {
        try {
            window.AAAI_LOGGER.info('Attempting silent token refresh...');
            
            const url = `${this.AUTH_BASE_URL}/auth/refresh-silent`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Update tokens
                this.token = data.access_token;
                if (data.refresh_token) {
                    this.refreshToken = data.refresh_token;
                }
                
                // Store updated tokens
                this._setSecureItem('auth_token', data.access_token);
                if (data.refresh_token) {
                    this._setSecureItem('refresh_token', data.refresh_token);
                    this._setCookie('refresh_token', data.refresh_token, 7);
                }
                this._setCookie('access_token', data.access_token, 1);
                
                window.AAAI_LOGGER.info('Silent token refresh successful');
                return true;
            } else {
                window.AAAI_LOGGER.warn('Silent refresh failed, user needs to re-authenticate');
                this.logout();
                return false;
            }
        } catch (error) {
            window.AAAI_LOGGER.error('Silent refresh error:', error);
            this.logout();
            return false;
        }
    },
    
    // FIXED: Add force token refresh method

    async forceTokenRefresh() {
        this._log('🔄 Forcing token refresh...');
        
        try {
            // First try standard refresh with refresh token
            if (this.refreshToken) {
                const refreshed = await this._refreshAccessToken(this.refreshToken);
                if (refreshed) return true;
            }
            
            // If that fails, try silent refresh
            return await this._attemptSilentRefresh();
        } catch (error) {
            this._log('❌ Force token refresh failed:', error);
            return false;
        }
    },
    
    // Enhanced verify OTP with refresh token support
    async verifyOTP(email, otp) {
        try {
            window.AAAI_LOGGER.info(`Verifying OTP for email: ${email}`);
            
            const url = `${this.AUTH_BASE_URL}/auth/verify-otp`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
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
                window.AAAI_LOGGER.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            window.AAAI_LOGGER.info('OTP verification successful');
            
            // Update authentication state with refresh token supportthis.token = data.access_token;
            this.userEmail = email;
            this.userId = data.id;
            this.sessionId = data.session_id;
            this.authenticated = true;

            // Store in localStorage as backup
            this._setSecureItem('auth_token', data.access_token);
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', data.id);

            // Set authentication cookies manually
            this._setCookie('access_token', data.access_token, 1); // 1 day
            this._setCookie('authenticated', 'true', 1);
            this._setCookie('user_info', JSON.stringify({
                id: data.id,
                email: email,
                session_id: data.session_id
            }), 1);

            if (data.refresh_token) {
                this._setCookie('refresh_token', data.refresh_token, 30); // 30 days
            }

            window.AAAI_LOGGER.info('Authentication state updated with session cookies');

            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('OTP verification timeout');
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            window.AAAI_LOGGER.error('OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    // FIXED: Enhanced session checking
    hasPersistentSession() {
        return !!(this.refreshToken || this._getCookie('refresh_token') || this._getSecureItem('refresh_token'));
    },
    
    // FIXED: Refresh token if needed - public method
    async refreshTokenIfNeeded() {
        const result = await this._checkAndRefreshToken();
        
        // If refresh failed but we have a refresh token, try force refresh
        if (!result && this.hasPersistentSession()) {
            return await this.forceTokenRefresh();
        }
        
        return result;
    },
    
    // Clear authentication state
    _clearAuthState() {
        this.token = null;
        this.refreshToken = null; // FIXED: Clear refresh token
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        
        // Clear localStorage
        this._removeSecureItem('auth_token');
        this._removeSecureItem('refresh_token'); // FIXED: Clear refresh token
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
    },
    
    // Enhanced logout with refresh token cleanup
    async logout() {
        try {
            // Clear token refresh timer
            if (this.tokenRefreshTimer) {
                clearInterval(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
            }
            
            // Attempt server-side logout with refresh token
            try {
                const url = `${this.API_BASE_URL}/auth/logout`;
                
                await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.getToken()}`,
                        'Content-Type': 'application/json'
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
            
            console.log('✓ Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this.clearAuthData();
        }
    },
    
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

        // Clear WebSocket reconnect token
        localStorage.removeItem('ws_reconnect_token');

        // Clear instance data
        this.currentUser = null;
        this.token = null;
        this.refreshToken = null; // FIXED: Clear refresh token
        this.isRefreshing = false;
        this.refreshPromise = null;

        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }
    },
    
    // Get session information
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
    
    // Check if user is authenticated
    isAuthenticated() {
        return this.authenticated && !!this.token && !!this.userId;
    },
    
    // Get current user information
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },
    
    // Get token for API requests
    getToken() {
        return this.token;
    },
    
    // Request OTP - unchanged
    async requestOTP(email) {
        try {
            window.AAAI_LOGGER.info(`Requesting OTP for email: ${email}`);
            
            const url = `${this.AUTH_BASE_URL}/auth/request-otp`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
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
                window.AAAI_LOGGER.error('OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            window.AAAI_LOGGER.info('OTP request successful');
            return responseData;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('OTP request timeout');
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            window.AAAI_LOGGER.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // Execute a function with automatic token refresh
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            // Check if token needs refresh before making request
            await this.refreshTokenIfNeeded();
            
            window.AAAI_LOGGER.info(`Executing function: ${functionName}`);
            
            const url = `${this.API_BASE_URL}/api/function/${functionName}`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const response = await fetch(url, {
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
                window.AAAI_LOGGER.error(`Function execution failed:`, data);
                
                // Handle token expiration
                if (response.status === 401) {
                    window.AAAI_LOGGER.warn('Token expired during function execution');
                    await this.refreshTokenIfNeeded();
                    throw new Error('Session expired. Please try again.');
                }
                
                throw new Error(data.error || data.detail || `Failed to execute function: ${functionName}`);
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('Function execution timeout');
                throw new Error('Request timed out. Please try again.');
            }
            window.AAAI_LOGGER.error(`Function execution error (${functionName}):`, error);
            throw error;
        }
    },
    
    // Send chat message via HTTP API
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            await this.refreshTokenIfNeeded();
            
            const url = `${this.API_BASE_URL}/api/chat`;
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            
            const response = await fetch(url, {
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
                window.AAAI_LOGGER.error('Chat message failed:', data);
                
                if (response.status === 401) {
                    window.AAAI_LOGGER.warn('Token expired during chat message');
                    await this.refreshTokenIfNeeded();
                    throw new Error('Session expired. Please try again.');
                }
                
                throw new Error(data.error || 'Failed to send message');
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('Chat message timeout');
                throw new Error('Request timed out. Please try again.');
            }
            window.AAAI_LOGGER.error('Chat error:', error);
            throw error;
        }
    },
    
    // Get WebSocket URL
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        const url = `${wsProtocol}//${wsHost}/ws/${userId}?token=${this.token}`;
        window.AAAI_LOGGER.debug(`WebSocket URL: ${url.replace(/token=[^&]*/, 'token=***')}`);
        return url;
    },
    
    // Get user credits
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
            window.AAAI_LOGGER.error('Error getting user credits:', error);
            return 0;
        }
    },
    
    // Check drive access
    async checkDriveAccess(driveLink) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const result = await this.executeFunction('check_drive_access', {
                drive_link: driveLink,
                email: this.userEmail
            });
            return result.data;
        } catch (error) {
            window.AAAI_LOGGER.error('Error checking drive access:', error);
            throw error;
        }
    },
    
    // Set up automatic token refresh
    _setupTokenRefresh() {
        // Check token every 5 minutes
        this.refreshInterval = setInterval(() => {
            if (this.isAuthenticated()) {
                this._checkAndRefreshToken();
            }
        }, 300000); // 5 minutes
        
        // Check token on page visibility change
        this._setupVisibilityHandler();
    },
    
    // Set up page visibility change handler
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Page became visible, check if token needs refresh
                this._checkAndRefreshToken();
            }
        });
    },
    
    // Validate token format and expiration
    _isTokenValid(token) {
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length !== 3) return false;
            
            const payload = JSON.parse(atob(tokenParts[1]));
            const now = Date.now() / 1000;
            
            // Check if token is expired (with 5 minute grace period)
            return payload.exp && (payload.exp + 300) > now;
        } catch (error) {
            return false;
        }
    },
    
    // Cookie management utilities
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
    
    // Secure storage methods (localStorage fallback)
    _setSecureItem(key, value) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.setItem(storageKey, value);
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error storing secure item:', error);
            return false;
        }
    },
    
    _getSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            return localStorage.getItem(storageKey);
        } catch (error) {
            window.AAAI_LOGGER.error('Error retrieving secure item:', error);
            return null;
        }
    },
    
    _removeSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.removeItem(storageKey);
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error removing secure item:', error);
            return false;
        }
    },
    
    // Get authentication headers
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