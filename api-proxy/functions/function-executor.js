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
      
      // FIXED: Extract function name from URL path instead of request body
      const urlPath = req.url || req.path || '';
      console.log('Request URL path:', urlPath);
      
      // Extract function name from path like /api/function/get_user_creds or /function/get_user_creds
      let functionName = null;
      
      if (urlPath.includes('/api/function/')) {
        functionName = urlPath.split('/api/function/')[1]?.split('?')[0];
      } else if (urlPath.includes('/function/')) {
        functionName = urlPath.split('/function/')[1]?.split('?')[0];
      }
      
      // Fallback: check request body (for backward compatibility)
      if (!functionName && req.body.function_name) {
        functionName = req.body.function_name;
        console.log('Using function name from request body (fallback)');
      }
      
      console.log('Extracted function name:', functionName);
      
      if (!functionName) {
        console.error('No function name found in URL path or request body');
        console.error('URL path:', urlPath);
        console.error('Request body keys:', Object.keys(req.body || {}));
        
        res.status(400).json({ 
          error: 'Function name is required',
          debug: {
            urlPath: urlPath,
            bodyKeys: Object.keys(req.body || {}),
            expectedFormat: '/api/function/{functionName}'
          }
        });
        return;
      }
      
      // Extract access token from cookies or Authorization header
      let accessToken = null;
      
      // Method 1: Check cookies first (preferred for web clients)
      if (req.cookies && req.cookies.access_token) {
        accessToken = req.cookies.access_token;
        console.log('Access token found in cookies');
      }
      
      // Method 2: Check Authorization header as fallback
      if (!accessToken && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        accessToken = req.headers.authorization.replace('Bearer ', '');
        console.log('Access token found in Authorization header');
      }
      
      // Method 3: Parse cookie header manually if req.cookies failed
      if (!accessToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'access_token' && value) {
            accessToken = decodeURIComponent(value);
            console.log('Access token found via cookie header parsing');
            break;
          }
        }
      }
      
      if (!accessToken) {
        console.error('No access token found in cookies or headers');
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'No access token found in cookies or Authorization header',
          code: 'MISSING_ACCESS_TOKEN'
        });
        return;
      }
      
      // Build headers with both API key and access token
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${accessToken}`
      };
      
      // Forward original cookies for additional context
      if (req.headers.cookie) {
        headers['Cookie'] = req.headers.cookie;
      }
      
      console.log(`Executing function: ${functionName} with authentication`);
      
      // Create a new axios instance with enhanced headers
      const apiClient = axios.create({
        baseURL: 'https://api-server-559730737995.us-central1.run.app',
        headers: headers
      });
      
      // FIXED: Create clean request body without function_name (since it's in the URL)
      const cleanRequestBody = { ...req.body };
      delete cleanRequestBody.function_name; // Remove function_name if it exists
      
      console.log('Request body to forward:', cleanRequestBody);
      
      // Forward the request to the API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        cleanRequestBody // Send clean body without function_name
      );
      
      console.log(`Function ${functionName} executed successfully`);
      
      // Return the API server response
      res.status(200).json(response.data);
      
    } catch (error) {
      console.error('Function execution error:', error);
      
      // Handle specific authentication errors
      if (error.response && error.response.status === 401) {
        res.status(401).json({
          error: 'Authentication failed',
          message: 'Invalid or expired access token',
          code: 'INVALID_ACCESS_TOKEN',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Handle other errors
      const statusCode = error.response?.status || 500;
      const errorMessage = error.response?.data?.detail || 
                          error.response?.data?.error || 
                          error.message || 
                          'Internal server error';
      
      res.status(statusCode).json({ 
        error: errorMessage,
        timestamp: new Date().toISOString(),
        function_name: req.body.function_name || 'unknown'
      });
    }
  });
}

module.exports = functionExecutor;