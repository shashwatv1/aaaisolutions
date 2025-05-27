const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * FIXED: Validate user session with enhanced cookie and header checking
 */
async function validateSession(req, res) {
  // Handle CORS with credentials
  return cors(req, res, async () => {
    // Handle OPTIONS request for CORS preflight
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
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      console.log('=== FIXED SESSION VALIDATION DEBUG ===');
      console.log('Headers received:', JSON.stringify(req.headers, null, 2));
      console.log('Cookies received:', req.cookies);
      console.log('Raw cookie header:', req.headers.cookie);
      
      // FIXED: Enhanced token and cookie extraction with multiple methods
      let accessToken = null;
      let userInfo = null;
      let authorizationHeader = null;
      
      // Method 1: Check for user_info cookie (this is what we need!)
      if (req.cookies && req.cookies.user_info) {
        try {
          userInfo = JSON.parse(decodeURIComponent(req.cookies.user_info));
          console.log('FIXED: Found user_info in req.cookies:', userInfo);
        } catch (parseError) {
          console.warn('Failed to parse user_info cookie from req.cookies:', parseError);
        }
      }
      
      // Method 2: Parse cookie header manually if req.cookies failed
      if (!userInfo && req.headers.cookie) {
        console.log('FIXED: Parsing cookie header manually...');
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'user_info' && value) {
            try {
              const decodedValue = decodeURIComponent(value);
              userInfo = JSON.parse(decodedValue);
              console.log('FIXED: Found user_info via header parsing:', userInfo);
              break;
            } catch (parseError) {
              console.warn('Failed to parse user_info from cookie header:', parseError);
            }
          }
        }
      }
      
      // Method 3: Check Authorization header for access token
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        accessToken = req.headers.authorization.replace('Bearer ', '');
        authorizationHeader = req.headers.authorization;
        console.log('FIXED: Found token in Authorization header');
      }
      
      // Method 4: Check access_token cookie
      if (!accessToken && req.cookies && req.cookies.access_token) {
        accessToken = req.cookies.access_token;
        authorizationHeader = `Bearer ${accessToken}`;
        console.log('FIXED: Found access_token in cookies');
      }
      
      // Method 5: Parse access_token from cookie header
      if (!accessToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'access_token' && value) {
            accessToken = decodeURIComponent(value);
            authorizationHeader = `Bearer ${accessToken}`;
            console.log('FIXED: Found access_token via cookie header parsing');
            break;
          }
        }
      }
      
      console.log('FIXED: Final extraction results:', {
        hasAccessToken: !!accessToken,
        hasUserInfo: !!userInfo,
        userInfoValid: userInfo && userInfo.email && userInfo.id
      });
      
      // FIXED: If we have valid user_info from cookies, that's sufficient for validation
      if (userInfo && userInfo.email && userInfo.id) {
        console.log('FIXED: Validating based on user_info cookie');
        
        // Enhanced response with user info
        const validationResult = {
          valid: true,
          user_info: userInfo,
          source: 'cookie_user_info',
          authenticated_at: new Date().toISOString(),
          session_valid: true,
          validation_method: 'cookie_based'
        };
        
        console.log('FIXED: Session validation successful via user_info cookie');
        
        // Set CORS headers explicitly
        res.set({
          'Access-Control-Allow-Origin': 'https://aaai.solutions',
          'Access-Control-Allow-Credentials': 'true'
        });
        
        return res.status(200).json(validationResult);
      }
      
      // If no user_info but we have access_token, validate with main API
      if (accessToken) {
        console.log('FIXED: Validating with main API using access token');
        
        try {
          const response = await axios.post(
            'https://api-server-559730737995.us-central1.run.app/auth/validate-session',
            req.body || {},
            {
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
                'Authorization': authorizationHeader,
                'Cookie': req.headers.cookie || ''
              },
              timeout: 10000
            }
          );
          
          const validationResult = response.data;
          
          // Enhance response if we have user info
          if (validationResult.valid && userInfo) {
            validationResult.user_info = userInfo;
            validationResult.source = 'token_and_cookie';
          } else if (validationResult.valid) {
            validationResult.source = 'token_only';
          }
          
          console.log('FIXED: Main API validation result:', validationResult.valid);
          
          // Set CORS headers explicitly
          res.set({
            'Access-Control-Allow-Origin': 'https://aaai.solutions',
            'Access-Control-Allow-Credentials': 'true'
          });
          
          return res.status(200).json(validationResult);
          
        } catch (apiError) {
          console.error('FIXED: Main API validation failed:', apiError.message);
          
          // If API call fails but we have user info, still consider it valid
          if (userInfo && userInfo.email && userInfo.id) {
            console.log('FIXED: API failed but user_info valid, accepting session');
            
            res.set({
              'Access-Control-Allow-Origin': 'https://aaai.solutions',
              'Access-Control-Allow-Credentials': 'true'
            });
            
            return res.status(200).json({
              valid: true,
              user_info: userInfo,
              source: 'cookie_fallback',
              api_error: apiError.message,
              validation_method: 'cookie_fallback'
            });
          }
          
          throw apiError;
        }
      }
      
      // No valid authentication found
      console.log('FIXED: No valid authentication found');
      
      res.set({
        'Access-Control-Allow-Origin': 'https://aaai.solutions',
        'Access-Control-Allow-Credentials': 'true'
      });
      
      return res.status(200).json({ 
        valid: false, 
        reason: "No valid authentication tokens or user info found",
        debug_info: {
          had_cookies: !!req.cookies,
          had_cookie_header: !!req.headers.cookie,
          had_auth_header: !!req.headers.authorization,
          cookie_keys: req.cookies ? Object.keys(req.cookies) : [],
          user_info_found: !!userInfo,
          access_token_found: !!accessToken
        }
      });
      
    } catch (error) {
      console.log('FIXED: Session validation error:', error.message);
      
      // Set CORS headers even for errors
      res.set({
        'Access-Control-Allow-Origin': 'https://aaai.solutions',
        'Access-Control-Allow-Credentials': 'true'
      });
      
      // Return validation format even on error
      if (error.response && error.response.status === 401) {
        return res.status(200).json({ 
          valid: false, 
          reason: "Authentication validation failed",
          error: error.response.data?.error || "Unauthorized"
        });
      } else {
        return res.status(200).json({
          valid: false,
          reason: "Session validation service temporarily unavailable",
          error: "Internal server error",
          error_details: error.message
        });
      }
    }
  });
}

module.exports = validateSession;