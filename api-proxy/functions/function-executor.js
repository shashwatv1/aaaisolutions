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
      
      console.log('=== DEBUGGING URL EXTRACTION ===');
      console.log('req.url:', req.url);
      console.log('req.path:', req.path);
      console.log('req.originalUrl:', req.originalUrl);
      console.log('req.query:', req.query);
      
      let functionName = null;
      
      if (!functionName && req.query && req.query.function_name) {
        functionName = req.query.function_name;
        console.log('Extracted from query params:', functionName);
      }
      
      console.log('=== FINAL FUNCTION NAME ===');
      console.log('Function name:', functionName);
      
      if (!functionName) {
        console.error('❌ No function name found with any method');
        res.status(400).json({ 
          error: 'Function name is required',
          debug: {
            urlPath: urlPath,
            originalUrl: originalUrl,
            query: req.query,
            bodyKeys: Object.keys(req.body || {}),
            expectedFormats: [
              '/api/function/{functionName}',
              '/?function_name={functionName}',
              'Body: {"function_name": "functionName"}'
            ]
          }
        });
        return;
      }
      
      // FIXED: Extract access token with correct priority (cookies first)
      let accessToken = null;
      
      console.log('=== TOKEN EXTRACTION DEBUG ===');
      console.log('Cookies available:', !!req.cookies);
      console.log('Cookie keys:', req.cookies ? Object.keys(req.cookies) : []);
      console.log('Authorization header:', !!req.headers.authorization);
      
      // PRIORITY 2: Parse cookie header manually if req.cookies failed
      if (!accessToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'access_token' && value) {
            accessToken = decodeURIComponent(value);
            console.log('✅ Access token found via cookie header parsing (USER TOKEN)');
            break;
          }
        }
      }
      
      console.log('=== FINAL TOKEN SELECTION ===');
      console.log('Final access token source:', accessToken ? 
        (req.cookies?.access_token ? 'cookies' : 
         req.headers.cookie?.includes('access_token') ? 'cookie-header' : 'authorization-header') 
        : 'none');
      
      if (!accessToken) {
        console.error('❌ No access token found');
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'No access token found in cookies or Authorization header',
          code: 'MISSING_ACCESS_TOKEN',
          debug: {
            hasCookies: !!req.cookies,
            hasCookieHeader: !!req.headers.cookie,
            hasAuthHeader: !!req.headers.authorization
          }
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
      
      console.log(`🚀 Executing function: ${functionName} with authentication`);
      console.log('Token being sent to API server starts with:', accessToken.substring(0, 20) + '...');
      
      // Create a new axios instance with enhanced headers
      const apiClient = axios.create({
        baseURL: 'https://api-server-559730737995.us-central1.run.app',
        headers: headers
      });
      
      // Create clean request body without function_name
      const cleanRequestBody = { ...req.body };
      delete cleanRequestBody.function_name; // Remove function_name if it exists
      
      console.log('📊 Request body to forward:', cleanRequestBody);
      
      // Forward the request to the API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        cleanRequestBody
      );
      
      console.log(`✅ Function ${functionName} executed successfully`);
      
      // Return the API server response
      res.status(200).json(response.data);
      
    } catch (error) {
      console.error('💥 Function execution error:', error);
      
      // Handle specific authentication errors
      if (error.response && error.response.status === 401) {
        console.error('💥 401 Authentication Error Details:');
        console.error('Response data:', error.response.data);
        
        res.status(401).json({
          error: 'Authentication failed',
          message: error.response.data?.detail || 'Invalid or expired access token',
          code: 'INVALID_ACCESS_TOKEN',
          timestamp: new Date().toISOString(),
          debug: {
            apiServerResponse: error.response.data,
            tokenSource: 'check logs above for token source'
          }
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
        function_name: functionName || 'unknown'
      });
    }
  });
}

module.exports = functionExecutor;