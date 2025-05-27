const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Refresh access token using refresh token
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
      
      // Get refresh token from request body or cookies
      let refreshToken = req.body.refresh_token;
      
      if (!refreshToken && req.cookies) {
        refreshToken = req.cookies.refresh_token;
      }
      
      if (!refreshToken) {
        res.status(400).json({ 
          error: 'Refresh token is required',
          message: 'No refresh token provided in request body or cookies'
        });
        return;
      }
      
      // Forward the request to the main API
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/refresh',
        { refresh_token: refreshToken },
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
            session_id: response.data.session_id
          }), {
            httpOnly: false, // Accessible to JavaScript
            secure: secure,
            sameSite: sameSite,
            maxAge: 3600000, // 1 hour
            path: '/'
          });
        }
      }
      
      // Return the response to the client
      res.status(200).json(response.data);
      
    } catch (error) {
      // Handle specific token refresh errors
      if (error.response && error.response.status === 401) {
        // Clear cookies on invalid refresh token
        const cookiesToClear = ['access_token', 'refresh_token', 'authenticated', 'user_info'];
        cookiesToClear.forEach(cookieName => {
          res.clearCookie(cookieName, { path: '/' });
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