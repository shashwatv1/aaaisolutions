/**
 * JWT Authentication Service for AAAI Solutions
 * Complete implementation with Bearer tokens, localStorage, and automatic refresh
 */
const AuthService = {
    // Core authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    accessToken: null,
    tokenExpiry: null,
    
    // Auto-refresh management
    refreshTimer: null,
    refreshPromise: null,
    isRefreshing: false,
    
    // Configuration
    TOKEN_STORAGE_KEY: 'aaai_access_token',
    USER_STORAGE_KEY: 'aaai_user_info',
    TOKEN_REFRESH_THRESHOLD: 5 * 60 * 1000, // 5 minutes before expiry
    
    // URLs (set during init)
    AUTH_BASE_URL: null,
    API_BASE_URL: null,
    
    /**
     * Initialize the JWT authentication service
     */
    init() {
        console.log('🚀 JWT AuthService initialization starting...');
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        console.log('Environment:', window.AAAI_CONFIG.ENVIRONMENT);
        
        // Set up URLs based on environment
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            this.AUTH_BASE_URL = 'http://localhost:8080';
            this.API_BASE_URL = 'http://localhost:8080';
        } else {
            this.AUTH_BASE_URL = '';
            this.API_BASE_URL = '';
            this.WS_BASE_URL = window.location.origin;
        }
        
        console.log('AUTH_BASE_URL:', this.AUTH_BASE_URL);
        
        // Initialize authentication state from localStorage
        const authRestored = this._restoreAuthFromStorage();
        
        // Set up automatic token refresh
        this._setupTokenRefresh();
        this._setupVisibilityHandler();
        
        // Start refresh timer if authenticated
        if (authRestored) {
            this._scheduleTokenRefresh();
        }
        
        console.log('✅ JWT AuthService initialized successfully', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authenticated: this.isAuthenticated(),
            hasStoredAuth: authRestored,
            tokenMethod: 'jwt_bearer'
        });
        
        return this.isAuthenticated();
    },
    
    /**
     * Request OTP for authentication
     */
    async requestOTP(email) {
        try {
            console.log(`📧 Requesting OTP for: ${email}`);
            
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
    
    /**
     * Verify OTP and establish JWT authentication
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`🔐 Verifying OTP for: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                signal: controller.signal,
                credentials: 'include' // Include for refresh token cookie
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                console.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('✅ OTP verification successful - JWT tokens received');
            
            // Extract authentication data
            const { user, tokens, authentication } = data;
            
            if (!user || !tokens || !tokens.access_token) {
                throw new Error('Invalid authentication response');
            }
            
            // Store authentication state
            this._setAuthState({
                user: user,
                accessToken: tokens.access_token,
                tokenExpiry: new Date(Date.now() + (tokens.expires_in * 1000))
            });
            
            // Schedule token refresh
            this._scheduleTokenRefresh();
            
            console.log('✅ JWT authentication established');
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
     * Execute function with JWT Bearer authentication
     */
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`🚀 Executing function with JWT: ${functionName}`);
            
            // Auto-refresh token if needed
            await this._ensureValidToken();
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const executeUrl = `${this.API_BASE_URL}/api/function/${functionName}`;
            
            console.log(`📡 Making JWT-authenticated request to: ${executeUrl}`);
            console.log(`📝 Function: ${functionName}`);
            console.log(`👤 User: ${this.userEmail}`);
            
            const response = await fetch(executeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.accessToken}`
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include' // For refresh token cookie
            });
            
            clearTimeout(timeoutId);
            
            console.log(`📊 Response status: ${response.status}`);
            
            if (!response.ok) {
                let errorData;
                try {
                    const responseText = await response.text();
                    console.log(`💥 Error response:`, responseText.substring(0, 300));
                    
                    if (responseText.trim().startsWith('<')) {
                        throw new Error(`Received HTML instead of JSON (status: ${response.status}). Check API Gateway configuration.`);
                    }
                    
                    errorData = JSON.parse(responseText);
                } catch (parseError) {
                    throw new Error(`HTTP ${response.status}: Failed to parse error response`);
                }
                
                console.error(`💥 Function execution failed:`, errorData);
                
                // Handle token expiration
                if (response.status === 401 && errorData.expired) {
                    console.log('🔄 Token expired, attempting refresh...');
                    try {
                        await this.refreshToken();
                        // Retry the request once with new token
                        return await this.executeFunction(functionName, inputData);
                    } catch (refreshError) {
                        console.error('Token refresh failed:', refreshError);
                        this._clearAuthState();
                        throw new Error('Session expired. Please log in again.');
                    }
                }
                
                if (response.status === 401) {
                    console.warn('🔓 Authentication failed');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(errorData.error || errorData.detail || errorData.message || `Failed to execute function: ${functionName}`);
            }
            
            // Parse successful response
            let data;
            try {
                const responseText = await response.text();
                
                if (responseText.trim().startsWith('<')) {
                    throw new Error('Received HTML instead of JSON - API Gateway route may not be configured properly');
                }
                
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('💥 Failed to parse successful response:', parseError);
                throw new Error(`Invalid response format: ${parseError.message}`);
            }
            
            console.log(`✅ Function ${functionName} executed successfully with JWT`);
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`💀 JWT function execution failed (${functionName}):`, error);
            throw error;
        }
    },
    
    /**
     * Refresh JWT access token using httpOnly refresh token
     */
    async refreshToken() {
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
    
    /**
     * Perform actual token refresh
     */
    async _performTokenRefresh() {
        try {
            console.log('🔄 Refreshing JWT access token...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include', // Include httpOnly refresh token
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.log('❌ Token refresh failed:', response.status, errorData);
                
                if (response.status === 401) {
                    console.log('Refresh token expired or invalid, clearing auth state');
                    this._clearAuthState();
                    throw new Error('Please log in again');
                }
                
                throw new Error(errorData.error || 'Token refresh failed');
            }
            
            const data = await response.json();
            console.log('✅ Token refreshed successfully');
            
            // Update authentication state with new token
            this._updateAuthState({
                accessToken: data.tokens.access_token,
                tokenExpiry: new Date(Date.now() + (data.tokens.expires_in * 1000)),
                user: data.user
            });
            
            // Reschedule next refresh
            this._scheduleTokenRefresh();
            
            return true;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn('Token refresh timed out');
            } else {
                console.error('Token refresh error:', error);
            }
            
            // Clear auth state on refresh failure
            this._clearAuthState();
            throw error;
        }
    },
    
    /**
     * Ensure valid token (refresh if needed)
     */
    async _ensureValidToken() {
        if (!this.accessToken || !this.tokenExpiry) {
            throw new Error('No access token available');
        }
        
        // Check if token expires soon
        const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
        
        if (timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD) {
            console.log('🔄 Token expires soon, refreshing...');
            await this.refreshToken();
        }
    },
    
    /**
     * Logout and clear all authentication
     */
    async logout() {
        try {
            console.log('🚪 JWT logout starting...');
            
            // Clear refresh timer
            this._clearRefreshTimer();
            
            // Attempt server-side logout
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000);
                
                await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': this.accessToken ? `Bearer ${this.accessToken}` : ''
                    },
                    credentials: 'include',
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId);
                console.log('✅ Server-side logout completed');
            } catch (error) {
                console.warn('Server-side logout failed or timed out:', error);
            }
            
            // Clear local authentication state
            this._clearAuthState();
            
            console.log('✅ JWT logout successful');
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this._clearAuthState();
        }
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
            return result.data?.credits || 0;
        } catch (error) {
            console.error('Error getting user credits:', error);
            return 0;
        }
    },
    
    // ============================================================
    // JWT UTILITY METHODS
    // ============================================================
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated && 
               !!this.userId && 
               !!this.userEmail && 
               !!this.accessToken &&
               this._isTokenValid();
    },
    
    /**
     * Check if current token is valid (not expired)
     */
    _isTokenValid() {
        if (!this.tokenExpiry) return false;
        return this.tokenExpiry.getTime() > Date.now();
    },
    
    /**
     * Get current user information
     */
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated,
            tokenExpiry: this.tokenExpiry,
            tokenValid: this._isTokenValid()
        };
    },
    
    /**
     * Get access token
     */
    getToken() {
        return this.accessToken;
    },
    
    /**
     * Get authorization header for API calls
     */
    getAuthHeader() {
        return {
            'Authorization': `Bearer ${this.accessToken}`
        };
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
            tokenValid: this._isTokenValid(),
            tokenExpiry: this.tokenExpiry,
            refreshScheduled: !!this.refreshTimer,
            authMethod: 'jwt_bearer'
        };
    },
    
    /**
     * Check if user has a persistent session
     */
    hasPersistentSession() {
        // Check if we have stored authentication or refresh token cookie
        const hasStoredAuth = !!localStorage.getItem(this.TOKEN_STORAGE_KEY);
        const hasRefreshCookie = document.cookie.includes('refresh_token=');
        return hasStoredAuth || hasRefreshCookie;
    },
    
    // ============================================================
    // PRIVATE METHODS
    // ============================================================
    
    /**
     * Restore authentication from localStorage
     */
    _restoreAuthFromStorage() {
        try {
            console.log('💾 Restoring JWT auth from localStorage...');
            
            const storedToken = localStorage.getItem(this.TOKEN_STORAGE_KEY);
            const storedUser = localStorage.getItem(this.USER_STORAGE_KEY);
            
            if (!storedToken || !storedUser) {
                console.log('No stored authentication found');
                return false;
            }
            
            const userInfo = JSON.parse(storedUser);
            const tokenExpiry = new Date(userInfo.tokenExpiry);
            
            // Check if token is expired
            if (tokenExpiry.getTime() <= Date.now()) {
                console.log('Stored token is expired, clearing storage');
                this._clearStorage();
                return false;
            }
            
            // Restore authentication state
            this.authenticated = true;
            this.userEmail = userInfo.email;
            this.userId = userInfo.id;
            this.sessionId = userInfo.sessionId;
            this.accessToken = storedToken;
            this.tokenExpiry = tokenExpiry;
            
            console.log('✅ JWT authentication restored from storage');
            return true;
            
        } catch (error) {
            console.error('Error restoring auth from storage:', error);
            this._clearStorage();
            return false;
        }
    },
    
    /**
     * Set authentication state and persist to storage
     */
    _setAuthState({ user, accessToken, tokenExpiry }) {
        console.log('🔐 Setting JWT authentication state');
        
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        this.accessToken = accessToken;
        this.tokenExpiry = tokenExpiry;
        
        // Persist to localStorage
        this._saveToStorage();
    },
    
    /**
     * Update authentication state (for token refresh)
     */
    _updateAuthState({ accessToken, tokenExpiry, user }) {
        if (accessToken) this.accessToken = accessToken;
        if (tokenExpiry) this.tokenExpiry = tokenExpiry;
        if (user) {
            this.userEmail = user.email || this.userEmail;
            this.userId = user.user_id || this.userId;
            this.sessionId = user.session_id || this.sessionId;
        }
        
        // Update storage
        this._saveToStorage();
    },
    
    /**
     * Clear authentication state
     */
    _clearAuthState() {
        console.log('🧹 Clearing JWT authentication state');
        
        this.authenticated = false;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        
        this._clearRefreshTimer();
        this._clearStorage();
    },
    
    /**
     * Save authentication to localStorage
     */
    _saveToStorage() {
        try {
            if (this.accessToken) {
                localStorage.setItem(this.TOKEN_STORAGE_KEY, this.accessToken);
            }
            
            if (this.userEmail && this.userId) {
                const userInfo = {
                    email: this.userEmail,
                    id: this.userId,
                    sessionId: this.sessionId,
                    tokenExpiry: this.tokenExpiry?.toISOString()
                };
                localStorage.setItem(this.USER_STORAGE_KEY, JSON.stringify(userInfo));
            }
        } catch (error) {
            console.error('Error saving auth to storage:', error);
        }
    },
    
    /**
     * Clear localStorage
     */
    _clearStorage() {
        try {
            localStorage.removeItem(this.TOKEN_STORAGE_KEY);
            localStorage.removeItem(this.USER_STORAGE_KEY);
        } catch (error) {
            console.error('Error clearing storage:', error);
        }
    },
    
    /**
     * Setup automatic token refresh
     */
    _setupTokenRefresh() {
        // Check for expiring tokens every minute
        setInterval(() => {
            if (this.isAuthenticated()) {
                const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
                
                // Refresh if token expires in the next 5 minutes
                if (timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD && timeUntilExpiry > 0) {
                    console.log('🔄 Auto-refreshing token due to upcoming expiry');
                    this.refreshToken().catch(error => {
                        console.error('Auto-refresh failed:', error);
                    });
                }
            }
        }, 60000); // Check every minute
    },
    
    /**
     * Schedule token refresh
     */
    _scheduleTokenRefresh() {
        this._clearRefreshTimer();
        
        if (!this.tokenExpiry) return;
        
        const timeUntilRefresh = this.tokenExpiry.getTime() - Date.now() - this.TOKEN_REFRESH_THRESHOLD;
        
        if (timeUntilRefresh > 0) {
            this.refreshTimer = setTimeout(() => {
                console.log('🔄 Scheduled token refresh triggered');
                this.refreshToken().catch(error => {
                    console.error('Scheduled refresh failed:', error);
                });
            }, timeUntilRefresh);
            
            console.log(`⏰ Token refresh scheduled for ${new Date(Date.now() + timeUntilRefresh).toLocaleTimeString()}`);
        }
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
     * Setup page visibility change handler
     */
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Page became visible, check if token needs refresh
                const timeUntilExpiry = this.tokenExpiry.getTime() - Date.now();
                if (timeUntilExpiry <= this.TOKEN_REFRESH_THRESHOLD) {
                    console.log('🔄 Page visible and token expires soon, refreshing...');
                    this.refreshToken().catch(error => {
                        console.error('Visibility refresh failed:', error);
                    });
                }
            }
        });
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export for module environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}