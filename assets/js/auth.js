/**
 * JWT-Based Authentication Service for AAAI Solutions
 * Fixed to properly store and use user JWT tokens
 */
const AuthService = {
    // Core authentication state
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    
    // Token management
    accessToken: null,
    tokenExpiry: null,
    refreshInProgress: false,
    refreshPromise: null,
    
    // Auto-refresh timer
    refreshTimer: null,
    
    // Configuration
    options: {
        refreshBufferTime: 2 * 60 * 1000, // 2 minutes before expiry
        maxRetryAttempts: 3,
        debug: false
    },

    /**
     * Initialize the authentication service
     */
    init() {
        console.log('🔐 Initializing JWT Authentication Service with Gateway routing...');
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
        // Set debug mode
        if (window.AAAI_CONFIG?.ENABLE_DEBUG) {
            this.options.debug = true;
        }
        
        // Use Gateway URLs from config
        this.AUTH_BASE_URL = '';
        
        // Initialize authentication state
        const authResult = this._initializeAuthState();
        
        if (authResult.success) {
            this._setupAutoRefresh();
            this._log('JWT Authentication initialized successfully with Gateway', {
                authenticated: this.authenticated,
                hasAccessToken: !!this.accessToken,
                hasRefreshToken: this._hasRefreshTokenCookie(),
                gatewayURL: this.AUTH_BASE_URL
            });
        }
        
        return authResult.success;
    },

    /**
     * Initialize authentication state from stored tokens
     */
    _initializeAuthState() {
        try {
            // Check for refresh token cookie indicator
            const hasRefreshToken = this._hasRefreshTokenCookie();
            
            if (!hasRefreshToken) {
                this._log('No refresh token found');
                return { success: false };
            }
            
            // Try to restore access token from sessionStorage
            const storedToken = this._getStoredAccessToken();
            
            if (storedToken && this._isTokenValid(storedToken)) {
                // Validate that stored token is a user token
                const validationResult = this._validateUserToken(storedToken.token);
                if (validationResult.valid) {
                    this._setAccessToken(storedToken.token, storedToken.expiresIn);
                    this._setUserInfo(storedToken.user);
                    
                    this._log('Authentication state restored from storage');
                    return { success: true };
                } else {
                    this._log('Stored token is not a valid user token:', validationResult.reason);
                    sessionStorage.removeItem('aaai_access_token');
                }
            }
            
            // We have refresh token but no valid access token
            // This will be handled by silent refresh when needed
            this._log('Refresh token available, access token will be refreshed on demand');
            return { success: true };
            
        } catch (error) {
            console.error('Error initializing auth state:', error);
            this._clearAuthState();
            return { success: false };
        }
    },

    /**
     * Enhanced user token validation with strict service account rejection
     */
    /**
     * Enhanced user token validation with flexible token type checking
     */
    _validateUserToken(token) {
        try {
            if (!token || typeof token !== 'string') {
                return { valid: false, reason: 'Invalid token format', code: 'INVALID_FORMAT' };
            }
            
            // Parse token payload
            const parts = token.split('.');
            if (parts.length !== 3) {
                return { valid: false, reason: 'Invalid JWT format', code: 'INVALID_JWT_FORMAT' };
            }
            
            // Decode payload
            let payload;
            try {
                const paddedPayload = parts[1] + '='.repeat((4 - parts[1].length % 4) % 4);
                const decoded = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
                payload = JSON.parse(decoded);
            } catch (error) {
                return { valid: false, reason: 'Failed to decode token payload', code: 'DECODE_ERROR' };
            }
            
            // STRICT: Check for service account patterns in email
            if (!payload.email) {
                return { valid: false, reason: 'Token missing email claim', code: 'MISSING_EMAIL' };
            }
            
            // Reject any service account emails
            const serviceAccountPatterns = [
                '@developer.gserviceaccount.com',
                '@.gserviceaccount.com',
                '.gserviceaccount.com',
                '-compute@developer.gserviceaccount.com'
            ];
            
            const isServiceAccount = serviceAccountPatterns.some(pattern => 
                payload.email.includes(pattern)
            );
            
            if (isServiceAccount) {
                this._log('STRICT REJECTION: Service account email detected:', payload.email);
                return { 
                    valid: false, 
                    reason: 'Service account tokens are strictly forbidden for user operations', 
                    code: 'SERVICE_ACCOUNT_FORBIDDEN' 
                };
            }
            
            // STRICT: Require user_id for all user tokens
            if (!payload.user_id || typeof payload.user_id !== 'string' || payload.user_id.trim().length === 0) {
                return { 
                    valid: false, 
                    reason: 'User token must contain valid user_id claim', 
                    code: 'MISSING_USER_ID' 
                };
            }
            
            // FLEXIBLE: Check token type (accept both 'user_access' and missing/null token_type)
            if (payload.token_type && payload.token_type !== 'user_access') {
                // Only reject if token_type is explicitly set to something bad
                const badTokenTypes = ['service_account', 'service', 'gserviceaccount'];
                if (badTokenTypes.includes(payload.token_type)) {
                    return { 
                        valid: false, 
                        reason: `Invalid token type: ${payload.token_type}`, 
                        code: 'INVALID_TOKEN_TYPE' 
                    };
                }
            }
            
            // FLEXIBLE: Check issuer (accept both 'aaai-solutions' and Google issuers for user tokens)
            if (payload.iss) {
                // Reject service account issuers
                const serviceAccountIssuers = [
                    'serviceaccount',
                    'gserviceaccount', 
                    'compute@developer'
                ];
                
                const hasServiceAccountIssuer = serviceAccountIssuers.some(pattern => 
                    payload.iss.includes(pattern)
                );
                
                if (hasServiceAccountIssuer) {
                    return { 
                        valid: false, 
                        reason: 'Service account issued tokens are forbidden', 
                        code: 'SERVICE_ACCOUNT_ISSUER' 
                    };
                }
            }
            
            // Check expiration
            if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
                return { valid: false, reason: 'Token expired', code: 'TOKEN_EXPIRED' };
            }
            
            // Validate email format for real user emails
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(payload.email)) {
                return { valid: false, reason: 'Invalid email format', code: 'INVALID_EMAIL_FORMAT' };
            }
            
            // Additional check: email should not contain "compute" or "developer" 
            if (payload.email.includes('compute@') || payload.email.includes('developer@')) {
                return { 
                    valid: false, 
                    reason: 'Compute or developer service emails are forbidden', 
                    code: 'FORBIDDEN_EMAIL_TYPE' 
                };
            }
            
            // STRICT: Validate user_id format (should be meaningful, not empty)
            if (payload.user_id.length < 5) {
                return { 
                    valid: false, 
                    reason: 'Invalid user_id format - too short', 
                    code: 'INVALID_USER_ID_FORMAT' 
                };
            }
            
            this._log('Token validation passed for user:', payload.email);
            return { valid: true, payload: payload, code: 'VALID_USER_TOKEN' };
            
        } catch (error) {
            return { 
                valid: false, 
                reason: `Token validation error: ${error.message}`, 
                code: 'VALIDATION_ERROR' 
            };
        }
    },

    /**
     * Request OTP for authentication via Gateway
     */
    async requestOTP(email) {
        try {
            this._log(`Requesting OTP for: ${email} via Gateway`);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/request-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Failed to request OTP');
            }
            
            this._log('OTP request successful via Gateway');
            return data;
            
        } catch (error) {
            console.error('OTP Request error:', error);
            throw new Error(`OTP request failed: ${error.message}`);
        }
    },

    /**
     * Verify OTP and establish JWT session via Gateway
     */
    async verifyOTP(email, otp) {
        try {
            this._log(`Verifying OTP for: ${email} via Gateway`);
            
            // Clear any existing state
            this._clearAuthState();
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/verify-otp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, otp }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            // Extract tokens and user info
            const { user, tokens, authentication } = data;
            
            this._log('OTP verification response received:', {
                hasUser: !!user,
                hasTokens: !!tokens,
                userEmail: user?.email,
                tokenType: authentication?.token_type,
                accessTokenPreview: tokens?.access_token ? tokens.access_token.substring(0, 50) + '...' : 'none'
            });
            
            // STRICT: Validate that we received a valid user access token
            const validationResult = this._validateUserToken(tokens.access_token);
            if (!validationResult.valid) {
                this._log('CRITICAL: Invalid token received from authentication server:', {
                    reason: validationResult.reason,
                    code: validationResult.code,
                    tokenPreview: tokens.access_token ? tokens.access_token.substring(0, 50) + '...' : 'null'
                });
                
                // Clear state and reject
                this._clearAuthState();
                throw new Error(`Authentication server returned invalid token: ${validationResult.reason}`);
            }
            
            // STRICT: Validate that user info matches token
            if (validationResult.payload.email !== email) {
                this._log('CRITICAL: Email mismatch between request and token:', {
                    requestEmail: email,
                    tokenEmail: validationResult.payload.email
                });
                this._clearAuthState();
                throw new Error('Email mismatch in authentication response');
            }
            
            // STRICT: Validate user object contains required fields
            if (!user.id || !user.email || user.email !== email) {
                this._log('CRITICAL: Invalid user object in authentication response:', user);
                this._clearAuthState();
                throw new Error('Invalid user information in authentication response');
            }
            
            this._log('✅ Valid user token received from authentication:', {
                email: validationResult.payload.email,
                user_id: validationResult.payload.user_id,
                tokenCode: validationResult.code,
                tokenType: validationResult.payload.token_type
            });
            
            // IMPORTANT: Set access token and user information IMMEDIATELY
            this._setAccessToken(tokens.access_token, tokens.expires_in);
            this._setUserInfo(user);
            
            // Store for persistence across page refresh
            this._storeAccessToken(tokens.access_token, tokens.expires_in, user);
            
            // DEBUGGING: Verify token was stored correctly
            this._log('✅ Token storage verification:', {
                storedToken: this.accessToken ? this.accessToken.substring(0, 50) + '...' : 'none',
                tokenExpiry: this.tokenExpiry,
                authenticated: this.authenticated,
                userEmail: this.userEmail,
                userId: this.userId
            });
            
            // Setup auto-refresh
            this._setupAutoRefresh();
            
            this._log('JWT authentication successful via Gateway', {
                userId: user.id,
                email: user.email,
                expiresIn: tokens.expires_in,
                tokenType: 'validated_user_access_token'
            });
            
            return data;
            
        } catch (error) {
            console.error('OTP Verification error:', error);
            this._clearAuthState();
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * Execute authenticated function calls via Gateway
     */
    /**
     * Execute authenticated function calls via Gateway - ENHANCED DEBUGGING
     */
    async executeFunction(functionName, inputData) {
        this._log(`🚀 executeFunction called: ${functionName}`);
        
        if (!this.isAuthenticated()) {
            this._log('❌ Not authenticated for executeFunction');
            throw new Error('Authentication required');
        }
        
        try {
            // DEBUGGING: Check current auth state
            this._log('🔍 Current auth state before function execution:', {
                authenticated: this.authenticated,
                hasAccessToken: !!this.accessToken,
                tokenExpiry: this.tokenExpiry,
                userEmail: this.userEmail,
                userId: this.userId,
                currentTokenPreview: this.accessToken ? this.accessToken.substring(0, 50) + '...' : 'none'
            });
            
            // Ensure we have a valid access token
            const accessToken = await this._ensureValidAccessToken();
            
            if (!accessToken) {
                throw new Error('No valid access token available');
            }
            
            this._log('🔍 Token retrieved for function execution:', {
                tokenPreview: accessToken.substring(0, 50) + '...',
                tokenLength: accessToken.length
            });
            
            // STRICT: Pre-validate token before sending to server
            const validationResult = this._validateUserToken(accessToken);
            if (!validationResult.valid) {
                this._log('CRITICAL: Token validation failed before function execution:', {
                    reason: validationResult.reason,
                    code: validationResult.code,
                    functionName: functionName
                });
                this._clearAuthState();
                throw new Error(`Invalid token for function execution: ${validationResult.reason}`);
            }
            
            this._log(`✅ Executing function: ${functionName} via Gateway with validated user token for:`, validationResult.payload.email);
            this._log('🔍 Token details for function execution:', {
                tokenType: validationResult.payload.token_type,
                userId: validationResult.payload.user_id,
                issuer: validationResult.payload.iss,
                audience: validationResult.payload.aud,
                email: validationResult.payload.email
            });
            
            const response = await fetch(`${this.AUTH_BASE_URL}/api/function/${functionName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify(inputData),
                credentials: 'include'
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                this._log('❌ Function execution failed:', {
                    status: response.status,
                    errorData: errorData,
                    functionName: functionName
                });
                
                if (response.status === 401) {
                    this._log('401 error during function execution, attempting token refresh');
                    
                    // Check if error is due to service account token
                    if (errorData.code === 'SERVICE_ACCOUNT_TOKEN_REJECTED' || 
                        errorData.message?.includes('service account') ||
                        errorData.message?.includes('gserviceaccount')) {
                        
                        this._log('CRITICAL: Service account token detected, clearing auth state');
                        this._clearAuthState();
                        throw new Error('Invalid token type detected. Please log in again.');
                    }
                    
                    // Try refresh for normal expiration
                    const refreshed = await this.refreshTokenIfNeeded();
                    if (refreshed) {
                        // Retry with new token
                        return this.executeFunction(functionName, inputData);
                    } else {
                        this._clearAuthState();
                        throw new Error('Session expired. Please log in again.');
                    }
                }
                
                throw new Error(errorData.error || errorData.detail || `Function execution failed: ${functionName}`);
            }
            
            const result = await response.json();
            this._log(`✅ Function ${functionName} executed successfully via Gateway`);
            return result;
            
        } catch (error) {
            console.error(`Function execution failed (${functionName}):`, error);
            throw error;
        }
    },
    /**
     * Refresh access token using refresh token via Gateway
     */
    async refreshTokenIfNeeded() {
        // Check if refresh is already in progress
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }
        
        // Check if token needs refresh
        if (this.accessToken && this._isAccessTokenValid()) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (validationResult.valid) {
                return true;
            } else {
                this._log('Current token invalid, forcing refresh:', validationResult.reason);
            }
        }
        
        return this._performTokenRefresh();
    },

    /**
     * Perform token refresh via Gateway
     */
    async _performTokenRefresh() {
        if (this.refreshInProgress) {
            return this.refreshPromise;
        }
        
        this.refreshInProgress = true;
        this.refreshPromise = this._doTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.refreshInProgress = false;
            this.refreshPromise = null;
        }
    },

    /**
     * Execute the actual token refresh via Gateway
     */
    async _doTokenRefresh() {
        try {
            this._log('Performing token refresh via Gateway...');
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                if (response.status === 401) {
                    this._log('Refresh token expired, clearing session');
                    this._clearAuthState();
                    return false;
                }
                throw new Error(data.error || 'Token refresh failed');
            }
            
            // Handle different response formats
            let accessToken, expiresIn;
            
            if (data.tokens) {
                accessToken = data.tokens.access_token;
                expiresIn = data.tokens.expires_in;
            } else if (data.access_token) {
                accessToken = data.access_token;
                expiresIn = data.expires_in;
            } else {
                throw new Error('Invalid refresh response format');
            }
            
            // STRICT: Validate that we received a valid user access token
            const validationResult = this._validateUserToken(accessToken);
            if (!validationResult.valid) {
                this._log('CRITICAL: Invalid token received from refresh endpoint:', {
                    reason: validationResult.reason,
                    code: validationResult.code,
                    tokenPreview: accessToken ? accessToken.substring(0, 50) + '...' : 'null'
                });
                
                // Clear state and fail refresh
                this._clearAuthState();
                return false;
            }
            
            // STRICT: Validate that refreshed token is for the same user
            if (this.userEmail && validationResult.payload.email !== this.userEmail) {
                this._log('CRITICAL: User email mismatch in refresh token:', {
                    currentEmail: this.userEmail,
                    tokenEmail: validationResult.payload.email
                });
                this._clearAuthState();
                return false;
            }
            
            this._log('Valid user token received from refresh:', {
                email: validationResult.payload.email,
                user_id: validationResult.payload.user_id,
                tokenCode: validationResult.code,
                tokenType: validationResult.payload.token_type
            });
            
            // Update access token
            this._setAccessToken(accessToken, expiresIn);
            
            // Update stored token
            if (this.userEmail && this.userId) {
                this._storeAccessToken(accessToken, expiresIn, {
                    id: this.userId,
                    email: this.userEmail,
                    session_id: this.sessionId
                });
            }
            
            // Setup next refresh
            this._setupAutoRefresh();
            
            this._log('Token refresh successful via Gateway');
            return true;
            
        } catch (error) {
            console.error('Token refresh failed:', error);
            this._clearAuthState();
            return false;
        }
    },

    /**
     * Logout user via Gateway
     */
    async logout() {
        try {
            this._log('Logging out user via Gateway...');
            
            // Clear auto-refresh timer
            if (this.refreshTimer) {
                clearTimeout(this.refreshTimer);
                this.refreshTimer = null;
            }
            
            // Call logout endpoint to invalidate refresh token via Gateway
            if (this.accessToken) {
                try {
                    await fetch(`${this.AUTH_BASE_URL}/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${this.accessToken}`
                        },
                        credentials: 'include'
                    });
                } catch (error) {
                    console.warn('Logout API call failed:', error);
                }
            }
            
            // Clear local state
            this._clearAuthState();
            
            this._log('Logout completed via Gateway');
            
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local state even if server logout fails
            this._clearAuthState();
        }
    },


    /**
     * Check if user is authenticated - ENHANCED
     */
    isAuthenticated() {
        const hasBasicAuth = this.authenticated && this.userEmail && this.userId;
        
        this._log('🔍 isAuthenticated() check:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            hasBasicAuth: hasBasicAuth,
            hasAccessToken: !!this.accessToken
        });
        
        if (!hasBasicAuth) {
            // Try to restore from storage
            const storedToken = this._getStoredAccessToken();
            if (storedToken && this._isTokenValid(storedToken)) {
                const validationResult = this._validateUserToken(storedToken.token);
                if (validationResult.valid) {
                    this._log('✅ Restoring authentication state from storage');
                    this._setAccessToken(storedToken.token, storedToken.expiresIn);
                    this._setUserInfo(storedToken.user);
                    return true;
                }
            }
            
            this._log('❌ Not authenticated - no valid state');
            return false;
        }
        
        // Additional validation that token is a user token
        if (this.accessToken) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (!validationResult.valid) {
                this._log('❌ Authentication invalid due to token validation:', validationResult.reason);
                this._clearAuthState();
                return false;
            }
        }
        
        this._log('✅ Authentication valid');
        return true;
    },

    /**
     * Get current user information
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
     * Get valid access token - COMPLETELY REWRITTEN
     */
    getToken() {
        this._log('🔍 getToken() called');
        
        // First check memory
        if (this.accessToken && this._isAccessTokenValid()) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (validationResult.valid) {
                this._log('✅ Returning valid token from memory:', {
                    email: validationResult.payload.email,
                    userId: validationResult.payload.user_id,
                    tokenPreview: this.accessToken.substring(0, 50) + '...'
                });
                return this.accessToken;
            } else {
                this._log('❌ Memory token invalid:', validationResult.reason);
                this.accessToken = null;
                this.tokenExpiry = null;
            }
        }
        
        // Try to restore from storage
        const storedToken = this._getStoredAccessToken();
        if (storedToken && this._isTokenValid(storedToken)) {
            const validationResult = this._validateUserToken(storedToken.token);
            if (validationResult.valid) {
                this._log('✅ Restoring token from storage to memory');
                this._setAccessToken(storedToken.token, storedToken.expiresIn);
                this._setUserInfo(storedToken.user);
                return this.accessToken;
            }
        }
        
        this._log('❌ No valid token available');
        return null;
    },

    /**
     * Check if user has persistent session
     */
    hasPersistentSession() {
        return this._hasRefreshTokenCookie();
    },

    /**
     * Debug function to check token state
     */
    debugTokenState() {
        console.log('🔍 DEBUG: Current token state:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            sessionId: this.sessionId,
            hasAccessToken: !!this.accessToken,
            tokenExpiry: this.tokenExpiry,
            isTokenValid: this._isAccessTokenValid(),
            sessionStorageToken: !!sessionStorage.getItem('aaai_access_token'),
            refreshTokenCookie: this._hasRefreshTokenCookie()
        });
        
        // Check what's actually in session storage
        const stored = sessionStorage.getItem('aaai_access_token');
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                console.log('🔍 DEBUG: Session storage content:', {
                    userEmail: parsed.user?.email,
                    userId: parsed.user?.id,
                    tokenType: parsed.tokenType,
                    hasToken: !!parsed.token,
                    tokenPreview: parsed.token ? parsed.token.substring(0, 50) + '...' : 'none'
                });
            } catch (e) {
                console.log('🔍 DEBUG: Session storage parse error:', e);
            }
        }
        
        // Check current token validation
        if (this.accessToken) {
            const validation = this._validateUserToken(this.accessToken);
            console.log('🔍 DEBUG: Current token validation:', {
                valid: validation.valid,
                reason: validation.reason,
                payload: validation.payload
            });
        }
    },

    /**
     * Ensure we have a valid access token - COMPLETELY REWRITTEN
     */
    async _ensureValidAccessToken() {
        this._log('🔍 _ensureValidAccessToken called');
        
        // Step 1: Check memory token
        if (this.accessToken && this._isAccessTokenValid()) {
            const validationResult = this._validateUserToken(this.accessToken);
            if (validationResult.valid) {
                this._log('✅ Using valid token from memory');
                return this.accessToken;
            } else {
                this._log('❌ Memory token validation failed:', validationResult.reason);
                this.accessToken = null;
                this.tokenExpiry = null;
            }
        }
        
        // Step 2: Try to restore from session storage
        this._log('🔍 Checking session storage...');
        const storedToken = this._getStoredAccessToken();
        if (storedToken && this._isTokenValid(storedToken)) {
            const validationResult = this._validateUserToken(storedToken.token);
            if (validationResult.valid) {
                this._log('✅ Restoring valid user token from session storage');
                this._setAccessToken(storedToken.token, storedToken.expiresIn);
                this._setUserInfo(storedToken.user);
                return this.accessToken;
            } else {
                this._log('❌ Stored token validation failed:', validationResult.reason);
                sessionStorage.removeItem('aaai_access_token');
            }
        }
        
        // Step 3: Try to refresh token
        this._log('🔍 Attempting token refresh...');
        const refreshed = await this.refreshTokenIfNeeded();
        if (!refreshed) {
            this._log('❌ Token refresh failed');
            throw new Error('Unable to obtain valid user access token');
        }
        
        this._log('✅ Token refresh successful');
        return this.accessToken;
    },
    
    /**
     * Enhanced authentication check - validates complete authentication state
     */
    _isAuthenticationComplete() {
        return this.authenticated && 
               this.userEmail && 
               this.userId && 
               this.accessToken && 
               this._isAccessTokenValid();
    },

    /**
     * Wait for authentication to be ready
     */
    async _waitForAuthReady(timeout = 5000) {
        const startTime = Date.now();
        
        while (!this._isAuthenticationComplete() && (Date.now() - startTime) < timeout) {
            // Try to refresh token if we have refresh capability
            if (this._hasRefreshTokenCookie() && !this.refreshInProgress) {
                try {
                    const refreshed = await this.refreshTokenIfNeeded();
                    if (refreshed && this._isAuthenticationComplete()) {
                        return true;
                    }
                } catch (error) {
                    console.warn('Auth refresh failed during wait:', error);
                }
            }
            
            // Wait a bit before checking again
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        return this._isAuthenticationComplete();
    },

    /**
     * Ensure authentication is ready before proceeding
     */
    async _ensureAuthReady() {
        if (this._isAuthenticationComplete()) {
            return true;
        }
        
        if (this._hasRefreshTokenCookie()) {
            try {
                const refreshed = await this.refreshTokenIfNeeded();
                return refreshed && this._isAuthenticationComplete();
            } catch (error) {
                console.error('Failed to ensure auth ready:', error);
                return false;
            }
        }
        
        return false;
    },

    // Private methods

    /**
     * Set access token and expiry - ENHANCED
     */
    _setAccessToken(token, expiresIn) {
        this.accessToken = token;
        this.tokenExpiry = Date.now() + (expiresIn * 1000);
        
        this._log('✅ Access token set in memory:', {
            tokenPreview: token ? token.substring(0, 50) + '...' : 'none',
            expiresIn: expiresIn,
            tokenExpiry: this.tokenExpiry
        });
    },
    /**
     * Set user information - FIXED
     */
    _setUserInfo(user) {
        this.authenticated = true;
        this.userEmail = user.email;
        this.userId = user.id;
        this.sessionId = user.session_id;
        
        this._log('✅ User info set:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            sessionId: this.sessionId
        });
    },

    /**
     * Clear all authentication state
     */
    _clearAuthState() {
        this.authenticated = false;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.accessToken = null;
        this.tokenExpiry = null;
        
        // Clear stored tokens
        sessionStorage.removeItem('aaai_access_token');
        
        // Clear refresh timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
        
        this._log('Authentication state cleared');
    },

    /**
     * Check if access token is valid
     */
    _isAccessTokenValid() {
        if (!this.accessToken || !this.tokenExpiry) {
            return false;
        }
        
        // Check expiration
        if (Date.now() >= (this.tokenExpiry - this.options.refreshBufferTime)) {
            return false;
        }
        
        // STRICT: Validate token format and content
        const validationResult = this._validateUserToken(this.accessToken);
        if (!validationResult.valid) {
            this._log('Access token validation failed:', validationResult.reason);
            return false;
        }
        
        return true;
    },

    /**
     * Check if stored token is valid
     */
    _isTokenValid(storedToken) {
        return storedToken && 
               storedToken.token && 
               storedToken.expiry && 
               Date.now() < storedToken.expiry;
    },

    /**
     * Store access token in sessionStorage
     */
    /**
     * Store access token in sessionStorage - FIXED
     */
    _storeAccessToken(token, expiresIn, user) {
        try {
            // STRICT: Validate token before storing
            const validationResult = this._validateUserToken(token);
            if (!validationResult.valid) {
                this._log('CRITICAL: Refusing to store invalid user token:', {
                    reason: validationResult.reason,
                    code: validationResult.code
                });
                return;
            }
            
            const tokenData = {
                token: token,
                expiry: Date.now() + (expiresIn * 1000),
                expiresIn: expiresIn,
                user: {
                    id: user.id,
                    email: user.email,
                    session_id: user.session_id
                },
                stored: Date.now(),
                validated: true,
                tokenType: 'user_access',
                payload: validationResult.payload
            };
            
            sessionStorage.setItem('aaai_access_token', JSON.stringify(tokenData));
            
            // DEBUGGING: Verify storage immediately
            const verifyStored = sessionStorage.getItem('aaai_access_token');
            if (verifyStored) {
                const parsed = JSON.parse(verifyStored);
                this._log('✅ Token stored and verified in sessionStorage:', {
                    userEmail: parsed.user?.email,
                    userId: parsed.user?.id,
                    tokenType: parsed.tokenType,
                    payloadEmail: parsed.payload?.email,
                    payloadUserId: parsed.payload?.user_id,
                    tokenPreview: parsed.token ? parsed.token.substring(0, 50) + '...' : 'none'
                });
            } else {
                this._log('❌ Failed to verify token storage');
            }
            
        } catch (error) {
            console.warn('Failed to store access token:', error);
        }
    },

    /**
     * Get stored access token - FIXED
     */
    _getStoredAccessToken() {
        try {
            const stored = sessionStorage.getItem('aaai_access_token');
            if (!stored) {
                this._log('❌ No token found in sessionStorage');
                return null;
            }
            
            const tokenData = JSON.parse(stored);
            
            this._log('🔍 Retrieved token from sessionStorage:', {
                hasToken: !!tokenData.token,
                userEmail: tokenData.user?.email,
                userId: tokenData.user?.id,
                tokenType: tokenData.tokenType,
                expiry: tokenData.expiry,
                isExpired: Date.now() >= tokenData.expiry,
                tokenPreview: tokenData.token ? tokenData.token.substring(0, 50) + '...' : 'none'
            });
            
            // Check if token is expired
            if (Date.now() >= tokenData.expiry) {
                this._log('❌ Stored token is expired, removing');
                sessionStorage.removeItem('aaai_access_token');
                return null;
            }
            
            // STRICT: Re-validate stored token
            const validationResult = this._validateUserToken(tokenData.token);
            if (!validationResult.valid) {
                this._log('❌ Stored token validation failed, removing:', validationResult.reason);
                sessionStorage.removeItem('aaai_access_token');
                return null;
            }
            
            this._log('✅ Stored token validation passed');
            return tokenData;
            
        } catch (error) {
            console.warn('Failed to retrieve stored token:', error);
            sessionStorage.removeItem('aaai_access_token');
            return null;
        }
    },

    /**
     * Check if refresh token cookie exists
     */
    _hasRefreshTokenCookie() {
        return document.cookie.includes('authenticated=true') || 
               document.cookie.includes('refresh_token=');
    },

    /**
     * Setup automatic token refresh
     */
    _setupAutoRefresh() {
        // Clear existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        if (!this.tokenExpiry) return;
        
        // Calculate when to refresh (2 minutes before expiry)
        const refreshTime = this.tokenExpiry - Date.now() - this.options.refreshBufferTime;
        
        if (refreshTime > 0) {
            this.refreshTimer = setTimeout(() => {
                this._performTokenRefresh().catch(error => {
                    console.error('Automatic token refresh failed:', error);
                });
            }, refreshTime);
            
            this._log(`Auto-refresh scheduled in ${Math.round(refreshTime / 1000)} seconds`);
        }
    },

    /**
     * Debug logging
     */
    _log(...args) {
        if (this.options.debug) {
            console.log('[AuthService]', ...args);
        }
    }
};

// Export for global access
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthService;
}