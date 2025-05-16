const functions = require('@google-cloud/functions-framework');
const requestOTP = require('./functions/request-otp');
const verifyOTP = require('./functions/verify-otp');
const chat = require('./functions/chat');
const functionExecutor = require('./functions/function-executor');

// Register all HTTP functions
functions.http('requestOTP', requestOTP);
functions.http('verifyOTP', verifyOTP);
functions.http('chat', chat);
functions.http('executeFunction', functionExecutor);