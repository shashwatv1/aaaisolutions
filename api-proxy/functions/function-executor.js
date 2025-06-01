const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {validateJWTMiddleware, extractBearerToken} = require('../utils/jwt-utils');

/**
 * Enhanced JWT-based Function Executor
 * Validates user JWT tokens (not service account tokens)
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
      
      console.log('🚀 Enhanced JWT-based function execution starting...');
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
        return res.status(400).json({ 
          error: 'Function name is required',
          code: 'MISSING_FUNCTION_NAME',
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
      
      // Parse and validate JWT token payload
      let tokenPayload;
      try {
        tokenPayload = parseJWTPayload(accessToken);
        console.log('🔍 Token payload parsed successfully');
        console.log('Token claims:', {
          email: tokenPayload.email || 'not present',
          user_id: tokenPayload.user_id || 'not present',
          iss: tokenPayload.iss || 'not present',
          aud: tokenPayload.aud || 'not present',
          token_type: tokenPayload.token_type || 'not present',
          exp: tokenPayload.exp || 'not present'
        });
        
      } catch (parseError) {
        console.error('❌ Failed to parse JWT token:', parseError.message);
        return res.status(401).json({
          error: 'Invalid token format',
          message: 'JWT token could not be parsed',
          code: 'INVALID_JWT_FORMAT'
        });
      }
      
      // Enhanced validation for user tokens
      const validationResult = validateUserToken(tokenPayload);
      if (!validationResult.valid) {
        console.error('❌ Token validation failed:', validationResult.reason);
        return res.status(401).json({
          error: 'Invalid token type',
          message: validationResult.reason,
          code: validationResult.code
        });
      }
      
      console.log(`🎟️ Valid user JWT token confirmed, executing function: ${functionName}`);
      console.log('User email:', tokenPayload.email);
      console.log('User ID:', tokenPayload.user_id);
      
      // Build headers for API server
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'X-Token-Type': 'user_jwt'
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
      
      console.log('📡 Making request to API server with user JWT...');
      console.log('Function:', functionName);
      console.log('Body keys:', Object.keys(requestBody));
      
      // Execute function on API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        requestBody
      );
      
      console.log(`✅ Function ${functionName} executed successfully with user JWT`);
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
          message: errorData.detail || 'Invalid or expired user JWT token',
          code: 'USER_JWT_AUTHENTICATION_FAILED',
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

/**
 * Enhanced JWT payload parser with proper base64 handling
 */
function parseJWTPayload(token) {
  try {
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a valid string');
    }
    
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format - must have 3 parts');
    }
    
    const payload = parts[1];
    
    // Proper base64 padding and decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const base64Decoded = paddedPayload.replace(/-/g, '+').replace(/_/g, '/');
    
    // Use Buffer for Node.js environment
    const decoded = Buffer.from(base64Decoded, 'base64').toString('utf8');
    
    const parsed = JSON.parse(decoded);
    
    // Basic structure validation
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JWT payload structure');
    }
    
    return parsed;
    
  } catch (error) {
    throw new Error(`Failed to parse JWT payload: ${error.message}`);
  }
}

/**
 * Enhanced user token validation
 */
function validateUserToken(payload) {
  // Check for required user token fields
  if (!payload.email) {
    return {
      valid: false,
      reason: 'User token must contain email claim',
      code: 'MISSING_EMAIL_CLAIM'
    };
  }
  
  if (!payload.user_id) {
    return {
      valid: false,
      reason: 'User token must contain user_id claim',
      code: 'MISSING_USER_ID_CLAIM'
    };
  }
  
  // Check for service account indicators in email
  if (payload.email.includes('@developer.gserviceaccount.com') || 
      payload.email.includes('@') && payload.email.includes('.gserviceaccount.com')) {
    return {
      valid: false,
      reason: 'Service account tokens are not allowed for user operations',
      code: 'SERVICE_ACCOUNT_TOKEN_REJECTED'
    };
  }
  
  // Check for service account indicators in issuer
  if (payload.iss && (
    payload.iss.includes('serviceaccount') ||
    payload.iss.includes('gserviceaccount')
  )) {
    return {
      valid: false,
      reason: 'Service account issued tokens are not allowed for user operations',
      code: 'SERVICE_ACCOUNT_ISSUER_REJECTED'
    };
  }
  
  // Check for explicit service account token type
  if (payload.token_type === 'service_account') {
    return {
      valid: false,
      reason: 'Explicitly marked service account tokens are not allowed',
      code: 'EXPLICIT_SERVICE_ACCOUNT_REJECTED'
    };
  }
  
  // Check for Google service account specific patterns
  if (payload.aud && payload.aud.includes('gserviceaccount')) {
    return {
      valid: false,
      reason: 'Google service account audience tokens are not allowed',
      code: 'GOOGLE_SERVICE_ACCOUNT_AUDIENCE_REJECTED'
    };
  }
  
  // Check token expiration
  if (payload.exp && typeof payload.exp === 'number') {
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return {
        valid: false,
        reason: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      };
    }
  }
  
  // Additional validation for user email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(payload.email)) {
    return {
      valid: false,
      reason: 'Invalid email format in token',
      code: 'INVALID_EMAIL_FORMAT'
    };
  }
  
  // Check for reasonable user_id format (should be UUID or similar)
  if (typeof payload.user_id !== 'string' || payload.user_id.length < 10) {
    return {
      valid: false,
      reason: 'Invalid user_id format in token',
      code: 'INVALID_USER_ID_FORMAT'
    };
  }
  
  // All validations passed
  return {
    valid: true,
    reason: 'Valid user token',
    code: 'VALID_USER_TOKEN'
  };
}

module.exports = functionExecutor;