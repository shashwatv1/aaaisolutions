/**
 * Standard error handler for function responses
 * @param {Error} error - The error object
 * @param {Response} res - Express response object
 */
function handleError(error, res) {
    console.error('Function error:', error);
    
    const statusCode = error.response?.status || 500;
    const errorMessage = error.response?.data?.detail || error.message || 'Internal server error';
    
    res.status(statusCode).json({ 
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
  
  module.exports = {
    handleError
  };