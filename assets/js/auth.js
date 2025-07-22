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
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated && 
               this.accessToken && 
               this._isAccessTokenValid() && 
               this.userEmail && 
               this.userId;
    },

    /**
     * Check if access token is still valid
     */
    _isAccessTokenValid() {
        if (!this.tokenExpiry) return false;
        return Date.now() < (this.tokenExpiry - 60000); // 1 minute buffer
    },

    /**
     * Execute function with automatic token refresh
     */
    async executeFunction(functionName, inputData) {
        if (!this.authenticated) {
            throw new Error('Authentication required');
        }
        
        // Ensure we have a valid access token
        let accessToken = this.getToken();
        if (!accessToken) {
            this._log('No valid access token, attempting refresh...');
            const refreshed = await this._quickRefresh();
            if (!refreshed) {
                throw new Error('No valid access token available');
            }
            accessToken = this.accessToken;
        }
        
        this._log('Executing function:', functionName);
        
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
     * Verify OTP and establish session
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Verifying OTP for: ${email}`);
            
            this._clearAuthState();
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Invalid OTP');
            }
            
            const data = await response.json();
            const { user, tokens } = data;
            
            if (!user?.id || !user?.email || !tokens?.access_token) {
                throw new Error('Invalid authentication response - missing user or tokens');
            }
            
            // Set authentication state in memory
            this._storeAccessToken(tokens.access_token, tokens.expires_in || 21600, user);
            
            // Start proactive refresh
            this._scheduleProactiveRefresh();
            
            this._log('✅ Authentication successful');
            return data;
            
        } catch (error) {
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

    // Private helper methods
    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
    },

    _storeAccessToken(token, expiresIn, user) {
        // FIXED: Added missing _storeAccessToken method
        this._setAccessToken(token, expiresIn);
        if (user) {
            this._setUserInfo(user);
        }
        
        // Cache the auth state
        this._cacheAuthState({
            user: user,
            token: token,
            expiresIn: expiresIn || 21600,
            timestamp: Date.now()
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