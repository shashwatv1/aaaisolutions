const cors = require('cors')({origin: true});
const {revokeRefreshToken, revokeAllUserTokens, extractBearerToken, verifyAccessToken} = require('../utils/jwt-utils');

/**
 * JWT-based Logout Function
 * Revokes refresh tokens and clears authentication
 */
async function logout(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      console.log('🚪 JWT-based logout starting...');

      let userId = null;
      let refreshToken = null;

      // Try to get user ID from JWT token for comprehensive logout
      const accessToken = extractBearerToken(req.headers.authorization);
      if (accessToken) {
        const verification = verifyAccessToken(accessToken);
        if (verification.valid) {
          userId = verification.payload.user_id;
          console.log('👤 User ID extracted from JWT for comprehensive logout:', userId);
        }
      }

      // Extract refresh token from httpOnly cookie
      if (req.headers.cookie) {
        const cookies = req.headers.cookie.split(';');
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'refresh_token' && value) {
            refreshToken = decodeURIComponent(value);
            console.log('🎟️ Refresh token found for revocation');
            break;
          }
        }
      }

      // Revoke tokens
      const revocationPromises = [];

      if (refreshToken) {
        console.log('🗑️ Revoking current refresh token...');
        revocationPromises.push(
          revokeRefreshToken(refreshToken).catch(error => {
            console.warn('Failed to revoke specific refresh token:', error);
          })
        );
      }

      if (userId) {
        console.log('🗑️ Revoking all user tokens for comprehensive logout...');
        revocationPromises.push(
          revokeAllUserTokens(userId).catch(error => {
            console.warn('Failed to revoke all user tokens:', error);
          })
        );
      }

      // Wait for all revocation attempts
      await Promise.allSettled(revocationPromises);

      // Clear authentication cookies
      const clearCookies = [
        'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; httpOnly; secure; sameSite=lax',
        'authenticated=false; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; sameSite=lax'
      ];

      res.setHeader('Set-Cookie', clearCookies);

      console.log('✅ JWT-based logout completed successfully');

      // Return success response
      res.status(200).json({
        success: true,
        message: 'Logout successful',
        logout: {
          access_token_invalidated: !!accessToken,
          refresh_token_revoked: !!refreshToken,
          all_sessions_revoked: !!userId,
          cookies_cleared: true,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('💥 JWT logout error:', error);

      // Even if there's an error, still clear cookies for security
      const clearCookies = [
        'refresh_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; httpOnly; secure; sameSite=lax',
        'authenticated=false; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; sameSite=lax'
      ];

      res.setHeader('Set-Cookie', clearCookies);

      // Handle database/Supabase errors
      if (error.message.includes('Supabase') || error.message.includes('database')) {
        return res.status(200).json({
          success: true,
          message: 'Logout completed (with warnings)',
          warning: 'Some tokens may not have been revoked due to service issues',
          logout: {
            cookies_cleared: true,
            timestamp: new Date().toISOString()
          }
        });
      }

      // For any other error, still report success since cookies are cleared
      res.status(200).json({
        success: true,
        message: 'Logout completed',
        logout: {
          cookies_cleared: true,
          timestamp: new Date().toISOString()
        }
      });
    }
  });
}

module.exports = logout;