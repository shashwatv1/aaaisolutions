const cors = require('cors')({origin: true});
const {refreshAccessToken, revokeRefreshToken} = require('../utils/jwt-utils');

/**
 * JWT Token Refresh Function
 * Uses httpOnly refresh token to generate new access token
 */
async function refreshToken(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      console.log('🔄 JWT token refresh starting...');

      // Extract refresh token from httpOnly cookie
      let refreshToken = null;

      if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'refresh_token' && value) {
            refreshToken = decodeURIComponent(value);
            break;
          }
        }
      }

      if (!refreshToken) {
        console.log('❌ No refresh token found in cookies');
        return res.status(401).json({
          error: 'Refresh token not found',
          code: 'MISSING_REFRESH_TOKEN',
          action: 'login_required'
        });
      }

      console.log('🎟️ Refresh token found, generating new access token...');

      // Generate new access token
      const tokenData = await refreshAccessToken(refreshToken);

      console.log('✅ New access token generated successfully');

      // Return new access token
      const responseData = {
        success: true,
        message: 'Token refreshed successfully',
        user: tokenData.user,
        tokens: {
          access_token: tokenData.access_token,
          token_type: tokenData.token_type,
          expires_in: tokenData.expires_in
        },
        authentication: {
          method: 'jwt_bearer',
          expires_at: new Date(Date.now() + (15 * 60 * 1000)).toISOString(),
          refreshed_at: new Date().toISOString()
        }
      };

      console.log('✅ JWT token refresh complete:', {
        userId: tokenData.user.user_id,
        email: tokenData.user.email,
        expiresIn: '15 minutes'
      });

      res.status(200).json(responseData);

    } catch (error) {
      console.error('💥 JWT token refresh error:', error);

      // Handle specific refresh token errors
      if (error.message.includes('Invalid or expired')) {
        // Try to revoke the invalid token
        try {
          const refreshToken = extractRefreshTokenFromCookies(req.headers.cookie);
          if (refreshToken) {
            await revokeRefreshToken(refreshToken);
          }
        } catch (revokeError) {
          console.warn('Failed to revoke invalid token:', revokeError);
        }

        // Clear the invalid refresh token cookie
        res.setHeader('Set-Cookie', [
          'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; httpOnly; secure; sameSite=lax',
          'authenticated=false; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; sameSite=lax'
        ]);

        return res.status(401).json({
          error: 'Refresh token expired or invalid',
          code: 'INVALID_REFRESH_TOKEN',
          action: 'login_required'
        });
      }

      // Handle database/Supabase errors
      if (error.message.includes('Supabase') || error.message.includes('database')) {
        return res.status(503).json({
          error: 'Authentication service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          retry_after: 60
        });
      }

      // Generic error
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Silent token refresh (same as above, but with different endpoint name)
 * For backward compatibility with existing frontend code
 */
async function refreshTokenSilent(req, res) {
  return refreshToken(req, res);
}

/**
 * Helper function to extract refresh token from cookie string
 */
function extractRefreshTokenFromCookies(cookieString) {
  if (!cookieString) return null;

  const cookies = cookieString.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'refresh_token' && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

module.exports = {
  refreshToken,
  refreshTokenSilent
};