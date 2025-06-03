const Cookies = {
    // Set a cookie with options
    set: function(name, value, days = 7, path = '/', sameSite = 'lax') {
        const expires = new Date(Date.now() + days * 864e5).toUTCString();
        const secureFlag = window.location.protocol === 'https:' ? '; secure' : '';
        document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=${path}; samesite=${sameSite}${secureFlag}`;
    },
    
    // Get a cookie by name
    get: function(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) {
            return decodeURIComponent(parts.pop().split(';').shift());
        }
        return null;
    },
    
    // Delete a cookie
    delete: function(name, path = '/') {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path};`;
    },
    
    // Store user preferences
    setPreferences: function(preferences) {
        this.set('user_preferences', JSON.stringify(preferences), 365);  // Store for a year
    },
    
    // Get user preferences
    getPreferences: function() {
        const prefStr = this.get('user_preferences');
        return prefStr ? JSON.parse(prefStr) : {};
    },
    
    // Check if user is authenticated
    isAuthenticated: function() {
        return !!this.get('user_info');
    },
    
    // Get user info
    getUserInfo: function() {
        const userInfoStr = this.get('user_info');
        return userInfoStr ? JSON.parse(userInfoStr) : null;
    }
};