const AuthService = {
    // Authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    accessToken: null,
    tokenExpiry: null,
    lastValidation: null,
    
    AUTH_BASE_URL: '',
        
    // State management
    isInitialized: false,
    initPromise: null,
    
    options: {
        debug: true,
        cacheTimeout: 5 * 60 * 1000,
        refreshBuffer: 5 * 60 * 1000
    },

    /**
     * GLOBAL INITIALIZATION - Called once when script loads
     */
    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this._performInit();
        return this.initPromise;
    },

    async _performInit() {
        if (this.isInitialized) {
            return { success: true, authenticated: this.authenticated };
        }

        try {
            this._log('🚀 AuthService initializing globally...');
            this._log('Using AUTH_BASE_URL:', this.AUTH_BASE_URL);
            
            // Try to restore session
            const restored = await this._restoreSession();
            
            this.isInitialized = true;
            
            if (restored) {
                this._log('✅ AuthService initialized with session');
                return { success: true, authenticated: true };
            } else {
                this._log('✅ AuthService initialized - no session');
                return { success: true, authenticated: false };
            }
            
        } catch (error) {
            this._error('AuthService initialization failed:', error);
            this.isInitialized = true;
            return { success: false, error: error.message };
        }
    },

    /**
     * SIMPLIFIED: Session restoration with priority order
     */
    async _restoreSession() {
        try {
            // Method 1: Try localStorage backup if recent and valid
            if (this._restoreFromLocalStorage()) {
                this._log('✅ Session restored from localStorage');
                return true;
            }
            
            // Method 2: Try refresh token
            this._log('Attempting token refresh...');
            if (await this._attemptTokenRefresh()) {
                this._log('✅ Session restored via token refresh');
                return true;
            }
            
            // Method 3: Try cookies as fallback
            if (await this._restoreFromCookies()) {
                this._log('✅ Session restored from cookies');
                return true;
            }
            
            this._log('ℹ️ No session to restore');
            return false;
            
        } catch (error) {
            this._error('Session restoration failed:', error);
            return false;
        }
    },

    /**
     * RESTORE FROM LOCALSTORAGE BACKUP
     */
    _restoreFromLocalStorage() {
        try {
            const backupAuth = localStorage.getItem('aaai_backup_auth');
            if (!backupAuth) return false;
            
            const parsed = JSON.parse(backupAuth);
            const isRecent = (Date.now() - parsed.timestamp) < (24 * 60 * 60 * 1000);
            const isNotExpired = Date.now() < parsed.expires;
            
            if (isRecent && isNotExpired && parsed.user && parsed.token) {
                this._setUserInfo(parsed.user);
                this._setAccessToken(parsed.token, Math.floor((parsed.expires - Date.now()) / 1000));
                this.authenticated = true;
                this.lastValidation = Date.now();
                return true;
            } else {
                localStorage.removeItem('aaai_backup_auth');
                return false;
            }
        } catch (error) {
            this._log('localStorage restore failed:', error);
            return false;
        }
    },

    /**
     * RESTORE FROM COOKIES
     */
    async _restoreFromCookies() {
        try {
            const allCookies = document.cookie;
            this._log('🔍 Checking cookies for session data...');
            
            if (!allCookies || allCookies.trim() === '') {
                this._log('No cookies found');
                return false;
            }
            
            const cookieArray = allCookies.split(';').map(c => c.trim());
            const authCookie = cookieArray.find(c => c.startsWith('authenticated=true'));
            const userInfoCookie = cookieArray.find(c => c.startsWith('user_info='));
            
            if (!authCookie || !userInfoCookie) {
                this._log('Required auth cookies not found');
                return false;
            }
            
            const userInfoValue = userInfoCookie.split('=')[1];
            const userInfo = JSON.parse(decodeURIComponent(userInfoValue));
            
            if (!userInfo.email || !userInfo.id) {
                this._log('Invalid user info in cookie');
                return false;
            }
            
            this._setUserInfo(userInfo);
            this.authenticated = true;
            this.lastValidation = Date.now();
            
            const accessTokenCookie = cookieArray.find(c => c.startsWith('access_token='));
            if (accessTokenCookie) {
                const tokenValue = accessTokenCookie.split('=')[1];
                if (tokenValue && tokenValue !== '') {
                    this._setAccessToken(tokenValue, 21600);
                }
            }
            
            return true;
            
        } catch (error) {
            this._log('Cookie restore failed:', error);
            return false;
        }
    },

    /**
     * SIMPLIFIED: Token refresh with single attempt
     */
    async _attemptTokenRefresh() {
        try {
            let refreshToken = null;
            try {
                const cookies = document.cookie.split(';');
                const refreshCookie = cookies.find(c => c.trim().startsWith('refresh_token='));
                if (refreshCookie) {
                    refreshToken = refreshCookie.split('=')[1];
                }
            } catch (error) {
                this._log('Error extracting refresh token from cookies:', error);
            }
    
            const requestBody = refreshToken ? { refresh_token: refreshToken } : {};
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(requestBody)
            });
            
            if (!response.ok) {
                this._log('Token refresh failed:', response.status);
                return false;
            }
            
            const data = await response.json();
            
            if (data.tokens?.access_token || data.access_token) {
                const accessToken = data.tokens?.access_token || data.access_token;
                const expiresIn = data.tokens?.expires_in || data.expires_in || 21600;
                
                this._setAccessToken(accessToken, expiresIn);
                
                if (data.user) {
                    this._setUserInfo(data.user);
                }
                
                this.authenticated = true;
                this.lastValidation = Date.now();
                
                // Update localStorage backup
                const backupData = {
                    user: data.user || { email: this.userEmail, id: this.userId },
                    token: accessToken,
                    expires: Date.now() + (expiresIn * 1000),
                    timestamp: Date.now()
                };
                localStorage.setItem('aaai_backup_auth', JSON.stringify(backupData));
                
                this._log('✅ Token refresh successful');
                return true;
            }
            
            this._log('❌ Token refresh response missing tokens');
            return false;
            
        } catch (error) {
            this._log('❌ Token refresh failed:', error);
            return false;
        }
    },

    /**
     * WAIT FOR INITIALIZATION
     */
    async waitForInit() {
        if (this.initPromise) {
            await this.initPromise;
        }
        return this.isInitialized;
    },

    /**
     * SIMPLIFIED: Token getter with basic refresh only when expired
     */
    async getToken() {
        // If we have a valid token, return it
        if (this._isAccessTokenValid()) {
            return this.accessToken;
        }
        
        // If token is expired, try one refresh attempt
        if (this.accessToken && this.tokenExpiry && this.tokenExpiry <= Date.now()) {
            this._log('Token expired, attempting refresh...');
            const refreshed = await this._attemptTokenRefresh();
            if (refreshed && this._isAccessTokenValid()) {
                return this.accessToken;
            }
        }
        
        return null;
    },

    /**
     * CRITICAL CHANGE: Simplified authentication check - only verify state
     */
    isAuthenticated() {
        const hasUserInfo = this.userEmail && this.userId;
        const isMarkedAuth = this.authenticated;
        
        return isMarkedAuth && hasUserInfo;
    },

    _isAccessTokenValid() {
        return this.accessToken && this.tokenExpiry && Date.now() < (this.tokenExpiry - this.options.refreshBuffer);
    },

    /**
     * LOGIN METHODS
     */
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
            
            const data = await response.json();
            
            if (data.user && data.tokens) {
                this.storeAuthData(data.tokens.access_token, data.tokens.expires_in || 21600, data.user);
            }
            
            return data;
        } catch (error) {
            this._error('OTP verification failed:', error);
            throw error;
        }
    },

    /**
     * STORE AUTHENTICATION DATA
     */
    storeAuthData(token, expiresIn, user) {
        try {
            this._log('📝 Storing authentication data...');
            
            this._setAccessToken(token, expiresIn);
            this._setUserInfo(user);
            this.authenticated = true;
            this.lastValidation = Date.now();
            
            const backupData = {
                user: user,
                token: token,
                expires: Date.now() + (expiresIn * 1000),
                timestamp: Date.now()
            };
            
            localStorage.setItem('aaai_backup_auth', JSON.stringify(backupData));
            
            this._log('✅ Authentication data stored successfully');
            
        } catch (error) {
            this._error('Failed to store auth data:', error);
        }
    },

    /**
     * GET CURRENT USER
     */
    getCurrentUser() {
        if (!this.isAuthenticated()) {
            return null;
        }
        
        return {
            id: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },

    /**
     * CRITICAL CHANGE: Simplified function execution with guaranteed token
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
     
        // Get access token (with automatic refresh if needed)
        const accessToken = await this.getToken();
        if (!accessToken) {
            throw new Error('No valid access token available');
        }

        this._log('Executing function:', functionName, 'with input:', inputData);
        
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
                const errorData = await response.json().catch(() => ({}));
                this._error('API error response:', errorData);
                throw new Error(errorData.error || errorData.detail || `Function execution failed with status ${response.status}`);
            }
            
            const result = await response.json();
            this._log('Function response:', functionName, JSON.stringify(result, null, 2));
            
            return result;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                this._error('Function execution timeout:', functionName);
                throw new Error('Function execution timed out');
            }
            this._error('Function execution error:', functionName, error);
            throw error;
        }
    },

    /**
     * LOGOUT
     */
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

    /**
     * PRIVATE METHODS
     */
    _setUserInfo(user) {
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
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
        
        try {
            localStorage.removeItem('aaai_backup_auth');
        } catch (error) {
            this._log('Could not clear localStorage:', error);
        }
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

// ========================================
// GLOBAL INITIALIZATION - HAPPENS IMMEDIATELY
// ========================================

// Initialize AuthService immediately when script loads
window.AuthService = AuthService;

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        AuthService.init();
    });
} else {
    // DOM already ready, initialize immediately
    AuthService.init();
}

console.log('🔧 AuthService loaded and will initialize globally');