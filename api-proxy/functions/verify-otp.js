const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {getSecret} = require('../utils/secret-manager');

/**
 * Enhanced JWT-based OTP Verification
 * Creates proper user JWT tokens (not service account tokens)
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
      
      console.log('📧 Verifying OTP for:', email);
      
      // Get API key from Secret Manager
      const apiKey = await getSecret('api-key');
      
      // Call API server for OTP verification
      const response = await fetch('https://api-server-559730737995.us-central1.run.app/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ email, otp })
      });
      
      const apiResult = await response.json();
      
      if (!response.ok) {
        console.error('❌ API server OTP verification failed:', apiResult);
        return res.status(response.status).json({
          error: apiResult.detail || apiResult.error || 'OTP verification failed',
          code: 'OTP_VERIFICATION_FAILED'
        });
      }
      
      console.log('✅ API server OTP verification successful');
      
      // Extract user information from API response
      const userData = apiResult.user;
      if (!userData || !userData.id || !userData.email) {
        console.error('❌ Invalid user data from API server:', userData);
        return res.status(500).json({
          error: 'Invalid user data received',
          code: 'INVALID_USER_DATA'
        });
      }
      
      console.log('🎟️ Creating JWT token pair...');
      
      // Create JWT token pair for the USER (not service account)
      const tokenPair = await createUserJWTTokenPair(userData);
      
      console.log('✅ JWT tokens created successfully');
      
      // Set refresh token as HTTP-only cookie
      res.cookie('refresh_token', tokenPair.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        path: '/'
      });
      
      // Set authentication indicator cookie
      res.cookie('authenticated', 'true', {
        secure: true,
        sameSite: 'lax',
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        path: '/'
      });
      
      // Return user data and access token
      res.status(200).json({
        user: {
          id: userData.id,
          email: userData.email,
          session_id: tokenPair.sessionId
        },
        tokens: {
          access_token: tokenPair.accessToken,
          expires_in: 900 // 15 minutes
        },
        authentication: {
          method: 'jwt_bearer',
          token_type: 'user_access_token',
          expires_in: 900
        }
      });
      
      console.log('✅ JWT-based authentication complete:', {
        userId: userData.id,
        email: userData.email,
        tokenType: 'Bearer',
        expiresIn: '15 minutes'
      });
      
    } catch (error) {
      console.error('💥 OTP verification error:', error);
      res.status(500).json({
        error: 'Internal server error during OTP verification',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Create JWT token pair for authenticated user
 */
async function createUserJWTTokenPair(userData) {
  try {
    console.log('Creating JWT token pair for user:', userData.email);
    
    // Get JWT secret from Secret Manager
    const jwtSecret = await getSecret('jwt-secret-key');
    
    if (!jwtSecret) {
      throw new Error('JWT secret key not configured');
    }
    
    // Generate session ID
    const sessionId = crypto.randomBytes(32).toString('hex');
    
    // Current time
    const now = Math.floor(Date.now() / 1000);
    
    // Create access token (15 minutes) - USER TOKEN
    const accessTokenPayload = {
      user_id: userData.id,
      email: userData.email,
      session_id: sessionId,
      token_type: 'user_access',
      iss: 'aaai-solutions',
      aud: 'aaai-api',
      iat: now,
      exp: now + 900, // 15 minutes
      jti: crypto.randomBytes(16).toString('hex')
    };
    
    // Create refresh token (90 days) - USER TOKEN
    const refreshTokenPayload = {
      user_id: userData.id,
      email: userData.email,
      session_id: sessionId,
      token_type: 'user_refresh',
      iss: 'aaai-solutions',
      aud: 'aaai-refresh',
      iat: now,
      exp: now + (90 * 24 * 60 * 60), // 90 days
      jti: crypto.randomBytes(16).toString('hex')
    };
    
    // Sign tokens
    const accessToken = jwt.sign(accessTokenPayload, jwtSecret, { algorithm: 'HS256' });
    const refreshToken = jwt.sign(refreshTokenPayload, jwtSecret, { algorithm: 'HS256' });
    
    // Store refresh token in database for validation
    await storeRefreshToken(refreshToken, userData.id, sessionId);
    
    console.log('✅ JWT token pair created successfully');
    
    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: 900
    };
    
  } catch (error) {
    console.error('❌ Failed to create JWT token pair:', error);
    throw new Error('Token creation failed');
  }
}

/**
 * Store refresh token securely
 */
async function storeRefreshToken(refreshToken, userId, sessionId) {
  try {
    // Get Supabase credentials
    const supabaseUrl = await getSecret('supabase-url');
    const supabaseKey = await getSecret('supabase-service-key');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured');
    }
    
    console.log('Initializing Supabase client...');
    
    // Initialize Supabase client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    console.log('✅ Supabase client initialized successfully');
    
    // Hash the refresh token for storage
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    
    // Store in refresh_tokens table
    const { error } = await supabase
      .from('refresh_tokens')
      .insert({
        token_hash: tokenHash,
        user_id: userId,
        session_id: sessionId,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        is_active: true
      });
    
    if (error) {
      console.error('❌ Failed to store refresh token:', error);
      throw new Error('Failed to store refresh token');
    }
    
    console.log('✅ Refresh token stored successfully');
    
  } catch (error) {
    console.error('❌ Error storing refresh token:', error);
    throw error;
  }
}

module.exports = verifyOTP;