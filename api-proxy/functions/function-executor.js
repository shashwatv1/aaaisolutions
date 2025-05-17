const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

async function functionExecutor(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      // Get function name from request
      const functionName = req.body.function_name;
      if (!functionName) {
        res.status(400).json({ error: 'Function name is required' });
        return;
      }
      
      // Create a new axios instance with clean headers
      const apiClient = axios.create({
        baseURL: 'https://api-server-559730737995.us-central1.run.app',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        }
      });
      
      // Forward the request to the API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        req.body
      );
      
      // Return the API server response
      res.status(200).json(response.data);
      
    } catch (error) {
      console.error('Function execution error:', error);
      
      // Handle errors
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.detail || error.message || 'Internal server error';
      
      res.status(statusCode).json({ 
        error: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });
}

module.exports = functionExecutor;