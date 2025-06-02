const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

// Cache for performance
let apiKeyCache = null;
let apiKeyCacheExpiry = null;

/**
 * High-Performance Function Executor
 * Optimized for fast execution with minimal validation
 */
async function functionExecutor(req, res) {
  let functionName = null;
  
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🚀 Fast function execution starting...');
      
      // Quick function name extraction
      functionName = req.query?.function_name?.trim();
      if (!functionName) {
        return res.status(400).json({ 
          error: 'Function name is required',
          code: 'MISSING_FUNCTION_NAME'
        });
      }
      
      console.log('🚀 Fast executing function:', functionName);
      
      // Fast API key retrieval
      const apiKey = await getFastAPIKey();
      
      // Quick auth header check
      let accessToken = null;
      
      if (req.headers['x-forwarded-authorization']?.startsWith('Bearer ')) {
        accessToken = req.headers['x-forwarded-authorization'].substring(7);
        console.log('✅ Using user token from x-forwarded-authorization');
      } else if (req.headers.authorization?.startsWith('Bearer ')) {
        // Check if this might be a service account token
        const token = req.headers.authorization.substring(7);
        if (token.length > 500) { // Service account tokens are typically much longer
          console.log('❌ Rejecting potential service account token');
          return res.status(401).json({
            error: 'Service account token not allowed',
            code: 'SERVICE_ACCOUNT_TOKEN_REJECTED'
          });
        }
        accessToken = token;
        console.log('✅ Using token from authorization header');
      } else {
        return res.status(401).json({ 
          error: 'User Bearer token required',
          code: 'MISSING_USER_TOKEN'
        });
      }
      
      // Fast token validation (basic format check)
      if (!accessToken || accessToken.length < 100) {
        return res.status(401).json({
          error: 'Invalid token format',
          code: 'INVALID_TOKEN_FORMAT'
        });
      }
      
      // Quick JWT payload extraction for email validation
      try {
        const payloadPart = accessToken.split('.')[1];
        if (!payloadPart) throw new Error('Invalid JWT format');
        
        const paddedPayload = payloadPart + '='.repeat((4 - payloadPart.length % 4) % 4);
        const decoded = Buffer.from(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const payload = JSON.parse(decoded);
        
        // Quick validation for user token
        if (!payload.email || !payload.user_id) {
          throw new Error('Missing user claims');
        }
        
        // Check for service account patterns
        if (payload.email.includes('gserviceaccount.com') || 
            payload.email.includes('compute@developer')) {
          throw new Error('Service account email detected');
        }
        
        console.log('✅ Fast token validation passed for:', payload.email);
        
      } catch (error) {
        console.error('❌ Fast token validation failed:', error.message);
        return res.status(401).json({
          error: 'Invalid user token',
          code: 'TOKEN_VALIDATION_FAILED'
        });
      }
      
      // Prepare request body quickly
      const requestBody = { ...req.body };
      delete requestBody.function_name;
      
      // Fast API execution with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout
      
      const response = await fetch(`https://api-server-559730737995.us-central1.run.app/api/function/${functionName}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
          return res.status(401).json({
            error: 'Authentication failed on API server',
            code: 'API_AUTHENTICATION_FAILED'
          });
        }
        
        return res.status(response.status).json({
          error: errorData.detail || 'Function execution failed',
          code: 'API_ERROR'
        });
      }
      
      const result = await response.json();
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast function ${functionName} completed in ${responseTime}ms`);
      
      // Return result with performance metrics
      res.status(200).json({
        ...result,
        performance: {
          response_time_ms: responseTime,
          function_name: functionName
        }
      });
      
    } catch (error) {
      console.error('💥 Fast function execution error:', error);
      
      if (error.name === 'AbortError') {
        res.status(504).json({
          error: 'Function execution timeout',
          code: 'EXECUTION_TIMEOUT'
        });
      } else if (error.code === 'ECONNABORTED') {
        res.status(504).json({
          error: 'Function execution timeout',
          code: 'EXECUTION_TIMEOUT'
        });
      } else {
        res.status(500).json({
          error: 'Internal server error',
          code: 'INTERNAL_ERROR'
        });
      }
    }
  });
}

/**
 * Get API key with caching
 */
async function getFastAPIKey() {
  if (apiKeyCache && apiKeyCacheExpiry && Date.now() < apiKeyCacheExpiry) {
    return apiKeyCache;
  }
  
  try {
    apiKeyCache = await getSecret('api-key');
    apiKeyCacheExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes
    return apiKeyCache;
  } catch (error) {
    console.error('Failed to get API key:', error);
    throw new Error('API key not available');
  }
}

module.exports = functionExecutor;