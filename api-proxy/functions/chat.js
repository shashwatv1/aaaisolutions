const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Handle chat API requests with proper delivery_status initialization
 */
async function chat(req, res) {
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
      
      // Get authorization header from request
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header missing' });
        return;
      }
      
      // Extract user info from JWT token for proper message attribution
      let userInfo = null;
      try {
        const token = authHeader.replace('Bearer ', '');
        const tokenParts = token.split('.');
        if (tokenParts.length === 3) {
          const payloadPart = tokenParts[1];
          const paddedPayload = payloadPart + '='.repeat((4 - payloadPart.length % 4) % 4);
          const decoded = Buffer.from(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          const payload = JSON.parse(decoded);
          
          userInfo = {
            user_id: payload.user_id,
            email: payload.email
          };
        }
      } catch (error) {
        console.warn('Failed to extract user info from JWT:', error);
      }
      
      // Enhanced request body with delivery_status
      const enhancedBody = {
        ...req.body,
        _delivery_status: 'pending_delivery',  // Set delivery status for HTTP messages
        _source: 'http_api',
        _user_info: userInfo
      };
      
      // Forward the request to the main API
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/api/chat',
        enhancedBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': authHeader
          }
        }
      );
      
      // Return the response to the client
      res.status(200).json(response.data);
    } catch (error) {
      handleError(error, res);
    }
  });
}

module.exports = chat;