const cors = require('cors')({origin: true});
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const {getSecret} = require('../utils/secret-manager');

let supabaseClient = null;

async function verifyOTP(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('🔐 JWT OTP verification starting for 7-day session...');
      
      const { email, otp } = req.body;
      
      if (!email || !otp) {
        return res.status(400).json({
          error: 'Email and OTP are required',
          code: 'MISSING_CREDENTIALS'
        });
      }
      
      console.log('📧 OTP verification for:', email);
      
      const apiKey = await getSecret('api-key');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
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
      
      const userData = apiResult.user;
      if (!userData?.id || !userData?.email) {
        console.error('❌ Invalid user data:', userData);
        return res.status(500).json({
          error: 'Invalid user data received',
          code: 'INVALID_USER_DATA'
        });
      }
      
      console.log('🎟️ Creating JWT token pair for 7-day session...');
      
      const tokenPair = await createJWTTokenPair(userData);
      
      console.log('🍪 Setting authentication cookies...');
      
      setCookies(req, res, tokenPair, userData);
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ JWT authentication completed in ${responseTime}ms`);
      
      res.status(200).json({
        user: {
          id: userData.id,
          email: userData.email,
          session_id: tokenPair.sessionId
        },
        tokens: {
          access_token: tokenPair.accessToken,
          refresh_token: tokenPair.refreshToken,
          token_type: 'Bearer',
          expires_in: 21600
        },
        authentication: {
          method: 'jwt_bearer',
          session_duration: '7_days'
        },
        performance: {
          response_time_ms: responseTime
        }
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

async function createJWTTokenPair(userData) {
  const jwtSecret = await getSecret('JWT_SECRET_KEY');
  
  if (!jwtSecret) {
    throw new Error('JWT secret not configured');
  }
  
  const sessionId = crypto.randomBytes(16).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomBytes(8).toString('hex');
  
  const accessTokenPayload = {
    user_id: userData.id,
    email: userData.email,
    session_id: sessionId,
    token_type: 'user_access',
    iss: 'aaai-solutions',
    aud: 'aaai-api',
    iat: now,
    exp: now + 21600, // 6 hours
    jti: jti
  };
  
  const refreshTokenPayload = {
    user_id: userData.id,
    email: userData.email,
    session_id: sessionId,
    token_type: 'user_refresh',
    iss: 'aaai-solutions',
    aud: 'aaai-refresh',
    iat: now,
    exp: now + (7 * 24 * 60 * 60), // 7 days
    jti: jti + '_refresh'
  };
  
  const accessToken = jwt.sign(accessTokenPayload, jwtSecret, { algorithm: 'HS256' });
  const refreshToken = jwt.sign(refreshTokenPayload, jwtSecret, { algorithm: 'HS256' });
  
  if (!accessToken || !refreshToken) {
    throw new Error('Token creation failed');
  }
  
  console.log('✅ JWT tokens created successfully');
  
  // Store refresh token in database - WAIT for completion
  await storeRefreshToken(refreshToken, userData.id, sessionId);
  
  return {
    accessToken,
    refreshToken,
    sessionId,
    expiresIn: 21600
  };
}

function setCookies(req, res, tokenPair, userData) {
  const secure = req.headers['x-forwarded-proto'] === 'https';
  
  // Set refresh token cookie - 7 days
  res.cookie('refresh_token', tokenPair.refreshToken, {
    httpOnly: true,
    secure: secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  
  // Set authenticated flag - 6 hours
  res.cookie('authenticated', 'true', {
    httpOnly: false,
    secure: secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 21600000
  });
  
  // Set user info cookie - 6 hours
  res.cookie('user_info', JSON.stringify({
    id: userData.id,
    email: userData.email,
    session_id: tokenPair.sessionId
  }), {
    httpOnly: false,
    secure: secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 21600000
  });
  
  console.log('✅ All authentication cookies set for 7-day session');
}

async function storeRefreshToken(refreshToken, userId, sessionId) {
  try {
    if (!supabaseClient) {
      const [supabaseUrl, supabaseKey] = await Promise.all([
        getSecret('SUPABASE_URL'),
        getSecret('SUPABASE_KEY')
      ]);
      
      const { createClient } = require('@supabase/supabase-js');
      supabaseClient = createClient(supabaseUrl, supabaseKey);
      console.log('✅ Supabase client initialized for refresh token storage');
    }
    
    const jwtSecret = await getSecret('JWT_SECRET_KEY');
    const payload = jwt.verify(refreshToken, jwtSecret);
    
    const now = new Date().toISOString();
    const expiresAt = new Date(payload.exp * 1000).toISOString();
    
    const { data, error } = await supabaseClient
      .from('user_refresh_token')
      .insert({
        user_id: userId,
        email: payload.email,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        created_at: now,
        updated_at: now,
        device_info: {
          session_id: sessionId,
          created_via: 'otp_verification',
          user_agent: 'web_client'
        },
        is_active: true,
        last_used_at: now
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('❌ Failed to store refresh token:', error);
      throw new Error('Failed to store refresh token: ' + error.message);
    } else {
      console.log('✅ Refresh token stored in database with ID:', data.id);
    }
    
  } catch (error) {
    console.error('❌ Refresh token storage error:', error);
    throw error;
  }
}

module.exports = verifyOTP;