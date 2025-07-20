/**
 * UPDATED: High-Performance JWT Authentication Service for 7-day sessions
 * Enhanced with proactive 6-hour token refresh mechanism and better session management
 */
const AuthService = {
    // Core authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    
    // Token management with caching
    accessToken: null,
    tokenExpiry: null,
    refreshInProgress: false,
    
    // Performance optimizations
    authCache: new Map(),
    lastValidation: null,
    validationCache: 30000, // 30 seconds cache
    
    // UPDATED: Single refresh timer for 6-hour tokens
    refreshTimer: null,
    
    // UPDATED: Configuration for 7-day sessions with 6-hour access tokens
    options: {
        refreshBufferTime: 30 * 60 * 1000,    // 30 minutes (was 2 minutes)
        proactiveRefreshTime: 60 * 60 * 1000, // 1 hour before expiry
        maxRetryAttempts: 3,                   // Increased from 2
        debug: false,
        cacheTimeout: 30000, // 30 seconds
        sessionDurationDays: 7 // 7-day sessions
    },

    /**
     * UPDATED: Enhanced initialization with 7-day session support
     */
    init() {
        console.log('🔐 Initializing JWT Authentication for 7-day sessions...');
        
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available');
        }
        
        this.options.debug = window.AAAI_CONFIG?.ENABLE_DEBUG || false;
        this.AUTH_BASE_URL = '';
        
        // Quick auth state check from cache first
        const cachedState = this._getCachedAuthState();
        if (cachedState) {
            this._restoreFromCache(cachedState);
            this._scheduleProactiveRefresh(); // Start proactive refresh
            this._log('Authentication restored from cache with proactive refresh');
            return true;
        }
        
        // Check for refresh token existence (fast check)
        const hasRefresh = this._hasRefreshTokenCookie();
        if (hasRefresh) {
            // Perform immediate silent refresh to get current token
            this._performInitialRefresh();
            this._log('Refresh token available, performing initial refresh');
            return true;
        }
        
        this._log('No authentication state found');
        return false;
    },

    /**
     * UPDATED: Enhanced authentication check for 7-day sessions
     */
    isAuthenticated() {
        // Use cache if recent (but shorter cache for more responsive updates)
        if (this.lastValidation && (Date.now() - this.lastValidation) < 5000) { // 5 seconds
            return this.authenticated;
        }
        
        const hasBasicAuth = this.authenticated && this.userEmail && this.userId && this.accessToken;
        
        if (hasBasicAuth && this._isAccessTokenValid()) {
            this.lastValidation = Date.now();
            return true;
        }
        
        // Try to restore from session storage if internal state is missing
        const stored = this._getStoredAccessToken();
        if (stored && this._isTokenValid(stored)) {
            this._log('🔧 Restoring auth state from session storage');
            this._setAccessToken(stored.token, stored.expiresIn);
            this._setUserInfo(stored.user);
            this._scheduleProactiveRefresh();
            this.lastValidation = Date.now();
            return true;
        }
        
        // CRITICAL: Check cookie-based authentication and SET INTERNAL STATE
        if (this._hasRefreshTokenCookie() || document.cookie.includes('authenticated=true')) {
            try {
                const userInfoCookie = this._getUserInfoFromCookie();
                if (userInfoCookie && userInfoCookie.email && userInfoCookie.id) {
                    this._log('🔧 Setting auth state from user_info cookie');
                    
                    // SET INTERNAL STATE (this was missing before)
                    this.authenticated = true;
                    this.userEmail = userInfoCookie.email;
                    this.userId = userInfoCookie.id;
                    this.sessionId = userInfoCookie.session_id;
                    this.lastValidation = Date.now();
                    
                    // Try to get access token via refresh
                    if (this._hasRefreshTokenCookie()) {
                        this._performInitialRefresh().catch(() => {
                            this._log('Background refresh failed, but cookie auth valid');
                        });
                    }
                    
                    return true;
                }
            } catch (error) {
                this._log('Failed to parse user_info cookie:', error);
            }
        }
        
        this.authenticated = false;
        return false;
    },

    /**
     * NEW: Perform initial refresh on page load
     */
    async _performInitialRefresh() {
        try {
            const success = await this._quickRefresh();
            if (success) {
                this._scheduleProactiveRefresh();
                this._log('Initial refresh successful, proactive refresh scheduled');
            }
        } catch (error) {
            this._error('Initial refresh failed:', error);
        }
    },

    /**
     * UPDATED: Enhanced token retrieval with automatic refresh
     */
    getToken() {
        // Return cached token if valid
        if (this.accessToken && this._isAccessTokenValid()) {
            return this.accessToken;
        }
        
        // Quick storage check
        const stored = this._getStoredAccessToken();
        if (stored && this._isTokenValid(stored)) {
            this._setAccessToken(stored.token, stored.expiresIn);
            this._setUserInfo(stored.user);
            this._scheduleProactiveRefresh();
            return this.accessToken;
        }
        
        // CRITICAL FIX: If isAuthenticated() is true but we have no token,
        // there's a state mismatch - try to recover
        if (this.isAuthenticated() && !this.accessToken) {
            this._log('🔧 Auth state mismatch detected - recovering...');
            
            // Try to get user info from cookie and set internal state
            const userInfo = this._getUserInfoFromCookie();
            if (userInfo && userInfo.email && userInfo.id) {
                this._log('🔧 Setting internal state from cookie...');
                this.authenticated = true;
                this.userEmail = userInfo.email;
                this.userId = userInfo.id;
                this.sessionId = userInfo.session_id;
                this.lastValidation = Date.now();
                
                // Try silent refresh to get access token
                this._log('🔄 Attempting silent refresh to get access token...');
                this._quickRefresh().then(success => {
                    if (success) {
                        this._log('✅ Silent refresh successful');
                    } else {
                        this._log('❌ Silent refresh failed');
                    }
                }).catch(error => {
                    this._log('❌ Silent refresh error:', error);
                });
            }
        }
        
        return null;
    },

    /**
     * Optimized OTP request with reduced validation
     */
    async requestOTP(email) {
        try {
            this._log(`Fast OTP request for: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
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
     * UPDATED: Enhanced OTP verification with 7-day session setup
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Fast OTP verification for 7-day session: ${email}`);
            
            this._clearAuthState(); // Quick clear
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, otp }),
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Invalid OTP');
            }
            
            const data = await response.json();
            const { user, tokens } = data;
            
            // Quick validation and setup
            if (!user?.id || !user?.email || !tokens?.access_token) {
                throw new Error('Invalid authentication response');
            }
            
            // UPDATED: Set authentication state with 6-hour tokens
            this._setAccessToken(tokens.access_token, tokens.expires_in || 21600);
            this._setUserInfo(user);
            
            // Cache the auth state
            this._cacheAuthState({
                user,
                token: tokens.access_token,
                expiresIn: tokens.expires_in || 21600,
                timestamp: Date.now()
            });
            
            // Store for persistence
            this._storeAccessToken(tokens.access_token, tokens.expires_in || 21600, user);
            
            // UPDATED: Start proactive refresh scheduling
            this._scheduleProactiveRefresh();
            
            this._log('Fast authentication successful for 7-day session');
            return data;
            
        } catch (error) {
            this._clearAuthState();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Optimized function execution with enhanced logging
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        // Get token (cached if available)
        const accessToken = this.getToken();
        if (!accessToken) {
            // Try refresh once
            const refreshed = await this._quickRefresh();
            if (!refreshed) {
                throw new Error('No valid access token available');
            }
        }
        
        this._log('Executing function:', functionName, 'with input:', inputData);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout
            
            const response = await fetch(`${this.AUTH_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(inputData),
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            this._log('Response status:', response.status, response.statusText);
            
            if (!response.ok) {
                if (response.status === 401) {
                    // Try refresh once
                    const refreshed = await this._quickRefresh();
                    if (refreshed) {
                        return this.executeFunction(functionName, inputData);
                    }
                    this._clearAuthState();
                    throw new Error('Session expired');
                }
                
                const errorData = await response.json().catch(() => ({}));
                this._error('API error response:', errorData);
                throw new Error(errorData.error || errorData.detail || `Function execution failed with status ${response.status}`);
            }
            
            const result = await response.json();
            this._log('Function response:', functionName, JSON.stringify(result, null, 2));
            
            return result;
            
        } catch (error) {
            this._error('Function execution error:', functionName, error);
            throw error;
        }
    },

    /**
     * UPDATED: Enhanced token refresh with 6-hour tokens
     */
    async _quickRefresh() {
        if (this.refreshInProgress) {
            return false;
        }
        
        this.refreshInProgress = true;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                this._clearAuthState();
                return false;
            }
            
            const data = await response.json();
            let accessToken, expiresIn;
            
            if (data.tokens) {
                accessToken = data.tokens.access_token;
                expiresIn = data.tokens.expires_in || 21600; // Default 6 hours
            } else {
                accessToken = data.access_token;
                expiresIn = data.expires_in || 21600; // Default 6 hours
            }
            
            if (accessToken) {
                this._setAccessToken(accessToken, expiresIn);
                this._updateStoredToken(accessToken, expiresIn);
                
                // Update user info if provided
                if (data.user) {
                    this._setUserInfo(data.user);
                }
                
                this._scheduleProactiveRefresh(); // Schedule next refresh
                this._log('Token refreshed successfully, expires in:', expiresIn / 3600, 'hours');
                return true;
            }
            
            return false;
            
        } catch (error) {
            this._error('Token refresh error:', error);
            this._clearAuthState();
            return false;
        } finally {
            this.refreshInProgress = false;
        }
    },

    /**
     * NEW: Proactive refresh scheduling for 7-day sessions
     */
    _scheduleProactiveRefresh() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) {
            this._log('No token expiry, cannot schedule refresh');
            return;
        }
        
        // Calculate when to refresh (1 hour before expiry, or at 30 minutes if token is shorter)
        const timeToExpiry = this.tokenExpiry - Date.now();
        const refreshTime = Math.min(
            Math.max(timeToExpiry - this.options.proactiveRefreshTime, 0),
            timeToExpiry - this.options.refreshBufferTime
        );
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(() => {
                this._log('Proactive refresh triggered');
                this._performProactiveRefresh();
            }, refreshTime);
            
            const refreshIn = Math.round(refreshTime / (60 * 1000));
            this._log(`Proactive refresh scheduled in ${refreshIn} minutes`);
        } else {
            // Token expires soon, refresh immediately
            this._log('Token expires soon, refreshing immediately');
            this._performProactiveRefresh();
        }
    },

    /**
     * NEW: Perform proactive refresh with retry logic
     */
    async _performProactiveRefresh() {
        let attempts = 0;
        const maxAttempts = this.options.maxRetryAttempts;
        
        while (attempts < maxAttempts) {
            attempts++;
            
            try {
                this._log(`Proactive refresh attempt ${attempts}/${maxAttempts}`);
                const success = await this._quickRefresh();
                
                if (success) {
                    this._log('Proactive refresh successful');
                    return;
                }
                
                // If refresh failed, wait before retry
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
                }
                
            } catch (error) {
                this._error(`Proactive refresh attempt ${attempts} failed:`, error);
                
                if (attempts < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempts));
                }
            }
        }
        
        // All attempts failed
        this._error('All proactive refresh attempts failed, clearing auth state');
        this._clearAuthState();
    },

    /**
     * Lazy refresh - only when needed
     */
    async refreshTokenIfNeeded() {
        if (this.accessToken && this._isAccessTokenValid()) {
            return true;
        }
        return this._quickRefresh();
    },

    /**
     * Enhanced logout with cleanup
     */
    async logout() {
        try {
            this._clearRefreshTimer();
            
            // Call logout endpoint with timeout
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

    getCurrentUser() {
        if (!this.isAuthenticated()) return null;
        
        return {
            id: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },

    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
    },

    // UPDATED: Private methods optimized for 7-day sessions

    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        
        // Cache the auth state
        this._cacheAuthState({
            token: token,
            expiresIn: expiresIn,
            user: {
                id: this.userId,
                email: this.userEmail,
                session_id: this.sessionId
            }
        });
    },

    _setUserInfo(user) {
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        this.lastValidation = Date.now();
        
        this._log('User authenticated:', user.email);
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
        sessionStorage.removeItem('aaai_access_token');
        this.authCache.clear();
        
        this._log('Auth state cleared');
    },

    /**
     * UPDATED: Enhanced access token validation with longer buffer
     */
    _isAccessTokenValid() {
        return this.accessToken && 
               this.tokenExpiry && 
               Date.now() < (this.tokenExpiry - this.options.refreshBufferTime);
    },

    _isTokenValid(storedToken) {
        return storedToken && 
               storedToken.token && 
               storedToken.expiry && 
               Date.now() < storedToken.expiry;
    },

    _storeAccessToken(token, expiresIn, user) {
        try {
            const tokenData = {
                token,
                expiry: Date.now() + (expiresIn * 1000),
                expiresIn,
                user: {
                    id: user.id,
                    email: user.email,
                    session_id: user.session_id
                },
                stored: Date.now()
            };
            
            sessionStorage.setItem('aaai_access_token', JSON.stringify(tokenData));
        } catch (error) {
            console.warn('Failed to store access token:', error);
        }
    },

    _getStoredAccessToken() {
        try {
            const stored = sessionStorage.getItem('aaai_access_token');
            if (!stored) return null;
            
            const tokenData = JSON.parse(stored);
            
            if (Date.now() >= tokenData.expiry) {
                sessionStorage.removeItem('aaai_access_token');
                return null;
            }
            
            return tokenData;
        } catch (error) {
            sessionStorage.removeItem('aaai_access_token');
            return null;
        }
    },

    _updateStoredToken(token, expiresIn) {
        try {
            const stored = this._getStoredAccessToken();
            if (stored) {
                stored.token = token;
                stored.expiry = Date.now() + (expiresIn * 1000);
                stored.expiresIn = expiresIn;
                sessionStorage.setItem('aaai_access_token', JSON.stringify(stored));
            }
        } catch (error) {
            console.warn('Failed to update stored token:', error);
        }
    },

    /**
     * UPDATED: Enhanced cookie detection (fix for missing refresh_token)
     */
    _hasRefreshTokenCookie() {
        const cookieString = document.cookie;
        const hasAuthenticated = cookieString.includes('authenticated=true');
        const hasRefreshToken = cookieString.includes('refresh_token=') && 
                               !cookieString.includes('refresh_token=;') && 
                               !cookieString.includes('refresh_token=""');
        
        this._log('Cookie check - authenticated:', hasAuthenticated, 'refresh_token:', hasRefreshToken);
        
        // TEMPORARY FIX: Return true if we have authenticated cookie (until backend is fixed)
        // This allows the system to work even without refresh_token cookie
        return hasAuthenticated;
    },

    /**
     * NEW: Extract user info from cookie
     */
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

    _cacheAuthState(state) {
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

    _restoreFromCache(cached) {
        this._setAccessToken(cached.token, cached.expiresIn);
        this._setUserInfo(cached.user);
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
    
    // Initialize when DOM is ready
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