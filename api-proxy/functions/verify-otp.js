const axios = require('axios');
const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');
const {createTokenPair, getDeviceInfo} = require('../utils/jwt-utils');

/**
 * Enhanced OTP Verification with JWT Token System
 */
async function verifyOTP(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    try {
      console.log('🔐 JWT-based OTP verification starting...');
      
      const { email, otp } = req.body;

      if (!email || !otp) {
        return res.status(400).json({
          error: 'Email and OTP are required',
          code: 'MISSING_CREDENTIALS'
        });
      }

      // Get API key
      const apiKey = await getSecret('api-key');
      
      console.log(`📧 Verifying OTP for: ${email}`);

      // Verify OTP with API server
      const response = await axios.post(
        'https://api-server-559730737995.us-central1.run.app/auth/verify-otp',
        { email, otp },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey
          },
          timeout: 30000
        }
      );

      console.log('✅ API server OTP verification successful');

      // Extract user information from API response
      const {
        id: userId,
        email: userEmail,
        message
      } = response.data;

      if (!userId || !userEmail) {
        throw new Error('Invalid response from authentication server');
      }

      // Prepare user payload for JWT
      const userPayload = {
        user_id: userId,
        email: userEmail,
        session_id: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };

      // Get device information
      const deviceInfo = getDeviceInfo(req);
      
      console.log('🎟️ Creating JWT token pair...');

      // Create JWT token pair
      const tokenPair = await createTokenPair(userPayload, deviceInfo);

      console.log('✅ JWT tokens created successfully');

      // Set refresh token as httpOnly cookie (secure storage)
      const cookieOptions = [
        'httpOnly',
        'secure', // Always use secure in production
        'sameSite=lax',
        'path=/',
        `max-age=${30 * 24 * 60 * 60}` // 30 days
      ];

      res.setHeader('Set-Cookie', [
        `refresh_token=${tokenPair.refresh_token}; ${cookieOptions.join('; ')}`,
        `authenticated=true; path=/; max-age=${30 * 24 * 60 * 60}; sameSite=lax`
      ]);

      // Return user info and access token
      const responseData = {
        success: true,
        message: message || 'Authentication successful',
        user: {
          id: userId,
          email: userEmail,
          session_id: userPayload.session_id
        },
        tokens: {
          access_token: tokenPair.access_token,
          token_type: tokenPair.token_type,
          expires_in: tokenPair.expires_in,
          scope: tokenPair.scope
        },
        authentication: {
          method: 'jwt_bearer',
          expires_at: new Date(Date.now() + (15 * 60 * 1000)).toISOString(),
          refresh_expires_at: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
        }
      };

      console.log('✅ JWT-based authentication complete:', {
        userId,
        email: userEmail,
        tokenType: 'Bearer',
        expiresIn: '15 minutes'
      });

      res.status(200).json(responseData);

    } catch (error) {
      console.error('💥 JWT OTP verification error:', error);

      // Handle specific API server errors
      if (error.response) {
        const statusCode = error.response.status;
        const errorData = error.response.data;

        if (statusCode === 400) {
          return res.status(400).json({
            error: errorData.detail || 'Invalid OTP',
            code: 'INVALID_OTP'
          });
        }

        if (statusCode === 429) {
          return res.status(429).json({
            error: 'Too many attempts. Please try again later.',
            code: 'RATE_LIMIT_EXCEEDED',
            retry_after: errorData.retry_after || 60
          });
        }
      }

      // Handle timeout
      if (error.code === 'ECONNABORTED') {
        return res.status(504).json({
          error: 'Verification timeout. Please try again.',
          code: 'TIMEOUT'
        });
      }

      // Handle JWT creation errors
      if (error.message.includes('token') || error.message.includes('Supabase')) {
        return res.status(500).json({
          error: 'Authentication system error. Please try again.',
          code: 'TOKEN_CREATION_ERROR'
        });
      }

      // Generic error
      res.status(500).json({
        error: 'Authentication failed. Please try again.',
        code: 'AUTHENTICATION_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });
}

module.exports = verifyOTP;