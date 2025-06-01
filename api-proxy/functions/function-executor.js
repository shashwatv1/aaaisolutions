const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

/**
 * FIXED JWT-based Function Executor
 * Correctly extracts user token from x-forwarded-authorization
 */
async function functionExecutor(req, res) {
  let functionName = null;
  
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      const apiKey = await getSecret('api-key');
      
      console.log('🚀 FIXED JWT-based function execution starting...');
      
      // Extract function name
      if (req.query?.function_name) {
        functionName = req.query.function_name.trim();
        console.log('✅ Function name:', functionName);
      }
      
      if (!functionName) {
        console.error('❌ No function name found');
        return res.status(400).json({ 
          error: 'Function name is required',
          code: 'MISSING_FUNCTION_NAME'
        });
      }
      
      // DEBUGGING: Check all auth-related headers
      console.log('🔍 Auth headers check:');
      console.log('  authorization:', req.headers.authorization ? 'present' : 'missing');
      console.log('  x-forwarded-authorization:', req.headers['x-forwarded-authorization'] ? 'present' : 'missing');
      
      // EXPLICIT: Extract user token from x-forwarded-authorization ONLY
      let accessToken = null;
      let tokenSource = 'none';
      
      if (req.headers['x-forwarded-authorization'] && req.headers['x-forwarded-authorization'].startsWith('Bearer ')) {
        accessToken = req.headers['x-forwarded-authorization'].substring(7);
        tokenSource = 'x-forwarded-authorization';
        console.log('✅ Using user token from x-forwarded-authorization');
        console.log('🔍 Token preview:', accessToken.substring(0, 50) + '...');
        
        // Verify this is our HS256 user token
        try {
          const headerPart = accessToken.split('.')[0];
          const paddedHeader = headerPart + '='.repeat((4 - headerPart.length % 4) % 4);
          const decodedHeader = Buffer.from(paddedHeader.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
          console.log('🔍 Token header:', decodedHeader);
          
          const header = JSON.parse(decodedHeader);
          if (header.alg === 'HS256') {
            console.log('✅ Confirmed: This is our HS256 user token');
          } else {
            console.log('⚠️ WARNING: Token algorithm is', header.alg, 'expected HS256');
          }
        } catch (e) {
          console.log('🔍 Could not verify token header');
        }
        
      } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        // This is likely the Google service account token - reject it
        console.log('❌ Only authorization header found (likely Google service account token)');
        console.log('❌ Rejecting service account token - user token required');
        return res.status(401).json({
          error: 'Service account token not allowed',
          message: 'User authentication required, but received service account token',
          code: 'SERVICE_ACCOUNT_TOKEN_REJECTED'
        });
      } else {
        console.error('❌ No valid Bearer token found');
        return res.status(401).json({ 
          error: 'Authentication required',
          message: 'User Bearer token required in x-forwarded-authorization header',
          code: 'MISSING_USER_TOKEN'
        });
      }
      
      console.log('🔍 Using token from:', tokenSource);
      
      // Parse and validate JWT token payload
      let tokenPayload;
      try {
        tokenPayload = parseJWTPayload(accessToken);
        console.log('✅ Token payload parsed successfully:', {
          email: tokenPayload.email,
          user_id: tokenPayload.user_id,
          token_type: tokenPayload.token_type,
          iss: tokenPayload.iss,
          aud: tokenPayload.aud
        });
        
      } catch (parseError) {
        console.error('❌ Failed to parse JWT token:', parseError.message);
        return res.status(401).json({
          error: 'Invalid token format',
          message: parseError.message,
          code: 'INVALID_JWT_FORMAT'
        });
      }
      
      // Validate this is a user token
      const validationResult = validateUserToken(tokenPayload);
      if (!validationResult.valid) {
        console.error('❌ User token validation failed:', validationResult.reason);
        return res.status(401).json({
          error: 'Invalid user token',
          message: validationResult.reason,
          code: validationResult.code
        });
      }
      
      console.log(`✅ Valid user token confirmed for: ${tokenPayload.email} (ID: ${tokenPayload.user_id})`);
      
      // Build headers for API server
      const headers = {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'Authorization': `Bearer ${accessToken}`,
        'X-Token-Type': 'user_jwt',
        'X-User-Email': tokenPayload.email,
        'X-User-ID': tokenPayload.user_id
      };
      
      // Create API client
      const apiClient = axios.create({
        baseURL: 'https://api-server-559730737995.us-central1.run.app',
        headers: headers,
        timeout: 60000
      });
      
      // Prepare request body
      const requestBody = { ...req.body };
      delete requestBody.function_name;
      
      console.log('📡 Executing function on API server with user token...');
      
      // Execute function on API server
      const response = await apiClient.post(
        `/api/function/${functionName}`,
        requestBody
      );
      
      console.log(`✅ Function ${functionName} executed successfully for user ${tokenPayload.email}`);
      
      // Return the API server response
      res.status(200).json(response.data);
      
    } catch (error) {
      console.error('💥 Function execution error:', error);
      
      if (error.response?.status === 401) {
        const errorData = error.response.data || {};
        return res.status(401).json({
          error: 'Authentication failed on API server',
          message: errorData.detail || 'User token rejected by API server',
          code: 'API_AUTHENTICATION_FAILED'
        });
      }
      
      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({
          error: 'Function execution timeout',
          code: 'EXECUTION_TIMEOUT'
        });
      }
      
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data || {};
        
        return res.status(statusCode).json({
          error: errorData.detail || 'Function execution failed',
          code: 'API_ERROR'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  });
}

/**
 * Parse JWT payload with proper error handling
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
    
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Invalid JWT payload structure');
    }
    
    return parsed;
    
  } catch (error) {
    throw new Error(`Failed to parse JWT payload: ${error.message}`);
  }
}

/**
 * Validate user token structure and content
 */
function validateUserToken(payload) {
  // Check for required user token fields
  if (!payload.email || typeof payload.email !== 'string') {
    return {
      valid: false,
      reason: 'User token must contain valid email claim',
      code: 'MISSING_EMAIL_CLAIM'
    };
  }
  
  if (!payload.user_id || typeof payload.user_id !== 'string') {
    return {
      valid: false,
      reason: 'User token must contain valid user_id claim',
      code: 'MISSING_USER_ID_CLAIM'
    };
  }
  
  // Check for service account patterns in email
  const serviceAccountPatterns = [
    '@developer.gserviceaccount.com',
    '@.gserviceaccount.com',
    '.gserviceaccount.com',
    'compute@developer',
    'gserviceaccount'
  ];
  
  const isServiceAccount = serviceAccountPatterns.some(pattern => 
    payload.email.includes(pattern)
  );
  
  if (isServiceAccount) {
    return {
      valid: false,
      reason: 'Service account tokens are forbidden for user operations',
      code: 'SERVICE_ACCOUNT_TOKEN_FORBIDDEN'
    };
  }
  
  // Validate token type if present
  if (payload.token_type && payload.token_type !== 'user_access') {
    return {
      valid: false,
      reason: `Invalid token type: ${payload.token_type}`,
      code: 'INVALID_TOKEN_TYPE'
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
  
  return {
    valid: true,
    reason: 'Valid user token',
    code: 'VALID_USER_TOKEN'
  };
}

module.exports = functionExecutor;