const cors = require('cors')({origin: true});
const cookieParser = require('cookie-parser');
const {getSecret} = require('../utils/secret-manager');

let apiKeyCache = null;
let apiKeyCacheExpiry = null;

function parseCookies(req, res, next) {
  cookieParser()(req, res, next);
}

async function validateSession(req, res) {
  return cors(req, res, async () => {
    parseCookies(req, res, async () => {
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
        
        res.set({
          'Access-Control-Allow-Origin': 'https://aaai.solutions',
          'Access-Control-Allow-Credentials': 'true'
        });
        
        let userInfo = null;
        
        if (req.cookies?.user_info) {
          try {
            userInfo = JSON.parse(decodeURIComponent(req.cookies.user_info));
            console.log('✅ Fast user_info from req.cookies');
          } catch (error) {
            console.warn('Failed to parse user_info from req.cookies');
          }
        }
        
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
        
        let accessToken = null;
        
        if (req.headers.authorization?.startsWith('Bearer ')) {
          accessToken = req.headers.authorization.replace('Bearer ', '');
          console.log('✅ Found access token in authorization header');
        } else if (req.cookies?.access_token) {
          accessToken = req.cookies.access_token;
          console.log('✅ Found access token in cookies');
        }
        
        if (accessToken) {
          console.log('🔍 Fast API validation with access token...');
          
          try {
            const apiKey = await getFastAPIKey();
            
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);
            
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
        console.error('💥 Fast validation error:', error);
        
        const responseTime = Date.now() - startTime;
        
        res.status(500).json({
          valid: false,
          error: 'Validation service error',
          code: 'VALIDATION_ERROR',
          performance: {
            response_time_ms: responseTime
          }
        });
      }
    });
  });
}

async function getFastAPIKey() {
  if (apiKeyCache && apiKeyCacheExpiry && Date.now() < apiKeyCacheExpiry) {
    return apiKeyCache;
  }
  
  try {
    apiKeyCache = await getSecret('api-key');
    apiKeyCacheExpiry = Date.now() + (30 * 60 * 1000);
    return apiKeyCache;
  } catch (error) {
    console.error('❌ API key retrieval failed:', error);
    throw new Error('API key unavailable');
  }
}

module.exports = validateSession;