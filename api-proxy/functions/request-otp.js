const cors = require('cors')({
  origin: 'https://aaai.solutions',
  credentials: true, // ← This is crucial for credentials: 'include'
  optionsSuccessStatus: 200
});
const {getSecret} = require('../utils/secret-manager');

// Cache API key for performance
let apiKeyCache = null;
let apiKeyCacheExpiry = null;

/**
 * FIXED: High-Performance OTP Request with proper CORS credentials
 */
async function requestOTP(req, res) {
  return cors(req, res, async () => {
    // FIXED: Explicitly set CORS headers for all responses
    res.set({
      'Access-Control-Allow-Origin': 'https://aaai.solutions',
      'Access-Control-Allow-Credentials': 'true' // ← This fixes the CORS error
    });

    if (req.method === 'OPTIONS') {
      res.set({
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '3600'
      });
      res.status(204).send('');
      return;
    }
    
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }
    
    const startTime = Date.now();
    
    try {
      console.log('📧 Fast OTP request starting...');
      
      // Quick input validation
      const { email } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({
          error: 'Valid email address is required',
          code: 'INVALID_EMAIL'
        });
      }
      
      console.log('📧 Fast OTP request for:', email);
      
      // Get API key with caching
      const apiKey = await getFastAPIKey();
      
      // Fast API call with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout
      
      const response = await fetch('https://api-server-559730737995.us-central1.run.app/auth/request-otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey
        },
        body: JSON.stringify({ email }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      const data = await response.json();
      
      if (!response.ok) {
        console.error('❌ Fast OTP request failed:', data);
        return res.status(response.status).json({
          error: data.error || data.detail || 'Failed to request OTP',
          code: 'OTP_REQUEST_FAILED'
        });
      }
      
      const responseTime = Date.now() - startTime;
      console.log(`✅ Fast OTP request completed in ${responseTime}ms`);
      
      // Return optimized response
      res.status(200).json({
        ...data,
        performance: {
          response_time_ms: responseTime
        }
      });
      
    } catch (error) {
      console.error('💥 Fast OTP request error:', error);
      
      if (error.name === 'AbortError') {
        return res.status(408).json({
          error: 'Request timeout',
          code: 'TIMEOUT'
        });
      }
      
      res.status(500).json({
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      });
    }
  });
}

async function getFastAPIKey() {
  if (apiKeyCache && apiKeyCacheExpiry && Date.now() < apiKeyCacheExpiry) {
    return apiKeyCache;
  }
  
  try {
    apiKeyCache = await getSecret('api-key');
    apiKeyCacheExpiry = Date.now() + (30 * 60 * 1000); // 30 minutes
    return apiKeyCache;
  } catch (error) {
    console.error('❌ API key retrieval failed:', error);
    throw new Error('API key unavailable');
  }
}

module.exports = requestOTP;