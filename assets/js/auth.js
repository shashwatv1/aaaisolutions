/**
 * ENHANCED Authentication Service for AAAI Solutions - CONSISTENT STATE MANAGEMENT
 * Ensures authentication state consistency across all operations
 */
const AuthService = {
    // Core state - NEVER set authenticated without complete user data
    authenticated: false,
    userEmail: null,
    userId: null,
    sessionId: null,
    token: null,
    refreshToken: null,
    
    // Enhanced state tracking for consistency
    authenticationSource: null, // 'cookies', 'localStorage', 'server'
    lastValidation: null,
    validationPromise: null,
    isValidating: false,
    
    // Timers and promises
    tokenRefreshTimer: null,
    refreshPromise: null,
    isRefreshing: false,
    
    // State management
    lastTokenRefresh: null,
    sessionValidationCache: null,
    sessionValidationExpiry: null,
    cookieMonitoringInterval: null,
    _needsBackgroundValidation: false,

    /**
     * ENHANCED: Initialize with guaranteed state consistency
     */
    init() {
        console.log('=== ENHANCED AuthService.init() START - CONSISTENT STATE ===');
        console.log('window.location.hostname:', window.location.hostname);
        
        // Wait for config to be available
        if (!window.AAAI_CONFIG) {
            throw new Error('AAAI_CONFIG not available. Make sure config.js is loaded first.');
        }
        
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
        
        // CONSISTENT: Initialize authentication state with strict validation
        const authResult = this._initializeConsistentAuthState();
        
        // ONLY set up services if we have COMPLETE authentication
        if (authResult.success && this._isAuthenticationComplete()) {
            this._setupEnhancedTokenRefresh();
            this._setupVisibilityHandler();
            this._setupCookieMonitoring();
            
            // Schedule background validation only for complete auth
            setTimeout(() => {
                this._validateAndRepairAsync().catch(error => {
                    console.warn('Background validation failed:', error);
                });
            }, 1000);
        } else if (authResult.needsValidation) {
            // We have partial data, try to validate immediately
            console.log('🔍 Partial auth state detected, attempting immediate validation...');
            this._attemptImmediateValidation();
        }
        
        const finalAuthState = this.isAuthenticated();
        
        window.AAAI_LOGGER?.info('ENHANCED AuthService initialized - CONSISTENT STATE', {
            environment: window.AAAI_CONFIG.ENVIRONMENT,
            authBaseUrl: this.AUTH_BASE_URL,
            authenticated: finalAuthState,
            authenticationComplete: this._isAuthenticationComplete(),
            authSource: this.authenticationSource,
            hasPersistentSession: this.hasPersistentSession(),
            chatMode: 'websocket_only'
        });
        
        console.log('=== ENHANCED AuthService.init() END - CONSISTENT STATE ===');
        console.log('Final CONSISTENT auth state:', {
            authenticated: this.authenticated,
            userEmail: this.userEmail,
            userId: this.userId,
            sessionId: this.sessionId,
            isComplete: this._isAuthenticationComplete(),
            source: this.authenticationSource
        });
        
        return finalAuthState;
    },

    /**
     * CONSISTENT: Check if authentication state is complete and valid
     */
    _isAuthenticationComplete() {
        const isComplete = !!(
            this.authenticated && 
            this.userEmail && 
            this.userId && 
            this.sessionId &&
            this._validateUserData({
                email: this.userEmail,
                id: this.userId,
                session_id: this.sessionId
            })
        );
        
        if (this.authenticated && !isComplete) {
            console.warn('🚨 INCONSISTENT AUTH STATE DETECTED:', {
                authenticated: this.authenticated,
                hasEmail: !!this.userEmail,
                hasUserId: !!this.userId,
                hasSessionId: !!this.sessionId
            });
        }
        
        return isComplete;
    },

    /**
     * CONSISTENT: Enhanced authentication check with auto-repair
     */
    isAuthenticated() {
        // First check if we have complete authentication
        if (this._isAuthenticationComplete()) {
            return true;
        }
        
        // If authenticated flag is true but incomplete, try to repair
        if (this.authenticated && (!this.userEmail || !this.userId)) {
            console.warn('🔧 Detected incomplete auth state, attempting quick repair...');
            
            if (this._quickAuthRepair()) {
                return this._isAuthenticationComplete();
            } else {
                // Clear inconsistent state
                console.warn('🧹 Quick repair failed, clearing inconsistent state');
                this._clearAuthState();
                return false;
            }
        }
        
        return false;
    },

    /**
     * CONSISTENT: Initialize authentication state with strict validation
     */
    _initializeConsistentAuthState() {
        console.log('🔍 CONSISTENT: Initializing authentication state...');
        
        try {
            // Clear any existing inconsistent state first
            this._clearAuthState();
            
            // Step 1: Try to restore from cookies with strict validation
            const cookieResult = this._restoreFromCookiesConsistent();
            if (cookieResult.success) {
                console.log('✅ CONSISTENT: Authentication restored from cookies');
                this.authenticationSource = 'cookies';
                return { success: true, source: 'cookies' };
            }
            
            // Step 2: Try localStorage with strict validation
            const storageResult = this._restoreFromStorageConsistent();
            if (storageResult.success) {
                console.log('✅ CONSISTENT: Authentication restored from localStorage');
                this.authenticationSource = 'localStorage';
                return { success: true, source: 'localStorage' };
            }
            
            // Step 3: Check if we have any recoverable authentication data
            const recoverResult = this._checkRecoverableAuthData();
            if (recoverResult.hasData) {
                console.log('⚠️ CONSISTENT: Found partial auth data, needs validation');
                return { success: false, needsValidation: true, source: 'partial' };
            }
            
            console.log('❌ CONSISTENT: No authentication state found');
            return { success: false, needsValidation: false, source: 'none' };
            
        } catch (error) {
            console.error('❌ Error during consistent auth initialization:', error);
            this._clearAuthState();
            return { success: false, needsValidation: false, source: 'error' };
        }
    },

    /**
     * CONSISTENT: Restore authentication from cookies with strict validation
     */
    _restoreFromCookiesConsistent() {
        try {
            console.log('🍪 CONSISTENT: Restoring from cookies...');
            
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            console.log('Cookie status:', {
                authenticated: authCookie,
                hasUserInfo: !!userInfoCookie,
                userInfoLength: userInfoCookie ? userInfoCookie.length : 0,
                hasAccessToken: this._cookieExists('access_token'),
                hasRefreshToken: this._cookieExists('refresh_token')
            });
            
            // Must have both authenticated cookie AND user info
            if (authCookie !== 'true' || !userInfoCookie) {
                console.log('❌ Missing required cookies for consistent auth');
                return { success: false };
            }
            
            // Parse and validate user info
            let userInfo;
            try {
                userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
            } catch (parseError) {
                console.error('❌ Failed to parse user_info cookie:', parseError);
                console.log('Raw cookie value:', userInfoCookie.substring(0, 100));
                return { success: false };
            }
            
            // STRICT validation of user info
            if (!this._validateUserData(userInfo)) {
                console.error('❌ User info validation failed:', userInfo);
                return { success: false };
            }
            
            // Set COMPLETE authentication state
            this._setCompleteAuthState(userInfo, 'cookies');
            
            // Verify the state was set correctly
            if (!this._isAuthenticationComplete()) {
                console.error('❌ Failed to set complete auth state from cookies');
                this._clearAuthState();
                return { success: false };
            }
            
            console.log('✅ CONSISTENT: Authentication restored from cookies');
            return { success: true };
            
        } catch (error) {
            console.error('❌ Error restoring from cookies:', error);
            return { success: false };
        }
    },

    /**
     * CONSISTENT: Restore authentication from localStorage with strict validation
     */
    _restoreFromStorageConsistent() {
        try {
            console.log('💾 CONSISTENT: Restoring from localStorage...');
            
            const storedEmail = this._getSecureItem('user_email');
            const storedUserId = this._getSecureItem('user_id');
            const storedSessionId = this._getSecureItem('session_id');
            const authCookie = this._getCookie('authenticated');
            
            console.log('LocalStorage status:', {
                hasEmail: !!storedEmail,
                hasUserId: !!storedUserId,
                hasSessionId: !!storedSessionId,
                authCookie: authCookie,
                emailValue: storedEmail,
                userIdValue: storedUserId
            });
            
            // Must have ALL required data for consistent restore
            if (!storedEmail || !storedUserId || authCookie !== 'true') {
                console.log('❌ Incomplete localStorage data for consistent auth');
                return { success: false };
            }
            
            const userInfo = {
                email: storedEmail,
                id: storedUserId,
                session_id: storedSessionId || this._generateSessionId()
            };
            
            // STRICT validation
            if (!this._validateUserData(userInfo)) {
                console.error('❌ LocalStorage user data validation failed:', userInfo);
                return { success: false };
            }
            
            // Set COMPLETE authentication state
            this._setCompleteAuthState(userInfo, 'localStorage');
            
            // Verify the state was set correctly
            if (!this._isAuthenticationComplete()) {
                console.error('❌ Failed to set complete auth state from localStorage');
                this._clearAuthState();
                return { success: false };
            }
            
            // Update cookies to maintain consistency
            this._syncAuthToCookies(userInfo);
            
            console.log('✅ CONSISTENT: Authentication restored from localStorage');
            return { success: true };
            
        } catch (error) {
            console.error('❌ Error restoring from localStorage:', error);
            return { success: false };
        }
    },

    /**
     * CONSISTENT: Check for recoverable authentication data
     */
    _checkRecoverableAuthData() {
        try {
            const authCookie = this._getCookie('authenticated');
            const hasAnyToken = this._cookieExists('access_token') || this._cookieExists('refresh_token');
            const hasPartialStorage = this._getSecureItem('user_email') || this._getSecureItem('user_id');
            
            const hasData = authCookie === 'true' && (hasAnyToken || hasPartialStorage);
            
            console.log('Recoverable data check:', {
                authCookie: authCookie,
                hasAnyToken: hasAnyToken,
                hasPartialStorage: hasPartialStorage,
                hasData: hasData
            });
            
            return { hasData: hasData };
            
        } catch (error) {
            console.error('Error checking recoverable auth data:', error);
            return { hasData: false };
        }
    },

    /**
     * CONSISTENT: Set complete authentication state with validation
     */
    _setCompleteAuthState(userInfo, source) {
        console.log('🔐 CONSISTENT: Setting complete authentication state from:', source);
        console.log('User info:', {
            email: userInfo.email,
            id: userInfo.id,
            session_id: userInfo.session_id
        });
        
        // Validate before setting
        if (!this._validateUserData(userInfo)) {
            throw new Error('Cannot set auth state with invalid user data');
        }
        
        // Set ALL required fields atomically
        this.authenticated = true;
        this.userEmail = userInfo.email;
        this.userId = userInfo.id;
        this.sessionId = userInfo.session_id;
        this.token = 'cookie_stored';
        this.refreshToken = 'cookie_stored';
        this.authenticationSource = source;
        this.lastValidation = Date.now();
        
        // Sync to all storage locations for consistency
        this._syncToAllStorage(userInfo);
        
        // Verify completeness
        if (!this._isAuthenticationComplete()) {
            throw new Error('Failed to set complete authentication state');
        }
        
        console.log('✅ CONSISTENT: Complete authentication state set successfully');
    },

    /**
     * CONSISTENT: Sync authentication data to all storage locations
     */
    _syncToAllStorage(userInfo) {
        try {
            // Sync to localStorage
            this._setSecureItem('user_email', userInfo.email);
            this._setSecureItem('user_id', userInfo.id);
            this._setSecureItem('session_id', userInfo.session_id);
            
            // Sync to cookies
            this._syncAuthToCookies(userInfo);
            
            console.log('✅ CONSISTENT: Synced auth data to all storage locations');
        } catch (error) {
            console.error('❌ Error syncing to all storage:', error);
        }
    },

    /**
     * CONSISTENT: Sync authentication data to cookies
     */
    _syncAuthToCookies(userInfo) {
        try {
            this._setCookie('authenticated', 'true', 1);
            this._setCookie('user_info', JSON.stringify(userInfo), 1);
        } catch (error) {
            console.error('Error syncing to cookies:', error);
        }
    },

    /**
     * ENHANCED: User data validation with comprehensive checks and better error messages
     */
    _validateUserData(userData) {
        console.log('🔍 Validating user data:', userData);
        
        if (!userData || typeof userData !== 'object') {
            console.error('❌ Invalid user data: not an object', userData);
            return false;
        }
        
        // Check email
        if (!userData.email || typeof userData.email !== 'string' || !userData.email.includes('@')) {
            console.error('❌ Invalid user data: missing or invalid email', {
                email: userData.email,
                type: typeof userData.email,
                hasAt: userData.email ? userData.email.includes('@') : false
            });
            return false;
        }
        
        // Check id (must be string and non-empty)
        if (!userData.id || typeof userData.id !== 'string' || userData.id.trim() === '') {
            console.error('❌ Invalid user data: missing or invalid id', {
                id: userData.id,
                type: typeof userData.id,
                isEmpty: userData.id ? userData.id.trim() === '' : true
            });
            return false;
        }
        
        // Session ID can be missing, but if present must be valid
        if (userData.session_id && (typeof userData.session_id !== 'string' || userData.session_id.trim() === '')) {
            console.error('❌ Invalid user data: invalid session_id', {
                session_id: userData.session_id,
                type: typeof userData.session_id
            });
            return false;
        }
        
        console.log('✅ User data validation passed');
        return true;
    },

    /**
     * CONSISTENT: Quick authentication repair with strict validation
     */
    _quickAuthRepair() {
        try {
            console.log('🔧 CONSISTENT: Attempting quick authentication repair...');
            
            // Try to gather complete user data from all sources
            const email = this.userEmail || this._getSecureItem('user_email') || this._extractEmailFromCookie();
            const userId = this.userId || this._getSecureItem('user_id') || this._extractUserIdFromCookie();
            const sessionId = this.sessionId || this._getSecureItem('session_id') || this._generateSessionId();
            
            console.log('Quick repair data gathered:', {
                email: !!email,
                userId: !!userId,
                sessionId: !!sessionId,
                emailValue: email,
                userIdValue: userId
            });
            
            // Must have at least email and userId for repair
            if (!email || !userId) {
                console.log('❌ Quick repair: Insufficient data');
                return false;
            }
            
            const repairedUserInfo = {
                email: email,
                id: userId,
                session_id: sessionId
            };
            
            // Validate the repaired data
            if (!this._validateUserData(repairedUserInfo)) {
                console.log('❌ Quick repair: Validation failed');
                return false;
            }
            
            // Apply the repair
            this._setCompleteAuthState(repairedUserInfo, 'repair');
            
            console.log('✅ CONSISTENT: Quick repair successful');
            return true;
            
        } catch (error) {
            console.error('❌ Quick repair failed:', error);
            return false;
        }
    },

    /**
     * Extract email from user_info cookie
     */
    _extractEmailFromCookie() {
        try {
            const userInfoCookie = this._getCookie('user_info');
            if (userInfoCookie) {
                const userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
                return userInfo.email;
            }
        } catch (error) {
            console.warn('Failed to extract email from cookie:', error);
        }
        return null;
    },

    /**
     * Extract user ID from user_info cookie
     */
    _extractUserIdFromCookie() {
        try {
            const userInfoCookie = this._getCookie('user_info');
            if (userInfoCookie) {
                const userInfo = JSON.parse(decodeURIComponent(userInfoCookie));
                return userInfo.id;
            }
        } catch (error) {
            console.warn('Failed to extract user ID from cookie:', error);
        }
        return null;
    },

    /**
     * Generate a session ID
     */
    _generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * CONSISTENT: Attempt immediate validation for partial auth data
     */
    async _attemptImmediateValidation() {
        if (this.isValidating) {
            console.log('Validation already in progress');
            return;
        }
        
        this.isValidating = true;
        
        try {
            console.log('🔍 CONSISTENT: Attempting immediate validation...');
            
            // Try to refresh tokens to get complete auth data
            const refreshSuccess = await this._performEnhancedTokenRefresh();
            
            if (refreshSuccess) {
                console.log('✅ Immediate validation successful via token refresh');
                this._needsBackgroundValidation = false;
            } else {
                console.log('❌ Immediate validation failed');
                // Clear any partial state
                this._clearAuthState();
            }
            
        } catch (error) {
            console.error('❌ Immediate validation error:', error);
            this._clearAuthState();
        } finally {
            this.isValidating = false;
        }
    },

    /**
     * ENHANCED: OTP verification with server response mapping
     */
    async verifyOTP(email, otp) {
        try {
            console.log(`🔐 ENHANCED OTP: Verifying OTP for email: ${email}`);
            
            // Clear any existing inconsistent state
            this._clearAuthState();
            
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
                console.error('❌ OTP verification failed:', data);
                throw new Error(data.error || data.detail || 'Invalid OTP');
            }
            
            console.log('✅ OTP verification successful, mapping server response...');
            console.log('🔍 Raw server response:', data);
            
            // ENHANCED: Map server response to expected user info structure
            const userInfo = this._mapServerResponseToUserInfo(email, data);
            
            console.log('🔍 Mapped user info:', userInfo);
            
            // Validate the mapped user info
            if (!this._validateUserData(userInfo)) {
                console.error('❌ Mapped user data validation failed:', userInfo);
                throw new Error('Server returned invalid user data after mapping');
            }
            
            // Set COMPLETE authentication state
            this._setCompleteAuthState(userInfo, 'server');
            
            // Clear validation flags
            this.sessionValidationCache = null;
            this.sessionValidationExpiry = null;
            this._needsBackgroundValidation = false;
            this.lastTokenRefresh = Date.now();
            
            // Verify final state
            if (!this._isAuthenticationComplete()) {
                throw new Error('Failed to establish complete authentication state');
            }
            
            console.log('✅ ENHANCED OTP: Authentication state established successfully');
            return data; // Return original server response
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please check your connection and try again.');
            }
            console.error('❌ ENHANCED OTP Verification error:', error);
            this._clearAuthState(); // Ensure clean state on failure
            throw new Error(`OTP verification failed: ${error.message}`);
        }
    },

    /**
     * ENHANCED: Map server response to expected user info structure
     */
    _mapServerResponseToUserInfo(email, serverResponse) {
        console.log('🔄 Mapping server response to user info...');
        console.log('📥 Server response keys:', Object.keys(serverResponse));
        
        // Create user info object with all possible mappings
        const userInfo = {
            email: email, // Use the email from the request
            id: null,
            session_id: null
        };
        
        // Map user ID from various possible fields
        if (serverResponse.userId) {
            userInfo.id = serverResponse.userId;
            console.log('✅ Mapped userId to id:', serverResponse.userId);
        } else if (serverResponse.id) {
            userInfo.id = serverResponse.id;
            console.log('✅ Found id field:', serverResponse.id);
        } else if (serverResponse.user_id) {
            userInfo.id = serverResponse.user_id;
            console.log('✅ Mapped user_id to id:', serverResponse.user_id);
        } else if (serverResponse.user && serverResponse.user.id) {
            userInfo.id = serverResponse.user.id;
            console.log('✅ Mapped user.id to id:', serverResponse.user.id);
        } else if (serverResponse.user && serverResponse.user.userId) {
            userInfo.id = serverResponse.user.userId;
            console.log('✅ Mapped user.userId to id:', serverResponse.user.userId);
        }
        
        // Map session ID from various possible fields
        if (serverResponse.session_id) {
            userInfo.session_id = serverResponse.session_id;
            console.log('✅ Found session_id:', serverResponse.session_id);
        } else if (serverResponse.sessionId) {
            userInfo.session_id = serverResponse.sessionId;
            console.log('✅ Mapped sessionId to session_id:', serverResponse.sessionId);
        } else if (serverResponse.token) {
            // Generate session ID from token or timestamp
            userInfo.session_id = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            console.log('✅ Generated session_id:', userInfo.session_id);
        } else {
            // Generate a session ID if none provided
            userInfo.session_id = `otp_session_${Date.now()}`;
            console.log('✅ Generated fallback session_id:', userInfo.session_id);
        }
        
        // Ensure email is correct
        if (serverResponse.email && serverResponse.email !== email) {
            console.warn('⚠️ Email mismatch, using server email:', serverResponse.email);
            userInfo.email = serverResponse.email;
        }
        
        console.log('✅ Final mapped user info:', userInfo);
        return userInfo;
    },

    /**
     * ENHANCED: Execute function with consistent authentication checks
     */
    async executeFunction(functionName, inputData) {
        // STRICT authentication check
        if (!this._isAuthenticationComplete()) {
            console.error('Execute function failed: Authentication incomplete');
            throw new Error('Complete authentication required');
        }
        
        try {
            console.log(`🚀 CONSISTENT: Executing function: ${functionName}`);
            
            // Refresh token if needed
            if (this.lastTokenRefresh && (Date.now() - this.lastTokenRefresh) > 600000) {
                console.log('🔄 Refreshing token before function call...');
                await this.refreshTokenIfNeeded();
                
                // Re-verify authentication after refresh
                if (!this._isAuthenticationComplete()) {
                    throw new Error('Authentication incomplete after token refresh');
                }
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000);
            
            const executeUrl = `${this.AUTH_BASE_URL}/api/function/${functionName}`;
            
            console.log(`📡 Making request to: ${executeUrl}`);
            console.log(`👤 Authenticated user: ${this.userEmail}`);
            
            const response = await fetch(executeUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(inputData),
                signal: controller.signal,
                credentials: 'include'
            });
            
            clearTimeout(timeoutId);
            
            console.log(`📊 Response status: ${response.status}`);
            
            if (!response.ok) {
                let errorData;
                try {
                    const responseText = await response.text();
                    errorData = JSON.parse(responseText);
                } catch (parseError) {
                    throw new Error(`HTTP ${response.status}: Failed to parse error response`);
                }
                
                console.error(`💥 Function execution failed:`, errorData);
                
                if (response.status === 401) {
                    console.warn('🔓 Authentication failed - clearing state');
                    this._clearAuthState();
                    throw new Error('Session expired. Please log in again.');
                }
                
                throw new Error(errorData.error || errorData.detail || errorData.message || `Failed to execute function: ${functionName}`);
            }
            
            // Parse successful response
            let data;
            try {
                const responseText = await response.text();
                data = JSON.parse(responseText);
            } catch (parseError) {
                console.error('💥 Failed to parse successful response:', parseError);
                throw new Error(`Invalid response format: ${parseError.message}`);
            }
            
            console.log(`✅ CONSISTENT: Function ${functionName} executed successfully`);
            return data;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timed out. Please try again.');
            }
            console.error(`💀 Function execution failed (${functionName}):`, error);
            throw error;
        }
    },

    /**
     * ENHANCED: Token refresh with consistent state management
     */
    async _performEnhancedTokenRefresh() {
        try {
            console.log('🔄 CONSISTENT: Attempting token refresh...');
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            // Try silent refresh first
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
                console.log('✅ CONSISTENT: Token refresh successful');
                
                this.lastTokenRefresh = Date.now();
                
                // Update authentication state if user data provided
                if (data.user && this._validateUserData(data.user)) {
                    const userInfo = {
                        email: data.user.email,
                        id: data.user.id,
                        session_id: data.session_id || this.sessionId
                    };
                    
                    this._setCompleteAuthState(userInfo, 'refresh');
                }
                
                // Clear validation flags
                this.sessionValidationCache = null;
                this.sessionValidationExpiry = null;
                
                return true;
            } else {
                const errorData = await response.json().catch(() => ({}));
                console.log('❌ CONSISTENT: Token refresh failed:', response.status, errorData);
                
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
                console.error('Token refresh error:', error);
            }
            return false;
        }
    },

    /**
     * CONSISTENT: Clear authentication state completely
     */
    _clearAuthState() {
        console.log('🧹 CONSISTENT: Clearing all authentication state');
        
        // Clear ALL instance data atomically
        this.token = null;
        this.refreshToken = null;
        this.userEmail = null;
        this.userId = null;
        this.sessionId = null;
        this.authenticated = false;
        this.authenticationSource = null;
        this.lastTokenRefresh = null;
        this.lastValidation = null;
        this.sessionValidationCache = null;
        this.sessionValidationExpiry = null;
        this._needsBackgroundValidation = false;
        this.isValidating = false;
        this.validationPromise = null;
        
        // Clear localStorage
        this._removeSecureItem('user_email');
        this._removeSecureItem('user_id');
        this._removeSecureItem('session_id');
        
        console.log('✅ CONSISTENT: Authentication state cleared completely');
    },

    /**
     * ENHANCED: Get current user with consistency check
     */
    getCurrentUser() {
        if (!this._isAuthenticationComplete()) {
            console.warn('getCurrentUser called with incomplete authentication state');
            return null;
        }
        
        return {
            email: this.userEmail,
            id: this.userId,
            sessionId: this.sessionId,
            authenticated: this.authenticated,
            websocketReady: true,
            authenticationSource: this.authenticationSource,
            lastValidation: this.lastValidation
        };
    },

    /**
     * ENHANCED: Check for persistent session with better validation
     */
    hasPersistentSession() {
        const hasAuthCookie = this._getCookie('authenticated') === 'true';
        const hasUserInfo = !!this._getCookie('user_info');
        const hasStoredUser = !!this._getSecureItem('user_id');
        const hasAccessToken = this._cookieExists('access_token');
        
        return hasAuthCookie && (hasUserInfo || hasStoredUser || hasAccessToken);
    },

    /**
     * ENHANCED: Get detailed session information
     */
    getSessionInfo() {
        return {
            authenticated: this.authenticated,
            authenticationComplete: this._isAuthenticationComplete(),
            userId: this.userId,
            email: this.userEmail,
            sessionId: this.sessionId,
            authenticationSource: this.authenticationSource,
            lastValidation: this.lastValidation,
            lastTokenRefresh: this.lastTokenRefresh,
            hasPersistentSession: this.hasPersistentSession(),
            websocketReady: this._isAuthenticationComplete(),
            chatMode: 'websocket_only',
            cookieHealth: {
                authenticated: this._getCookie('authenticated') === 'true',
                userInfo: !!this._getCookie('user_info'),
                accessToken: this._cookieExists('access_token'),
                refreshToken: this._cookieExists('refresh_token')
            }
        };
    },

    // Keep all other existing methods (requestOTP, logout, etc.) but ensure they use consistent state management
    
    async requestOTP(email) {
        try {
            console.log(`CONSISTENT: Requesting OTP for email: ${email}`);
            
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

    async logout() {
        try {
            console.log('🚪 CONSISTENT: Logging out...');
            
            // Clear timers first
            if (this.tokenRefreshTimer) {
                clearInterval(this.tokenRefreshTimer);
                this.tokenRefreshTimer = null;
            }
            
            if (this.cookieMonitoringInterval) {
                clearInterval(this.cookieMonitoringInterval);
                this.cookieMonitoringInterval = null;
            }
            
            // Attempt server-side logout if authenticated
            if (this._isAuthenticationComplete()) {
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
                    console.log('✅ Server-side logout completed');
                } catch (error) {
                    console.warn('Server-side logout failed or timed out:', error);
                }
            }
            
            // Always clear local state
            this.clearAuthData();
            
            console.log('✅ CONSISTENT: Logout completed');
        } catch (error) {
            console.error('Logout error:', error);
            // Still clear local data even if server logout fails
            this.clearAuthData();
        }
    },

    clearAuthData() {
        // Clear localStorage
        ['auth_token', 'refresh_token', 'user_email', 'user_id', 'session_id'].forEach(key => {
            this._removeSecureItem(key);
        });

        // Clear cookies
        this._deleteCookie('authenticated');
        this._deleteCookie('user_info');

        // Clear state
        this._clearAuthState();

        // Clear timers
        if (this.tokenRefreshTimer) {
            clearInterval(this.tokenRefreshTimer);
            this.tokenRefreshTimer = null;
        }
        
        if (this.cookieMonitoringInterval) {
            clearInterval(this.cookieMonitoringInterval);
            this.cookieMonitoringInterval = null;
        }

        console.log('🧹 CONSISTENT: All authentication data cleared');
    },

    async refreshTokenIfNeeded() {
        if (!this._isAuthenticationComplete()) {
            console.log('Not completely authenticated, cannot refresh token');
            return false;
        }
        
        // Check if we recently refreshed
        if (this.lastTokenRefresh && (Date.now() - this.lastTokenRefresh) < 300000) {
            console.log('Recently refreshed token, skipping');
            return true;
        }
        
        // Prevent concurrent refresh attempts
        if (this.isRefreshing) {
            console.log('Token refresh already in progress, waiting...');
            return this.refreshPromise;
        }
        
        this.isRefreshing = true;
        this.refreshPromise = this._performEnhancedTokenRefresh();
        
        try {
            const result = await this.refreshPromise;
            return result;
        } finally {
            this.isRefreshing = false;
            this.refreshPromise = null;
        }
    },

    // Include all utility methods with consistent error handling
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

    _cookieExists(name) {
        try {
            const cookieString = document.cookie;
            return cookieString.includes(`${name}=`);
        } catch (error) {
            return false;
        }
    },

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

    // Additional methods to maintain compatibility...
    _setupEnhancedTokenRefresh() {
        this.tokenRefreshTimer = setInterval(() => {
            if (this._isAuthenticationComplete()) {
                this.refreshTokenIfNeeded().catch(error => {
                    console.error('Scheduled token refresh failed:', error);
                });
            }
        }, 180000); // 3 minutes
        
        console.log('🔄 Enhanced token refresh scheduler started');
    },
    
    _setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && this._isAuthenticationComplete()) {
                this._validateSessionAsync().catch(error => {
                    console.error('Visibility session check failed:', error);
                });
            }
        });
    },
    
    _setupCookieMonitoring() {
        this.cookieMonitoringInterval = setInterval(() => {
            this._monitorCookieHealth();
        }, 30000);
    },
    
    _monitorCookieHealth() {
        if (!this._isAuthenticationComplete()) return;
        
        try {
            const authCookie = this._getCookie('authenticated');
            const userInfoCookie = this._getCookie('user_info');
            
            if (this.authenticated && authCookie !== 'true') {
                console.warn('⚠️ Auth cookie mismatch, correcting...');
                this._setCookie('authenticated', 'true', 1);
            }
            
            if (this.authenticated && !userInfoCookie && this.userEmail && this.userId) {
                console.warn('⚠️ Missing user_info cookie, restoring...');
                const userInfo = {
                    email: this.userEmail,
                    id: this.userId,
                    session_id: this.sessionId
                };
                this._setCookie('user_info', JSON.stringify(userInfo), 1);
            }
            
        } catch (error) {
            console.error('Error in cookie health monitoring:', error);
        }
    },

    async _validateSessionAsync() {
        try {
            if (this.sessionValidationCache && this.sessionValidationExpiry && 
                Date.now() < this.sessionValidationExpiry) {
                return this.sessionValidationCache;
            }
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            
            const response = await fetch(`${this.AUTH_BASE_URL}/auth/validate-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                return false;
            }
            
            const data = await response.json();
            const isValid = data.valid;
            
            // Cache the result
            this.sessionValidationCache = isValid;
            this.sessionValidationExpiry = Date.now() + 300000; // 5 minutes
            
            if (isValid && data.user_info && this._validateUserData(data.user_info)) {
                this._setCompleteAuthState(data.user_info, 'validation');
            }
            
            return isValid;
            
        } catch (error) {
            console.error('Session validation error:', error);
            return false;
        }
    },

    async _validateAndRepairAsync() {
        if (!this._needsBackgroundValidation) {
            return true;
        }
        
        try {
            console.log('🔧 Background validation and repair...');
            
            if (!this._isAuthenticationComplete()) {
                console.log('❌ Background validation: Authentication incomplete');
                return false;
            }
            
            const isValid = await this._validateSessionAsync();
            if (isValid) {
                console.log('✅ Background validation successful');
                this._needsBackgroundValidation = false;
                return true;
            }
            
            console.log('⚠️ Background validation failed, attempting repair...');
            
            const refreshSuccess = await this._performEnhancedTokenRefresh();
            if (refreshSuccess) {
                console.log('✅ Authentication repaired via token refresh');
                this._needsBackgroundValidation = false;
                return true;
            }
            
            if (this.hasPersistentSession()) {
                console.log('⚠️ Validation failed but persistent session exists');
                return true;
            }
            
            console.log('❌ Background validation failed completely');
            this._clearAuthState();
            return false;
            
        } catch (error) {
            console.error('Error during background validation:', error);
            return false;
        }
    },

    getWebSocketURL(userId) {
        if (!this._isAuthenticationComplete()) {
            throw new Error('Complete authentication required for WebSocket');
        }
        
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.AAAI_CONFIG.ENVIRONMENT === 'development' 
            ? 'localhost:8080' 
            : 'api-server-559730737995.us-central1.run.app';
        
        const url = `${wsProtocol}//${wsHost}/ws/${userId}`;
        console.log(`CONSISTENT WebSocket URL: ${url}`);
        return url;
    },

    async getUserCredits() {
        if (!this._isAuthenticationComplete()) {
            throw new Error('Complete authentication required');
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

    getToken() {
        return this.token;
    },

    getAuthHeader() {
        if (!this._isAuthenticationComplete()) {
            return {};
        }
        
        return {
            'X-Session-ID': this.sessionId || '',
            'X-WebSocket-Ready': 'true'
        };
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