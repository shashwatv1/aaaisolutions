const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {validateJWTMiddleware, extractBearerToken} = require('../utils/jwt-utils');

/**
 * Simplified JWT-based Function Executor
 * Uses Bearer tokens instead of complex cookie parsing
 */
async function functionExecutor(req, res) {
  // Declare functionName outside try-catch to avoid scoping issues
  let functionName = null;
  
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      console.log('🚀 JWT-based function execution starting...');
      console.log('📍 Request URL:', req.url);
      console.log('📍 Request path:', req.path);
      console.log('📍 Request originalUrl:', req.originalUrl);
      
      // Extract function name - prioritize query parameter first
      console.log('🔍 Request details:');
      console.log('  URL:', req.url);
      console.log('  Path:', req.path);
      console.log('  Query:', req.query);
      console.log('  OriginalUrl:', req.originalUrl);
      
      // Method 1: Check query parameter first (most reliable)
      if (req.query?.function_name) {
        functionName = req.query.function_name.trim();
        console.log('✅ Function name extracted from query params:', functionName);
      }
      
      // Method 2: Extract from URL path (e.g., /api/function/functionName)
      if (!functionName) {
        const urlPath = req.url || req.path || req.originalUrl || '';
        // Split by '?' to remove query parameters, then extract function name
        const pathOnly = urlPath.split('?')[0];
        const pathMatch = pathOnly.match(/\/api\/function\/([^\/]+)$/);
        if (pathMatch && pathMatch[1]) {
          functionName = decodeURIComponent(pathMatch[1]).trim();
          console.log('✅ Function name extracted from URL path:', functionName);
        }
      }
      
      // Method 3: Additional fallback - check if path ends with function name
      if (!functionName) {
        const urlPath = req.url || req.path || req.originalUrl || '';
        const pathOnly = urlPath.split('?')[0];
        const pathParts = pathOnly.split('/').filter(part => part.trim());
        
        if (pathParts.length > 0) {
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart && lastPart !== 'function' && lastPart !== 'api') {
            functionName = lastPart.trim();
            console.log('✅ Function name extracted from path end:', functionName);
          }
        }
      }
      
      if (!functionName) {
        console.error('❌ No function name found');
        console.error('📍 URL analysis failed for:', urlPath);
        return res.status(400).json({ 
          error: 'Function name is required',
          code: 'MISSING_FUNCTION_NAME',
          debug: {
            urlPath: urlPath,
            pathMatch: pathMatch,
            queryParams: req.query
          },
          expected_formats: [
            'URL: /api/function/{functionName}',
            'Query: ?function_name={functionName}'
          ]
        });
      }
      
      // Extract JWT token from Authorization header
      const accessToken = extractBearerToken(req.headers.authorization);
      
      if (!accessToken) {
        console.error('❌ No JWT token found in Authorization header');
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'Bearer token required in Authorization header',
          code: 'MISSING_BEARER_TOKEN',
          expected_format: 'Authorization: Bearer {jwt_token}'
        });
      }
      
      console.log(`🎟️ JWT token found, executing function: ${functionName}`);
      console.log('Token preview:', accessToken.substring(0, 20) + '...');
      
      // Build headers for API server
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${accessToken}`
      };
      
      // Create API client
      const apiClient = axios.create({
        baseURL: 'https://api-server-559730737995.us-central1.run.app',
        headers: headers,
        timeout: 60000
      });
      
      // Prepare request body (remove function_name if present)
      const requestBody = { ...req.body };
      delete requestBody.function_name;
      
      console.log('📡 Making request to API server...');
      console.log('Function:', functionName);
      console.log('Body keys:', Object.keys(requestBody));
      
      // Execute function on API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        requestBody
      );
      
      console.log(`✅ Function ${functionName} executed successfully`);
      console.log('Response status:', response.status);
      
      // Return the API server response
      res.status(200).json(response.data);
      
    } catch (error) {
      console.error('💥 Function execution error:', error);
      
      // Handle JWT validation errors (401)
      if (error.response?.status === 401) {
        const errorData = error.response.data || {};
        
        console.error('💥 Authentication error from API server:', errorData);
        
        return res.status(401).json({
          error: 'Authentication failed',
          message: errorData.detail || 'Invalid or expired JWT token',
          code: 'JWT_AUTHENTICATION_FAILED',
          expired: errorData.expired || false,
          timestamp: new Date().toISOString()
        });
      }
      
      // Handle timeout errors
      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({
          error: 'Function execution timeout',
          code: 'EXECUTION_TIMEOUT',
          function_name: functionName || 'unknown'
        });
      }
      
      // Handle other HTTP errors
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data || {};
        
        return res.status(statusCode).json({
          error: errorData.detail || errorData.error || errorData.message || 'Function execution failed',
          code: errorData.code || 'API_ERROR',
          function_name: functionName || 'unknown',
          timestamp: new Date().toISOString()
        });
      }
      
      // Handle network and other errors
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        function_name: functionName || 'unknown',
        timestamp: new Date().toISOString()
      });
    }
  });
}

module.exports = functionExecutor;