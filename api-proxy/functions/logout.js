const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

/**
 * Logout user and revoke refresh token
 */
async function logout(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    try {
      console.log('🚪 JWT logout starting...');
      
      // Get refresh token from HTTP-only cookie
      const refreshToken = req.cookies?.refresh_token;
      
      if (refreshToken) {
        // Revoke refresh token in database
        await revokeRefreshToken(refreshToken);
      }
      
      // Clear cookies
      res.clearCookie('refresh_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/'
      });
      
      res.clearCookie('authenticated', {
        secure: true,
        sameSite: 'lax',
        path: '/'
      });
      
      console.log('✅ Logout completed successfully');
      
      res.status(200).json({
        message: 'Logout successful',
        code: 'LOGOUT_SUCCESS'
      });
      
    } catch (error) {
      console.error('💥 Logout error:', error);
      
      // Still clear cookies even if database operation fails
      res.clearCookie('refresh_token');
      res.clearCookie('authenticated');
      
      res.status(200).json({
        message: 'Logout completed with warnings',
        code: 'LOGOUT_PARTIAL'
      });
    }
  });
}

/**
 * Revoke refresh token in database
 */
async function revokeRefreshToken(refreshToken) {
  try {
    // Get Supabase credentials
    const supabaseUrl = await getSecret('SUPABASE_URL');
    const supabaseKey = await getSecret('SUPABASE_KEY');
    
    // Initialize Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Mark refresh token as inactive
    const { error } = await supabase
      .from('user_refresh_token')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('refresh_token', refreshToken);
    
    if (error) {
      console.warn('⚠️ Failed to revoke refresh token:', error);
    } else {
      console.log('✅ Refresh token revoked successfully');
    }
    
  } catch (error) {
    console.warn('⚠️ Error revoking refresh token:', error);
  }
}

module.exports = logout;