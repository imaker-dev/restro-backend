/**
 * Activation Middleware
 * 
 * Blocks ALL API requests (except activation routes) if the system is not activated.
 * This ensures the restaurant MUST activate with a valid token before using the POS.
 * 
 * The middleware caches the activation status in memory to avoid DB checks on every request.
 */

const licenseService = require('./license.service');
const logger = require('../../src/utils/logger');

// In-memory cache of activation status (reset on server restart)
let cachedStatus = null;
let lastCheck = 0;
const CACHE_TTL_MS = 30 * 1000; // Re-check every 30 seconds

// Paths that are allowed BEFORE activation
const ALLOWED_PATHS = [
  '/api/v1/activation',    // Activation routes
  '/health',               // Health check
  '/api/v1/network-info',  // Network discovery
  '/admin',                // Admin panel static files (has its own auth)
  '/uploads',              // Static uploaded files
];

/**
 * Check if the request path is allowed without activation
 */
const isAllowedPath = (path) => {
  return ALLOWED_PATHS.some(allowed => path.startsWith(allowed));
};

/**
 * Middleware that blocks requests if system is not activated
 */
const requireActivation = async (req, res, next) => {
  // Always allow activation-related paths and health checks
  if (isAllowedPath(req.path)) {
    return next();
  }
  
  // Skip check if not a free version
  if (process.env.IS_FREE_VERSION !== 'true' || process.env.ACTIVATION_REQUIRED !== 'true') {
    return next();
  }
  
  try {
    // Use cached status if fresh enough
    const now = Date.now();
    if (cachedStatus !== null && (now - lastCheck) < CACHE_TTL_MS) {
      if (cachedStatus.activated) {
        return next();
      }
      return res.status(403).json({
        success: false,
        code: 'NOT_ACTIVATED',
        message: 'System is not activated. Please activate with a valid token first.',
        activationUrl: '/api/v1/activation/activate',
      });
    }
    
    // Check activation status from DB
    const status = await licenseService.getActivationStatus();
    cachedStatus = status;
    lastCheck = now;
    
    if (status.activated) {
      return next();
    }
    
    return res.status(403).json({
      success: false,
      code: 'NOT_ACTIVATED',
      message: 'System is not activated. Please activate with a valid token first.',
      activationUrl: '/api/v1/activation/activate',
    });
    
  } catch (error) {
    logger.error('Activation check error:', error);
    // If we can't check, allow the request (fail-open for DB issues during startup)
    return next();
  }
};

/**
 * Clear the cached activation status (called after successful activation)
 */
const clearActivationCache = () => {
  cachedStatus = null;
  lastCheck = 0;
};

module.exports = {
  requireActivation,
  clearActivationCache,
};
