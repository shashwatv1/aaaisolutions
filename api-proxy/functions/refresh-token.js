const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {getSecret} = require('../utils/secret-manager');

/**
 * Refresh JWT access token using refresh token
 */
async function refreshToken(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      console.log('🔄 JWT token refresh starting...');
      
      // Get refresh token from HTTP-only cookie
      const refreshToken = req.cookies?.refresh_token;
      
      if (!refreshToken) {
        console.log('❌ No refresh token found in cookies');
        return res.status(401).json({
          error: 'Refresh token required',
          code: 'MISSING_REFRESH_TOKEN'
        });
      }
      
      // Get JWT secret
      const jwtSecret = await getSecret('JWT_SECRET_KEY');
      
      // Verify refresh token
      let payload;
      try {
        payload = jwt.verify(refreshToken, jwtSecret);
      } catch (error) {
        console.log('❌ Invalid refresh token:', error.message);
        
        // Clear invalid refresh token
        res.clearCookie('refresh_token');
        res.clearCookie('authenticated');
        
        return res.status(401).json({
          error: 'Invalid refresh token',
          code: 'INVALID_REFRESH_TOKEN'
        });
      }
      
      // Validate payload structure
      if (!payload.user_id || !payload.email || payload.token_type !== 'user_refresh') {
        console.log('❌ Invalid refresh token structure:', payload);
        return res.status(401).json({
          error: 'Invalid refresh token structure',
          code: 'INVALID_TOKEN_STRUCTURE'
        });
      }
      
      // Verify refresh token exists in database
      const isValidToken = await verifyRefreshTokenInDatabase(refreshToken, payload.user_id);
      if (!isValidToken) {
        console.log('❌ Refresh token not found in database');
        
        // Clear invalid refresh token
        res.clearCookie('refresh_token');
        res.clearCookie('authenticated');
        
        return res.status(401).json({
          error: 'Refresh token revoked',
          code: 'TOKEN_REVOKED'
        });
      }
      
      console.log('✅ Refresh token validated for user:', payload.email);
      
      // Create new access token
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
        jti: crypto.randomBytes(16).toString('hex')
      };
      
      const newAccessToken = jwt.sign(newAccessTokenPayload, jwtSecret, { algorithm: 'HS256' });
      
      // Update last_used_at in database
      await updateRefreshTokenLastUsed(refreshToken);
      
      console.log('✅ New access token created for user:', payload.email);
      
      // Return new access token
      res.status(200).json({
        tokens: {
          access_token: newAccessToken,
          expires_in: 900
        },
        user: {
          id: payload.user_id,
          email: payload.email,
          session_id: payload.session_id
        }
      });
      
    } catch (error) {
      console.error('💥 Token refresh error:', error);
      res.status(500).json({
        error: 'Internal server error during token refresh',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Verify refresh token exists in database
 */
async function verifyRefreshTokenInDatabase(refreshToken, userId) {
  try {
    // Get Supabase credentials
    const supabaseUrl = await getSecret('supabase-url');
    const supabaseKey = await getSecret('supabase-service-key');
    
    // Initialize Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Query the user_refresh_token table
    const { data, error } = await supabase
      .from('user_refresh_token')
      .select('id, user_id, expires_at, is_active')
      .eq('refresh_token', refreshToken)
      .eq('user_id', userId)
      .eq('is_active', true)
      .single();
    
    if (error) {
      console.log('❌ Refresh token query error:', error);
      return false;
    }
    
    if (!data) {
      console.log('❌ Refresh token not found in database');
      return false;
    }
    
    // Check if token is expired
    const expiresAt = new Date(data.expires_at);
    if (expiresAt < new Date()) {
      console.log('❌ Refresh token expired in database');
      return false;
    }
    
    console.log('✅ Refresh token validated in database');
    return true;
    
  } catch (error) {
    console.error('❌ Error verifying refresh token:', error);
    return false;
  }
}

/**
 * Update last_used_at timestamp for refresh token
 */
async function updateRefreshTokenLastUsed(refreshToken) {
  try {
    // Get Supabase credentials
    const supabaseUrl = await getSecret('SUPABASE_URL');
    const supabaseKey = await getSecret('SUPABASE_KEY');
    
    // Initialize Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Update last_used_at
    const { error } = await supabase
      .from('user_refresh_token')
      .update({
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('refresh_token', refreshToken);
    
    if (error) {
      console.warn('⚠️ Failed to update refresh token last_used_at:', error);
    }
    
  } catch (error) {
    console.warn('⚠️ Error updating refresh token last_used_at:', error);
  }
}

module.exports = refreshToken;