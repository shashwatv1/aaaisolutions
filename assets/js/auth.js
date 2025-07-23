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
            
            // Try to restore session from any available source
            const restored = await this._restoreSession();
            
            this.isInitialized = true;
            
            if (restored) {
                this._log('✅ AuthService initialized with existing session');
                return { success: true, authenticated: true };
            } else {
                this._log('✅ AuthService initialized - no existing session');
                return { success: true, authenticated: false };
            }
            
        } catch (error) {
            this._error('AuthService initialization failed:', error);
            this.isInitialized = true; // Mark as initialized even if failed
            return { success: false, error: error.message };
        }
    },

    /**
     * ENHANCED SESSION RESTORATION
     */
    async _restoreSession() {
        try {
            // Method 1: Try localStorage backup first (most reliable)
            if (this._restoreFromLocalStorage()) {
                this._log('✅ Session restored from localStorage');
                return true;
            }
            
            // Method 2: Try cookies
            if (await this._restoreFromCookies()) {
                this._log('✅ Session restored from cookies');
                return true;
            }
            
            // Method 3: Try refresh token
            if (await this._restoreFromRefreshToken()) {
                this._log('✅ Session restored from refresh token');
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
                // Clean up expired backup
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
            this._log('🔍 All available cookies:', allCookies);
            
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
            
            // Parse user info
            const userInfoValue = userInfoCookie.split('=')[1];
            const userInfo = JSON.parse(decodeURIComponent(userInfoValue));
            
            if (!userInfo.email || !userInfo.id) {
                this._log('Invalid user info in cookie');
                return false;
            }
            
            // Set session from cookies
            this._setUserInfo(userInfo);
            this.authenticated = true;
            this.lastValidation = Date.now();
            
            // Try to get access token from cookie
            const accessTokenCookie = cookieArray.find(c => c.startsWith('access_token='));
            if (accessTokenCookie) {
                const tokenValue = accessTokenCookie.split('=')[1];
                if (tokenValue && tokenValue !== '') {
                    this._setAccessToken(tokenValue, 21600); // 6 hours default
                }
            }
            
            return true;
            
        } catch (error) {
            this._log('Cookie restore failed:', error);
            return false;
        }
    },

    /**
     * RESTORE FROM REFRESH TOKEN
     */
    async _restoreFromRefreshToken() {
        try {
            const refreshResult = await this._attemptTokenRefresh();
            return refreshResult;
        } catch (error) {
            this._log('Refresh token restore failed:', error);
            return false;
        }
    },

    /**
     * TOKEN REFRESH
     */
    async _attemptTokenRefresh() {
        try {
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include'
            });
            
            if (!response.ok) return false;
            
            const data = await response.json();
            
            if (data.tokens?.access_token) {
                this._setAccessToken(data.tokens.access_token, data.tokens.expires_in || 21600);
                
                if (data.user) {
                    this._setUserInfo(data.user);
                }
                
                this.authenticated = true;
                this.lastValidation = Date.now();
                
                return true;
            }
            
            return false;
            
        } catch (error) {
            this._log('Token refresh failed:', error);
            return false;
        }
    },

    /**
     * AUTHENTICATION CHECK
     */
    isAuthenticated() {
        const hasValidToken = this.accessToken && this._isAccessTokenValid();
        const hasUserInfo = this.userEmail && this.userId;
        const isMarkedAuth = this.authenticated;
        
        return isMarkedAuth && hasUserInfo && (hasValidToken || this._hasRefreshCapability());
    },

    _isAccessTokenValid() {
        return this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry;
    },

    _hasRefreshCapability() {
        try {
            return document.cookie.includes('refresh_token=');
        } catch {
            return false;
        }
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
            
            // Store authentication data immediately
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
            
            // Set AuthService state
            this._setAccessToken(token, expiresIn);
            this._setUserInfo(user);
            this.authenticated = true;
            this.lastValidation = Date.now();
            
            // Store backup in localStorage
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
     * FUNCTION EXECUTION
     */
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
        
        // Clear localStorage backup
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