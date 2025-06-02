const cors = require('cors')({origin: true});
const {getSecret} = require('../utils/secret-manager');

// Cache API key for performance
let apiKeyCache = null;
let apiKeyCacheExpiry = null;

/**
 * High-Performance OTP Request
 * Optimized for fast response times
 */
async function requestOTP(req, res) {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
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
        res.status(408).json({
          error: 'Request timeout - please try again',
          code: 'REQUEST_TIMEOUT'
        });
      } else {
        res.status(500).json({
          error: 'Internal server error during OTP request',
          code: 'INTERNAL_ERROR',
          timestamp: new Date().toISOString()
        });
      }
    }
  });
}

/**
 * Get API key with caching for performance
 */
async function getFastAPIKey() {
  // Use cached API key if still valid (cache for 10 minutes)
  if (apiKeyCache && apiKeyCacheExpiry && Date.now() < apiKeyCacheExpiry) {
    return apiKeyCache;
  }
  
  try {
    apiKeyCache = await getSecret('api-key');
    apiKeyCacheExpiry = Date.now() + (10 * 60 * 1000); // 10 minutes
    return apiKeyCache;
  } catch (error) {
    console.error('Failed to get API key:', error);
    throw new Error('API key not available');
  }
}

module.exports = requestOTP;