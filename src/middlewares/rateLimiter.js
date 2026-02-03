const rateLimit = require('express-rate-limit');
const rateLimitConfig = require('../config/rateLimit.config');

const createRateLimiter = (options = {}) => {
  return rateLimit({
    ...rateLimitConfig,
    ...options,
  });
};

// Default API rate limiter
const apiLimiter = createRateLimiter();

// Strict limiter for auth endpoints
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    message: 'Too many login attempts, please try again after 15 minutes',
  },
});

// Relaxed limiter for read-only endpoints
const readLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200,
});

// Strict limiter for sensitive operations
const sensitiveLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: {
    success: false,
    message: 'Too many requests for this operation, please try again later',
  },
});

module.exports = {
  createRateLimiter,
  apiLimiter,
  authLimiter,
  readLimiter,
  sensitiveLimiter,
};
