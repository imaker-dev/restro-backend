/**
 * Module Guard Middleware
 * 
 * Restricts access to Pro-only API routes based on the current license.
 * Usage:  router.use('/captain', requireModule('captain'), captainRoutes);
 * 
 * Checks the activation_info table for module flags.
 * Caches result in memory (refreshed every 30s or on upgrade).
 */

const licenseService = require('./license.service');
const logger = require('../../src/utils/logger');

// In-memory cache
let _cachedModules = null;
let _lastCheck = 0;
const CACHE_TTL_MS = 30 * 1000;

/**
 * Refresh the module cache from DB.
 * Also called by license.routes.js after a successful upgrade.
 */
const refreshModuleCache = () => {
  _cachedModules = null;
  _lastCheck = 0;
};

const _getModules = async () => {
  const now = Date.now();
  if (_cachedModules && (now - _lastCheck) < CACHE_TTL_MS) {
    return _cachedModules;
  }

  try {
    const status = await licenseService.getLicenseStatus();
    _cachedModules = status.modules || { captain: false, inventory: false, advancedReports: false };
    _lastCheck = now;
    return _cachedModules;
  } catch (err) {
    logger.warn('[ModuleGuard] Failed to fetch modules, allowing access:', err.message);
    // Fail-open: if DB is unreachable, allow request rather than blocking
    return { captain: true, inventory: true, advancedReports: true };
  }
};

/**
 * Express middleware factory.
 * @param {string} moduleName - One of: 'captain', 'inventory', 'advancedReports'
 */
const requireModule = (moduleName) => {
  return async (req, res, next) => {
    try {
      const modules = await _getModules();

      if (modules[moduleName]) {
        return next();
      }

      return res.status(403).json({
        success: false,
        code: 'MODULE_NOT_ENABLED',
        message: `${_friendlyName(moduleName)} requires Pro plan. Please upgrade to access this feature.`,
        upgradeRequired: true,
        module: moduleName,
      });
    } catch (err) {
      logger.error('[ModuleGuard] Error:', err.message);
      // Fail-open
      return next();
    }
  };
};

const _friendlyName = (m) => {
  switch (m) {
    case 'captain': return 'Captain Module';
    case 'inventory': return 'Inventory Module';
    case 'advancedReports': return 'Advanced Reports';
    default: return m;
  }
};

module.exports = {
  requireModule,
  refreshModuleCache,
};
