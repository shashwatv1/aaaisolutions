const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');
const jwt = require('jsonwebtoken');

/**
 * Generate a temporary WebSocket authentication token
 * This resolves the cross-origin cookie issue with WebSockets
 */
async function getWebSocketToken(req, res) {
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
      console.log('=== WebSocket Token Request ===');
      console.log('Headers received:', JSON.stringify(req.headers, null, 2));
      console.log('Cookies received:', req.cookies);
      
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      // Get authorization header from request
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header missing' });
        return;
      }
      
      // Validate session with main API
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/validate-session',
        {},
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': authHeader,
            'Cookie': req.headers.cookie || ''
          }
        }
      );
      
      // Check if validation was successful
      if (!response.data.valid) {
        res.status(401).json({ 
          error: 'Invalid session',
          message: response.data.reason || 'Session validation failed'
        });
        return;
      }
      
      // Extract user info from validation response
      const userInfo = response.data.user_info;
      if (!userInfo || !userInfo.id || !userInfo.email) {
        res.status(500).json({ error: 'User information not available' });
        return;
      }
      
      // Generate a temporary token (valid for 5 minutes)
      const wsTokenSecret = await getSecret('ws-token-secret');
      const expiresIn = 5 * 60; // 5 minutes in seconds
      
      const token = jwt.sign(
        {
          user_id: userInfo.id,
          email: userInfo.email,
          exp: Math.floor(Date.now() / 1000) + expiresIn,
          purpose: 'websocket_auth',
          iat: Math.floor(Date.now() / 1000)
        },
        wsTokenSecret
      );
      
      // Return the temporary token
      res.status(200).json({
        success: true,
        token: token,
        expires_in: expiresIn,
        user_id: userInfo.id
      });
      
    } catch (error) {
      console.error('WebSocket token error:', error);
      handleError(error, res);
    }
  });
}
module.exports = getWebSocketToken;