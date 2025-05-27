const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * ENHANCED: Refresh access token using refresh token with better error handling
 */
async function refreshToken(req, res) {
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
      
      console.log('=== STANDARD REFRESH DEBUG ===');
      console.log('Request body:', req.body);
      console.log('Cookies received:', req.cookies);
      
      // Enhanced refresh token extraction
      let refreshToken = null;
      
      // Method 1: Request body (explicit refresh)
      if (req.body && req.body.refresh_token) {
        refreshToken = req.body.refresh_token;
        console.log('Found refresh token in request body');
      }
      
      // Method 2: Cookies (fallback)
      if (!refreshToken && req.cookies && req.cookies.refresh_token) {
        refreshToken = req.cookies.refresh_token;
        console.log('Found refresh token in cookies');
      }
      
      // Method 3: Parse cookie header manually
      if (!refreshToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'refresh_token' && value) {
            refreshToken = decodeURIComponent(value);
            console.log('Found refresh token via cookie header parsing');
            break;
          }
        }
      }
      
      console.log('Final refresh token found:', !!refreshToken);
      console.log('Refresh token length:', refreshToken ? refreshToken.length : 0);
      
      if (!refreshToken) {
        console.log('ERROR: No refresh token found');
        res.status(400).json({ 
          error: 'Refresh token is required',
          message: 'No refresh token provided in request body or cookies',
          code: 'MISSING_REFRESH_TOKEN',
          debug: {
            hasBody: !!req.body,
            hasCookies: !!req.cookies,
            bodyKeys: req.body ? Object.keys(req.body) : [],
            cookieKeys: req.cookies ? Object.keys(req.cookies) : []
          }
        });
        return;
      }
      
      // Validate refresh token format
      if (!refreshToken.startsWith('eyJ')) {
        console.log('ERROR: Invalid refresh token format');
        res.status(400).json({
          error: 'Invalid refresh token format',
          message: 'Refresh token does not appear to be a valid JWT',
          code: 'INVALID_TOKEN_FORMAT'
        });
        return;
      }
      
      // Forward the request to the main API
      console.log('Forwarding to main API for token refresh');
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/refresh',
        { 
          refresh_token: refreshToken,
          silent: req.body.silent || false
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            // Forward original cookies for session context
            'Cookie': req.headers.cookie || ''
          }
        }
      );
      
      // If successful, set new cookies
      if (response.data && response.data.access_token) {
        const secure = req.headers['x-forwarded-proto'] === 'https';
        const sameSite = 'lax';
        
        console.log('Token refresh successful, setting cookies');
        
        // Set access token cookie (shorter expiry)
        res.cookie('access_token', response.data.access_token, {
          httpOnly: true,
          secure: secure,
          sameSite: sameSite,
          maxAge: 3600000, // 1 hour
          path: '/'
        });
        
        // Update refresh token if provided
        if (response.data.refresh_token) {
          res.cookie('refresh_token', response.data.refresh_token, {
            httpOnly: true,
            secure: secure,
            sameSite: sameSite,
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
            path: '/'
          });
        }
        
        // Set authenticated flag
        res.cookie('authenticated', 'true', {
          httpOnly: false, // Accessible to JavaScript
          secure: secure,
          sameSite: sameSite,
          maxAge: 3600000, // 1 hour
          path: '/'
        });
        
        // Update user info cookie if provided
        if (response.data.user) {
          res.cookie('user_info', JSON.stringify({
            id: response.data.user.id,
            email: response.data.user.email,
            session_id: response.data.session_id || 'refreshed_session'
          }), {
            httpOnly: false, // Accessible to JavaScript
            secure: secure,
            sameSite: sameSite,
            maxAge: 3600000, // 1 hour
            path: '/'
          });
        }
        
        console.log('All cookies set successfully');
      }
      
      // Return the response to the client
      res.status(200).json(response.data);
      
    } catch (error) {
      console.log('Standard refresh error:', error.message);
      
      // Handle specific token refresh errors
      if (error.response && error.response.status === 401) {
        // Clear cookies on invalid refresh token
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
          error: 'Invalid or expired refresh token',
          message: 'Please log in again',
          code: 'REFRESH_TOKEN_INVALID'
        });
        return;
      }
      
      handleError(error, res);
    }
  });
}

module.exports = refreshToken;