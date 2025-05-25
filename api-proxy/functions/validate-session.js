// Create a new file: api-proxy/functions/validate-session.js
const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Validate user session
 */
async function validateSession(req, res) {
  // Handle CORS
  return cors(req, res, async () => {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      // Get authorization header from request
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        res.status(401).json({ error: 'Authorization header missing', valid: false });
        return;
      }
      
      // Forward the request to the main API
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/validate-session',
        req.body || {},
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': authHeader,
            // Forward cookies if needed
            'Cookie': req.headers.cookie || ''
          }
        }
      );
      
      // Return the response to the client
      res.status(200).json(response.data);
    } catch (error) {
      // Return a proper session validation response even on error
      if (error.response && error.response.status === 401) {
        res.status(401).json({ valid: false, reason: "Unauthorized" });
      } else {
        handleError(error, res);
      }
    }
  });
}

module.exports = validateSession;