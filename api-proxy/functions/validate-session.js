const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

// Cache for performance
let apiKeyCache = null;
let apiKeyCacheExpiry = null;

/**
 * High-Performance Session Validation
 * Optimized for fast validation with minimal API calls
 */
async function validateSession(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Origin': 'https://aaai.solutions',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Max-Age': '3600'
      });
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🔍 Fast session validation starting...');
      
      // Set CORS headers for all responses
      res.set({
        'Access-Control-Allow-Origin': 'https://aaai.solutions',
        'Access-Control-Allow-Credentials': 'true'
      });
      
      // Fast user info extraction from cookies
      let userInfo = null;
      
      // Method 1: Check req.cookies first (fastest)
      if (req.cookies?.user_info) {
        try {
          userInfo = JSON.parse(decodeURIComponent(req.cookies.user_info));
          console.log('✅ Fast user_info from req.cookies');
        } catch (error) {
          console.warn('Failed to parse user_info from req.cookies');
        }
      }
      
      // Method 2: Parse cookie header if needed
      if (!userInfo && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'user_info' && value) {
            try {
              userInfo = JSON.parse(decodeURIComponent(value));
              console.log('✅ Fast user_info from header parsing');
              break;
            } catch (error) {
              console.warn('Failed to parse user_info from header');
            }
          }
        }
      }
      
      // Fast validation if we have complete user info
      if (userInfo?.email && userInfo?.id) {
        console.log('✅ Fast validation via user_info cookie');
        
        const responseTime = Date.now() - startTime;
        
        return res.status(200).json({
          valid: true,
          user_info: userInfo,
          source: 'cookie_user_info',
          authenticated_at: new Date().toISOString(),
          session_valid: true,
          validation_method: 'fast_cookie_based',
          performance: {
            response_time_ms: responseTime
          }
        });
      }
      
      // Fallback: Check for access token
      let accessToken = null;
      
      if (req.headers.authorization?.startsWith('Bearer ')) {
        accessToken = req.headers.authorization.replace('Bearer ', '');
        console.log('✅ Found access token in authorization header');
      } else if (req.cookies?.access_token) {
        accessToken = req.cookies.access_token;
        console.log('✅ Found access token in cookies');
      } else if (req.headers.cookie) {
        // Quick cookie parsing for access token
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'access_token' && value) {
            accessToken = decodeURIComponent(value);
            console.log('✅ Found access token via cookie parsing');
            break;
          }
        }
      }
      
      // If we have access token, validate with API (but with timeout)
      if (accessToken) {
        console.log('🔍 Fast API validation with access token...');
        
        try {
          const apiKey = await getFastAPIKey();
          
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout
          
          const response = await fetch('https://api-server-559730737995.us-central1.run.app/auth/validate-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
              'Authorization': `Bearer ${accessToken}`,
              'Cookie': req.headers.cookie || ''
            },
            body: JSON.stringify(req.body || {}),
            signal: controller.signal
          });
          
          clearTimeout(timeoutId);
          
          const validationResult = await response.json();
          
          if (response.ok && validationResult.valid) {
            // Enhance response if we have user info
            if (userInfo) {
              validationResult.user_info = userInfo;
              validationResult.source = 'token_and_cookie';
            } else {
              validationResult.source = 'token_only';
            }
            
            const responseTime = Date.now() - startTime;
            validationResult.performance = { response_time_ms: responseTime };
            
            console.log('✅ Fast API validation successful');
            return res.status(200).json(validationResult);
          }
          
        } catch (error) {
          console.error('❌ Fast API validation failed:', error.message);
          
          // If API fails but we have user info, still consider valid
          if (userInfo?.email && userInfo?.id) {
            console.log('✅ API failed but user_info valid, accepting session');
            
            const responseTime = Date.now() - startTime;
            
            return res.status(200).json({
              valid: true,
              user_info: userInfo,
              source: 'cookie_fallback',
              api_error: error.message,
              validation_method: 'fast_cookie_fallback',
              performance: {
                response_time_ms: responseTime
              }
            });
          }
        }
      }
      
      // No valid authentication found
      console.log('❌ Fast validation: No valid authentication found');
      
      const responseTime = Date.now() - startTime;
      
      return res.status(200).json({ 
        valid: false, 
        reason: "No valid authentication found",
        validation_method: 'fast_check',
        debug_info: {
          had_cookies: !!req.cookies,
          had_cookie_header: !!req.headers.cookie,
          had_auth_header: !!req.headers.authorization,
          user_info_found: !!userInfo,
          access_token_found: !!accessToken
        },
        performance: {
          response_time_ms: responseTime
        }
      });
      
    } catch (error) {
      console.error('💥 Fast session validation error:', error);
      
      const responseTime = Date.now() - startTime;
      
      // Return validation format even on error
      if (error.name === 'AbortError') {
        return res.status(200).json({ 
          valid: false, 
          reason: "Validation timeout",
          error: "Request timeout",
          performance: { response_time_ms: responseTime }
        });
      } else if (error.response?.status === 401) {
        return res.status(200).json({ 
          valid: false, 
          reason: "Authentication validation failed",
          error: error.response.data?.error || "Unauthorized",
          performance: { response_time_ms: responseTime }
        });
      } else {
        return res.status(200).json({
          valid: false,
          reason: "Validation service error",
          error: "Internal server error",
          performance: { response_time_ms: responseTime }
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

module.exports = validateSession;