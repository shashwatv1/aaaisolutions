/**
 * Authentication module for AAAI Solutions
 * Handles OTP request/verification and token management with environment-aware configuration
 */
const AuthService = {
    // Initialize the auth service with configuration
    init() {
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        // Set up URLs based on environment
        if (window.AAAI_CONFIG.ENVIRONMENT === 'development') {
            // In development, point directly to localhost
            this.AUTH_BASE_URL = 'http://localhost:8080';
            this.API_BASE_URL = 'http://localhost:8080';
            this.WS_BASE_URL = 'ws://localhost:8080';
        } else {
            // In production/staging, use relative paths that nginx will proxy
            // Auth requests go to /auth/ (proxied to API Gateway)
            // API requests go to /api/ (proxied to Cloud Run)
            this.AUTH_BASE_URL = ''; // Use relative path for auth
            this.API_BASE_URL = ''; // Use relative path for API
            this.WS_BASE_URL = window.location.origin;
        }
        
        // Load stored auth data
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
                        this.logout(); // Token expired
                    }
                }
            } catch (error) {
                window.AAAI_LOGGER.error('Error parsing token:', error);
                this.logout();
            }
        }
        
        window.AAAI_LOGGER.info('AuthService initialized', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            apiBaseUrl: this.API_BASE_URL,
            wsBaseUrl: this.WS_BASE_URL,
            authenticated: this.isAuthenticated()
        });
        
        return this.isAuthenticated();
    },
    
    // Check if user is authenticated
    isAuthenticated() {
        return !!this.token && !!this.userId;
    },
    
    // Get current user information
    getCurrentUser() {
        return {
            email: this.userEmail,
            id: this.userId
        };
    },
    
    // Request OTP
    async requestOTP(email) {
        try {
            window.AAAI_LOGGER.info(`Requesting OTP for email: ${email}`);
            
            // Auth requests go directly to /auth/ (proxied to API Gateway)
            const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                ? `${this.AUTH_BASE_URL}/auth/request-otp`
                : '/auth/request-otp'; // Always use absolute path in production
            
            window.AAAI_LOGGER.debug(`Request URL: ${url}`);
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch(url, {
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
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            window.AAAI_LOGGER.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // Verify OTP
    async verifyOTP(email, otp) {
        try {
            window.AAAI_LOGGER.info(`Verifying OTP for email: ${email}`);
            
            // Auth requests go directly to /auth/ (proxied to API Gateway)
            const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                ? `${this.AUTH_BASE_URL}/auth/verify-otp`
                : '/auth/verify-otp'; // Always use absolute path in production
            
            window.AAAI_LOGGER.debug(`Request URL: ${url}`);
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
            
            const response = await fetch(url, {
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
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('OTP verification timeout');
                throw new Error('Request timed out. Please check your connection and try again.');
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
            window.AAAI_LOGGER.info(`Executing function: ${functionName}`);
            
            // API requests go to /api/ path (proxied to Cloud Run)
            const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                ? `${this.API_BASE_URL}/api/function/${functionName}`
                : `/api/function/${functionName}`; // Always use absolute path in production
            
            window.AAAI_LOGGER.debug(`Request URL: ${url}`);
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout for API calls
            
            const response = await fetch(url, {
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
                window.AAAI_LOGGER.error(`Function execution failed:`, data);
                
                // Handle token expiration
                if (response.status === 401) {
                    window.AAAI_LOGGER.warn('Token expired, logging out');
                    this.logout();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(data.error || data.detail || `Failed to execute function: ${functionName}`);
            }
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('Function execution timeout');
                throw new Error('Request timed out. Please try again.');
            }
            window.AAAI_LOGGER.error(`Function execution error (${functionName}):`, error);
            throw error;
        }
    },
    
    // Send a chat message (for HTTP API, not WebSocket)
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            // API requests go to /api/ path (proxied to Cloud Run)
            const url = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
                ? `${this.API_BASE_URL}/api/chat`
                : '/api/chat'; // Always use absolute path in production
            
            window.AAAI_LOGGER.debug(`Chat request URL: ${url}`);
            
            // Add timeout to fetch request
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
            
            const response = await fetch(url, {
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
                window.AAAI_LOGGER.error('Chat message failed:', data);
                
                // Handle token expiration
                if (response.status === 401) {
                    window.AAAI_LOGGER.warn('Token expired, logging out');
                    this.logout();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(data.error || 'Failed to send message');
            }
            
            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                window.AAAI_LOGGER.error('Chat message timeout');
                throw new Error('Request timed out. Please try again.');
            }
            window.AAAI_LOGGER.error('Chat error:', error);
            throw error;
        }
    },
    
    // Logout user
    logout() {
        this.token = null;
        this.userEmail = null;
        this.userId = null;
        
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
    
    // Get WebSocket URL with token
    getWebSocketURL(userId) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : window.location.host;
            
        const url = `${wsProtocol}//${wsHost}/ws/${userId}?token=${this.token}`;
        window.AAAI_LOGGER.debug(`WebSocket URL: ${url.replace(/token=[^&]*/, 'token=***')}`);
        return url;
    },
    
    // Get user credits (example function call)
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
            window.AAAI_LOGGER.error('Error getting user credits:', error);
            return 0;
        }
    },
    
    // Check drive access (example function call)
    async checkDriveAccess(driveLink) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const result = await this.executeFunction('check_drive_access', {
                drive_link: driveLink,
                email: this.userEmail
            });
            return result.data;
        } catch (error) {
            window.AAAI_LOGGER.error('Error checking drive access:', error);
            throw error;
        }
    },
    
    // Refresh token if needed
    async refreshTokenIfNeeded() {
        if (!this.token) return false;
        
        try {
            const tokenParts = this.token.split('.');
            if (tokenParts.length === 3) {
                const payload = JSON.parse(atob(tokenParts[1]));
                const timeUntilExpiry = payload.exp - (Date.now() / 1000);
                
                // Refresh if token expires in less than 5 minutes
                if (timeUntilExpiry < 300) {
                    window.AAAI_LOGGER.warn('Token expiring soon, logout required');
                    this.logout();
                    return false;
                }
            }
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error checking token expiration:', error);
            this.logout();
            return false;
        }
    },
    
    // Secure storage methods
    _setSecureItem(key, value) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.setItem(storageKey, value);
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error storing secure item:', error);
            return false;
        }
    },
    
    _getSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            return localStorage.getItem(storageKey);
        } catch (error) {
            window.AAAI_LOGGER.error('Error retrieving secure item:', error);
            return null;
        }
    },
    
    _removeSecureItem(key) {
        try {
            const storageKey = `aaai_${key}`;
            localStorage.removeItem(storageKey);
            return true;
        } catch (error) {
            window.AAAI_LOGGER.error('Error removing secure item:', error);
            return false;
        }
    }
};

// Auto-refresh token check every 5 minutes
setInterval(() => {
    if (typeof AuthService !== 'undefined' && AuthService.isAuthenticated()) {
        AuthService.refreshTokenIfNeeded();
    }
}, 300000); // 5 minutes

// Export the service for module usage
typeof module !== 'undefined' && (module.exports = AuthService);