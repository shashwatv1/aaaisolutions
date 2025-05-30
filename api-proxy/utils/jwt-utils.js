/**
 * JWT Utilities for AAAI Solutions
 * Handles JWT creation, validation, and refresh token management with Secret Manager
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { getSecret } = require('./secret-manager');

// Lazy-loaded Supabase client
let supabase = null;

// JWT Configuration
const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRY: '15m',     // 15 minutes
  REFRESH_TOKEN_EXPIRY: '30d',    // 30 days
  ISSUER: 'aaai-solutions',
  AUDIENCE: 'aaai-users'
};

/**
 * Initialize Supabase client lazily
 */
async function getSupabaseClient() {
  if (!supabase) {
    try {
      console.log('Initializing Supabase client...');
      const supabaseUrl = await getSecret('supabase-url');
      const supabaseKey = await getSecret('supabase-service-role-key');
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase credentials in Secret Manager');
      }
      
      supabase = createClient(supabaseUrl, supabaseKey);
      console.log('✅ Supabase client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize Supabase client:', error);
      throw new Error('Supabase initialization failed: ' + error.message);
    }
  }
  return supabase;
}

/**
 * Get JWT secret from Secret Manager
 */
async function getJWTSecret() {
  try {
    return await getSecret('jwt-secret');
  } catch (error) {
    console.error('Failed to get JWT secret:', error);
    throw new Error('JWT secret not available');
  }
}

/**
 * Generate JWT access token
 */
async function generateAccessToken(userPayload) {
  const jwtSecret = await getJWTSecret();
  
  const payload = {
    user_id: userPayload.user_id,
    email: userPayload.email,
    session_id: userPayload.session_id,
    iat: Math.floor(Date.now() / 1000),
    iss: JWT_CONFIG.ISSUER,
    aud: JWT_CONFIG.AUDIENCE
  };

  return jwt.sign(payload, jwtSecret, {
    expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRY
  });
}

/**
 * Generate secure refresh token
 */
function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Verify and decode JWT access token
 */
async function verifyAccessToken(token) {
  try {
    const jwtSecret = await getJWTSecret();
    
    const decoded = jwt.verify(token, jwtSecret, {
      issuer: JWT_CONFIG.ISSUER,
      audience: JWT_CONFIG.AUDIENCE
    });
    
    return {
      valid: true,
      payload: decoded,
      expired: false
    };
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        valid: false,
        payload: null,
        expired: true,
        error: 'Token expired'
      };
    }
    
    return {
      valid: false,
      payload: null,
      expired: false,
      error: error.message
    };
  }
}

/**
 * Store refresh token in Supabase
 */
