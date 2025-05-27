const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Logout user and invalidate all tokens
 */
async function logout(req, res) {
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
      
      // Get tokens from various sources
      const accessToken = req.cookies?.access_token || 
                         req.headers.authorization?.replace('Bearer ', '');
      const refreshToken = req.cookies?.refresh_token || req.body.refresh_token;
      
      // Prepare logout request data
      const logoutData = {};
      if (accessToken) logoutData.access_token = accessToken;
      if (refreshToken) logoutData.refresh_token = refreshToken;
      
      // Always attempt server-side logout, even if tokens are missing
      let serverLogoutSuccess = false;
      try {
        const response = await axios.post(
          'https://api-server-559730737995.us-central1.run.app/auth/logout',
          logoutData,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
              // Include authorization header if available
              ...(accessToken && { 'Authorization': `Bearer ${accessToken}` }),
              // Forward cookies for session context
              'Cookie': req.headers.cookie || ''
            },
            timeout: 10000 // 10 second timeout
          }
        );
        
        serverLogoutSuccess = response.status === 200;
      } catch (serverError) {
        // Log the error but continue with client-side cleanup
        console.warn('Server-side logout failed:', serverError.message);
        // Don't throw here - we still want to clear cookies
      }
      
      // Clear all authentication cookies regardless of server response
      const cookiesToClear = [
        'access_token',
        'refresh_token', 
        'authenticated',
        'user_info',
        'user_preferences',
        'session_id',
        'csrf_token',
        'websocket_id'
      ];
      
      const secure = req.headers['x-forwarded-proto'] === 'https';
      
      cookiesToClear.forEach(cookieName => {
        // Clear with multiple path variations to ensure cleanup
        res.clearCookie(cookieName, { 
          path: '/',
          httpOnly: true,
          secure: secure,
          sameSite: 'lax'
        });
        
        // Also clear without httpOnly for JavaScript-accessible cookies
        res.clearCookie(cookieName, { 
          path: '/',
          httpOnly: false,
          secure: secure,
          sameSite: 'lax'
        });
      });
      
      // Set a logout confirmation cookie that expires quickly
      res.cookie('logged_out', 'true', {
        httpOnly: false,
        secure: secure,
        sameSite: 'lax',
        maxAge: 5000, // 5 seconds
        path: '/'
      });
      
      // Return success response
      res.status(200).json({
        success: true,
        message: 'Logout successful',
        server_logout: serverLogoutSuccess,
        cookies_cleared: cookiesToClear,
        logged_out_at: new Date().toISOString(),
        redirect_recommended: '/login.html'
      });
      
    } catch (error) {
      // Even if there's an error, we should still try to clear cookies
      const cookiesToClear = [
        'access_token',
        'refresh_token', 
        'authenticated',
        'user_info',
        'user_preferences',
        'session_id',
        'csrf_token',
        'websocket_id'
      ];
      
      const secure = req.headers['x-forwarded-proto'] === 'https';
      
      cookiesToClear.forEach(cookieName => {
        res.clearCookie(cookieName, { 
          path: '/',
          secure: secure,
          sameSite: 'lax'
        });
      });
      
      // Return partial success
      res.status(200).json({
        success: true,
        message: 'Logout completed with errors',
        cookies_cleared: cookiesToClear,
        server_error: error.message,
        logged_out_at: new Date().toISOString(),
        redirect_recommended: '/login.html'
      });
    }
  });
}

module.exports = logout;