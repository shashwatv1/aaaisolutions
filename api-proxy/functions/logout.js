const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

// Cached Supabase client for performance
let supabaseClient = null;

/**
 * High-Performance Logout
 * Optimized for fast logout with minimal blocking operations
 */
async function logout(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🚪 Fast logout starting...');
      
      const refreshToken = req.cookies?.refresh_token;
      
      // Clear cookies immediately (most important part)
      clearAuthCookiesFast(res);
      
      // Revoke refresh token asynchronously (non-blocking)
      if (refreshToken) {
        revokeRefreshTokenAsync(refreshToken).catch(error => {
          console.warn('Warning: Failed to revoke refresh token:', error);
        });
      }
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast logout completed in ${responseTime}ms`);
      
      res.status(200).json({
        message: 'Logout successful',
        code: 'LOGOUT_SUCCESS',
        performance: {
          response_time_ms: responseTime
        }
      });
      
    } catch (error) {
      console.error('💥 Fast logout error:', error);
      
      // Still clear cookies even if other operations fail
      clearAuthCookiesFast(res);
      
      const responseTime = Date.now() - startTime;
      
      res.status(200).json({
        message: 'Logout completed with warnings',
        code: 'LOGOUT_PARTIAL',
        performance: {
          response_time_ms: responseTime
        }
      });
    }
  });
}

/**
 * Clear authentication cookies efficiently
 */
function clearAuthCookiesFast(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  };
  
  // Clear all auth-related cookies
  const cookiesToClear = [
    'refresh_token',
    'authenticated', 
    'access_token',
    'user_info',
    'session_id'
  ];
  
  cookiesToClear.forEach(cookieName => {
    res.clearCookie(cookieName, cookieOptions);
  });
  
  console.log('✅ Fast auth cookies cleared');
}

/**
 * Revoke refresh token asynchronously (non-blocking)
 */
async function revokeRefreshTokenAsync(refreshToken) {
  try {
    // Initialize Supabase client once and reuse
    if (!supabaseClient) {
      const [supabaseUrl, supabaseKey] = await Promise.all([
        getSecret('SUPABASE_URL'),
        getSecret('SUPABASE_KEY')
      ]);
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not available');
      }
      
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      console.log('✅ Supabase client initialized for fast logout');
    }
    
    // Fast database update
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('refresh_token', refreshToken);
    
    if (error) {
      console.warn('⚠️ Fast refresh token revocation failed:', error);
    } else {
      console.log('✅ Refresh token revoked successfully');
    }
    
  } catch (error) {
    console.warn('⚠️ Async refresh token revocation error:', error);
    // Don't throw - this is non-blocking
  }
}

module.exports = logout;