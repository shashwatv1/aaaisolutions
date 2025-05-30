const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * Enhanced function executor with improved authentication handling
 * Fixed issue with missing required claims in token
 */
async function functionExecutor(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      console.log('=== FUNCTION REQUEST DETAILS ===');
      console.log('Method:', req.method);
      console.log('Path:', req.path || 'N/A');
      
      // Extract function name with improved reliability
      let functionName = null;
      
      // Method 1: Extract from path parameters
      const pathParts = (req.path || req.url || '').split('/');
      const functionPathIndex = pathParts.findIndex(part => part === 'function');
      if (functionPathIndex >= 0 && functionPathIndex < pathParts.length - 1) {
        functionName = pathParts[functionPathIndex + 1];
        console.log('Extracted from path:', functionName);
      }
      
      // Method 2: Extract from query parameters
      if (!functionName && req.query && req.query.function_name) {
        functionName = req.query.function_name;
        console.log('Extracted from query params:', functionName);
      }
      
      // Method 3: Extract from request body
      if (!functionName && req.body && req.body.function_name) {
        functionName = req.body.function_name;
        console.log('Extracted from request body:', functionName);
      }
      
      if (!functionName) {
        console.error('❌ No function name found with any method');
        res.status(400).json({ 
          error: 'Function name is required',
          message: 'Please provide a function name in the URL path, query parameters, or request body',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      console.log(`🔍 Executing function: ${functionName}`);
      
      // Enhanced token extraction with detailed logging
      let accessToken = null;
      
      // PRIORITY 1: Extract from cookies (most reliable)
      if (req.cookies && req.cookies.access_token) {
        accessToken = req.cookies.access_token;
        console.log('✅ Access token found in cookies');
      }
      
      // PRIORITY 2: Parse cookie header manually if req.cookies failed
      if (!accessToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'access_token' && value) {
            accessToken = decodeURIComponent(value);
            console.log('✅ Access token found via cookie header parsing');
            break;
          }
        }
      }
      
      // PRIORITY 3: Check Authorization header
      if (!accessToken && req.headers.authorization) {
        const authHeader = req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          accessToken = authHeader.substring(7);
          console.log('✅ Access token found in Authorization header');
        }
      }
      
      if (!accessToken) {
        console.error('❌ No access token found');
        res.status(401).json({ 
          error: 'Authentication required',
          message: 'No access token found in cookies or Authorization header',
          code: 'MISSING_ACCESS_TOKEN',
          timestamp: new Date().toISOString()
        });
        return;
      }
      
      // Extract email from token for logging purposes
      let userEmail = 'unknown';
      try {
        // Decode token (without verification) to extract user info
        const tokenPayload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64').toString());
        userEmail = tokenPayload.email || tokenPayload.sub || 'unknown';
        
        // Log if user_id is missing (this is likely causing the authentication error)
        if (!tokenPayload.user_id && tokenPayload.id) {
          console.warn('⚠️ Token is missing user_id claim but has id claim');
        }
      } catch (e) {
        console.warn('⚠️ Could not decode token payload');
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
      
      console.log(`🚀 Executing function: ${functionName} for user: ${userEmail}`);
      
      // Create a new axios instance with enhanced headers
      const apiClient = axios.create({
        baseURL: 'https://api-server-559730737995.us-central1.run.app',
        headers: headers,
        timeout: 30000 // 30 second timeout
      });
      
      // Enhance request body with email if it's missing
      const enhancedRequestBody = { ...req.body };
      
      // Add email to the request if not present
      if (!enhancedRequestBody.email && userEmail !== 'unknown') {
        enhancedRequestBody.email = userEmail;
        console.log('✅ Added email to request body');
      }
      
      console.log('📊 Request body to forward:', JSON.stringify(enhancedRequestBody).substring(0, 500));
      
      // Forward the request to the API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        enhancedRequestBody
      );
      
      console.log(`✅ Function ${functionName} executed successfully`);
      
      // Return the API server response
      res.status(200).json(response.data);
      
    } catch (error) {
      // Enhanced error handling
      console.error(`💥 Function execution error:`, error.message);
      
      // Authentication errors
      if (error.response && error.response.status === 401) {
        console.error('💥 401 Authentication Error Details:');
        console.error('Response data:', error.response.data);
        
        return res.status(401).json({
          error: 'Authentication failed',
          message: error.response.data?.detail || error.response.data?.error || 'Invalid or expired access token',
          code: 'INVALID_ACCESS_TOKEN',
          timestamp: new Date().toISOString()
        });
      }
      
      // Validation errors
      if (error.response && error.response.status === 400) {
        console.error('💥 400 Validation Error Details:');
        console.error('Response data:', error.response.data);
        
        return res.status(400).json({
          error: 'Validation error',
          message: error.response.data?.detail || error.response.data?.error || 'Invalid request data',
          code: 'VALIDATION_ERROR',
          timestamp: new Date().toISOString()
        });
      }
      
      // Use error handler utility for other errors
      handleError(error, res);
    }
  });
}

module.exports = functionExecutor;