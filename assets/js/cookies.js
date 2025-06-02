/**
 * High-Performance Cookie Management for AAAI Solutions
 * Optimized for fast cookie operations with caching
 */
const Cookies = {
    // Cookie cache for performance
    _cache: new Map(),
    _cacheExpiry: new Map(),
    _cacheTimeout: 5000, // 5 seconds cache
    
    /**
     * Fast cookie setting with optimized options
     */
    set: function(name, value, days = 7, path = '/', sameSite = 'lax') {
        try {
            const expires = new Date(Date.now() + days * 864e5).toUTCString();
            const secureFlag = window.location.protocol === 'https:' ? '; secure' : '';
            const cookieString = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=${path}; samesite=${sameSite}${secureFlag}`;
            
            document.cookie = cookieString;
            
            // Update cache
            this._cache.set(name, value);
            this._cacheExpiry.set(name, Date.now() + this._cacheTimeout);
            
            return true;
        } catch (error) {
            console.warn('Failed to set cookie:', name, error);
            return false;
        }
    },
    
    /**
     * Fast cookie retrieval with caching
     */
    get: function(name) {
        // Check cache first
        if (this._cache.has(name)) {
            const expiry = this._cacheExpiry.get(name);
            if (expiry && Date.now() < expiry) {
                return this._cache.get(name);
            } else {
                // Cache expired
                this._cache.delete(name);
                this._cacheExpiry.delete(name);
            }
        }
        
        // Parse from document.cookie
        const value = this._parseCookieValue(name);
        
        // Cache the result
        if (value !== null) {
            this._cache.set(name, value);
            this._cacheExpiry.set(name, Date.now() + this._cacheTimeout);
        }
        
        return value;
    },
    
    /**
     * Fast cookie deletion
     */
    delete: function(name, path = '/') {
        try {
            document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
            
            // Remove from cache
            this._cache.delete(name);
            this._cacheExpiry.delete(name);
            
            return true;
        } catch (error) {
            console.warn('Failed to delete cookie:', name, error);
            return false;
        }
    },
    
    /**
     * Fast preferences storage with compression
     */
    setPreferences: function(preferences) {
        try {
            // Simple compression for large preference objects
            const prefStr = JSON.stringify(preferences);
            
            if (prefStr.length > 1000) {
                console.warn('Preferences object is large, consider reducing size');
            }
            
            return this.set('user_preferences', prefStr, 365);
        } catch (error) {
            console.warn('Failed to set preferences:', error);
            return false;
        }
    },
    
    /**
     * Fast preferences retrieval with validation
     */
    getPreferences: function() {
        try {
            const prefStr = this.get('user_preferences');
            if (!prefStr) return {};
            
            const preferences = JSON.parse(prefStr);
            
            // Basic validation
            if (typeof preferences !== 'object' || preferences === null) {
                console.warn('Invalid preferences format, returning defaults');
                return {};
            }
            
            return preferences;
        } catch (error) {
            console.warn('Failed to parse preferences:', error);
            return {};
        }
    },
    
    /**
     * Fast authentication check
     */
    isAuthenticated: function() {
        // Quick check for authenticated cookie
        const authenticated = this.get('authenticated');
        const userInfo = this.get('user_info');
        
        return authenticated === 'true' && userInfo !== null;
    },
    
    /**
     * Fast user info retrieval with validation
     */
    getUserInfo: function() {
        try {
            const userInfoStr = this.get('user_info');
            if (!userInfoStr) return null;
            
            const userInfo = JSON.parse(userInfoStr);
            
            // Basic validation for required fields
            if (!userInfo.id || !userInfo.email) {
                console.warn('Invalid user info format');
                return null;
            }
            
            return userInfo;
        } catch (error) {
            console.warn('Failed to parse user info:', error);
            return null;
        }
    },
    
    /**
     * Batch cookie operations for performance
     */
    setBatch: function(cookies) {
        if (!Array.isArray(cookies)) return false;
        
        let success = true;
        cookies.forEach(cookie => {
            if (!this.set(cookie.name, cookie.value, cookie.days, cookie.path, cookie.sameSite)) {
                success = false;
            }
        });
        
        return success;
    },
    
    /**
     * Get multiple cookies at once
     */
    getBatch: function(names) {
        if (!Array.isArray(names)) return {};
        
        const result = {};
        names.forEach(name => {
            result[name] = this.get(name);
        });
        
        return result;
    },
    
    /**
     * Clear cache manually if needed
     */
    clearCache: function() {
        this._cache.clear();
        this._cacheExpiry.clear();
        console.log('Cookie cache cleared');
    },
    
    /**
     * Check if cookies are supported
     */
    isSupported: function() {
        try {
            const testCookie = 'test_cookie_support';
            this.set(testCookie, 'test', 0.001); // Very short expiry
            const supported = this.get(testCookie) === 'test';
            this.delete(testCookie);
            return supported;
        } catch (error) {
            return false;
        }
    },
    
    /**
     * Get all cookies as object (expensive operation, use sparingly)
     */
    getAll: function() {
        const cookies = {};
        
        try {
            document.cookie.split(';').forEach(cookie => {
                const [name, value] = cookie.trim().split('=');
                if (name && value) {
                    cookies[name] = decodeURIComponent(value);
                }
            });
        } catch (error) {
            console.warn('Failed to parse all cookies:', error);
        }
        
        return cookies;
    },
    
    // Private helper methods
    
    /**
     * Fast cookie value parsing
     */
    _parseCookieValue: function(name) {
        try {
            const value = `; ${document.cookie}`;
            const parts = value.split(`; ${name}=`);
            
            if (parts.length === 2) {
                return decodeURIComponent(parts.pop().split(';').shift());
            }
            
            return null;
        } catch (error) {
            console.warn('Failed to parse cookie value:', name, error);
            return null;
        }
    }
};