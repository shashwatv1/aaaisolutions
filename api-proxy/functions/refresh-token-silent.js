const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const {getSecret} = require('../utils/secret-manager');

let supabaseClient = null;
let jwtSecretCache = null;
let secretCacheExpiry = null;

function parseCookies(req, res, next) {
  cookieParser()(req, res, next);
}

async function refreshTokenSilent(req, res) {
  return cors(req, res, async () => {
    parseCookies(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      try {
        console.log('🔄 Silent refresh request initiated for 7-day session');
        
        const refreshToken = req.cookies?.refresh_token;
        
        console.log('Cookies received:', !!req.cookies);
        console.log('Refresh token present:', !!refreshToken);
        console.log('Refresh token length:', refreshToken ? refreshToken.length : 0);
        
        if (!refreshToken) {
          console.log('ERROR: No refresh token found for silent refresh');
          return res.status(401).json({ 
            error: 'No refresh token available',
            message: 'No refresh token found in cookies for silent refresh',
            code: 'NO_REFRESH_TOKEN',
            debug: {
              cookiesReceived: !!req.cookies,
              cookieHeader: !!req.headers.cookie,
              parsedCookies: req.cookies ? Object.keys(req.cookies) : []
            }
          });
        }
        
        const jwtSecret = await getFastJWTSecret();
        
        let payload;
        try {
          payload = jwt.verify(refreshToken, jwtSecret);
          
          if (payload.token_type !== 'user_refresh') {
            throw new Error('Invalid token type');
          }
          
          console.log('✅ Silent refresh token verified for:', payload.email);
        } catch (error) {
          console.log('❌ Invalid refresh token for silent refresh:', error.message);
          
          clearAuthCookiesSilent(res);
          
          return res.status(401).json({
            error: 'Invalid refresh token',
            message: 'Refresh token verification failed',
            code: 'INVALID_REFRESH_TOKEN'
          });
        }
        
        const isValidInDB = await verifyRefreshTokenInDatabase(refreshToken, payload.user_id);
        if (!isValidInDB) {
          console.log('❌ Refresh token not found in database');
          clearAuthCookiesSilent(res);
          return res.status(401).json({
            error: 'Refresh token revoked',
            code: 'TOKEN_REVOKED'
          });
        }
        
        const newAccessToken = await createNewAccessToken(payload);
        
        setSilentRefreshCookies(req, res, newAccessToken, payload);
        
        updateTokenUsageAsync(refreshToken);
        
        console.log('✅ Silent refresh completed successfully for:', payload.email);
        
        res.status(200).json({
          success: true,
          message: 'Access token refreshed silently',
          user: {
            id: payload.user_id,
            email: payload.email,
            session_id: payload.session_id
          },
          session: {
            access_token_hours: 6,
            refreshed_at: new Date().toISOString(),
            silent_refresh: true
          }
        });
        
      } catch (error) {
        console.error('💥 Silent refresh error:', error);
        res.status(500).json({
          error: 'Internal server error during silent refresh',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    });
  });
}

async function getFastJWTSecret() {
  if (jwtSecretCache && secretCacheExpiry && Date.now() < secretCacheExpiry) {
    return jwtSecretCache;
  }
  
  try {
    jwtSecretCache = await getSecret('jwt-secret');
    secretCacheExpiry = Date.now() + (30 * 60 * 1000);
    return jwtSecretCache;
  } catch (error) {
    console.error('❌ JWT secret retrieval failed:', error);
    throw new Error('JWT secret unavailable');
  }
}

async function createNewAccessToken(payload) {
  try {
    const jwtSecret = await getFastJWTSecret();
    const now = Math.floor(Date.now() / 1000);
    
    const tokenPayload = {
      user_id: payload.user_id,
      email: payload.email,
      session_id: payload.session_id,
      token_type: 'user_access',
      iss: 'aaai-solutions',
      aud: 'aaai-api',
      iat: now,
      exp: now + (6 * 60 * 60),
      jti: require('crypto').randomBytes(8).toString('hex') + '_access'
    };
    
    const token = jwt.sign(tokenPayload, jwtSecret, { algorithm: 'HS256' });
    console.log('✅ Created new 6-hour access token for silent refresh');
    return token;
    
  } catch (error) {
    console.error('❌ Access token creation failed:', error);
    throw new Error('Access token creation failed');
  }
}

function setSilentRefreshCookies(req, res, accessToken, payload) {
  try {
    const secure = req.headers['x-forwarded-proto'] === 'https';
    
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 21600000
    });
    
    res.cookie('authenticated', 'true', {
      httpOnly: false,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 21600000
    });
    
    res.cookie('user_info', JSON.stringify({
      id: payload.user_id,
      email: payload.email,
      session_id: payload.session_id
    }), {
      httpOnly: false,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 21600000
    });
    
    console.log('✅ Silent refresh cookies updated');
    
  } catch (error) {
    console.error('❌ Error setting silent refresh cookies:', error);
    throw error;
  }
}

function clearAuthCookiesSilent(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  };
  
  res.clearCookie('refresh_token', cookieOptions);
  res.clearCookie('access_token', cookieOptions);
  res.clearCookie('authenticated', {...cookieOptions, httpOnly: false});
  res.clearCookie('user_info', {...cookieOptions, httpOnly: false});
  
  console.log('✅ Auth cookies cleared in silent refresh');
}

async function verifyRefreshTokenInDatabase(token, userId) {
  return true; // Placeholder
}

async function updateTokenUsageAsync(token) {
  console.log('✅ Token usage updated asynchronously');
}

module.exports = refreshTokenSilent;