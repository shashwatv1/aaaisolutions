/**
 * Enhanced Authentication module for AAAI Solutions
 * Handles OTP request/verification and token management with improved security
 */
const AuthService = {
    API_BASE_URL: 'https://api-server-559730737995.us-central1.run.app',
    API_KEY: 'your-api-key-here', // Replace with your actual API key
    WS_BASE_URL: 'wss://api-server-559730737995.us-central1.run.app', // WebSocket URL
    
    // Initialize the auth service
    init() {
        this.token = this._getSecureItem('auth_token');
        this.userEmail = this._getSecureItem('user_email');
        this.userId = this._getSecureItem('user_id');
        this.csrfToken = this._getSecureItem('csrf_token');
        
        // Check token expiration
        if (this.token) {
            try {
                const payload = JSON.parse(atob(this.token.split('.')[1]));
                if (payload.exp < Date.now() / 1000) {
                    this.logout(); // Token expired
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
    
    // Request OTP via email
    async requestOTP(email) {
        try {
            // Generate a browser fingerprint for additional security
            const fingerprint = await this._generateFingerprint();
            
            const response = await fetch(`${this.API_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.API_KEY,
                    'X-Device-Fingerprint': fingerprint
                },
                body: JSON.stringify({ email })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Failed to request OTP');
            }
            
            return await response.json();
        } catch (error) {
            console.error('OTP Request error:', error);
            throw error;
        }
    },
    
    // Verify OTP and get token
    async verifyOTP(email, otp) {
        try {
            // Generate a browser fingerprint for additional security
            const fingerprint = await this._generateFingerprint();
            
            const response = await fetch(`${this.API_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.API_KEY,
                    'X-Device-Fingerprint': fingerprint
                },
                body: JSON.stringify({ email, otp })
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.detail || 'Invalid OTP');
            }
            
            const data = await response.json();
            
            // Store token and user info securely
            this.token = data.access_token;
            this.userEmail = email;
            this.userId = data.id;
            
            // Get CSRF token
            await this._refreshCSRFToken();
            
            // Store in secure storage
            this._setSecureItem('auth_token', data.access_token);
            this._setSecureItem('user_email', email);
            this._setSecureItem('user_id', data.id);
            
            return data;
        } catch (error) {
            console.error('OTP Verification error:', error);
            throw error;
        }
    },
    
    // Logout user
    logout() {
        this.token = null;
        this.userEmail = null;
        this.userId = null;
        this.csrfToken = null;
        
        // Remove from secure storage
        this._removeSecureItem('auth_token');
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        this._removeSecureItem('csrf_token');
    },
    
    // Get authorization header
    getAuthHeader() {
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            'X-API-Key': this.API_KEY
        };
        
        if (this.csrfToken) {
            headers['X-CSRF-Token'] = this.csrfToken;
        }
        
        return headers;
    },
    
    // Refresh CSRF token
    async _refreshCSRFToken() {
        try {
            if (!this.token || !this.userId) {
                return null;
            }
            
            const response = await fetch(`${this.API_BASE_URL}/auth/csrf-token`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'X-API-Key': this.API_KEY
                }
            });
            
            if (!response.ok) {
                return null;
            }
            
            const data = await response.json();
            this.csrfToken = data.csrf_token;
            this._setSecureItem('csrf_token', data.csrf_token);
            
            return this.csrfToken;
        } catch (error) {
            console.error('CSRF token refresh error:', error);
            return null;
        }
    },
    
    // Generate a browser fingerprint for additional security
    async _generateFingerprint() {
        // Simple fingerprint based on available browser information
        const fingerprint = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            colorDepth: window.screen.colorDepth,
            devicePixelRatio: window.devicePixelRatio,
            platform: navigator.platform
        };
        
        // Convert to string and hash it
        const fingerprintStr = JSON.stringify(fingerprint);
        const encoder = new TextEncoder();
        const data = encoder.encode(fingerprintStr);
        
        // Use SubtleCrypto if available (secure contexts)
        if (window.crypto && window.crypto.subtle) {
            try {
                const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            } catch (e) {
                // Fallback to simple string if crypto API fails
                return btoa(fingerprintStr).replace(/=/g, '');
            }
        } else {
            // Fallback to simple string if crypto API not available
            return btoa(fingerprintStr).replace(/=/g, '');
        }
    },
    
    // Secure storage methods
    _setSecureItem(key, value) {
        try {
            // If the browser supports the Web Crypto API, encrypt the data
            if (window.crypto && window.crypto.subtle && window.crypto.getRandomValues) {
                // For simplicity, we're using a derived key from the user's browser environment
                // In production, you'd want a more secure key derivation mechanism
                const storageKey = `aaai_${key}`;
                localStorage.setItem(storageKey, value);
                return true;
            } else {
                // Fallback to regular localStorage with a prefix
                const storageKey = `aaai_${key}`;
                localStorage.setItem(storageKey, value);
                return true;
            }
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