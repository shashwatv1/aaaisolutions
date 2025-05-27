const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Silent token refresh using cookies only
 * This endpoint attempts to refresh tokens using only HTTP-only cookies
 * without requiring explicit refresh token in request body
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
      
      // Get refresh token from cookies only (silent refresh)
      const refreshToken = req.cookies?.refresh_token;
      
      if (!refreshToken) {
        res.status(401).json({ 
          error: 'No refresh token available',
          message: 'No refresh token found in cookies for silent refresh',
          code: 'NO_REFRESH_TOKEN'
        });
        return;
      }
      
      // Forward the request to the main API
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
            session_id: response.data.session_id
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
        
        cookiesToClear.forEach(cookieName => {
          res.clearCookie(cookieName, { path: '/' });
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