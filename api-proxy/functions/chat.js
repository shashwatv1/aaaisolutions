const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Handle chat API requests
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
      
      // Forward the request to the main API
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/api/chat',
        req.body,
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