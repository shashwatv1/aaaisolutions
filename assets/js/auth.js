/**
 * Authentication module for AAAI Solutions
 * Handles OTP request/verification and token management with improved security
 */
const AuthService = {
    // Cloud Functions or API Gateway URL
    API_BASE_URL: 'https://aaai-gateway-754x89jf.uc.gateway.dev',
    
    // Initialize the auth service
    init() {
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
                        this.logout(); // Token expired
                    }
                }
            } catch (error) {
                console.error('Error parsing token:', error);
                this.logout();
            }
        }
        
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
            console.log(`Requesting OTP for email: ${email}`);
            
            // Forward the request to the API Gateway
            const response = await fetch(`${this.API_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email })
            });

            const responseData = await response.json();
            
            if (!response.ok) {
                console.error('OTP request failed:', responseData);
                throw new Error(responseData.error || responseData.detail || 'Failed to request OTP');
            }
            
            console.log('OTP request successful');
            return responseData;
        } catch (error) {
            console.error('OTP Request error:', error);
            // Provide more context in the error message
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },
    
    // Verify OTP
    async verifyOTP(email, otp) {
        try {
            console.log(`Verifying OTP for email: ${email}`);
            
            const response = await fetch(`${this.API_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                console.error('OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('OTP verification successful');
            
            // Store token and user info
            this.token = data.access_token;
            this.userEmail = email;
            this.userId = data.id;
            
            this._setSecureItem('auth_token', data.access_token);
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', data.id);
            
            return data;
        } catch (error) {
            console.error('OTP Verification error:', error);
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },
    
    // Execute a function
    async executeFunction(functionName, inputData) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            console.log(`Executing function: ${functionName}`);
            
            const response = await fetch(`${this.API_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify(inputData)
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                console.error(`Function execution failed:`, data);
                throw new Error(data.error || data.detail || `Failed to execute function: ${functionName}`);
            }
            
            return data;
        } catch (error) {
            console.error(`Function execution error (${functionName}):`, error);
            throw new Error(`Function execution failed: ${error.message}`);
        }
    },
    
    // Send a chat message
    async sendChatMessage(message) {
        if (!this.isAuthenticated()) {
            throw new Error('Authentication required');
        }
        
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.token}`
                },
                body: JSON.stringify({ message })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                console.error('Chat message failed:', data);
                throw new Error(data.error || 'Failed to send message');
            }
            
            return data;
        } catch (error) {
            console.error('Chat error:', error);
            throw new Error(`Chat message failed: ${error.message}`);
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
        
        console.log('User logged out successfully');
    },
    
    // Get authorization header
    getAuthHeader() {
        return {
            'Authorization': `Bearer ${this.token}`
        };
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
    }
};

// Export the service for module usage
typeof module !== 'undefined' && (module.exports = AuthService);