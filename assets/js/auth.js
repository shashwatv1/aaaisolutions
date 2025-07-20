/**
 * UPDATED: High-Performance JWT Authentication Service for 7-day sessions
 * Enhanced with proactive 6-hour token refresh mechanism
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
    
    // UPDATED: Configuration for 7-day sessions
    options: {
        refreshBufferTime: 30 * 60 * 1000,    // 30 minutes (was 2 minutes)
        proactiveRefreshTime: 60 * 60 * 1000, // 1 hour before expiry
        maxRetryAttempts: 3,                   // Increased retry attempts
        debug: false,
        cacheTimeout: 30000, // 30 seconds
        sessionDurationDays: 7 // 7-day sessions
    },

    /**
     * UPDATED: Fast initialization with 7-day session support
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
     * UPDATED: Fast cached authentication check for 7-day sessions
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
        
        // Check if we have a refresh token but no access token
        if (!hasBasicAuth && this._hasRefreshTokenCookie()) {
            // Don't perform sync refresh, return true and let proactive refresh handle it
            return true;
        }
        
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
     * UPDATED: Enhanced access token validation
     */
    _isAccessTokenValid() {
        return this.accessToken && 
               this.tokenExpiry && 
               Date.now() < (this.tokenExpiry - this.options.refreshBufferTime);
    },

    /**
     * UPDATED: Set access token with 6-hour expiry
     */
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

    /**
     * UPDATED: Enhanced user info setting
     */
    _setUserInfo(user) {
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        this.lastValidation = Date.now();
        
        this._log('User authenticated:', user.email);
    },

    /**
     * UPDATED: Enhanced auth state clearing
     */
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
     * Clear refresh timer
     */
    _clearRefreshTimer() {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    },

    /**
     * Store access token in session storage
     */
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

    /**
     * Get stored access token
     */
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

    /**
     * Update stored token
     */
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
     * Check for refresh token cookie
     */
    _hasRefreshTokenCookie() {
        return document.cookie.includes('authenticated=true') && 
               document.cookie.includes('refresh_token=');
    },

    /**
     * Cache auth state
     */
    _cacheAuthState(state) {
        this.authCache.set('auth_state', {
            ...state,
            cached: Date.now()
        });
    },

    /**
     * Get cached auth state
     */
    _getCachedAuthState() {
        const cached = this.authCache.get('auth_state');
        if (cached && (Date.now() - cached.cached) < this.options.cacheTimeout) {
            return cached;
        }
        return null;
    },

    /**
     * Restore from cache
     */
    _restoreFromCache(cached) {
        this._setAccessToken(cached.token, cached.expiresIn);
        this._setUserInfo(cached.user);
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

    /**
     * Get current user
     */
    getCurrentUser() {
        if (!this.isAuthenticated()) return null;
        
        return {
            id: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },

    /**
     * Check for persistent session
     */
    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
    },

    /**
     * Logging helpers
     */
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