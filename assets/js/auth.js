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
    initPromise: null,  // Track initialization promise
    
    options: {
        debug: true,
        cacheTimeout: 5 * 60 * 1000,
        refreshBuffer: 5 * 60 * 1000,
        maxRetries: 3
    },

    /**
     * FIXED: Promise-based initialization
     */
    async init() {
        // Return existing promise if already initializing
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._performInit();
        return this.initPromise;
    },

    /**
     * FIXED: More patient initialization for page redirects
     */
    async _performInit() {
        try {
            this._log('🚀 Initializing AuthService...');
            
            // FIXED: Add small delay to ensure cookies are fully written
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Try to restore from cookie-based session
            const sessionRestored = await this._initializeFromCookies();
            
            // Start proactive refresh if authenticated
            if (this.authenticated && this.accessToken) {
                this._scheduleProactiveRefresh();
                this._log('✅ AuthService initialized with valid session');
                return { success: true, authenticated: true };
            } else if (sessionRestored === false) {
                this._log('ℹ️ AuthService initialized - no existing session');
                return { success: true, authenticated: false };
            } else {
                this._log('ℹ️ AuthService initialized - ready for authentication');
                return { success: true, authenticated: false };
            }
            
        } catch (error) {
            this._error('AuthService initialization error:', error);
            this._clearAuthState();
            return { success: false, error: error.message };
        }
    },

    /**
     * FIXED: Wait for initialization to complete
     */
    async waitForInit() {
        if (this.initPromise) {
            return await this.initPromise;
        }
        return { success: true, authenticated: this.authenticated };
    },

    /**
     * FIXED: More thorough cookie-based session restoration
     */
    async _initializeFromCookies() {
        try {
            // FIXED: Add debug info about available cookies
            this._log('🔍 Checking for authentication cookies...');
            this._debugCookies();
            
            // Check if we have authentication indicators
            if (!this._hasCookieAuth()) {
                this._log('No existing session found (no auth cookie)');
                return false;
            }

            // Get user info from cookie
            const userInfo = this._getUserInfoFromCookie();
            if (!userInfo?.email || !userInfo?.id) {
                this._log('Invalid session data found, clearing cookies');
                this._clearInvalidCookies();
                return false;
            }

            this._log('✅ Found valid user info in cookies:', { email: userInfo.email, id: userInfo.id });

            // Try to refresh token with more patience
            this._log('Attempting to restore session with refresh token...');
            
            // FIXED: Multiple attempts for token refresh (network issues)
            let refreshResult = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                this._log(`Token refresh attempt ${attempt}/3...`);
                
                refreshResult = await this._getAccessTokenFromStandardRefresh();
                
                if (refreshResult) {
                    break;
                }
                
                // Wait before retry (except last attempt)
                if (attempt < 3) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
            
            if (refreshResult) {
                // Always restore user info after successful token refresh
                this._setUserInfo(userInfo);
                this.authenticated = true;
                this.lastValidation = Date.now();
                
                this._log('✅ Session restored from cookies with fresh access token');
                
                // FIXED: Final validation
                const finalCheck = this.isAuthenticated();
                this._log('Final authentication check:', finalCheck);
                
                return true;
            } else {
                this._log('❌ Token refresh failed after all attempts');
                this._clearInvalidCookies();
                return false;
            }
            
        } catch (error) {
            this._error('Session restoration error:', error);
            this._clearInvalidCookies();
            return false;
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
     * FIXED: Enhanced authentication check with auto-fix
     */
    isAuthenticated() {
        const hasToken = this.accessToken && this._isAccessTokenValid();
        const hasUserInfo = this.userEmail && this.userId;
        
        // FIXED: Primary check - if we have valid token and user info, we're authenticated
        if (hasToken && hasUserInfo) {
            // Auto-fix authenticated flag if we have valid data
            if (!this.authenticated) {
                this.authenticated = true;
                this.lastValidation = Date.now();
                this._log('🔧 Fixed authentication flag state');
            }
            return true;
        }

        // If missing any component, we're not authenticated
        if (this.authenticated && (!hasToken || !hasUserInfo)) {
            this._log('Authentication state inconsistent, clearing...');
            this._clearAuthState();
        }

        return false;
    },

    /**
     * ADD debugging method for cookies
     */
    _debugCookies() {
        try {
            const cookies = document.cookie.split(';').map(c => c.trim());
            const authCookies = cookies.filter(c => 
                c.startsWith('authenticated=') || 
                c.startsWith('user_info=') || 
                c.startsWith('refresh_token=') ||
                c.startsWith('access_token=')
            );
            
            this._log('🍪 Available auth cookies:', authCookies.length > 0 ? authCookies : 'None found');
            
            if (authCookies.length === 0) {
                this._log('🚨 No authentication cookies found! Login may not have set cookies properly.');
            }
        } catch (error) {
            this._log('Cookie debug failed:', error);
        }
    },

    /**
     * Check if access token is still valid
     */
    _isAccessTokenValid() {
        if (!this.tokenExpiry) return false;
        return Date.now() < (this.tokenExpiry - 60000); // 1 minute buffer
    },

    /**
     * FIXED: Enhanced function execution with proper auth waiting
     */
    async executeFunction(functionName, inputData) {
        // FIXED: Wait for initialization if needed
        await this.waitForInit();
        
        let accessToken = this.getToken();
        
        // If no token, try to get one via refresh (for session restoration)
        if (!accessToken) {
            this._log('No access token found, attempting to restore session...');
            const refreshed = await this.refreshTokenIfNeeded();
            if (refreshed) {
                accessToken = this.accessToken;
            }
        }
        
        // If still no token, require authentication
        if (!accessToken) {
            throw new Error('Authentication required - please log in first');
        }

        // FIXED: Auto-fix authentication state if we have valid token but flag not set
        if (accessToken && !this.authenticated) {
            this._log('Have token but not marked authenticated - fixing state...');
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
     * FIXED: Enhanced token refresh with proper state restoration
     */
    async _getAccessTokenFromStandardRefresh() {
        try {
            this._log('🔄 Getting access token from refresh endpoint...');
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                if (response.status === 401) {
                    this._log('Refresh token expired or invalid');
                    this._clearAuthState();
                } else {
                    this._log('Refresh failed with status:', response.status);
                }
                return false;
            }
            
            const data = await response.json();
            
            // FIXED: Enhanced token response handling
            if (data.tokens?.access_token) {
                // Store token
                this._setAccessToken(data.tokens.access_token, data.tokens.expires_in || 21600);
                
                // FIXED: Handle user data restoration properly
                let userData = data.user;
                if (!userData) {
                    // Try to get user data from cookie if not in response
                    userData = this._getUserInfoFromCookie();
                    if (!userData && this.userEmail) {
                        // Use existing user data as fallback
                        userData = {
                            email: this.userEmail,
                            id: this.userId,
                            session_id: this.sessionId
                        };
                    }
                }

                // FIXED: Always set user info and authentication state
                if (userData) {
                    this._setUserInfo(userData);
                }
                
                // Ensure authenticated flag is set
                this.authenticated = true;
                this.lastValidation = Date.now();
                
                this._log('✅ Got fresh access token and restored auth state');
                return true;
            }
            
            this._log('❌ No access token in refresh response');
            return false;
            
        } catch (error) {
            // Better error handling
            if (error.message.includes('fetch')) {
                this._log('Network error during token refresh:', error.message);
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
    /**
     * UPDATED: Enhanced OTP verification with state validation
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
            
            // Validate response data
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
            this.authenticated = true;
            
            // FIXED: Ensure cookies are written and verify state multiple times
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify state was set correctly
            for (let i = 0; i < 3; i++) {
                const isAuth = this.isAuthenticated();
                this._log(`Authentication verification attempt ${i + 1}: ${isAuth}`);
                
                if (isAuth) {
                    break;
                }
                
                // Try to fix state if needed
                if (!this.authenticated && this.accessToken && this.userEmail) {
                    this.authenticated = true;
                    this._log('🔧 Fixed authentication flag');
                }
                
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            // Start proactive refresh
            this._scheduleProactiveRefresh();
            
            // Final state verification
            const finalState = {
                authenticated: this.authenticated,
                hasToken: !!this.accessToken,
                hasUser: !!this.userEmail,
                isAuthenticated: this.isAuthenticated(),
                cookiesSet: this._hasCookieAuth()
            };
            
            this._log('✅ Final authentication state after OTP verification:', finalState);
            
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
     * FIXED: Enhanced refresh with new session fallback
     */
    async refreshTokenIfNeeded() {
        // If we have a valid token, no need to refresh
        if (this.accessToken && this._isAccessTokenValid()) {
            return true;
        }
        
        // If no refresh token available, that's OK for new sessions
        if (!this._hasRefreshTokenCookie()) {
            this._log('No refresh token available (normal for new sessions)');
            return false; // Don't crash, just return false
        }
        
        // Try to refresh
        const refreshed = await this._quickRefresh();
        
        // Validate final state after refresh
        return refreshed && this.isAuthenticated();
    },

    /**
     * NEW: Setup session context after successful login
     */
    async setupNewSession() {
        try {
            this._log('🔧 Setting up new session context...');
            
            if (!this.isAuthenticated()) {
                throw new Error('Cannot setup session - not authenticated');
            }
            
            const user = this.getCurrentUser();
            if (!user) {
                throw new Error('Cannot setup session - no user data');
            }
            
            // Initialize user context if ProjectService is available
            if (window.ProjectService && typeof window.ProjectService.initializeUserContext === 'function') {
                try {
                    await window.ProjectService.initializeUserContext(user);
                    this._log('✅ User context initialized in ProjectService');
                } catch (error) {
                    this._log('⚠️ ProjectService context initialization failed (non-critical):', error.message);
                }
            }
            
            // Setup any other session-specific data here
            this._log('✅ New session setup completed');
            return true;
            
        } catch (error) {
            this._error('❌ New session setup failed:', error);
            return false;
        }
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
        this.initPromise = null;  // Reset init promise
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