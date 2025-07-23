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
    initPromise: null,
    
    options: {
        debug: true,
        cacheTimeout: 5 * 60 * 1000,
        refreshBuffer: 5 * 60 * 1000,
        maxRetries: 3
    },

    /**
     * FIXED: Single initialization entry point
     */
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._performInit();
        return this.initPromise;
    },

    /**
     * FIXED: Simplified initialization without aggressive cookie clearing
     */
    async _performInit() {
        try {
            this._log('🚀 Initializing AuthService...');
            
            // Try to restore from cookies
            const sessionRestored = await this._initializeFromCookies();
            
            if (this.authenticated && this.accessToken) {
                this._scheduleProactiveRefresh();
                this._log('✅ AuthService initialized with valid session');
                return { success: true, authenticated: true };
            } else {
                this._log('ℹ️ AuthService initialized - no existing session');
                return { success: true, authenticated: false };
            }
            
        } catch (error) {
            this._error('AuthService initialization error:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * FIXED: Cookie restoration without aggressive clearing
     */
    async _initializeFromCookies() {
        try {
            this._log('🔍 Checking for authentication cookies...');
            
            // Check if we have authentication indicators
            if (!this._hasCookieAuth()) {
                this._log('No existing session found');
                return false;
            }

            // Get user info from cookie
            const userInfo = this._getUserInfoFromCookie();
            if (!userInfo?.email || !userInfo?.id) {
                this._log('Invalid or missing session data');
                // DON'T clear cookies - they might be valid for other processes
                return false;
            }

            this._log('✅ Found valid user info in cookies:', { email: userInfo.email, id: userInfo.id });

            // Set AuthService state from cookies
            this._setUserInfo(userInfo);
            this.authenticated = true;
            this.lastValidation = Date.now();

            // Try to refresh token if available
            if (this._hasRefreshTokenCookie()) {
                this._log('🔄 Attempting token refresh...');
                try {
                    const refreshed = await this._getAccessTokenFromStandardRefresh();
                    if (refreshed) {
                        this._log('✅ Token refreshed successfully');
                    } else {
                        this._log('⚠️ Token refresh failed, but session valid from cookies');
                    }
                } catch (error) {
                    this._log('⚠️ Token refresh error (non-critical):', error.message);
                }
            }
            
            return true;
            
        } catch (error) {
            this._error('Session restoration error:', error);
            return false;
        }
    },

    /**
     * Wait for initialization to complete
     */
    async waitForInit() {
        if (this.initPromise) {
            return await this.initPromise;
        }
        return { success: true, authenticated: this.authenticated };
    },

    /**
     * Enhanced authentication check
     */
    isAuthenticated() {
        const hasToken = this.accessToken && this._isAccessTokenValid();
        const hasUserInfo = this.userEmail && this.userId;
        
        if (hasToken && hasUserInfo) {
            if (!this.authenticated) {
                this.authenticated = true;
                this.lastValidation = Date.now();
            }
            return true;
        }

        // Only clear if we're certain there's no valid data
        if (this.authenticated && (!hasUserInfo)) {
            this._log('Authentication state inconsistent, clearing...');
            this._clearAuthState();
        }

        return false;
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
            authenticated: this.authenticated,
            tokenExpiry: this.tokenExpiry
        };
    },

    /**
     * Store access token and user info
     */
    _storeAccessToken(token, expiresIn, user) {
        this._log('Storing access token and user info...', {
            tokenLength: token ? token.length : 0,
            expiresIn: expiresIn,
            hasUser: !!user
        });
        
        this._setAccessToken(token, expiresIn);
        
        if (user) {
            this._setUserInfo(user);
        }
        
        this.authenticated = true;
        
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

    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
    },

    _clearAuthState() {
        this.authenticated = false;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.lastValidation = null;
        this.initPromise = null;
        this._clearRefreshTimer();
    },

    _hasCookieAuth() {
        try {
            return document.cookie.includes('authenticated=true');
        } catch (error) {
            return false;
        }
    },

    _hasRefreshTokenCookie() {
        try {
            const cookieString = document.cookie;
            return cookieString.includes('refresh_token=') && 
                   !cookieString.includes('refresh_token=;');
        } catch (error) {
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

    _isAccessTokenValid() {
        return this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry;
    },

    // Refresh token functionality
    async _getAccessTokenFromStandardRefresh() {
        try {
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            
            if (!response.ok) {
                return false;
            }
            
            const data = await response.json();
            
            if (data.tokens?.access_token) {
                this._setAccessToken(data.tokens.access_token, data.tokens.expires_in || 21600);
                
                let userData = data.user;
                if (!userData) {
                    userData = this._getUserInfoFromCookie();
                    if (!userData && this.userEmail) {
                        userData = {
                            email: this.userEmail,
                            id: this.userId,
                            session_id: this.sessionId
                        };
                    }
                }

                if (userData) {
                    this._setUserInfo(userData);
                }
                
                this.authenticated = true;
                this.lastValidation = Date.now();
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            this._error('Refresh endpoint error:', error);
            return false;
        }
    },

    // Proactive refresh scheduling
    _scheduleProactiveRefresh() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) return;
        
        const refreshTime = this.tokenExpiry - Date.now() - this.options.refreshBuffer;
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(async () => {
                this._log('🔄 Proactive token refresh triggered');
                await this._getAccessTokenFromStandardRefresh();
            }, refreshTime);
        }
    },

    _clearRefreshTimer() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    },

    _cacheAuthState(state) {
        this.authCache.set('auth_state', {
            ...state,
            cached: Date.now()
        });
    },

    // Helper methods
    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
    },

    async refreshTokenIfNeeded() {
        if (this.accessToken && this._isAccessTokenValid()) {
            return true;
        }
        
        if (!this._hasRefreshTokenCookie()) {
            return false;
        }
        
        return await this._getAccessTokenFromStandardRefresh();
    },

    // OTP methods (existing)
    async requestOTP(email) {
        try {
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });
            
            if (!response.ok) {
                throw new Error('Failed to send verification code');
            }
            
            return await response.json();
        } catch (error) {
            this._error('OTP request failed:', error);
            throw error;
        }
    },

    async verifyOTP(email, otp) {
        try {
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Invalid verification code');
            }
            
            return await response.json();
        } catch (error) {
            this._error('OTP verification failed:', error);
            throw error;
        }
    },

    // Function execution (existing)
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }

        try {
            const response = await fetch(`${this.AUTH_BASE_URL}/execute`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify({
                    function_name: functionName,
                    input_data: inputData
                })
            });

            if (!response.ok) {
                throw new Error(`Function execution failed: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            this._error('Function execution error:', error);
            throw error;
        }
    },

    // Logout
    async logout() {
        try {
            await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                method: 'POST',
                credentials: 'include'
            });
        } catch (error) {
            this._log('Logout request failed:', error);
        }
        
        this._clearAuthState();
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

// FIXED: Only expose to global scope, don't auto-initialize
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}