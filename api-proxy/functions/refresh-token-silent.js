const cors = require('cors')({origin: true});
const axios = require('axios');
const {getSecret} = require('../utils/secret-manager');

/**
 * UPDATED: Silent Token Refresh for 7-day sessions
 * Enhanced with 6-hour access tokens and better cookie management
 */
async function refreshTokenSilent(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      console.log('🔄 Silent refresh request initiated for 7-day session');
      
      // Get API key for internal requests
      const apiKey = await getSecret('INTERNAL_API_KEY');
      if (!apiKey) {
        throw new Error('Internal API key not configured');
      }
      
      // Extract refresh token from cookies
      const refreshToken = req.cookies?.refresh_token;
      
      console.log('Cookies received:', !!req.cookies);
      console.log('Refresh token present:', !!refreshToken);
      console.log('Refresh token length:', refreshToken ? refreshToken.length : 0);
      
      if (!refreshToken) {
        console.log('ERROR: No refresh token found for silent refresh');
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
      console.log('Forwarding to main API with refresh token for 6-hour access token');
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
      
      // UPDATED: If successful, update cookies with 6-hour access token
      if (response.data && response.data.tokens && response.data.tokens.access_token) {
        const secure = req.headers['x-forwarded-proto'] === 'https';
        const sameSite = 'lax';
        
        console.log('Silent refresh successful, setting new 6-hour cookies');
        
        // UPDATED: Set new 6-hour access token cookie
        res.cookie('access_token', response.data.tokens.access_token, {
          httpOnly: true,
          secure: secure,
          sameSite: sameSite,
          maxAge: 21600000, // 6 hours in milliseconds (was 3600000)
          path: '/'
        });
        
        // Update refresh token if a new one is provided
        if (response.data.tokens.refresh_token) {
          res.cookie('refresh_token', response.data.tokens.refresh_token, {
            httpOnly: true,
            secure: secure,
            sameSite: sameSite,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days (was 30 days)
            path: '/'
          });
        }
        
        // UPDATED: Update authenticated flag with 6-hour expiry
        res.cookie('authenticated', 'true', {
          httpOnly: false, // Accessible to JavaScript
          secure: secure,
          sameSite: sameSite,
          maxAge: 21600000, // 6 hours (was 3600000)
          path: '/'
        });
        
        // UPDATED: Update user info if provided with 6-hour expiry
        if (response.data.user) {
          res.cookie('user_info', JSON.stringify({
            id: response.data.user.id,
            email: response.data.user.email,
            session_id: response.data.user.session_id || 'silent_refresh'
          }), {
            httpOnly: false, // Accessible to JavaScript
            secure: secure,
            sameSite: sameSite,
            maxAge: 21600000, // 6 hours (was 3600000)
            path: '/'
          });
        }
        
        // UPDATED: Return minimal response with 6-hour token info
        res.status(200).json({
          success: true,
          message: 'Token refreshed silently for 7-day session',
          expires_in: 21600, // 6 hours in seconds (was 3600)
          token_type: 'Bearer',
          session_duration: '7 days',
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
          message: 'Session expired - please log in again for new 7-day session',
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