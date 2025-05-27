/**
 * DEBUG VERSION - Enhanced Authentication module for AAAI Solutions
 * This version includes extensive logging to identify the URL construction issue
 */
const AuthService = {
    // Initialize the auth service with configuration
    init() {
        // DEBUG: Log initial state
        console.log('=== AuthService.init() DEBUG START ===');
        console.log('window.location.hostname:', window.location.hostname);
        console.log('window.AAAI_CONFIG exists:', !!window.AAAI_CONFIG);
        console.log('window.AAAI_CONFIG:', window.AAAI_CONFIG);
        
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
        
        
        console.log('FIXED URLs:');
        console.log('AUTH_BASE_URL:', this.AUTH_BASE_URL);
        console.log('API_BASE_URL:', this.API_BASE_URL);
        console.log('WS_BASE_URL:', this.WS_BASE_URL);
        
        // Initialize authentication state
        this._initializeFromStorage();
        
        // Set up token refresh monitoring
        this._setupTokenMonitoring();
        
        // Set up visibility change handler
        this._setupVisibilityHandler();
        
        window.AAAI_LOGGER.info('FIXED AuthService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: this.isAuthenticated(),
            tokenValid: this.isTokenValid()
        });
        
        return this.isAuthenticated();
    },
    
    // FIXED: Initialize authentication state from storage
    _initializeFromStorage() {
        try {
            // Try cookies first
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            const accessTokenCookie = this._getCookie('access_token');
            
            if (authCookie === 'true' && userInfoCookie && accessTokenCookie) {
                try {
                    const userInfo = JSON.parse(userInfoCookie);
                    
                    this.token = accessTokenCookie;
                    this.userEmail = userInfo.email;
                    this.userId = userInfo.id;
                    this.sessionId = userInfo.session_id;
                    this.authenticated = true;
                    
                    // Validate token
                    if (!this._isTokenValid(this.token)) {
                        console.warn('Stored token is expired, clearing auth state');
                        this._clearAuthState();
                        return false;
                    }
                    
                    console.log('✅ Authentication restored from cookies');
                    return true;
                    
                } catch (parseError) {
                    console.error('Error parsing user info cookie:', parseError);
                    this._clearAuthState();
                    return false;
                }
            }
            
            // Fallback to localStorage (but don't store tokens there anymore)
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            
            if (storedEmail && storedUserId) {
                this.userEmail = storedEmail;
                this.userId = storedUserId;
                this.authenticated = false; // Force re-authentication
                console.warn('Partial auth data found in localStorage, user needs to re-authenticate');
            }
            
            return false;
            
        } catch (error) {
            console.error('Error initializing from storage:', error);
            this._clearAuthState();
            return false;
        }
    },
    
    // FIXED: Token monitoring instead of automatic refresh
    _setupTokenMonitoring() {
        // Check token validity every 30 seconds
        this.tokenCheckInterval = setInterval(() => {
            if (this.isAuthenticated() && !this._isTokenValid(this.token)) {
                console.warn('Token expired during monitoring');
                this._handleTokenExpiration();
            }
        }, 30000);
    },
    
    // FIXED: Handle token expiration properly
    _handleTokenExpiration() {
        console.log('🔑 Token expired, clearing auth state');
        this._clearAuthState();
        
        // Notify about session expiration
        this._notifySessionExpired();
        
        // Redirect to login after a delay
        setTimeout(() => {
            if (confirm('Your session has expired. Would you like to log in again?')) {
                window.location.href = 'login.html';
            }
        }, 2000);
    },
    
    // FIXED: Notify about session expiration
    _notifySessionExpired() {
        const event = new CustomEvent('sessionExpired', {
            detail: { reason: 'Token expired' }
        });
        window.dispatchEvent(event);
        
        // Also call the legacy callback if it exists
        if (typeof this.onAuthenticationChange === 'function') {
            this.onAuthenticationChange(false);
        }
    },
    
    // Set up page visibility change handler
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.isAuthenticated()) {
                // Check token validity when page becomes visible
                if (!this._isTokenValid(this.token)) {
                    this._handleTokenExpiration();
                }
            }
        });
    },
    
    // FIXED: Validate token format and expiration
    _isTokenValid(token) {
        if (!token) return false;
        
        try {
            const tokenParts = token.split('.');
            if (tokenParts.length !== 3) return false;
            
            const payload = JSON.parse(atob(tokenParts[1]));
            const now = Math.floor(Date.now() / 1000);
            
            // Check if token is expired (no grace period for strict validation)
            return payload.exp && payload.exp > now;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    },
    
    // FIXED: Check if token is valid (public method)
    isTokenValid() {
        return this._isTokenValid(this.token);
    },
    
    // FIXED: Clear authentication state completely
    _clearAuthState() {
        this.token = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        
        // Clear cookies
        this._deleteCookie('authenticated');
        this._deleteCookie('user_info');
        this._deleteCookie('access_token');
        this._deleteCookie('refresh_token');
        this._deleteCookie('session_id');
        
        // Clear localStorage
        this._removeSecureItem('auth_token');
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        
        console.log('🧹 Auth state cleared completely');
    },
    
    // Check if user is authenticated with token validation
    isAuthenticated() {
        return this.authenticated && 
               !!this.token && 
               !!this.userId && 
               this._isTokenValid(this.token);
    },
    
    // Get current user information
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated,
            tokenValid: this.isTokenValid()
        };
    },
    
    // Get token for API requests (with validation)
    getToken() {
        if (!this.isAuthenticated()) {
            console.warn('Attempted to get token when not authenticated');
            return null;
        }
        return this.token;
    },
    
    // FIXED: Request OTP with proper URL construction
    async requestOTP(email) {
        try {
            console.log('🔐 Requesting OTP for:', email);
            
            // FIXED: Use the correct API gateway endpoint
            const url = `${this.AUTH_BASE_URL}/auth/request-otp`;
            console.log('Request URL:', url);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
            }
            
            const responseData = await response.json();
            console.log('✅ OTP request successful');
            return responseData;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('❌ OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // FIXED: Verify OTP with proper session management
    async verifyOTP(email, otp) {
        try {
            console.log('🔐 Verifying OTP for:', email);
            
            // FIXED: Use the correct API gateway endpoint
            const url = `${this.AUTH_BASE_URL}/auth/verify-otp`;
            console.log('Verify URL:', url);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Invalid OTP' }));
                throw new Error(errorData.error || errorData.detail || 'Invalid OTP');
            }
            
            const data = await response.json();
            console.log('✅ OTP verification successful');
            
            // FIXED: Update authentication state properly
            this.token = data.access_token;
            this.userEmail = email;
            this.userId = data.id || data.user_id;
            this.sessionId = data.session_id;
            this.authenticated = true;
            
            // Store minimal data in localStorage as backup
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', this.userId);
            
            console.log('🔐 Authentication state updated');
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('❌ OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    // FIXED: Execute a function with proper error handling
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`🔧 Executing function: ${functionName}`);
            
            // FIXED: Use the correct API gateway endpoint
            const url = `${this.API_BASE_URL}/api/function/${functionName}`;
            console.log('Function URL:', url);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: 'Function execution failed' }));
                
                // Handle authentication errors
                if (response.status === 401) {
                    console.warn('🔑 Function execution failed: Authentication error');
                    this._handleTokenExpiration();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(errorData.error || errorData.detail || `Function failed: ${functionName}`);
            }
            
            const data = await response.json();
            console.log('✅ Function executed successfully');
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`❌ Function execution error (${functionName}):`, error);
            throw error;
        }
    },
    
    // REMOVED: Token refresh methods (they were causing the 401 errors)
    // The server-side session management handles token lifecycle
    
    // FIXED: Get WebSocket URL without query parameters
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const actualUserId = userId || this.userId;
        
        // FIXED: WebSocket URL without token in query (auth happens after connection)
        const url = `${this.WS_BASE_URL}/ws/${actualUserId}`;
        console.log('🔌 WebSocket URL:', url);
        return url;
    },
    
    // Get user credits
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
    
    // FIXED: Enhanced logout with proper cleanup
    async logout() {
        try {
            console.log('🚪 Logging out...');
            
            // Clear monitoring intervals
            if (this.tokenCheckInterval) {
                clearInterval(this.tokenCheckInterval);
                this.tokenCheckInterval = null;
            }
            
            // Attempt server-side logout (optional, may fail)
            try {
                if (this.isAuthenticated()) {
                    await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.token}`,
                            'Content-Type': 'application/json'
                        },
                        credentials: 'include'
                    });
                }
            } catch (error) {
                console.warn('Server-side logout failed (expected):', error);
            }
            
            // Clear local auth data
            this._clearAuthState();
            
            console.log('✅ Logout successful');
            
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this._clearAuthState();
        }
    },
    
    // Cookie management utilities
    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return decodeURIComponent(parts.pop().split(';').shift());
        }
        return null;
    },
    
    _setCookie(name, value, days = 7) {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        const secureFlag = window.location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; samesite=lax${secureFlag}`;
    },
    
    _deleteCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; samesite=lax`;
    },
    
    // Secure storage methods
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
    
    // Get authentication headers
    getAuthHeader() {
        if (!this.isAuthenticated()) {
            return {};
        }
        
        return {
            'Authorization': `Bearer ${this.token}`,
            'X-Session-ID': this.sessionId || ''
        };
    },
    
    // Get session information
    getSessionInfo() {
        return {
            authenticated: this.authenticated,
            userId: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            tokenValid: this.isTokenValid(),
            hasValidToken: !!this.token && this._isTokenValid(this.token)
        };
    }
};

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}