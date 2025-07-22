const cors = require('cors')({origin: true});
const cookieParser = require('cookie-parser');
const {getSecret} = require('../utils/secret-manager');

let supabaseClient = null;

function parseCookies(req, res, next) {
  cookieParser()(req, res, next);
}

async function logout(req, res) {
  return cors(req, res, async () => {
    parseCookies(req, res, async () => {
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      
      const startTime = Date.now();
      
      try {
        console.log('🚪 Fast logout starting...');
        
        const refreshToken = req.cookies?.refresh_token;
        
        clearAuthCookiesFast(res);
        
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
  });
}

function clearAuthCookiesFast(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  };
  
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

async function revokeRefreshTokenAsync(refreshToken) {
  try {
    if (!supabaseClient) {
      const supabaseUrl = await getSecret('supabase-url');
      const supabaseKey = await getSecret('supabase-anon-key');
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
    }
    
    const now = new Date().toISOString();
    
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .update({
        is_active: false,
        revoked_at: now,
        updated_at: now
      })
      .eq('refresh_token', refreshToken);
    
    if (error) {
      console.warn('Failed to revoke refresh token in DB:', error);
    } else {
      console.log('✅ Refresh token revoked in database');
    }
    
  } catch (error) {
    console.warn('Error during token revocation:', error);
  }
}

module.exports = logout;