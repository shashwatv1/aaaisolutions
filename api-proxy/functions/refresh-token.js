const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {getSecret} = require('../utils/secret-manager');

// Cached connections and secrets for performance
let supabaseClient = null;
let jwtSecretCache = null;
let secretCacheExpiry = null;

async function refreshToken(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🔄 Fast JWT token refresh starting (6-hour tokens for 7-day sessions)...');
      
      // Quick refresh token extraction
      const refreshToken = req.cookies?.refresh_token;
      
      if (!refreshToken) {
        console.log('❌ No refresh token in cookies');
        return res.status(401).json({
          error: 'Refresh token required',
          code: 'MISSING_REFRESH_TOKEN'
        });
      }
      
      // Fast JWT secret retrieval (with caching)
      const jwtSecret = await getFastJWTSecret();
      
      // Quick token verification
      let payload;
      try {
        payload = jwt.verify(refreshToken, jwtSecret);
        console.log('✅ JWT refresh token verified successfully');
      } catch (error) {
        console.log('❌ Invalid refresh token:', error.message);
        
        // Clear invalid cookies
        clearAuthCookies(res);
        
        return res.status(401).json({
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
      
      // Fast payload validation
      if (!payload.user_id || !payload.email || payload.token_type !== 'user_refresh') {
        console.log('❌ Invalid refresh token structure');
        clearAuthCookies(res);
        return res.status(401).json({
          error: 'Invalid refresh token structure',
          code: 'INVALID_TOKEN_STRUCTURE'
        });
      }
      
      // Fast database validation (with connection reuse)
      const isValid = await verifyRefreshTokenFast(refreshToken, payload.user_id);
      if (!isValid) {
        console.log('❌ Refresh token not found in database');
        clearAuthCookies(res);
        return res.status(401).json({
          error: 'Refresh token revoked',
          code: 'TOKEN_REVOKED'
        });
      }
      
      console.log('✅ Fast refresh token validated for:', payload.email);
      
      // Create new 6-hour access token
      const newAccessToken = await createFastAccessToken(payload);
      
      // Create new refresh token for rotation
      const newRefreshToken = await createFastRefreshToken(payload);
      
      // Set refreshed cookies with proper expiry
      setRefreshCookies(req, res, newAccessToken, newRefreshToken, payload);
      
      // Update database with new refresh token
      await updateRefreshTokenInDatabase(refreshToken, newRefreshToken, payload.user_id);
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast token refresh completed in ${responseTime}ms for:`, payload.email);
      
      res.status(200).json({
        tokens: {
          access_token: newAccessToken,
          refresh_token: newRefreshToken,
          expires_in: 21600,
          token_type: 'Bearer'
        },
        user: {
          id: payload.user_id,
          email: payload.email,
          session_id: payload.session_id
        },
        session: {
          duration_days: 7,
          access_token_hours: 6,
          refresh_successful: true,
          refreshed_at: new Date().toISOString()
        },
        performance: {
          response_time_ms: responseTime
        }
      });
      
    } catch (error) {
      console.error('💥 Fast token refresh error:', error);
      res.status(500).json({
        error: 'Internal server error during token refresh',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
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

async function verifyRefreshTokenFast(refreshToken, userId) {
  try {
    if (!supabaseClient) {
      const [supabaseUrl, supabaseKey] = await Promise.all([
        getSecret('SUPABASE_URL'),
        getSecret('SUPABASE_KEY')
      ]);
      
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      console.log('✅ Supabase client initialized for fast refresh');
    }
    
    // Fast query with minimal data
    const { data, error } = await supabaseClient
      .from('user_refresh_token')
      .select('expires_at, is_active')
      .eq('refresh_token', refreshToken)
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();
    
    if (error) {
      console.log('❌ Fast refresh token query error:', error);
      return false;
    }
    
    if (!data) {
      console.log('❌ Fast refresh token not found');
      return false;
    }
    
    // Quick expiration check
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      console.log('❌ Fast refresh token expired');
      return false;
    }
    
    console.log('✅ Fast refresh token validated');
    return true;
    
  } catch (error) {
    console.error('❌ Fast refresh token verification error:', error);
    return false;
  }
}

async function createFastAccessToken(payload) {
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
      exp: now + 21600, // 6 hours in seconds
      jti: crypto.randomBytes(8).toString('hex')
    };
    
    const token = jwt.sign(newAccessTokenPayload, jwtSecret, { algorithm: 'HS256' });
    
    console.log('✅ Created 6-hour access token');
    return token;
    
  } catch (error) {
    console.error('❌ Fast access token creation failed:', error);
    throw new Error('Access token creation failed');
  }
}

async function createFastRefreshToken(payload) {
  try {
    const jwtSecret = await getFastJWTSecret();
    const now = Math.floor(Date.now() / 1000);
    
    const newRefreshTokenPayload = {
      user_id: payload.user_id,
      email: payload.email,
      session_id: payload.session_id,
      token_type: 'user_refresh',
      iss: 'aaai-solutions',
      aud: 'aaai-refresh',
      iat: now,
      exp: now + (7 * 24 * 60 * 60), // 7 days
      jti: crypto.randomBytes(8).toString('hex') + '_refresh'
    };
    
    const token = jwt.sign(newRefreshTokenPayload, jwtSecret, { algorithm: 'HS256' });
    
    console.log('✅ Created new 7-day refresh token');
    return token;
    
  } catch (error) {
    console.error('❌ Fast refresh token creation failed:', error);
    throw new Error('Refresh token creation failed');
  }
}

function setRefreshCookies(req, res, accessToken, refreshToken, payload) {
  try {
    const secure = req.headers['x-forwarded-proto'] === 'https';
    
    // Set new refresh token cookie - 7 days
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    });
    
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
    
    console.log('✅ Refresh cookies updated with new tokens for 7-day session');
    
  } catch (error) {
    console.error('❌ Failed to set refresh cookies:', error);
  }
}

async function updateRefreshTokenInDatabase(oldRefreshToken, newRefreshToken, userId) {
  try {
    if (!supabaseClient) {
      return;
    }
    
    const now = new Date().toISOString();
    const jwtSecret = await getFastJWTSecret();
    const newPayload = jwt.verify(newRefreshToken, jwtSecret);
    const newExpiresAt = new Date(newPayload.exp * 1000).toISOString();
    
    // Deactivate old refresh token
    await supabaseClient
      .from('user_refresh_token')
      .update({
        is_active: false,
        updated_at: now
      })
      .eq('refresh_token', oldRefreshToken)
      .eq('user_id', userId);
    
    // Insert new refresh token
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .insert({
        user_id: userId,
        email: newPayload.email,
        refresh_token: newRefreshToken,
        expires_at: newExpiresAt,
        created_at: now,
        updated_at: now,
        device_info: {
          session_id: newPayload.session_id,
          created_via: 'token_refresh'
        },
        is_active: true,
        last_used_at: now
      });
    
    if (error) {
      console.error('❌ Failed to update refresh token in database:', error);
    } else {
      console.log('✅ Refresh token rotated in database');
    }
    
  } catch (error) {
    console.error('❌ Refresh token database update error:', error);
  }
}

function clearAuthCookies(res) {
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
  
  console.log('✅ Authentication cookies cleared');
}

module.exports = refreshToken;