/**
 * Ultra-fast JWT Authentication Service for AAAI Solutions
 * Optimized with parallel processing, intelligent caching, and non-blocking operations
 */
const AuthService = {
    // Core authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    
    // Token management with enhanced caching
    accessToken: null,
    tokenExpiry: null,
    refreshInProgress: false,
    
    // Ultra-fast performance optimizations
    authCache: new Map(),
    lastValidation: null,
    validationCache: 15000, // Reduced to 15 seconds for faster response
    tokenCache: new Map(),
    
    // Single refresh timer with optimization
    refreshTimer: null,
    refreshPromise: null,
    
    // Configuration - optimized for speed
    options: {
        refreshBufferTime: 2 * 60 * 1000,
        maxRetryAttempts: 2,
        debug: false,
        cacheTimeout: 15000, // Reduced for faster updates
        parallelValidation: true,
        fastTokenRefresh: true
    },

    /**
     * Ultra-fast initialization with parallel setup
     */
    init() {
        const startTime = performance.now();
        console.log('🔐 Ultra-fast JWT Authentication initializing...');
        
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available');
        }
        
        this.options.debug = window.AAAI_CONFIG?.ENABLE_DEBUG || false;
        this.AUTH_BASE_URL = '';
        
        // Parallel initialization tasks
        const initTasks = [
            this._loadCachedAuthStateParallel(),
            this._checkRefreshTokenParallel(),
            this._initializeTokenCacheParallel()
        ];
        
        // Execute all tasks in parallel
        Promise.allSettled(initTasks).then(results => {
            const authStateResult = results[0];
            const refreshTokenResult = results[1];
            
            if (authStateResult.status === 'fulfilled' && authStateResult.value) {
                this._restoreFromCache(authStateResult.value);
                this._log('Authentication restored from cache ultra-fast');
            } else if (refreshTokenResult.status === 'fulfilled' && refreshTokenResult.value) {
                this._log('Refresh token available, lazy validation enabled');
            } else {
                this._log('No authentication state found');
            }
            
            const initTime = performance.now() - startTime;
            this._log(`Ultra-fast initialization completed in ${initTime.toFixed(2)}ms`);
        });
        
        return true;
    },

    /**
     * Ultra-fast cached authentication check with parallel validation
     */
    isAuthenticated() {
        // Ultra-fast cache check
        if (this.lastValidation && (Date.now() - this.lastValidation) < this.validationCache) {
            return this.authenticated;
        }
        
        // Quick basic auth check
        const hasBasicAuth = this.authenticated && this.userEmail && this.userId && this.accessToken;
        
        if (hasBasicAuth && this._isAccessTokenValidFast()) {
            this.lastValidation = Date.now();
            return true;
        }
        
        // Parallel token restoration
        if (this.options.parallelValidation) {
            this._restoreTokenParallel().then(restored => {
                if (restored) {
                    this.lastValidation = Date.now();
                    this.authenticated = true;
                }
            }).catch(() => {
                this.authenticated = false;
            });
        }
        
        // Return current state immediately
        return this.authenticated;
    },

    /**
     * Ultra-fast token retrieval with intelligent caching
     */
    getToken() {
        // Return cached token if valid
        if (this.accessToken && this._isAccessTokenValidFast()) {
            return this.accessToken;
        }
        
        // Quick storage check with caching
        const cacheKey = 'current_token';
        const cached = this.tokenCache.get(cacheKey);
        
        if (cached && this._isTokenValidFast(cached)) {
            this._setAccessTokenFast(cached.token, cached.expiresIn);
            this._setUserInfoFast(cached.user);
            return this.accessToken;
        }
        
        // Storage fallback
        const stored = this._getStoredAccessTokenFast();
        if (stored && this._isTokenValidFast(stored)) {
            this._setAccessTokenFast(stored.token, stored.expiresIn);
            this._setUserInfoFast(stored.user);
            
            // Cache for next time
            this.tokenCache.set(cacheKey, stored);
            
            return this.accessToken;
        }
        
        return null;
    },

    /**
     * Ultra-fast OTP request with parallel processing
     */
    async requestOTP(email) {
        const startTime = performance.now();
        
        try {
            this._log(`Ultra-fast OTP request for: ${email}`);
            
            // Parallel request preparation and validation
            const [requestReady, validationDone] = await Promise.allSettled([
                this._prepareOTPRequest(email),
                this._validateEmail(email)
            ]);
            
            if (validationDone.status === 'rejected') {
                throw validationDone.reason;
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000); // Reduced timeout
            
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
            
            const result = await response.json();
            
            const otpTime = performance.now() - startTime;
            this._log(`OTP request completed ultra-fast in ${otpTime.toFixed(2)}ms`);
            
            return result;
            
        } catch (error) {
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },

    /**
     * Ultra-fast OTP verification with parallel operations
     */
    async verifyOTP(email, otp) {
        const startTime = performance.now();
        
        try {
            this._log(`Ultra-fast OTP verification for: ${email}`);
            
            // Quick clear and parallel preparation
            const clearTask = this._clearAuthStateFast();
            const prepTask = this._prepareOTPVerification(email, otp);
            
            await Promise.allSettled([clearTask, prepTask]);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000); // Slightly increased for verification
            
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
            
            // Parallel validation and setup
            const [validationResult, setupResult] = await Promise.allSettled([
                this._validateAuthResponseParallel(user, tokens),
                this._prepareAuthSetupParallel()
            ]);
            
            if (validationResult.status === 'rejected') {
                throw validationResult.reason;
            }
            
            // Ultra-fast authentication setup
            const setupTasks = [
                this._setAccessTokenFast(tokens.access_token, tokens.expires_in),
                this._setUserInfoFast(user),
                this._cacheAuthStateParallel({
                    user,
                    token: tokens.access_token,
                    expiresIn: tokens.expires_in,
                    timestamp: Date.now()
                }),
                this._storeAccessTokenParallel(tokens.access_token, tokens.expires_in, user)
            ];
            
            await Promise.allSettled(setupTasks);
            
            // Start refresh timer (non-blocking)
            requestAnimationFrame(() => this._scheduleRefreshOptimized());
            
            const verifyTime = performance.now() - startTime;
            this._log(`Ultra-fast authentication completed in ${verifyTime.toFixed(2)}ms`);
            
            return data;
            
        } catch (error) {
            await this._clearAuthStateFast();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Ultra-fast function execution with parallel processing and enhanced error handling
     */
    async executeFunction(functionName, inputData) {
        const startTime = performance.now();
        
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        // Ultra-fast token acquisition with parallel refresh
        let accessToken = this.getToken();
        if (!accessToken) {
            const [refreshResult, tokenResult] = await Promise.allSettled([
                this._ultraFastRefresh(),
                this._getTokenFromStorage()
            ]);
            
            if (refreshResult.status === 'fulfilled' && refreshResult.value) {
                accessToken = this.getToken();
            } else if (tokenResult.status === 'fulfilled' && tokenResult.value) {
                accessToken = tokenResult.value;
            } else {
                throw new Error('No valid access token available');
            }
        }
        
        this._log('Executing function ultra-fast:', functionName);
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 25000); // Reduced timeout
            
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
                    // Ultra-fast retry with token refresh
                    const refreshed = await this._ultraFastRefresh();
                    if (refreshed) {
                        return this.executeFunction(functionName, inputData);
                    }
                    await this._clearAuthStateFast();
                    throw new Error('Session expired');
                }
                
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.detail || `Function execution failed with status ${response.status}`);
            }
            
            const result = await response.json();
            
            const execTime = performance.now() - startTime;
            this._log(`Function ${functionName} executed ultra-fast in ${execTime.toFixed(2)}ms`);
            
            return result;
            
        } catch (error) {
            this._error('Function execution error:', functionName, error);
            throw error;
        }
    },

    /**
     * Ultra-fast token refresh with parallel processing
     */
    async _ultraFastRefresh() {
        // Return existing refresh promise if in progress
        if (this.refreshInProgress && this.refreshPromise) {
            return this.refreshPromise;
        }
        
        this.refreshInProgress = true;
        
        // Create refresh promise for reuse
        this.refreshPromise = this._performUltraFastRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.refreshInProgress = false;
            this.refreshPromise = null;
        }
    },

    async _performUltraFastRefresh() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                await this._clearAuthStateFast();
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
                // Parallel token updates
                const updateTasks = [
                    this._setAccessTokenFast(accessToken, expiresIn),
                    this._updateStoredTokenParallel(accessToken, expiresIn),
                    Promise.resolve().then(() => this._scheduleRefreshOptimized())
                ];
                
                await Promise.allSettled(updateTasks);
                return true;
            }
            
            return false;
            
        } catch (error) {
            await this._clearAuthStateFast();
            return false;
        }
    },

    /**
     * Ultra-fast refresh if needed
     */
    async refreshTokenIfNeeded() {
        if (this.accessToken && this._isAccessTokenValidFast()) {
            return true;
        }
        return this._ultraFastRefresh();
    },

    /**
     * Ultra-fast logout with parallel cleanup
     */
    async logout() {
        const startTime = performance.now();
        
        try {
            this._clearRefreshTimer();
            
            // Parallel logout call and cleanup
            const logoutTasks = [
                this._performLogoutRequest(),
                this._clearAuthStateFast()
            ];
            
            await Promise.allSettled(logoutTasks);
            
            const logoutTime = performance.now() - startTime;
            this._log(`Ultra-fast logout completed in ${logoutTime.toFixed(2)}ms`);
            
        } catch (error) {
            // Always clear auth state even if logout fails
            await this._clearAuthStateFast();
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
        return this._hasRefreshTokenCookieFast();
    },

    // Ultra-fast private methods with parallel processing

    async _performLogoutRequest() {
        if (!this.accessToken) return;
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
        } catch (error) {
            // Ignore logout errors
        }
    },

    _setAccessTokenFast(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        
        // Update token cache
        this.tokenCache.set('current_token', {
            token,
            expiresIn,
            expiry: this.tokenExpiry,
            cached: Date.now()
        });
    },

    _setUserInfoFast(user) {
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        this.lastValidation = Date.now();
    },

    async _clearAuthStateFast() {
        return new Promise((resolve) => {
            this.authenticated = false;
            this.userEmail = null;
            this.userId = null;
            this.sessionId = null;
            this.accessToken = null;
            this.tokenExpiry = null;
            this.lastValidation = null;
            
            this._clearRefreshTimer();
            
            // Parallel cache clearing
            requestAnimationFrame(() => {
                try {
                    sessionStorage.removeItem('aaai_access_token');
                    this.authCache.clear();
                    this.tokenCache.clear();
                } catch (error) {
                    // Ignore storage errors
                }
                resolve();
            });
        });
    },

    _isAccessTokenValidFast() {
        return this.accessToken && 
               this.tokenExpiry && 
               Date.now() < (this.tokenExpiry - this.options.refreshBufferTime);
    },

    _isTokenValidFast(storedToken) {
        return storedToken && 
               storedToken.token && 
               storedToken.expiry && 
               Date.now() < storedToken.expiry;
    },

    async _storeAccessTokenParallel(token, expiresIn, user) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
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
                resolve();
            });
        });
    },

    _getStoredAccessTokenFast() {
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

    async _updateStoredTokenParallel(token, expiresIn) {
        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                try {
                    const stored = this._getStoredAccessTokenFast();
                    if (stored) {
                        stored.token = token;
                        stored.expiry = Date.now() + (expiresIn * 1000);
                        stored.expiresIn = expiresIn;
                        sessionStorage.setItem('aaai_access_token', JSON.stringify(stored));
                    }
                } catch (error) {
                    console.warn('Failed to update stored token:', error);
                }
                resolve();
            });
        });
    },

    _hasRefreshTokenCookieFast() {
        return document.cookie.includes('authenticated=true');
    },

    _scheduleRefreshOptimized() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) return;
        
        const refreshTime = this.tokenExpiry - Date.now() - this.options.refreshBufferTime;
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(() => {
                // Smart refresh with visibility check
                const timeToExpiry = this.tokenExpiry - Date.now();
                const shouldRefresh = document.visibilityState === 'visible' || 
                                    timeToExpiry < (this.options.refreshBufferTime / 2);
                
                if (shouldRefresh) {
                    this._ultraFastRefresh().catch(() => {});
                } else {
                    // Defer refresh until page becomes visible
                    const handleVisibilityChange = () => {
                        if (document.visibilityState === 'visible') {
                            document.removeEventListener('visibilitychange', handleVisibilityChange);
                            this._ultraFastRefresh().catch(() => {});
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

    // Parallel initialization helpers

    async _loadCachedAuthStateParallel() {
        const cached = this.authCache.get('auth_state');
        if (cached && (Date.now() - cached.cached) < this.options.cacheTimeout) {
            return cached;
        }
        return null;
    },

    async _checkRefreshTokenParallel() {
        return this._hasRefreshTokenCookieFast();
    },

    async _initializeTokenCacheParallel() {
        this.tokenCache.clear();
        return Promise.resolve();
    },

    async _restoreTokenParallel() {
        const stored = this._getStoredAccessTokenFast();
        if (stored && this._isTokenValidFast(stored)) {
            this._setAccessTokenFast(stored.token, stored.expiresIn);
            this._setUserInfoFast(stored.user);
            return true;
        }
        return false;
    },

    async _prepareOTPRequest(email) {
        // Placeholder for request preparation
        return Promise.resolve();
    },

    async _validateEmail(email) {
        if (!email || !email.includes('@')) {
            throw new Error('Invalid email format');
        }
        return Promise.resolve();
    },

    async _prepareOTPVerification(email, otp) {
        if (!otp || otp.length !== 6) {
            throw new Error('Invalid OTP format');
        }
        return Promise.resolve();
    },

    async _validateAuthResponseParallel(user, tokens) {
        if (!user?.id || !user?.email || !tokens?.access_token) {
            throw new Error('Invalid authentication response');
        }
        return Promise.resolve();
    },

    async _prepareAuthSetupParallel() {
        return Promise.resolve();
    },

    async _cacheAuthStateParallel(state) {
        return new Promise((resolve) => {
            this.authCache.set('auth_state', {
                ...state,
                cached: Date.now()
            });
            resolve();
        });
    },

    async _getTokenFromStorage() {
        const stored = this._getStoredAccessTokenFast();
        return stored?.token || null;
    },

    _restoreFromCache(cached) {
        this._setAccessTokenFast(cached.token, cached.expiresIn);
        this._setUserInfoFast(cached.user);
    },

    _log(...args) {
        if (this.options.debug) {
            console.log('[UltraFastAuth]', ...args);
        }
    },
    
    _error(...args) {
        console.error('[UltraFastAuth]', ...args);
    }
};

if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}