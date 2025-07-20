const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const {getSecret} = require('../utils/secret-manager');

// Cache for performance
let supabaseClient = null;
let jwtSecretCache = null;
let secretCacheExpiry = null;

async function refreshTokenSilent(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      console.log('🔄 Silent refresh request initiated for 7-day session');
      
      // Extract refresh token from cookies
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
      
      // Get JWT secret
      const jwtSecret = await getFastJWTSecret();
      
      // Verify refresh token
      let payload;
      try {
        payload = jwt.verify(refreshToken, jwtSecret);
        
        if (payload.token_type !== 'user_refresh') {
          throw new Error('Invalid token type');
        }
        
        console.log('✅ Silent refresh token verified for:', payload.email);
      } catch (error) {
        console.log('❌ Invalid refresh token for silent refresh:', error.message);
        
        // Clear invalid cookies
        clearAuthCookiesSilent(res);
        
        return res.status(401).json({
          error: 'Invalid refresh token',
          message: 'Refresh token verification failed',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
      
      // Verify token exists in database
      const isValidInDB = await verifyRefreshTokenInDatabase(refreshToken, payload.user_id);
      if (!isValidInDB) {
        console.log('❌ Refresh token not found in database');
        clearAuthCookiesSilent(res);
        return res.status(401).json({
          error: 'Refresh token revoked',
          code: 'TOKEN_REVOKED'
        });
      }
      
      // Create new access token
      const newAccessToken = await createNewAccessToken(payload);
      
      // Set new cookies
      setSilentRefreshCookies(req, res, newAccessToken, payload);
      
      // Update database usage
      updateTokenUsageAsync(refreshToken);
      
      console.log('✅ Silent refresh successful for:', payload.email);
      
      res.status(200).json({
        success: true,
        message: 'Token refreshed silently for 7-day session',
        expires_in: 21600, // 6 hours in seconds
        token_type: 'Bearer',
        session_duration: '7 days',
        refreshed_at: new Date().toISOString()
      });
      
    } catch (error) {
      console.log('Silent refresh error:', error.message);
      
      res.status(500).json({
        error: 'Silent refresh temporarily unavailable',
        message: 'Unable to refresh token silently at this time',
        code: 'SILENT_REFRESH_ERROR',
        retry_recommended: true
      });
    }
  });
}

async function getFastJWTSecret() {
  if (jwtSecretCache && secretCacheExpiry && Date.now() < secretCacheExpiry) {
    return jwtSecretCache;
  }
  
  try {
    jwtSecretCache = await getSecret('JWT_SECRET_KEY');
    secretCacheExpiry = Date.now() + (5 * 60 * 1000);
    return jwtSecretCache;
  } catch (error) {
    console.error('Failed to get JWT secret:', error);
    throw new Error('JWT secret not available');
  }
}

async function verifyRefreshTokenInDatabase(refreshToken, userId) {
  try {
    if (!supabaseClient) {
      const [supabaseUrl, supabaseKey] = await Promise.all([
        getSecret('SUPABASE_URL'),
        getSecret('SUPABASE_KEY')
      ]);
      
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
    
    const { data, error } = await supabaseClient
      .from('user_refresh_token')
      .select('expires_at, is_active')
      .eq('refresh_token', refreshToken)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (error || !data) {
      return false;
    }
    
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      return false;
    }
    
    return true;
    
  } catch (error) {
    console.error('Database verification error:', error);
    return false;
  }
}

async function createNewAccessToken(payload) {
  try {
    const jwtSecret = await getFastJWTSecret();
    const now = Math.floor(Date.now() / 1000);
    
    const newAccessTokenPayload = {
      user_id: payload.user_id,
      email: payload.email,
      session_id: payload.session_id,
      token_type: 'user_access',
      iss: 'aaai-solutions',
      aud: 'aaai-api',
      iat: now,
      exp: now + 21600, // 6 hours
      jti: require('crypto').randomBytes(8).toString('hex')
    };
    
    const token = jwt.sign(newAccessTokenPayload, jwtSecret, { algorithm: 'HS256' });
    
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
    
    // Update authenticated flag - 6 hours
    res.cookie('authenticated', 'true', {
      httpOnly: false,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 21600000 // 6 hours in milliseconds
    });
    
    // Update user info cookie - 6 hours
    res.cookie('user_info', JSON.stringify({
      id: payload.user_id,
      email: payload.email,
      session_id: payload.session_id
    }), {
      httpOnly: false,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 21600000 // 6 hours in milliseconds
    });
    
    console.log('✅ Silent refresh cookies updated');
    
  } catch (error) {
    console.error('❌ Failed to set silent refresh cookies:', error);
  }
}

function clearAuthCookiesSilent(res) {
  const cookieOptions = {
    path: '/',
    secure: true,
    sameSite: 'lax'
  };
  
  res.clearCookie('refresh_token', cookieOptions);
  res.clearCookie('authenticated', cookieOptions);
  res.clearCookie('access_token', cookieOptions);
  res.clearCookie('user_info', cookieOptions);
  res.clearCookie('session_id', cookieOptions);
  
  console.log('✅ Auth cookies cleared for silent refresh');
}

async function updateTokenUsageAsync(refreshToken) {
  try {
    if (!supabaseClient) {
      return;
    }
    
    const now = new Date().toISOString();
    
    await supabaseClient
      .from('user_refresh_token')
      .update({
        last_used_at: now,
        updated_at: now
      })
      .eq('refresh_token', refreshToken);
    
    console.log('✅ Token usage updated');
    
  } catch (error) {
    console.warn('⚠️ Token usage update failed:', error);
  }
}

module.exports = refreshTokenSilent;