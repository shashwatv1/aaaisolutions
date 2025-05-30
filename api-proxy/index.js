const functions = require('@google-cloud/functions-framework');
const requestOTP = require('./functions/request-otp');
const verifyOTP = require('./functions/verify-otp');
const chat = require('./functions/chat');
const functionExecutor = require('./functions/function-executor');
const validateSession = require('./functions/validate-session'); 
const refreshToken = require('./functions/refresh-token');
const refreshTokenSilent = require('./functions/refresh-token-silent');
const logout = require('./functions/logout');

// Register all HTTP functions
functions.http('requestOTP', requestOTP);
functions.http('verifyOTP', verifyOTP);
functions.http('chat', chat);
functions.http('functionExecutor', functionExecutor);  // Changed this line
functions.http('validateSession', validateSession);
functions.http('refreshToken', refreshToken);
functions.http('refreshTokenSilent', refreshTokenSilent);
functions.http('logout', logout);