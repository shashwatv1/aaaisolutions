const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Verify OTP and get access token
 */
async function verifyOTP(req, res) {
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
      
      // Forward the request to the main API
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/verify-otp',
        req.body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          }
        }
      );
      
      // If successful, set authentication cookies
      if (response.data && response.data.access_token) {
        const secure = req.headers['x-forwarded-proto'] === 'https';
        const sameSite = 'lax';
        
        // Set access token cookie
        res.cookie('access_token', response.data.access_token, {
          httpOnly: true,
          secure: secure,
          sameSite: sameSite,
          maxAge: 3600000, // 1 hour
          path: '/'
        });
        
        // Set refresh token cookie if provided
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
        
        // Set user info cookie
        res.cookie('user_info', JSON.stringify({
          id: response.data.id,
          email: req.body.email,
          session_id: response.data.session_id || 'default_session'
        }), {
          httpOnly: false, // Accessible to JavaScript
          secure: secure,
          sameSite: sameSite,
          maxAge: 3600000, // 1 hour
          path: '/'
        });
      }
      
      // Return the response to the client
      res.status(200).json(response.data);
    } catch (error) {
      handleError(error, res);
    }
  });
}

module.exports = verifyOTP;