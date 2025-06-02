const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {getSecret} = require('../utils/secret-manager');

// Connection pool for better performance
let supabaseClient = null;

/**
 * High-Performance JWT-based OTP Verification
 * Optimized for fast response times
 */
async function verifyOTP(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🔐 Fast JWT OTP verification starting...');
      
      const { email, otp } = req.body;
      
      if (!email || !otp) {
        return res.status(400).json({
          error: 'Email and OTP are required',
          code: 'MISSING_CREDENTIALS'
        });
      }
      
      console.log('📧 Fast OTP verification for:', email);
      
      // Get API key (cached in secret manager)
      const apiKey = await getSecret('api-key');
      
      // Fast API server call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
      
      const response = await fetch('https://api-server-559730737995.us-central1.run.app/auth/verify-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ email, otp }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const apiResult = await response.json();
      
      if (!response.ok) {
        console.error('❌ API server OTP verification failed:', apiResult);
        return res.status(response.status).json({
          error: apiResult.detail || apiResult.error || 'OTP verification failed',
          code: 'OTP_VERIFICATION_FAILED'
        });
      }
      
      console.log('✅ API server OTP verification successful');
      
      // Extract user data with validation
      const userData = apiResult.user;
      if (!userData?.id || !userData?.email) {
        console.error('❌ Invalid user data:', userData);
        return res.status(500).json({
          error: 'Invalid user data received',
          code: 'INVALID_USER_DATA'
        });
      }
      
      console.log('🎟️ Creating fast JWT token pair...');
      
      // Create JWT tokens quickly
      const tokenPair = await createFastJWTTokenPair(userData);
      
      // Set cookies efficiently
      const cookieOptions = {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/'
      };
      
      res.cookie('refresh_token', tokenPair.refreshToken, {
        ...cookieOptions,
        maxAge: 90 * 24 * 60 * 60 * 1000 // 90 days
      });
      
      res.cookie('authenticated', 'true', {
        ...cookieOptions,
        httpOnly: false, // Accessible to JS
        maxAge: 90 * 24 * 60 * 60 * 1000
      });
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast JWT authentication completed in ${responseTime}ms`);
      
      // Return optimized response
      res.status(200).json({
        user: {
          id: userData.id,
          email: userData.email,
          session_id: tokenPair.sessionId
        },
        tokens: {
          access_token: tokenPair.accessToken,
          expires_in: 900
        },
        authentication: {
          method: 'jwt_bearer',
          token_type: 'user_access_token',
          expires_in: 900
        },
        performance: {
          response_time_ms: responseTime
        }
      });
      
    } catch (error) {
      console.error('💥 Fast OTP verification error:', error);
      res.status(500).json({
        error: 'Internal server error during OTP verification',
        code: 'INTERNAL_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  });
}

/**
 * Create JWT token pair with optimized performance
 */
async function createFastJWTTokenPair(userData) {
  try {
    console.log('Creating fast JWT tokens for:', userData.email);
    
    // Get JWT secret (cached)
    const jwtSecret = await getSecret('JWT_SECRET_KEY');
    
    if (!jwtSecret) {
      throw new Error('JWT secret not configured');
    }
    
    // Generate session ID quickly
    const sessionId = crypto.randomBytes(16).toString('hex');
    const now = Math.floor(Date.now() / 1000);
    const jti = crypto.randomBytes(8).toString('hex');
    
    // Create access token (15 minutes)
    const accessTokenPayload = {
      user_id: userData.id,
      email: userData.email,
      session_id: sessionId,
      token_type: 'user_access',
      iss: 'aaai-solutions',
      aud: 'aaai-api',
      iat: now,
      exp: now + 900, // 15 minutes
      jti: jti
    };
    
    // Create refresh token (90 days)
    const refreshTokenPayload = {
      user_id: userData.id,
      email: userData.email,
      session_id: sessionId,
      token_type: 'user_refresh',
      iss: 'aaai-solutions',
      aud: 'aaai-refresh',
      iat: now,
      exp: now + (90 * 24 * 60 * 60), // 90 days
      jti: jti + '_refresh'
    };
    
    // Sign tokens in parallel for speed
    const [accessToken, refreshToken] = await Promise.all([
      new Promise((resolve, reject) => {
        jwt.sign(accessTokenPayload, jwtSecret, { algorithm: 'HS256' }, (err, token) => {
          if (err) reject(err);
          else resolve(token);
        });
      }),
      new Promise((resolve, reject) => {
        jwt.sign(refreshTokenPayload, jwtSecret, { algorithm: 'HS256' }, (err, token) => {
          if (err) reject(err);
          else resolve(token);
        });
      })
    ]);
    
    // Store refresh token asynchronously (non-blocking)
    storeRefreshTokenAsync(refreshToken, userData.id, sessionId).catch(error => {
      console.error('Warning: Failed to store refresh token:', error);
    });
    
    console.log('✅ Fast JWT tokens created');
    
    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: 900
    };
    
  } catch (error) {
    console.error('❌ Fast JWT creation failed:', error);
    throw new Error('Token creation failed');
  }
}

/**
 * Store refresh token asynchronously for better performance
 */
async function storeRefreshTokenAsync(refreshToken, userId, sessionId) {
  try {
    // Initialize Supabase client once and reuse
    if (!supabaseClient) {
      const [supabaseUrl, supabaseKey] = await Promise.all([
        getSecret('SUPABASE_URL'),
        getSecret('SUPABASE_KEY')
      ]);
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase credentials not configured');
      }
      
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      console.log('✅ Supabase client initialized for performance');
    }
    
    // Decode token for email (fast operation)
    const jwtSecret = await getSecret('JWT_SECRET_KEY');
    const payload = jwt.verify(refreshToken, jwtSecret);
    
    const now = new Date().toISOString();
    
    // Fast database insert
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .insert({
        user_id: userId,
        email: payload.email,
        refresh_token: refreshToken,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: now,
        updated_at: now,
        device_info: {
          session_id: sessionId,
          created_via: 'fast_otp_verification'
        },
        is_active: true,
        last_used_at: now
      });
    
    if (error) {
      console.error('❌ Fast refresh token storage failed:', error);
      throw new Error(`Refresh token storage failed: ${error.message}`);
    }
    
    console.log('✅ Refresh token stored quickly');
    
  } catch (error) {
    console.error('❌ Async refresh token storage error:', error);
    // Don't throw - this is non-blocking
  }
}

module.exports = verifyOTP;