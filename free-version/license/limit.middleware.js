/**
 * Plan Limit Enforcement Middleware
 * 
 * Checks user count and outlet count against the current license limits.
 * Applied to user-creation and outlet-creation routes in app-free.js.
 * 
 * Free plan: max 10 users, 1 outlet
 * Pro plan:  unlimited users (-1), 3 outlets
 */

const licenseService = require('./license.service');
const { getPool } = require('../../src/database');
const logger = require('../../src/utils/logger');

/**
 * Middleware: block if user count >= license maxUsers
 */
const checkUserLimit = async (req, res, next) => {
  try {
    const status = await licenseService.getLicenseStatus();

    // -1 = unlimited
    if (status.maxUsers === -1) return next();

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT COUNT(*) as cnt FROM users WHERE deleted_at IS NULL AND is_active = 1'
    );
    const currentCount = rows[0]?.cnt || 0;

    if (currentCount >= status.maxUsers) {
      return res.status(403).json({
        success: false,
        code: 'USER_LIMIT_REACHED',
        message: `Your ${status.plan} plan allows a maximum of ${status.maxUsers} staff users. Please upgrade to add more.`,
        upgradeRequired: true,
        currentCount,
        limit: status.maxUsers,
      });
    }

    next();
  } catch (err) {
    logger.warn('[LimitGuard] User limit check failed, allowing:', err.message);
    next(); // fail-open
  }
};

/**
 * Middleware: block if outlet count >= license maxOutlets
 */
const checkOutletLimit = async (req, res, next) => {
  try {
    const status = await licenseService.getLicenseStatus();

    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT COUNT(*) as cnt FROM outlets WHERE is_active = 1'
    );
    const currentCount = rows[0]?.cnt || 0;

    if (currentCount >= status.maxOutlets) {
      return res.status(403).json({
        success: false,
        code: 'OUTLET_LIMIT_REACHED',
        message: `Your ${status.plan} plan allows a maximum of ${status.maxOutlets} outlet(s). Please upgrade to add more.`,
        upgradeRequired: true,
        currentCount,
        limit: status.maxOutlets,
      });
    }

    next();
  } catch (err) {
    logger.warn('[LimitGuard] Outlet limit check failed, allowing:', err.message);
    next(); // fail-open
  }
};

module.exports = {
  checkUserLimit,
  checkOutletLimit,
};
