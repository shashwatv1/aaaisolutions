const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {getSecret} = require('../utils/secret-manager');

// Cached connections and secrets for performance
let supabaseClient = null;
let jwtSecretCache = null;
let secretCacheExpiry = null;

/**
 * High-Performance JWT Token Refresh
 * Optimized for minimal latency
 */
async function refreshToken(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🔄 Fast JWT token refresh starting...');
      
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
      
      // Create new access token quickly
      const newAccessToken = await createFastAccessToken(payload);
      
      // Update database asynchronously (non-blocking)
      updateRefreshTokenUsageAsync(refreshToken).catch(error => {
        console.warn('Warning: Failed to update token usage:', error);
      });
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast token refresh completed in ${responseTime}ms for:`, payload.email);
      
      // Return optimized response
      res.status(200).json({
        tokens: {
          access_token: newAccessToken,
          expires_in: 900
        },
        user: {
          id: payload.user_id,
          email: payload.email,
          session_id: payload.session_id
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

/**
 * Get JWT secret with caching for performance
 */
async function getFastJWTSecret() {
  // Use cached secret if still valid (cache for 5 minutes)
  if (jwtSecretCache && secretCacheExpiry && Date.now() < secretCacheExpiry) {
    return jwtSecretCache;
  }
  
  try {
    jwtSecretCache = await getSecret('JWT_SECRET_KEY');
    secretCacheExpiry = Date.now() + (5 * 60 * 1000); // 5 minutes
    return jwtSecretCache;
  } catch (error) {
    console.error('Failed to get JWT secret:', error);
    throw new Error('JWT secret not available');
  }
}

/**
 * Fast refresh token verification with connection reuse
 */
async function verifyRefreshTokenFast(refreshToken, userId) {
  try {
    // Initialize Supabase client once and reuse
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
      .maybeSingle(); // Use maybeSingle for better performance
    
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

/**
 * Create new access token quickly
 */
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
      exp: now + 900, // 15 minutes
      jti: crypto.randomBytes(8).toString('hex')
    };
    
    // Use synchronous signing for speed
    return jwt.sign(newAccessTokenPayload, jwtSecret, { algorithm: 'HS256' });
    
  } catch (error) {
    console.error('❌ Fast access token creation failed:', error);
    throw new Error('Access token creation failed');
  }
}

/**
 * Update refresh token usage asynchronously (non-blocking)
 */
async function updateRefreshTokenUsageAsync(refreshToken) {
  try {
    if (!supabaseClient) {
      return; // Skip if no client available
    }
    
    const now = new Date().toISOString();
    
    // Fast update with minimal data
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .update({
        last_used_at: now,
        updated_at: now
      })
      .eq('refresh_token', refreshToken);
    
    if (error) {
      console.warn('⚠️ Fast refresh token update failed:', error);
    } else {
      console.log('✅ Fast refresh token usage updated');
    }
    
  } catch (error) {
    console.warn('⚠️ Fast refresh token update error:', error);
  }
}

/**
 * Clear authentication cookies efficiently
 */
function clearAuthCookies(res) {
  const cookieOptions = {
    path: '/',
    secure: true,
    sameSite: 'lax'
  };
  
  res.clearCookie('refresh_token', cookieOptions);
  res.clearCookie('authenticated', cookieOptions);
}

module.exports = refreshToken;