const errorHandler = require('./errorHandler');
const validateModule = require('./validate');
const rateLimiter = require('./rateLimiter');
const authMiddleware = require('./auth.middleware');

module.exports = {
  errorHandler,
  ...validateModule,
  rateLimiter,
  ...authMiddleware,
};
