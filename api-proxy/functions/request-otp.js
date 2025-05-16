const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Request OTP for authentication
 */
async function requestOTP(req, res) {
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
        'https://api-server-559730737995.us-central1.run.app/auth/request-otp',
        req.body,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
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

module.exports = requestOTP;