/**
 * High-Performance JWT Authentication Service for AAAI Solutions
 * Optimized for fast loading and minimal API calls
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
    
    // Single refresh timer
    refreshTimer: null,
    
    // Configuration
    options: {
        refreshBufferTime: 2 * 60 * 1000,
        maxRetryAttempts: 2, // Reduced from 3
        debug: false,
        cacheTimeout: 30000 // 30 seconds
    },

    /**
     * Fast initialization with minimal checks
     */
    init() {
        console.log('🔐 Fast-initializing JWT Authentication...');
        
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available');
        }
        
        this.options.debug = window.AAAI_CONFIG?.ENABLE_DEBUG || false;
        this.AUTH_BASE_URL = '';
        
        // Quick auth state check from cache first
        const cachedState = this._getCachedAuthState();
        if (cachedState) {
            this._restoreFromCache(cachedState);
            this._log('Authentication restored from cache');
            return true;
        }
        
        // Check for refresh token existence (fast check)
        const hasRefresh = this._hasRefreshTokenCookie();
        if (hasRefresh) {
            // Don't validate immediately, do it lazily
            this._log('Refresh token available, lazy validation enabled');
            return true;
        }
        
        this._log('No authentication state found');
        return false;
    },
    /**
     * Fast cached authentication check
     */
    isAuthenticated() {
        // Use cache if recent
        if (this.lastValidation && (Date.now() - this.lastValidation) < this.validationCache) {
            return this.authenticated;
        }
        
        const hasBasicAuth = this.authenticated && this.userEmail && this.userId && this.accessToken;
        
        if (hasBasicAuth && this._isAccessTokenValid()) {
            this.lastValidation = Date.now();
            return true;
        }
        
        // Try quick restore from storage
        const stored = this._getStoredAccessToken();
        if (stored && this._isTokenValid(stored)) {
            this._setAccessToken(stored.token, stored.expiresIn);
            this._setUserInfo(stored.user);
            this.lastValidation = Date.now();
            return true;
        }
        
        this.authenticated = false;
        return false;
    },

    /**
     * Get token with caching
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
            return this.accessToken;
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
     * Fast OTP verification with minimal validation
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Fast OTP verification for: ${email}`);
            
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
            
            // Set authentication state immediately
            this._setAccessToken(tokens.access_token, tokens.expires_in);
            this._setUserInfo(user);
            
            // Cache the auth state
            this._cacheAuthState({
                user,
                token: tokens.access_token,
                expiresIn: tokens.expires_in,
                timestamp: Date.now()
            });
            
            // Store for persistence
            this._storeAccessToken(tokens.access_token, tokens.expires_in, user);
            
            // Start refresh timer
            this._scheduleRefresh();
            
            this._log('Fast authentication successful');
            return data;
            
        } catch (error) {
            this._clearAuthState();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Optimized func execution with enhanced logging
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
     * Quick token refresh without complex validation
     */
    async _quickRefresh() {
        if (this.refreshInProgress) {
            return false; // Don't wait, just fail fast
        }
        
        this.refreshInProgress = true;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
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
                expiresIn = data.tokens.expires_in;
            } else {
                accessToken = data.access_token;
                expiresIn = data.expires_in;
            }
            
            if (accessToken) {
                this._setAccessToken(accessToken, expiresIn);
                this._updateStoredToken(accessToken, expiresIn);
                this._scheduleRefresh();
                return true;
            }
            
            return false;
            
        } catch (error) {
            this._clearAuthState();
            return false;
        } finally {
            this.refreshInProgress = false;
        }
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
     * Fast logout with minimal API calls
     */
    async logout() {
        try {
            this._clearRefreshTimer();
            
            // Call logout endpoint with short timeout
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

    // Private methods - optimized for performance

    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
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
        sessionStorage.removeItem('aaai_access_token');
        this.authCache.clear();
    },

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

    _hasRefreshTokenCookie() {
        return document.cookie.includes('authenticated=true');
    },

    _scheduleRefresh() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) return;
        
        const refreshTime = this.tokenExpiry - Date.now() - this.options.refreshBufferTime;
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(() => {
                // Smart refresh: only refresh if page is visible or about to expire
                const timeToExpiry = this.tokenExpiry - Date.now();
                const shouldRefresh = document.visibilityState === 'visible' || 
                                    timeToExpiry < (this.options.refreshBufferTime / 2);
                
                if (shouldRefresh) {
                    this._quickRefresh().catch(() => {});
                } else {
                    // Defer refresh until page becomes visible
                    const handleVisibilityChange = () => {
                        if (document.visibilityState === 'visible') {
                            document.removeEventListener('visibilitychange', handleVisibilityChange);
                            this._quickRefresh().catch(() => {});
                        }
                    };
                    document.addEventListener('visibilitychange', handleVisibilityChange);
                }
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
            console.log('[FastAuth]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[FastAuth]', ...args);
    }
};

if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}