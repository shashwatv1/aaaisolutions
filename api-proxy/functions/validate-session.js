const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {handleError} = require('../utils/error-handler');

/**
 * FIXED: Validate user session with enhanced cookie and header checking
 */
async function validateSession(req, res) {
  // Handle CORS
  return cors(req, res, async () => {
    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      console.log('=== SESSION VALIDATION DEBUG ===');
      console.log('Cookies received:', req.cookies);
      console.log('Cookie header:', req.headers.cookie);
      console.log('Authorization header:', req.headers.authorization);
      
      // Enhanced token extraction - try multiple methods
      let accessToken = null;
      let authorizationHeader = null;
      
      // Method 1: Authorization header
      if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
        accessToken = req.headers.authorization.replace('Bearer ', '');
        authorizationHeader = req.headers.authorization;
        console.log('Found token in Authorization header');
      }
      
      // Method 2: Cookie (req.cookies)
      if (!accessToken && req.cookies && req.cookies.access_token) {
        accessToken = req.cookies.access_token;
        authorizationHeader = `Bearer ${accessToken}`;
        console.log('Found token in req.cookies');
      }
      
      // Method 3: Parse cookie header manually
      if (!accessToken && req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'access_token' && value) {
            accessToken = decodeURIComponent(value);
            authorizationHeader = `Bearer ${accessToken}`;
            console.log('Found token via cookie header parsing');
            break;
          }
        }
      }
      
      console.log('Final access token found:', !!accessToken);
      
      if (!accessToken) {
        console.log('ERROR: No access token found');
        res.status(401).json({ 
          error: 'No authentication token available',
          valid: false,
          reason: "No access token found in headers or cookies",
          debug: {
            hasAuthHeader: !!req.headers.authorization,
            hasCookies: !!req.cookies,
            hasCookieHeader: !!req.headers.cookie,
            cookieKeys: req.cookies ? Object.keys(req.cookies) : []
          }
        });
        return;
      }
      
      // Validate token format
      if (!accessToken.startsWith('eyJ')) {
        console.log('ERROR: Invalid token format');
        res.status(401).json({
          error: 'Invalid token format',
          valid: false,
          reason: "Token does not appear to be a valid JWT"
        });
        return;
      }
      
      // Check if we have user info in cookies for additional validation
      let userInfo = null;
      if (req.cookies && req.cookies.user_info) {
        try {
          userInfo = JSON.parse(decodeURIComponent(req.cookies.user_info));
          console.log('User info found in cookies:', userInfo.email);
        } catch (e) {
          console.log('Could not parse user_info cookie:', e.message);
        }
      }
      
      // Forward the request to the main API
      console.log('Forwarding session validation to main API');
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/validate-session',
        req.body || {},
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
            'Authorization': authorizationHeader,
            // Forward cookies if needed
            'Cookie': req.headers.cookie || ''
          }
        }
      );
      
      // Enhance response with cookie info
      const validationResult = response.data;
      if (validationResult.valid && userInfo) {
        validationResult.user_info = userInfo;
        validationResult.source = 'cookies_and_token';
      } else if (validationResult.valid) {
        validationResult.source = 'token_only';
      }
      
      console.log('Session validation result:', validationResult.valid);
      
      // Return the response to the client
      res.status(200).json(validationResult);
      
    } catch (error) {
      console.log('Session validation error:', error.message);
      
      // Return a proper session validation response even on error
      if (error.response && error.response.status === 401) {
        res.status(401).json({ 
          valid: false, 
          reason: "Token validation failed",
          error: error.response.data?.error || "Unauthorized"
        });
      } else {
        // For other errors, still return validation format
        res.status(500).json({
          valid: false,
          reason: "Session validation service temporarily unavailable",
          error: "Internal server error"
        });
      }
    }
  });
}

module.exports = validateSession;