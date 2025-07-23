const cors = require('cors')({
  origin: 'https://aaai.solutions',
  credentials: true, // ← FIXED: Enable credentials for CORS
  optionsSuccessStatus: 200
});
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
    res.set({
      'Access-Control-Allow-Origin': 'https://aaai.solutions',
      'Access-Control-Allow-Credentials': 'true' // ← FIXED: Required for credentials: 'include'
    });

    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '3600'
      });
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
      
      // Quick auth header check with proper token extraction
      let accessToken = null;
      let tokenSource = 'none';
      
      if (req.headers['x-forwarded-authorization']?.startsWith('Bearer ')) {
        accessToken = req.headers['x-forwarded-authorization'].substring(7);
        tokenSource = 'x-forwarded-authorization';
        console.log('✅ Using user token from x-forwarded-authorization');
      } else if (req.headers.authorization?.startsWith('Bearer ')) {
        accessToken = req.headers.authorization.substring(7);
        tokenSource = 'authorization';
        console.log('✅ Using token from authorization header');
      } else {
        return res.status(401).json({ 
          error: 'User Bearer token required',
          code: 'MISSING_USER_TOKEN'
        });
      }
      
      // Improved JWT validation
      if (!accessToken || accessToken.length < 50) {
        return res.status(401).json({
          error: 'Invalid token format',
          code: 'INVALID_TOKEN_FORMAT'
        });
      }
      
      // Enhanced JWT payload validation
      try {
        const tokenParts = accessToken.split('.');
        if (tokenParts.length !== 3) {
          throw new Error('Invalid JWT structure');
        }
        
        const payloadPart = tokenParts[1];
        const paddedPayload = payloadPart + '='.repeat((4 - payloadPart.length % 4) % 4);
        const decoded = Buffer.from(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        const payload = JSON.parse(decoded);
        
        // Validate required user claims
        if (!payload.email || !payload.user_id) {
          throw new Error('Missing required user claims (email, user_id)');
        }
        
        // Check for service account patterns (more specific)
        if (payload.email.includes('gserviceaccount.com') || 
            payload.email.includes('compute@developer') ||
            payload.email.includes('cloudbuild') ||
            payload.iss?.includes('google') && !payload.email.includes('@')) {
          throw new Error('Service account email detected');
        }
        
        // Additional validation for user tokens
        if (!payload.exp || payload.exp < Date.now() / 1000) {
          throw new Error('Token expired');
        }
        
        console.log('✅ JWT validation passed for:', payload.email, 'from:', tokenSource);
        
      } catch (error) {
        console.error('❌ JWT validation failed:', error.message);
        return res.status(401).json({
          error: 'Invalid user token: ' + error.message,
          code: 'TOKEN_VALIDATION_FAILED'
        });
      }
      
      // Prepare request body quickly
      const requestBody = { ...req.body };
      delete requestBody.function_name
      
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
        
        console.error('❌ API server error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          function: functionName
        });
        
        if (response.status === 401) {
          return res.status(401).json({
            error: 'Authentication failed on API server',
            code: 'API_AUTHENTICATION_FAILED',
            details: errorData
          });
        }
        
        return res.status(response.status).json({
          error: errorData.detail || errorData.error || 'Function execution failed',
          code: 'API_ERROR',
          function: functionName,
          details: errorData
        });
      }
      
      const result = await response.json();
      
      // Log successful project creation
      if (functionName === 'create_project_with_context' && result.status === 'success') {
        console.log('✅ Project created successfully:', {
          projectId: result.data?.project?.id,
          chatId: result.data?.chat_id,
          projectName: result.data?.project?.name
        });
      }
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast function ${functionName} completed in ${responseTime}ms`);
      
      // Return result with performance metrics
      res.status(200).json({
        ...result,
        performance: {
          response_time_ms: responseTime,
          function_name: functionName,
          token_source: tokenSource
        }
      });
      
    } catch (error) {
      console.error('💥 Fast function execution error:', {
        function: functionName,
        error: error.message,
        stack: error.stack
      });
      
      if (error.name === 'AbortError') {
        res.status(504).json({
          error: 'Function execution timeout',
          code: 'EXECUTION_TIMEOUT',
          function: functionName
        });
      } else if (error.code === 'ECONNABORTED') {
        res.status(504).json({
          error: 'Function execution timeout',
          code: 'EXECUTION_TIMEOUT',
          function: functionName
        });
      } else {
        res.status(500).json({
          error: 'Internal server error: ' + error.message,
          code: 'INTERNAL_ERROR',
          function: functionName
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