/**
 * Authentication module for AAAI Solutions - Environment-aware Configuration
 * Handles OTP request/verification and token management with improved security
 */
const AuthService = {
    // Use configuration from global config
    get API_BASE_URL() {
        return window.AAAI_CONFIG?.API_BASE_URL || 'https://aaai-gateway-754x89jf.uc.gateway.dev';
    },
    
    get WS_BASE_URL() {
        return window.AAAI_CONFIG?.WS_BASE_URL || 'wss://aaai.solutions';
    },
    
    get LOG_LEVEL() {
        return window.AAAI_CONFIG?.LOG_LEVEL || 'info';
    },
    
    // Initialize the auth service
    init() {
        // Ensure configuration is loaded
        if (!window.AAAI_CONFIG) {
            throw new Error('Configuration not loaded. Please include config.js before auth.js');
        }
        
        this.token = this._getSecureItem('auth_token');
        this.userEmail = this._getSecureItem('user_email');
        this.userId = this._getSecureItem('user_id');
        
        // Check token expiration
        if (this.token) {
            try {
                const tokenParts = this.token.split('.');
                if (tokenParts.length === 3) {
                    const payload = JSON.parse(atob(tokenParts[1]));
                    if (payload.exp && payload.exp < Date.now() / 1000) {
                        window.AAAI_LOGGER.warn('Token expired, logging out');
                        this.logout();
                    }
                }
            } catch (error) {
                window.AAAI_LOGGER.error('Error parsing token:', error);
                this.logout();
            }
        }
        
        window.AAAI_LOGGER.info('AuthService initialized', {
            authenticated: this.isAuthenticated(),
            environment: window.AAAI_CONFIG.ENVIRONMENT
        });
        
        return this.isAuthenticated();
    },
    
    // Check if user is authenticated
    isAuthenticated() {
        return !!(this.token && this.userId);
    },
    
    // Get current user information
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId
        };
    },
    
    // Request OTP check
    async requestOTP(email) {
        try {
            window.AAAI_LOGGER.debug(`Requesting OTP for email: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), window.AAAI_CONFIG.API_TIMEOUT);
            
            const response = await fetch(`${this.API_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const responseData = await response.json();
            
            if (!response.ok) {
                window.AAAI_LOGGER.error('OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            window.AAAI_LOGGER.info('OTP request successful');
            return responseData;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('OTP request timeout');
                throw new Error('Request timeout. Please try again.');
            }
            window.AAAI_LOGGER.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // Verify OTP
    async verifyOTP(email, otp) {
        try {
            window.AAAI_LOGGER.debug(`Verifying OTP for email: ${email}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), window.AAAI_CONFIG.API_TIMEOUT);
            
            const response = await fetch(`${this.API_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                window.AAAI_LOGGER.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            window.AAAI_LOGGER.info('OTP verification successful');
            
            // Store token and user info
            this.token = data.access_token;
            this.userEmail = email;
            this.userId = data.id;
            
            this._setSecureItem('auth_token', data.access_token);
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', data.id);
            
            // Schedule token refresh if needed
            this._scheduleTokenRefresh(data.access_token);
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('OTP verification timeout');
                throw new Error('Request timeout. Please try again.');
            }
            window.AAAI_LOGGER.error('OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    // Execute a function
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            window.AAAI_LOGGER.debug(`Executing function: ${functionName}`);
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), window.AAAI_CONFIG.API_TIMEOUT);
            
            const response = await fetch(`${this.API_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(inputData),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    window.AAAI_LOGGER.warn('Function execution failed: Unauthorized');
                    this.logout();
                    throw new Error('Session expired. Please log in again.');
                }
                window.AAAI_LOGGER.error(`Function execution failed:`, data);
                throw new Error(data.error || data.detail || `Failed to execute function: ${functionName}`);
            }
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('Function execution timeout');
                throw new Error('Request timeout. Please try again.');
            }
            window.AAAI_LOGGER.error(`Function execution error (${functionName}):`, error);
            throw new Error(`Function execution failed: ${error.message}`);
        }
    },
    
    // Send a chat message
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), window.AAAI_CONFIG.API_TIMEOUT);
            
            const response = await fetch(`${this.API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ message }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    window.AAAI_LOGGER.warn('Chat message failed: Unauthorized');
                    this.logout();
                    throw new Error('Session expired. Please log in again.');
                }
                window.AAAI_LOGGER.error('Chat message failed:', data);
                throw new Error(data.error || 'Failed to send message');
            }
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('Chat message timeout');
                throw new Error('Request timeout. Please try again.');
            }
            window.AAAI_LOGGER.error('Chat error:', error);
            throw new Error(`Chat message failed: ${error.message}`);
        }
    },
    
    // Logout user
    logout() {
        this.token = null;
        this.userEmail = null;
        this.userId = null;
        
        // Clear token refresh timer
        if (this._refreshTimer) {
            clearTimeout(this._refreshTimer);
            this._refreshTimer = null;
        }
        
        // Remove from secure storage
        this._removeSecureItem('auth_token');
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        
        window.AAAI_LOGGER.info('User logged out successfully');
    },
    
    // Get authorization header
    getAuthHeader() {
        return {
            'Authorization': `Bearer ${this.token}`
        };
    },
    
    // Schedule token refresh
    _scheduleTokenRefresh(token) {
        if (!window.AAAI_CONFIG.TOKEN_REFRESH_THRESHOLD) return;
        
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiresAt = payload.exp * 1000;
            const refreshAt = expiresAt - (window.AAAI_CONFIG.TOKEN_REFRESH_THRESHOLD * 1000);
            const now = Date.now();
            
            if (refreshAt > now) {
                this._refreshTimer = setTimeout(() => {
                    window.AAAI_LOGGER.warn('Token refresh not implemented');
                    // Implement token refresh logic here
                }, refreshAt - now);
            }
        } catch (error) {
            window.AAAI_LOGGER.error('Error scheduling token refresh:', error);
        }
    },
    
    // Secure storage methods
    _setSecureItem(key, value) {
        try {
            const storageKey = `aaai_${window.AAAI_CONFIG.ENVIRONMENT}_${key}`;
            localStorage.setItem(storageKey, value);
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error storing secure item:', error);
            return false;
        }
    },
    
    _getSecureItem(key) {
        try {
            const storageKey = `aaai_${window.AAAI_CONFIG.ENVIRONMENT}_${key}`;
            return localStorage.getItem(storageKey);
        } catch (error) {
            window.AAAI_LOGGER.error('Error retrieving secure item:', error);
            return null;
        }
    },
    
    _removeSecureItem(key) {
        try {
            const storageKey = `aaai_${window.AAAI_CONFIG.ENVIRONMENT}_${key}`;
            localStorage.removeItem(storageKey);
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error removing secure item:', error);
            return false;
        }
    }
};

// Export the service for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}