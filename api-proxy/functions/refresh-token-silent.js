const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * FIXED: Silent token refresh using cookies only
 * Enhanced cookie parsing and debugging
 */
async function refreshTokenSilent(req, res) {
  // Handle CORS
  return cors(req, res, async () => {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      // Enhanced cookie parsing with debugging
      console.log('=== SILENT REFRESH DEBUG ===');
      console.log('All cookies received:', req.cookies);
      console.log('Cookie header:', req.headers.cookie);
      
      // Multiple methods to extract refresh token
      let refreshToken = null;
      
      // Method 1: req.cookies (parsed by Express)
      if (req.cookies && req.cookies.refresh_token) {
        refreshToken = req.cookies.refresh_token;
        console.log('Found refresh token via req.cookies');
      }
      
      // Method 2: Parse cookie header manually
      if (!refreshToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'refresh_token' && value) {
            refreshToken = decodeURIComponent(value);
            console.log('Found refresh token via header parsing');
            break;
          }
        }
      }
      
      // Method 3: Check for token in different formats
      if (!refreshToken) {
        // Check for refresh_token with different encodings
        const cookieStr = req.headers.cookie || '';
        const refreshMatch = cookieStr.match(/refresh_token=([^;]+)/);
        if (refreshMatch) {
          refreshToken = decodeURIComponent(refreshMatch[1]);
          console.log('Found refresh token via regex parsing');
        }
      }
      
      console.log('Final refresh token found:', !!refreshToken);
      console.log('Refresh token length:', refreshToken ? refreshToken.length : 0);
      
      if (!refreshToken) {
        console.log('ERROR: No refresh token found in any format');
        res.status(401).json({ 
          error: 'No refresh token available',
          message: 'No refresh token found in cookies for silent refresh',
          code: 'NO_REFRESH_TOKEN',
          debug: {
            cookiesReceived: !!req.cookies,
            cookieHeader: !!req.headers.cookie,
            parsedCookies: req.cookies ? Object.keys(req.cookies) : []
          }
        });
        return;
      }
      
      // Validate refresh token format
      if (!refreshToken.startsWith('eyJ')) {
        console.log('ERROR: Invalid refresh token format');
        res.status(401).json({
          error: 'Invalid refresh token format',
          message: 'Refresh token does not appear to be a valid JWT',
          code: 'INVALID_TOKEN_FORMAT'
        });
        return;
      }
      
      // Forward the request to the main API
      console.log('Forwarding to main API with refresh token');
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/refresh',
        { 
          refresh_token: refreshToken,
          silent: true // Flag to indicate this is a silent refresh
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            // Forward all cookies for context
            'Cookie': req.headers.cookie || ''
          }
        }
      );
      
      // If successful, update cookies silently
      if (response.data && response.data.access_token) {
        const secure = req.headers['x-forwarded-proto'] === 'https';
        const sameSite = 'lax';
        
        console.log('Silent refresh successful, setting new cookies');
        
        // Set new access token cookie
        res.cookie('access_token', response.data.access_token, {
          httpOnly: true,
          secure: secure,
          sameSite: sameSite,
          maxAge: 3600000, // 1 hour
          path: '/'
        });
        
        // Update refresh token if a new one is provided
        if (response.data.refresh_token) {
          res.cookie('refresh_token', response.data.refresh_token, {
            httpOnly: true,
            secure: secure,
            sameSite: sameSite,
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            path: '/'
          });
        }
        
        // Update authenticated flag
        res.cookie('authenticated', 'true', {
          httpOnly: false, // Accessible to JavaScript
          secure: secure,
          sameSite: sameSite,
          maxAge: 3600000, // 1 hour
          path: '/'
        });
        
        // Update user info if provided
        if (response.data.user) {
          res.cookie('user_info', JSON.stringify({
            id: response.data.user.id,
            email: response.data.user.email,
            session_id: response.data.session_id || 'silent_refresh'
          }), {
            httpOnly: false, // Accessible to JavaScript
            secure: secure,
            sameSite: sameSite,
            maxAge: 3600000, // 1 hour
            path: '/'
          });
        }
        
        // For silent refresh, return minimal response
        res.status(200).json({
          success: true,
          message: 'Token refreshed silently',
          expires_in: 3600, // 1 hour in seconds
          token_type: 'Bearer',
          refreshed_at: new Date().toISOString()
        });
      } else {
        throw new Error('Invalid response from auth server');
      }
      
    } catch (error) {
      console.log('Silent refresh error:', error.message);
      
      // Handle specific silent refresh errors
      if (error.response && error.response.status === 401) {
        // Clear all auth cookies on failed silent refresh
        const cookiesToClear = [
          'access_token', 
          'refresh_token', 
          'authenticated', 
          'user_info',
          'session_id',
          'csrf_token'
        ];
        
        const secure = req.headers['x-forwarded-proto'] === 'https';
        
        cookiesToClear.forEach(cookieName => {
          res.clearCookie(cookieName, { 
            path: '/',
            secure: secure,
            sameSite: 'lax'
          });
        });
        
        res.status(401).json({
          error: 'Silent refresh failed',
          message: 'Authentication required - please log in again',
          code: 'SILENT_REFRESH_FAILED',
          requires_login: true
        });
        return;
      }
      
      // For other errors, don't clear cookies but indicate failure
      res.status(500).json({
        error: 'Silent refresh temporarily unavailable',
        message: 'Unable to refresh token silently at this time',
        code: 'SILENT_REFRESH_ERROR',
        retry_recommended: true
      });
    }
  });
}

module.exports = refreshTokenSilent;