async function storeRefreshToken(userPayload, refreshToken, deviceInfo = {}) {
  try {
    const supabaseClient = await getSupabaseClient();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    const { data, error } = await supabaseClient
      .from('user_refresh_token')
      .insert({
        user_id: userPayload.user_id,
        email: userPayload.email,
        refresh_token: refreshToken,
        expires_at: expiresAt.toISOString(),
        device_info: deviceInfo,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing refresh token:', error);
      throw new Error('Failed to store refresh token: ' + error.message);
    }

    console.log('✅ Refresh token stored successfully');
    return data;
  } catch (error) {
    console.error('Store refresh token error:', error);
    throw error;
  }
}

/**
 * Validate refresh token and get user info
 */
async function validateRefreshToken(refreshToken) {
  try {
    const supabaseClient = await getSupabaseClient();
    
    const { data, error } = await supabaseClient
      .from('user_refresh_token')
      .select('*')
      .eq('refresh_token', refreshToken)
      .eq('is_active', true)
      .gte('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      console.log('Refresh token validation failed:', error?.message || 'Token not found');
      return {
        valid: false,
        user: null,
        error: 'Invalid or expired refresh token'
      };
    }

    // Update last_used_at
    await supabaseClient
      .from('user_refresh_token')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    console.log('✅ Refresh token validated successfully');
    return {
      valid: true,
      user: {
        user_id: data.user_id,
        email: data.email,
        session_id: `refresh_${data.id}`
      },
      tokenData: data
    };
  } catch (error) {
    console.error('Validate refresh token error:', error);
    return {
      valid: false,
      user: null,
      error: error.message
    };
  }
}

/**
 * Revoke refresh token
 */
async function revokeRefreshToken(refreshToken) {
  try {
    const supabaseClient = await getSupabaseClient();
    
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .update({ is_active: false })
      .eq('refresh_token', refreshToken);

    if (error) {
      throw new Error('Failed to revoke refresh token: ' + error.message);
    }

    console.log('✅ Refresh token revoked successfully');
    return true;
  } catch (error) {
    console.error('Revoke refresh token error:', error);
    throw error;
  }
}

/**
 * Revoke all refresh tokens for a user
 */
async function revokeAllUserTokens(userId) {
  try {
    const supabaseClient = await getSupabaseClient();
    
    const { error } = await supabaseClient
      .from('user_refresh_token')
      .update({ is_active: false })
      .eq('user_id', userId);

    if (error) {
      throw new Error('Failed to revoke user tokens: ' + error.message);
    }

    console.log('✅ All user tokens revoked successfully');
    return true;
  } catch (error) {
    console.error('Revoke all user tokens error:', error);
    throw error;
  }
}

/**
 * Create complete token pair (access + refresh)
 */
async function createTokenPair(userPayload, deviceInfo = {}) {
  try {
    console.log('Creating JWT token pair for user:', userPayload.email);
    
    // Generate tokens
    const accessToken = await generateAccessToken(userPayload);
    const refreshToken = generateRefreshToken();

    // Store refresh token
    await storeRefreshToken(userPayload, refreshToken, deviceInfo);

    console.log('✅ JWT token pair created successfully');
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 900, // 15 minutes in seconds
      scope: 'read write'
    };
  } catch (error) {
    console.error('Create token pair error:', error);
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(refreshToken) {
  try {
    console.log('Refreshing JWT access token...');
    
    // Validate refresh token
    const validation = await validateRefreshToken(refreshToken);
    
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Generate new access token
    const accessToken = await generateAccessToken(validation.user);

    console.log('✅ JWT access token refreshed successfully');
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 900, // 15 minutes in seconds
      user: validation.user
    };
  } catch (error) {
    console.error('Refresh access token error:', error);
    throw error;
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(authHeader) {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Middleware to validate JWT token
 */
function validateJWTMiddleware(req, res, next) {
  return async function(req, res, next) {
    try {
      // Extract token from Authorization header
      const token = extractBearerToken(req.headers.authorization);
      
      if (!token) {
        return res.status(401).json({
          error: 'Authorization token required',
          code: 'MISSING_TOKEN'
        });
      }

      // Verify token
      const verification = await verifyAccessToken(token);
      
      if (!verification.valid) {
        if (verification.expired) {
          return res.status(401).json({
            error: 'Token expired',
            code: 'TOKEN_EXPIRED',
            expired: true
          });
        }
        
        return res.status(401).json({
          error: 'Invalid token',
          code: 'INVALID_TOKEN',
          details: verification.error
        });
      }

      // Add user info to request
      req.user = verification.payload;
      next();
    } catch (error) {
      console.error('JWT validation middleware error:', error);
      return res.status(500).json({
        error: 'Token validation failed',
        code: 'VALIDATION_ERROR'
      });
    }
  };
}

/**
 * Get device info from request
 */
function getDeviceInfo(req) {
  return {
    user_agent: req.headers['user-agent'] || 'Unknown',
    ip_address: req.ip || req.connection.remoteAddress || 'Unknown',
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  storeRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  createTokenPair,
  refreshAccessToken,
  extractBearerToken,
  validateJWTMiddleware,
  getDeviceInfo,
  getSupabaseClient,
  JWT_CONFIG
};