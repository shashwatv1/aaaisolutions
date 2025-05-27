/**
 * ROBUST Authentication module for AAAI Solutions
 * Enhanced cookie handling and session restoration
 */
const AuthService = {
    // Core state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    token: null,
    refreshToken: null,
    
    // Timers and promises
    tokenRefreshTimer: null,
    refreshPromise: null,
    isRefreshing: false,

    // Initialize the auth service with configuration
    init() {
        console.log('=== ROBUST AuthService.init() START ===');
        console.log('window.location.hostname:', window.location.hostname);
        console.log('window.AAAI_CONFIG exists:', !!window.AAAI_CONFIG);
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        console.log('Environment from config:', window.AAAI_CONFIG.ENVIRONMENT);
        
        // Set up URLs based on environment
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            this.AUTH_BASE_URL = 'http://localhost:8080';
            this.API_BASE_URL = 'http://localhost:8080';
            this.WS_BASE_URL = 'ws://localhost:8080';
        } else {
            this.AUTH_BASE_URL = '';
            this.API_BASE_URL = '';
            this.WS_BASE_URL = window.location.origin;
        }
        
        console.log('AUTH_BASE_URL:', this.AUTH_BASE_URL);
        console.log('API_BASE_URL:', this.API_BASE_URL);
        
        // Initialize authentication state with comprehensive approach
        const authRestored = this._initializeAuthState();
        
        // Set up periodic token refresh and session management
        this._setupTokenRefresh();
        this._setupVisibilityHandler();
        
        window.AAAI_LOGGER?.info('ROBUST AuthService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: this.isAuthenticated(),
            hasPersistentSession: this.hasPersistentSession(),
            authRestored: authRestored
        });
        
        console.log('=== ROBUST AuthService.init() END ===');
        console.log('Final auth state:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            hasTokens: !!this.token
        });
        
        return this.isAuthenticated();
    },
    
    /**
     * ROBUST: Comprehensive authentication state initialization
     */
    _initializeAuthState() {
        console.log('🔍 ROBUST: Initializing authentication state...');
        
        try {
            // Step 1: Check cookies first
            const cookieAuth = this._restoreFromCookies();
            if (cookieAuth) {
                console.log('✅ Authentication restored from cookies');
                return true;
            }
            
            // Step 2: Check localStorage as fallback
            const localAuth = this._restoreFromLocalStorage();
            if (localAuth) {
                console.log('✅ Authentication restored from localStorage');
                return true;
            }
            
            // Step 3: Check if we have partial authentication data
            const partialAuth = this._attemptPartialRestore();
            if (partialAuth) {
                console.log('⚠️ Partial authentication restored, validating...');
                // Validate in background
                setTimeout(() => this._validateAndRepair(), 100);
                return true;
            }
            
            console.log('❌ No authentication state found');
            this._clearAuthState();
            return false;
            
        } catch (error) {
            console.error('Error during auth initialization:', error);
            this._clearAuthState();
            return false;
        }
    },
    
    /**
     * Restore authentication from cookies
     */
    _restoreFromCookies() {
        try {
            console.log('🍪 Checking cookies for authentication...');
            
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            console.log('Cookie status:', {
                authenticated: authCookie,
                hasUserInfo: !!userInfoCookie,
                userInfoLength: userInfoCookie ? userInfoCookie.length : 0
            });
            
            if (authCookie === 'true' && userInfoCookie) {
                try {
                    // More robust user info parsing
                    let userInfo;
                    try {
                        userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
                    } catch (parseError) {
                        console.warn('Failed to parse user_info cookie, trying direct parse:', parseError);
                        userInfo = JSON.parse(userInfoCookie);
                    }
                    
                    if (this._validateUserInfo(userInfo)) {
                        this._setAuthState(userInfo);
                        return true;
                    }
                } catch (parseError) {
                    console.error('Failed to parse user info cookie:', parseError);
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error restoring from cookies:', error);
            return false;
        }
    },
    
    /**
     * Restore authentication from localStorage
     */
    _restoreFromLocalStorage() {
        try {
            console.log('💾 Checking localStorage for authentication...');
            
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            const authCookie = this._getCookie('authenticated');
            
            console.log('LocalStorage status:', {
                email: !!storedEmail,
                userId: !!storedUserId,
                sessionId: !!storedSessionId,
                authCookie: authCookie
            });
            
            if (storedEmail && storedUserId && authCookie === 'true') {
                const userInfo = {
                    email: storedEmail,
                    id: storedUserId,
                    session_id: storedSessionId
                };
                
                if (this._validateUserInfo(userInfo)) {
                    this._setAuthState(userInfo);
                    return true;
                }
            }
            
            return false;
        } catch (error) {
            console.error('Error restoring from localStorage:', error);
            return false;
        }
    },
    
    /**
     * Attempt partial authentication restore
     */
    _attemptPartialRestore() {
        try {
            console.log('🔧 Attempting partial authentication restore...');
            
            // Check if we have any authentication indicators
            const authCookie = this._getCookie('authenticated');
            const hasAnyStorage = this._getSecureItem('user_email') || this._getSecureItem('user_id');
            
            if (authCookie === 'true' || hasAnyStorage) {
                console.log('Found partial auth data, will attempt validation');
                // Set minimal state to trigger validation
                this.authenticated = true;
                return true;
            }
            
            return false;
        } catch (error) {
            console.error('Error in partial restore:', error);
            return false;
        }
    },
    
    /**
     * Validate user info structure
     */
    _validateUserInfo(userInfo) {
        if (!userInfo || typeof userInfo !== 'object') {
            console.warn('Invalid user info: not an object');
            return false;
        }
        
        if (!userInfo.email || typeof userInfo.email !== 'string') {
            console.warn('Invalid user info: missing or invalid email');
            return false;
        }
        
        if (!userInfo.id || typeof userInfo.id !== 'string') {
            console.warn('Invalid user info: missing or invalid id');
            return false;
        }
        
        return true;
    },
    
    /**
     * Set authentication state from user info
     */
    _setAuthState(userInfo) {
        console.log('🔐 Setting authentication state:', {
            email: userInfo.email,
            id: userInfo.id,
            session_id: userInfo.session_id
        });
        
        this.authenticated = true;
        this.userEmail = userInfo.email;
        this.userId = userInfo.id;
        this.sessionId = userInfo.session_id;
        this.token = 'cookie_stored';
        this.refreshToken = 'cookie_stored';
        
        // Sync to localStorage
        this._syncToLocalStorage();
    },
    
    /**
     * Sync authentication state to localStorage
     */
    _syncToLocalStorage() {
        try {
            if (this.userEmail) this._setSecureItem('user_email', this.userEmail);
            if (this.userId) this._setSecureItem('user_id', this.userId);
            if (this.sessionId) this._setSecureItem('session_id', this.sessionId);
        } catch (error) {
            console.warn('Failed to sync to localStorage:', error);
        }
    },
    
    /**
     * Validate and repair authentication state
     */
    async _validateAndRepair() {
        try {
            console.log('🔧 Validating and repairing authentication state...');
            
            const isValid = await this._validateSessionAsync();
            if (!isValid) {
                console.log('❌ Session validation failed, clearing state');
                this._clearAuthState();
            } else {
                console.log('✅ Session validation successful');
            }
            
            return isValid;
        } catch (error) {
            console.error('Error during validation and repair:', error);
            return false;
        }
    },
    
    /**
     * ENHANCED: Async session validation
     */
    async _validateSessionAsync() {
        try {
            console.log('🔍 Validating session with server...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            console.log('Session validation response:', {
                ok: response.ok,
                status: response.status,
                valid: data.valid,
                reason: data.reason
            });
            
            if (response.ok && data.valid) {
                console.log('✅ Session validation successful');
                
                // Update authentication state with server response
                if (data.user_info) {
                    console.log('Updating user info from server:', data.user_info);
                    
                    // Merge with existing state
                    this.userEmail = data.user_info.email || this.userEmail;
                    this.userId = data.user_info.id || this.userId;
                    this.sessionId = data.user_info.session_id || this.sessionId;
                    
                    // Ensure we have the minimum required info
                    if (!this.userEmail || !this.userId) {
                        console.warn('Server response missing required user info');
                        return false;
                    }
                    
                    this.authenticated = true;
                    this._syncToLocalStorage();
                }
                
                return true;
            } else {
                console.log('❌ Session validation failed:', data);
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Session validation timed out');
            } else {
                console.error('Session validation error:', error);
            }
            return false;
        }
    },
    
    /**
     * OTP verification with enhanced state management
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`ROBUST: Verifying OTP for email: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('✅ OTP verification successful');
            
            // Set authentication state
            const userInfo = {
                email: email,
                id: data.id,
                session_id: data.session_id
            };
            
            this._setAuthState(userInfo);
            
            console.log('✅ Authentication state updated after OTP verification');
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    /**
     * Enhanced token refresh
     */
    async refreshTokenIfNeeded() {
        if (!this.isAuthenticated()) {
            console.log('Not authenticated, no token to refresh');
            return false;
        }
        
        // Prevent concurrent refresh attempts
        if (this.isRefreshing) {
            console.log('Token refresh already in progress, waiting...');
            return this.refreshPromise;
        }
        
        this.isRefreshing = true;
        this.refreshPromise = this._performTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    },
    
    async _performTokenRefresh() {
        try {
            console.log('🔄 ROBUST: Attempting token refresh...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh-silent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Token refresh successful');
                
                // Update authentication state if provided
                if (data.user) {
                    this.userEmail = data.user.email || this.userEmail;
                    this.userId = data.user.id || this.userId;
                    this.sessionId = data.session_id || this.sessionId;
                    this._syncToLocalStorage();
                }
                
                return true;
            } else {
                console.log('Token refresh failed:', response.status);
                if (response.status === 401) {
                    console.log('Token refresh returned 401, clearing auth state');
                    this._clearAuthState();
                }
                return false;
            }
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Token refresh timed out');
            } else {
                console.error('Error refreshing token:', error);
            }
            return false;
        }
    },
    
    /**
     * Execute function with enhanced error handling
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`ROBUST: Executing function: ${functionName}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const response = await fetch(`${this.API_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`Function execution failed:`, data);
                
                if (response.status === 401) {
                    console.warn('Session expired during function execution');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(data.error || data.detail || `Failed to execute function: ${functionName}`);
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`Function execution error (${functionName}):`, error);
            throw error;
        }
    },
    
    /**
     * Send chat message with enhanced error handling
     */
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);
            
            const response = await fetch(`${this.API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('Chat message failed:', data);
                
                if (response.status === 401) {
                    console.warn('Session expired during chat message');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(data.error || 'Failed to send message');
            }
            
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error('Chat error:', error);
            throw error;
        }
    },
    
    /**
     * Logout with comprehensive cleanup
     */
    async logout() {
        try {
            console.log('🚪 ROBUST: Logging out...');
            
            // Clear timers
            if (this.tokenRefreshTimer) {
                clearInterval(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
            }
            
            // Attempt server-side logout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
            } catch (error) {
                console.warn('Server-side logout failed or timed out:', error);
            }
            
            // Clear all authentication data
            this.clearAuthData();
            
            console.log('✅ Logout successful');
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this.clearAuthData();
        }
    },
    
    /**
     * Check authentication status
     */
    isAuthenticated() {
        const isAuth = this.authenticated && !!this.userId && !!this.userEmail;
        
        if (!isAuth && this.authenticated) {
            console.warn('Authentication state inconsistent:', {
                authenticated: this.authenticated,
                hasUserId: !!this.userId,
                hasUserEmail: !!this.userEmail
            });
        }
        
        return isAuth;
    },
    
    /**
     * Get current user information
     */
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated
        };
    },
    
    /**
     * Get token (placeholder for cookie-stored tokens)
     */
    getToken() {
        return this.token;
    },
    
    /**
     * Get WebSocket URL
     */
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        const url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        console.log(`ROBUST WebSocket URL: ${url}`);
        return url;
    },
    
    /**
     * Get user credits
     */
    async getUserCredits() {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const result = await this.executeFunction('get_user_creds', {
                email: this.userEmail
            });
            return result.data.credits;
        } catch (error) {
            console.error('Error getting user credits:', error);
            return 0;
        }
    },
    
    /**
     * Request OTP
     */
    async requestOTP(email) {
        try {
            console.log(`Requesting OTP for email: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            const responseData = await response.json();
            
            if (!response.ok) {
                console.error('OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            console.log('✅ OTP request successful');
            return responseData;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // ============================================================
    // UTILITY METHODS
    // ============================================================
    
    /**
     * Check if user has a persistent session
     */
    hasPersistentSession() {
        return !!(this._getCookie('authenticated') === 'true' || 
                 this._getSecureItem('user_id') || 
                 this._getCookie('user_info'));
    },
    
    /**
     * Get session information
     */
    getSessionInfo() {
        return {
            authenticated: this.authenticated,
            userId: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            hasRefreshToken: this.hasPersistentSession(),
            tokenValid: this.authenticated
        };
    },
    
    /**
     * Clear all authentication data
     */
    clearAuthData() {
        // Clear localStorage
        ['auth_token', 'refresh_token', 'user_email', 'user_id', 'session_id'].forEach(key => {
            this._removeSecureItem(key);
        });

        // Clear instance data
        this.token = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        this.isRefreshing = false;
        this.refreshPromise = null;

        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }

        console.log('🧹 All authentication data cleared');
    },
    
    // ============================================================
    // PRIVATE METHODS
    // ============================================================
    
    /**
     * Set up automatic token refresh
     */
    _setupTokenRefresh() {
        // Check token every 5 minutes
        this.tokenRefreshTimer = setInterval(() => {
            if (this.isAuthenticated()) {
                this.refreshTokenIfNeeded().catch(error => {
                    console.error('Scheduled token refresh failed:', error);
                });
            }
        }, 300000); // 5 minutes
        
        console.log('🔄 Token refresh scheduler started');
    },
    
    /**
     * Set up page visibility change handler
     */
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Page became visible, validate session
                this._validateSessionAsync().catch(error => {
                    console.error('Visibility session check failed:', error);
                });
            }
        });
    },
    
    /**
     * Clear authentication state
     */
    _clearAuthState() {
        this.token = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        
        // Clear localStorage
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        this._removeSecureItem('session_id');
    },
    
    /**
     * Enhanced cookie management
     */
    _getCookie(name) {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            if (parts.length === 2) {
                const cookieValue = parts.pop().split(';').shift();
                return decodeURIComponent(cookieValue);
            }
        } catch (error) {
            console.warn(`Error reading cookie ${name}:`, error);
        }
        return null;
    },
    
    _setCookie(name, value, days = 7) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        const secureFlag = window.location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax${secureFlag}`;
    },
    
    _deleteCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    },
    
    /**
     * Secure storage methods
     */
    _setSecureItem(key, value) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.setItem(storageKey, value);
            return true;
        } catch (error) {
            console.error('Error storing secure item:', error);
            return false;
        }
    },
    
    _getSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            return localStorage.getItem(storageKey);
        } catch (error) {
            console.error('Error retrieving secure item:', error);
            return null;
        }
    },
    
    _removeSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.removeItem(storageKey);
            return true;
        } catch (error) {
            console.error('Error removing secure item:', error);
            return false;
        }
    },
    
    /**
     * Get authentication headers
     */
    getAuthHeader() {
        return {
            'X-Session-ID': this.sessionId || ''
        };
    }
};

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}