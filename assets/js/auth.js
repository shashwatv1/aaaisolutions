/**
 * Simplified Authentication Service for AAAI Solutions
 * Handles OTP authentication, token management, and session persistence
 */
const AuthService = {
    // Core state
    token: null,
    userInfo: null,
    authenticated: false,
    refreshTimer: null,
    
    // Configuration
    config: {
        API_BASE_URL: '',
        TOKEN_REFRESH_THRESHOLD: 300000, // 5 minutes
        SESSION_CHECK_INTERVAL: 60000,   // 1 minute
        REQUEST_TIMEOUT: 30000           // 30 seconds
    },
    
    /**
     * Initialize authentication service
     */
    init() {
        try {
            // Wait for global config
            if (!window.AAAI_CONFIG) {
                throw new Error('AAAI_CONFIG not available');
            }
            
            // Set API base URL based on environment
            // In production, use relative URLs (same origin) to avoid CORS
            // In development, use full localhost URL
            if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
                this.config.API_BASE_URL = 'http://localhost:8080';
            } else {
                // Use empty string for relative URLs in production (same origin)
                this.config.API_BASE_URL = '';
            }
            
            // Restore session from storage
            this._restoreSession();
            
            // Set up token refresh if authenticated
            if (this.authenticated) {
                this._setupTokenRefresh();
            }
            
            // Set up visibility change handler
            this._setupEventHandlers();
            
            window.AAAI_LOGGER?.info('AuthService initialized', {
                authenticated: this.authenticated,
                user: this.userInfo?.email
            });
            
            return this.authenticated;
            
        } catch (error) {
            window.AAAI_LOGGER?.error('AuthService initialization failed:', error);
            return false;
        }
    },
    
    /**
     * Restore session from storage
     */
    _restoreSession() {
        try {
            // Try cookies first (preferred for security)
            const tokenCookie = this._getCookie('access_token');
            const userCookie = this._getCookie('user_info');
            
            if (tokenCookie && userCookie) {
                this.token = tokenCookie;
                this.userInfo = JSON.parse(userCookie);
                this.authenticated = this._isTokenValid(this.token);
                
                if (this.authenticated) {
                    window.AAAI_LOGGER?.info('Session restored from cookies');
                    return;
                }
            }
            
            // Fallback to localStorage
            const storedToken = localStorage.getItem('aaai_auth_token');
            const storedUser = localStorage.getItem('aaai_user_info');
            
            if (storedToken && storedUser) {
                this.token = storedToken;
                this.userInfo = JSON.parse(storedUser);
                this.authenticated = this._isTokenValid(this.token);
                
                if (this.authenticated) {
                    window.AAAI_LOGGER?.info('Session restored from localStorage');
                    return;
                }
            }
            
            // No valid session found
            this._clearSession();
            
        } catch (error) {
            window.AAAI_LOGGER?.error('Error restoring session:', error);
            this._clearSession();
        }
    },
    
    /**
     * Set up event handlers
     */
    _setupEventHandlers() {
        // Handle page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this.authenticated) {
                this._validateSession();
            }
        });
        
        // Cleanup on unload
        window.addEventListener('beforeunload', () => {
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
            }
        });
    },
    
    /**
     * Set up automatic token refresh
     */
    _setupTokenRefresh() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        this.refreshTimer = setInterval(() => {
            if (this.authenticated) {
                this._checkTokenExpiry();
            }
        }, this.config.SESSION_CHECK_INTERVAL);
    },
    
    /**
     * Check if token needs refresh
     */
    async _checkTokenExpiry() {
        if (!this.token) return;
        
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            const timeUntilExpiry = payload.exp - (Date.now() / 1000);
            
            // Refresh if token expires soon
            if (timeUntilExpiry < (this.config.TOKEN_REFRESH_THRESHOLD / 1000)) {
                await this._refreshToken();
            }
        } catch (error) {
            window.AAAI_LOGGER?.error('Error checking token expiry:', error);
            this.logout();
        }
    },
    
    /**
     * Refresh access token
     */
    async _refreshToken() {
        try {
            const refreshToken = this._getCookie('refresh_token');
            if (!refreshToken) {
                throw new Error('No refresh token available');
            }
            
            // Build URL based on environment (matching original pattern)
            const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                ? `${this.config.API_BASE_URL}/auth/refresh`
                : '/auth/refresh';
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ refresh_token: refreshToken }),
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Update token
                this.token = data.access_token;
                this._saveSession();
                window.AAAI_LOGGER?.info('Token refreshed successfully');
                return true;
            } else {
                window.AAAI_LOGGER?.warn('Failed to refresh access token');
                this.logout();
                return false;
            }
        } catch (error) {
            window.AAAI_LOGGER?.error('Token refresh failed:', error);
            this.logout();
            return false;
        }
    },
    
    /**
     * Validate token format and expiration
     */
    _isTokenValid(token) {
        if (!token) return false;
        
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return false;
            
            const payload = JSON.parse(atob(parts[1]));
            const now = Date.now() / 1000;
            
            return payload.exp && payload.exp > now;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Make authenticated API request
     */
    async _makeRequest(endpoint, options = {}) {
        // Build URL based on environment (matching original working pattern)
        const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? `${this.config.API_BASE_URL}${endpoint}`
            : endpoint; // Use relative URL in production
        
        const config = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            credentials: 'include'
        };
        
        // Add auth header if authenticated
        if (this.authenticated && this.token) {
            config.headers['Authorization'] = `Bearer ${this.token}`;
        }
        
        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);
        config.signal = controller.signal;
        
        try {
            const response = await fetch(url, config);
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || errorData.detail || `HTTP ${response.status}`);
            }
            
            return await response.json();
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                throw new Error('Request timeout');
            }
            
            // Handle auth errors
            if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                this.logout();
                throw new Error('Session expired');
            }
            
            throw error;
        }
    },
    
    /**
     * Request OTP for email
     */
    async requestOTP(email) {
        try {
            window.AAAI_LOGGER?.info(`Requesting OTP for: ${email}`);
            
            const response = await this._makeRequest('/auth/request-otp', {
                method: 'POST',
                body: JSON.stringify({ email })
            });
            
            window.AAAI_LOGGER?.info('OTP request successful');
            return response;
            
        } catch (error) {
            window.AAAI_LOGGER?.error('OTP request failed:', error);
            throw new Error(`Failed to send OTP: ${error.message}`);
        }
    },
    
    /**
     * Verify OTP and authenticate
     */
    async verifyOTP(email, otp) {
        try {
            window.AAAI_LOGGER?.info(`Verifying OTP for: ${email}`);
            
            const response = await this._makeRequest('/auth/verify-otp', {
                method: 'POST',
                body: JSON.stringify({ email, otp })
            });
            
            if (response.access_token) {
                // Update auth state
                this.token = response.access_token;
                this.userInfo = {
                    id: response.id,
                    email: email,
                    session_id: response.session_id
                };
                this.authenticated = true;
                
                // Save session
                this._saveSession();
                
                // Setup token refresh
                this._setupTokenRefresh();
                
                window.AAAI_LOGGER?.info('Authentication successful');
                return response;
            }
            
            throw new Error('Invalid OTP response');
            
        } catch (error) {
            window.AAAI_LOGGER?.error('OTP verification failed:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    /**
     * Execute authenticated function
     */
    async executeFunction(functionName, inputData) {
        if (!this.authenticated) {
            throw new Error('Authentication required');
        }
        
        try {
            window.AAAI_LOGGER?.info(`Executing function: ${functionName}`);
            
            const response = await this._makeRequest(`/api/function/${functionName}`, {
                method: 'POST',
                body: JSON.stringify(inputData)
            });
            
            return response;
            
        } catch (error) {
            window.AAAI_LOGGER?.error(`Function execution failed (${functionName}):`, error);
            throw error;
        }
    },
    
    /**
     * Send chat message via HTTP
     */
    async sendChatMessage(message) {
        if (!this.authenticated) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await this._makeRequest('/api/chat', {
                method: 'POST',
                body: JSON.stringify({ message })
            });
            
            return response;
            
        } catch (error) {
            window.AAAI_LOGGER?.error('Chat message failed:', error);
            throw error;
        }
    },
    
    /**
     * Validate current session
     */
    async _validateSession() {
        if (!this.authenticated) return false;
        
        try {
            // Build URL based on environment (matching original pattern)
            const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                ? `${this.config.API_BASE_URL}/auth/validate-session`
                : '/auth/validate-session';
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`,
                    'X-Session-ID': this.userInfo?.session_id || ''
                },
                body: JSON.stringify({}),
                credentials: 'include'
            });
            
            if (response.ok) {
                return true;
            } else {
                window.AAAI_LOGGER?.warn('Session validation failed');
                this.logout();
                return false;
            }
            
        } catch (error) {
            window.AAAI_LOGGER?.warn('Session validation failed:', error.message);
            this.logout();
            return false;
        }
    },
    
    /**
     * Save session to storage
     */
    _saveSession() {
        if (!this.authenticated || !this.token || !this.userInfo) return;
        
        try {
            // Save to localStorage as backup
            localStorage.setItem('aaai_auth_token', this.token);
            localStorage.setItem('aaai_user_info', JSON.stringify(this.userInfo));
            
            window.AAAI_LOGGER?.info('Session saved');
            
        } catch (error) {
            window.AAAI_LOGGER?.error('Failed to save session:', error);
        }
    },
    
    /**
     * Clear session data
     */
    _clearSession() {
        this.token = null;
        this.userInfo = null;
        this.authenticated = false;
        
        // Clear localStorage
        try {
            localStorage.removeItem('aaai_auth_token');
            localStorage.removeItem('aaai_user_info');
        } catch (error) {
            window.AAAI_LOGGER?.error('Failed to clear localStorage:', error);
        }
        
        // Clear cookies
        this._deleteCookie('access_token');
        this._deleteCookie('refresh_token');
        this._deleteCookie('user_info');
        this._deleteCookie('authenticated');
    },
    
    /**
     * Logout user
     */
    async logout() {
        try {
            // Clear refresh timer
            if (this.refreshTimer) {
                clearInterval(this.refreshTimer);
                this.refreshTimer = null;
            }
            
            // Attempt server-side logout
            if (this.authenticated) {
                try {
                    // Build URL based on environment (matching original pattern)
                    const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                        ? `${this.config.API_BASE_URL}/auth/logout`
                        : '/auth/logout';
                    
                    await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.token}`
                        },
                        credentials: 'include'
                    });
                } catch (error) {
                    window.AAAI_LOGGER?.warn('Server logout failed:', error);
                }
            }
            
            // Clear local session
            this._clearSession();
            
            window.AAAI_LOGGER?.info('Logout successful');
            
        } catch (error) {
            window.AAAI_LOGGER?.error('Logout error:', error);
            // Still clear local data
            this._clearSession();
        }
    },
    
    /**
     * Get WebSocket URL for authenticated user
     */
    getWebSocketURL() {
        if (!this.authenticated || !this.userInfo?.id) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : window.location.host;
        
        // Include token as query parameter for initial authentication
        const url = `${wsProtocol}//${wsHost}/ws/${this.userInfo.id}?token=${encodeURIComponent(this.token)}`;
        window.AAAI_LOGGER?.debug(`WebSocket URL: ${url.replace(/token=[^&]*/, 'token=***')}`);
        return url;
    },
    
    /**
     * Get current user info
     */
    getCurrentUser() {
        return this.userInfo ? { ...this.userInfo } : null;
    },
    
    /**
     * Get auth token
     */
    getToken() {
        return this.token;
    },
    
    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return this.authenticated && !!this.token && this._isTokenValid(this.token);
    },
    
    /**
     * Get user credits
     */
    async getUserCredits() {
        try {
            const result = await this.executeFunction('get_user_creds', {
                email: this.userInfo?.email
            });
            return result.data?.credits || 0;
        } catch (error) {
            window.AAAI_LOGGER?.error('Failed to get user credits:', error);
            return 0;
        }
    },
    
    // Cookie utilities
    _getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return decodeURIComponent(parts.pop().split(';').shift());
        }
        return null;
    },
    
    _deleteCookie(name) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    }
};

// Auto-initialize when available
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}