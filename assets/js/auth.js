const AuthService = {
    // Authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    accessToken: null,
    tokenExpiry: null,
    lastValidation: null,
    
    // Configuration
    AUTH_BASE_URL: 'https://aaai-gateway-754x89jf.uc.gateway.dev',
    
    // Timers and cache
    refreshTimer: null,
    authCache: new Map(),
    
    options: {
        debug: true,
        cacheTimeout: 5 * 60 * 1000,
        refreshBuffer: 5 * 60 * 1000,
        maxRetries: 3
    },

    /**
     * Initialize the authentication service
     */
    async init() {
        try {
            this._log('🚀 Initializing AuthService...');
            
            // Try to restore from cookie-based session (this is optional)
            const sessionRestored = await this._initializeFromCookies();
            
            // Start proactive refresh if authenticated
            if (this.authenticated && this.accessToken) {
                this._scheduleProactiveRefresh();
                this._log('✅ AuthService initialized with valid session');
            } else if (sessionRestored === false) {
                this._log('ℹ️ AuthService initialized - no existing session (this is normal)');
            } else {
                this._log('ℹ️ AuthService initialized - ready for authentication');
            }
            
        } catch (error) {
            // Only log actual errors, not normal "no session" states
            this._error('AuthService initialization error:', error);
            this._clearAuthState();
        }
    },

    /**
     * Initialize from cookies (silent session restoration)
     * Returns: true (restored), false (no session), or throws on actual errors
     */
    async _initializeFromCookies() {
        try {
            // Check if we have authentication indicators
            if (!this._hasCookieAuth()) {
                this._log('No existing session found (this is normal for first-time users)');
                return false; // Not an error, just no existing session
            }

            // Get user info from cookie
            const userInfo = this._getUserInfoFromCookie();
            if (!userInfo?.email || !userInfo?.id) {
                this._log('Invalid session data found, clearing cookies');
                this._clearInvalidCookies();
                return false;
            }

            // FIXED: Directly try to get access token from standard refresh
            this._log('Attempting to restore session with refresh token...');
            const refreshResult = await this._getAccessTokenFromStandardRefresh();
            
            if (refreshResult) {
                this._setUserInfo(userInfo);
                this._log('✅ Session restored from cookies with fresh access token');
                return true;
            } else {
                this._log('❌ Session restoration failed - refresh token may be expired');
                this._clearInvalidCookies();
                return false;
            }
            
        } catch (error) {
            this._error('Session restoration error:', error);
            this._clearInvalidCookies();
            return false; // Don't throw, just return false
        }
    },

    /**
     * Get current access token
     */
    getToken() {
        // Check if we have a valid token in memory
        if (this.accessToken && this._isAccessTokenValid()) {
            return this.accessToken;
        }
        
        this._log('No valid access token available');
        return null;
    },

    /**
     * FIXED: Check if user is authenticated with debug logging
     */
    isAuthenticated() {
        const hasToken = this.accessToken && this._isAccessTokenValid();
        const hasUserInfo = this.userEmail && this.userId;
        const result = this.authenticated && hasToken && hasUserInfo;
        
        // FIXED: Debug logging for authentication check
        if (!result && this.options.debug) {
            this._log('Authentication check failed:', {
                authenticated: this.authenticated,
                hasValidToken: hasToken,
                hasUserInfo: hasUserInfo,
                accessToken: this.accessToken ? `${this.accessToken.substring(0, 20)}...` : null,
                tokenExpiry: this.tokenExpiry ? new Date(this.tokenExpiry) : null,
                userEmail: this.userEmail
            });
        }
        
        return result;
    },

    /**
     * Check if access token is still valid
     */
    _isAccessTokenValid() {
        if (!this.tokenExpiry) return false;
        return Date.now() < (this.tokenExpiry - 60000); // 1 minute buffer
    },

    /**
     * FIXED: Execute function with smart authentication handling
     */
    async executeFunction(functionName, inputData) {
        // FIXED: Better check for authentication state - don't require authenticated flag initially
        let accessToken = this.getToken();
        
        // If no token, try to get one via refresh (for session restoration)
        if (!accessToken) {
            this._log('No access token found, attempting to restore session...');
            const refreshed = await this._quickRefresh();
            if (refreshed) {
                accessToken = this.accessToken;
            }
        }
        
        // If still no token and not authenticated, require authentication
        if (!accessToken && !this.authenticated) {
            throw new Error('Authentication required - please log in first');
        }
        
        // Final check - if we have a token but not marked as authenticated, fix the state
        if (accessToken && !this.authenticated) {
            this._log('Have token but not marked authenticated - fixing state...');
            // Try to get user info from cookie to restore full auth state
            const userInfo = this._getUserInfoFromCookie();
            if (userInfo?.email && userInfo?.id) {
                this._setUserInfo(userInfo);
                this._log('✅ Authentication state restored from cookie');
            }
        }
        
        this._log('Executing function:', functionName, 'with auth state:', {
            authenticated: this.authenticated,
            hasToken: !!accessToken,
            userEmail: this.userEmail
        });
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(inputData),
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                if (response.status === 401) {
                    this._log('Got 401, attempting token refresh...');
                    const refreshed = await this._quickRefresh();
                    if (refreshed) {
                        // Retry with new token
                        return this.executeFunction(functionName, inputData);
                    }
                    this._clearAuthState();
                    throw new Error('Authentication failed');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            throw error;
        }
    },

    /**
     * FIXED: Simplified quick refresh - directly use standard refresh
     */
    async _quickRefresh() {
        try {
            if (!this._hasRefreshTokenCookie()) {
                this._log('No refresh token available for quick refresh');
                return false;
            }

            // FIXED: Directly call standard refresh instead of complex chain
            return await this._getAccessTokenFromStandardRefresh();
            
        } catch (error) {
            this._error('Quick refresh failed:', error);
            return false;
        }
    },

    /**
     * FIXED: Simplified to just call standard refresh endpoint
     */
    async _getAccessTokenFromStandardRefresh() {
        try {
            this._log('🔄 Getting access token from refresh endpoint...');
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include' // Sends httpOnly refresh token cookie
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this._log('Refresh token expired or invalid (this is normal after 7 days)');
                    this._clearAuthState(); // Clear invalid session
                } else {
                    this._log('Refresh failed with status:', response.status);
                }
                return false;
            }
            
            const data = await response.json();
            
            // FIXED: Check for tokens in response body
            if (data.tokens?.access_token) {
                this._storeAccessToken(data.tokens.access_token, data.tokens.expires_in || 21600, data.user);
                this._log('✅ Got fresh access token from refresh endpoint');
                
                // Update user info if provided
                if (!data.user && this.userEmail) {
                    // If no user data in response, preserve existing user info
                    const existingUser = {
                        email: this.userEmail,
                        id: this.userId,
                        session_id: this.sessionId
                    };
                    this._setUserInfo(existingUser);
                } else if (data.user) {
                    this._setUserInfo(data.user);
                }
                
                return true;
            } else {
                this._error('❌ Refresh response missing tokens:', data);
                return false;
            }
            
        } catch (error) {
            // Don't log network errors as errors during initialization - they're expected
            if (error.message.includes('fetch')) {
                this._log('Network error during token refresh (this may be normal):', error.message);
            } else {
                this._error('Refresh endpoint error:', error);
            }
            return false;
        }
    },

    /**
     * Request OTP
     */
    async requestOTP(email) {
        try {
            this._log(`Requesting OTP for: ${email}`);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to request OTP');
            }
            
            return await response.json();
            
        } catch (error) {
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },

    /**
     * FIXED: Verify OTP and establish session with better state management
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Verifying OTP for: ${email}`);
            
            // Clear any old authentication state
            this._clearAuthState();
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                const errorMsg = data.error || data.message || `HTTP ${response.status}`;
                this._error('OTP verification failed:', errorMsg);
                throw new Error(errorMsg);
            }
            
            const data = await response.json();
            this._log('OTP verification response:', data);
            
            const { user, tokens } = data;
            
            // FIXED: Better validation of response data
            if (!user || !user.id || !user.email) {
                this._error('Invalid user data in response:', user);
                throw new Error('Invalid user data received from server');
            }
            
            if (!tokens || !tokens.access_token) {
                this._error('Missing tokens in response:', tokens);
                throw new Error('No access token received from server');
            }
            
            this._log('✅ Valid OTP response received, setting up session...');
            
            // Set authentication state in memory
            this._storeAccessToken(tokens.access_token, tokens.expires_in || 21600, user);
            
            // FIXED: Ensure authentication flag is properly set
            this.authenticated = true;
            
            // Start proactive refresh
            this._scheduleProactiveRefresh();
            
            // FIXED: Verify the authentication state was set correctly
            const verifyState = {
                authenticated: this.authenticated,
                hasToken: !!this.accessToken,
                hasUser: !!this.userEmail,
                isAuthenticated: this.isAuthenticated()
            };
            this._log('✅ Authentication state after OTP verification:', verifyState);
            
            if (!this.isAuthenticated()) {
                this._error('❌ Authentication state check failed after OTP verification');
                throw new Error('Failed to establish authenticated session');
            }
            
            this._log('✅ Authentication successful - user logged in');
            return data;
            
        } catch (error) {
            this._error('OTP verification error:', error.message);
            this._clearAuthState();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Logout user
     */
    async logout() {
        try {
            this._clearRefreshTimer();
            
            if (this.accessToken) {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);
                
                fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.accessToken}`
                    },
                    credentials: 'include',
                    signal: controller.signal
                }).catch(() => {}); // Ignore errors
                
                clearTimeout(timeoutId);
            }
            
        } catch (error) {
            // Ignore logout errors
        } finally {
            this._clearAuthState();
        }
    },

    /**
     * Schedule proactive token refresh
     */
    _scheduleProactiveRefresh() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) return;
        
        // Refresh 5 minutes before expiry
        const refreshTime = this.tokenExpiry - Date.now() - this.options.refreshBuffer;
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(async () => {
                this._log('🔄 Proactive token refresh triggered');
                await this._quickRefresh();
            }, refreshTime);
            
            this._log(`🕐 Proactive refresh scheduled in ${Math.round(refreshTime / 1000)}s`);
        }
    },

    /**
     * FIXED: Get current user information
     */
    getCurrentUser() {
        if (!this.isAuthenticated()) {
            return null;
        }
        
        return {
            id: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            authenticated: this.authenticated,
            tokenExpiry: this.tokenExpiry
        };
    },

    /**
     * FIXED: Check if user has persistent session
     */
    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
    },

    /**
     * FIXED: Refresh token if needed
     */
    async refreshTokenIfNeeded() {
        if (this.accessToken && this._isAccessTokenValid()) {
            return true;
        }
        return await this._quickRefresh();
    },

    /**
     * FIXED: Debug method to check authentication state
     */
    debugAuthState() {
        const state = {
            authenticated: this.authenticated,
            accessToken: this.accessToken ? `${this.accessToken.substring(0, 20)}...` : null,
            tokenExpiry: this.tokenExpiry ? new Date(this.tokenExpiry) : null,
            tokenValid: this._isAccessTokenValid(),
            userEmail: this.userEmail,
            userId: this.userId,
            sessionId: this.sessionId,
            isAuthenticated: this.isAuthenticated(),
            hasCookieAuth: this._hasCookieAuth(),
            hasRefreshToken: this._hasRefreshTokenCookie(),
            userInfoFromCookie: this._getUserInfoFromCookie()
        };
        
        console.table(state);
        return state;
    },

    // Private helper methods
    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
    },

    _storeAccessToken(token, expiresIn, user) {
        // FIXED: Enhanced _storeAccessToken method with better state management
        this._log('Storing access token and user info...', {
            tokenLength: token ? token.length : 0,
            expiresIn: expiresIn,
            hasUser: !!user,
            userEmail: user?.email
        });
        
        // Set the access token and expiry
        this._setAccessToken(token, expiresIn);
        
        // Set user information and authentication flag
        if (user) {
            this._setUserInfo(user);
        }
        
        // FIXED: Ensure authenticated flag is set
        this.authenticated = true;
        
        // Cache the auth state
        this._cacheAuthState({
            user: user,
            token: token,
            expiresIn: expiresIn || 21600,
            timestamp: Date.now()
        });
        
        // FIXED: Verify the state was set correctly
        this._log('✅ Access token stored, auth state:', {
            authenticated: this.authenticated,
            hasToken: !!this.accessToken,
            tokenExpiry: this.tokenExpiry ? new Date(this.tokenExpiry) : null,
            userEmail: this.userEmail,
            isAuthenticated: this.isAuthenticated()
        });
    },

    _setUserInfo(user) {
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        this.lastValidation = Date.now();
    },

    _clearAuthState() {
        this.authenticated = false;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.lastValidation = null;
        this._clearRefreshTimer();
    },

    _hasCookieAuth() {
        try {
            return document.cookie.includes('authenticated=true');
        } catch (error) {
            this._log('Could not check cookie auth:', error);
            return false;
        }
    },

    _hasRefreshTokenCookie() {
        try {
            const cookieString = document.cookie;
            return cookieString.includes('refresh_token=') && 
                   !cookieString.includes('refresh_token=;');
        } catch (error) {
            this._log('Could not check refresh token cookie:', error);
            return false;
        }
    },

    _getUserInfoFromCookie() {
        try {
            const cookies = document.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'user_info' && value) {
                    return JSON.parse(decodeURIComponent(value));
                }
            }
        } catch (error) {
            this._log('Failed to parse user_info cookie:', error);
        }
        return null;
    },

    _clearRefreshTimer() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    },

    _clearInvalidCookies() {
        // Clear invalid session cookies by setting them to expire immediately
        try {
            document.cookie = 'authenticated=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            document.cookie = 'user_info=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
            this._log('Cleared invalid session cookies');
        } catch (error) {
            this._log('Could not clear cookies:', error);
        }
    },

    _cacheAuthState(state) {
        // FIXED: Added missing _cacheAuthState method
        this.authCache.set('auth_state', {
            ...state,
            cached: Date.now()
        });
    },

    _getCachedAuthState() {
        const cached = this.authCache.get('auth_state');
        if (cached && (Date.now() - cached.cached) < this.options.cacheTimeout) {
            return cached;
        }
        return null;
    },

    _log(...args) {
        if (this.options.debug) {
            console.log('[AuthService]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[AuthService]', ...args);
    }
};

// Auto-initialize on page load
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            AuthService.init();
        });
    } else {
        AuthService.init();
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}