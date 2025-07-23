const cors = require('cors')({
  origin: 'https://aaai.solutions',
  credentials: true, // ← FIXED: Enable credentials for CORS
  optionsSuccessStatus: 200
});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const {getSecret} = require('../utils/secret-manager');

let supabaseClient = null;
let jwtSecretCache = null;
let secretCacheExpiry = null;

function parseCookies(req, res, next) {
  cookieParser()(req, res, next);
}

async function refreshToken(req, res) {
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

    parseCookies(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      const startTime = Date.now();
      
      try {
        console.log('🔄 Fast JWT token refresh starting (6-hour tokens for 7-day sessions)...');
        
        const refreshToken = req.cookies?.refresh_token;
        
        if (!refreshToken) {
          console.log('❌ No refresh token in cookies');
          return res.status(401).json({
            error: 'Refresh token required',
            code: 'MISSING_REFRESH_TOKEN'
          });
        }
        
        const jwtSecret = await getFastJWTSecret();
        
        let payload;
        try {
          payload = jwt.verify(refreshToken, jwtSecret);
          console.log('✅ JWT refresh token verified successfully');
        } catch (error) {
          console.log('❌ Invalid refresh token:', error.message);
          clearAuthCookies(res);
          return res.status(401).json({
            error: 'Invalid refresh token',
            code: 'INVALID_REFRESH_TOKEN'
          });
        }
        
        if (!payload.user_id || !payload.email || payload.token_type !== 'user_refresh') {
          console.log('❌ Invalid refresh token structure');
          clearAuthCookies(res);
          return res.status(401).json({
            error: 'Invalid refresh token structure',
            code: 'INVALID_TOKEN_STRUCTURE'
          });
        }
        
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
        
        const newAccessToken = await createFastAccessToken(payload);
        const newRefreshToken = await createFastRefreshToken(payload);
        
        setRefreshCookies(req, res, newAccessToken, newRefreshToken, payload);
        
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
  });
}

async function getFastJWTSecret() {
  if (jwtSecretCache && secretCacheExpiry && Date.now() < secretCacheExpiry) {
    return jwtSecretCache;
  }
  
  try {
    jwtSecretCache = await getSecret('JWT_SECRET_KEY');
    secretCacheExpiry = Date.now() + (30 * 60 * 1000);
    return jwtSecretCache;
  } catch (error) {
    console.error('❌ JWT secret retrieval failed:', error);
    throw new Error('JWT secret unavailable');
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
      exp: now + (6 * 60 * 60),
      jti: crypto.randomBytes(8).toString('hex') + '_access'
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
      exp: now + (7 * 24 * 60 * 60),
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
    
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000
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
    
    console.log('✅ Refresh cookies set successfully');
    
  } catch (error) {
    console.error('❌ Error setting refresh cookies:', error);
    throw error;
  }
}

function clearAuthCookies(res) {
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
  
  console.log('✅ Auth cookies cleared');
}

// FIXED: Proper database verification implementation
async function verifyRefreshTokenFast(token, userId) {
  try {
    // Initialize Supabase client if needed
    if (!supabaseClient) {
      await initializeSupabaseClient();
    }
    
    // Check if refresh token exists and is active
    const { data, error } = await supabaseClient
      .from('user_refresh_token')
      .select('id, user_id, is_active, expires_at')
      .eq('refresh_token', token)
      .eq('user_id', userId)
      .eq('is_active', true)
      .gte('expires_at', new Date().toISOString())
      .single();
    
    if (error || !data) {
      console.log('❌ Refresh token not found or expired in database');
      return false;
    }
    
    // Update last_used_at timestamp asynchronously
    updateTokenUsageAsync(token, data.id).catch(error => {
      console.warn('⚠️ Failed to update token usage:', error);
    });
    
    console.log('✅ Refresh token verified in database');
    return true;
    
  } catch (error) {
    console.error('❌ Database verification error:', error);
    return false;
  }
}

// FIXED: Proper database update implementation with token rotation
async function updateRefreshTokenInDatabase(oldToken, newToken, userId) {
  try {
    if (!supabaseClient) {
      await initializeSupabaseClient();
    }
    
    const now = new Date().toISOString();
    const jwtSecret = await getFastJWTSecret();
    const newPayload = jwt.verify(newToken, jwtSecret);
    const newExpiresAt = new Date(newPayload.exp * 1000).toISOString();
    
    // Start transaction-like operations
    // 1. Deactivate old refresh token
    const { error: deactivateError } = await supabaseClient
      .from('user_refresh_token')
      .update({
        is_active: false,
        updated_at: now,
        revoked_at: now
      })
      .eq('refresh_token', oldToken)
      .eq('user_id', userId);
    
    if (deactivateError) {
      console.warn('⚠️ Failed to deactivate old refresh token:', deactivateError);
    }
    
    // 2. Insert new refresh token
    const { error: insertError } = await supabaseClient
      .from('user_refresh_token')
      .insert({
        user_id: userId,
        email: newPayload.email,
        refresh_token: newToken,
        expires_at: newExpiresAt,
        created_at: now,
        updated_at: now,
        device_info: {
          session_id: newPayload.session_id,
          created_via: 'token_refresh',
          user_agent: 'web_client',
          rotated_from: oldToken.substring(0, 10) + '...' // Store partial old token for audit
        },
        is_active: true,
        last_used_at: now
      });
    
    if (insertError) {
      console.error('❌ Failed to insert new refresh token:', insertError);
      throw new Error('Failed to store new refresh token');
    }
    
    console.log('✅ Refresh token rotated successfully in database');
    
  } catch (error) {
    console.error('❌ Refresh token database update error:', error);
    // Don't throw here - token refresh should still work even if DB update fails
  }
}

// Helper function to initialize Supabase client
async function initializeSupabaseClient() {
  try {
    const [supabaseUrl, supabaseKey] = await Promise.all([
      getSecret('SUPABASE_URL'),
      getSecret('SUPABASE_KEY')
    ]);
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not available');
    }
    
    const { createClient } = require('@supabase/supabase-js');
    supabaseClient = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized for refresh token operations');
    
  } catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error);
    throw error;
  }
}

// Helper function to update token usage asynchronously
async function updateTokenUsageAsync(refreshToken, tokenId) {
  try {
    const now = new Date().toISOString();
    
    // Update by ID for better performance
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .update({
        last_used_at: now,
        updated_at: now
      })
      .eq('id', tokenId);
    
    if (error) {
      console.warn('⚠️ Failed to update token usage:', error);
    } else {
      console.log('✅ Token usage timestamp updated');
    }
    
  } catch (error) {
    console.warn('⚠️ Token usage update error:', error);
  }
}

module.exports = refreshToken;