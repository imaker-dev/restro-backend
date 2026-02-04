/**
 * Permission Middleware
 * Enforces feature-based permissions on API routes
 * 
 * Usage:
 * router.post('/bill/generate', requirePermission('BILL_GENERATE'), controller.generateBill);
 * router.get('/reports', requireAnyPermission(['REPORT_VIEW', 'REPORT_SALES']), controller.getReports);
 */

const permissionService = require('../services/permission.service');
const logger = require('../utils/logger');

/**
 * Require a specific permission
 */
const requirePermission = (permissionSlug) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const outletId = req.body?.outletId || req.query?.outletId || req.user?.outletId || null;
      
      const hasPermission = await permissionService.hasPermission(userId, permissionSlug, outletId);
      
      if (!hasPermission) {
        logger.warn(`Permission denied: User ${userId} lacks ${permissionSlug}`);
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
          requiredPermission: permissionSlug
        });
      }
      
      next();
    } catch (error) {
      logger.error('Permission check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Require any of the specified permissions
 */
const requireAnyPermission = (permissionSlugs) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const outletId = req.body?.outletId || req.query?.outletId || req.user?.outletId || null;
      
      const hasPermission = await permissionService.hasAnyPermission(userId, permissionSlugs, outletId);
      
      if (!hasPermission) {
        logger.warn(`Permission denied: User ${userId} lacks any of ${permissionSlugs.join(', ')}`);
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
          requiredPermissions: permissionSlugs,
          requirement: 'any'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Permission check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Require all of the specified permissions
 */
const requireAllPermissions = (permissionSlugs) => {
  return async (req, res, next) => {
    try {
      const userId = req.user?.userId;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      const outletId = req.body?.outletId || req.query?.outletId || req.user?.outletId || null;
      
      const hasPermission = await permissionService.hasAllPermissions(userId, permissionSlugs, outletId);
      
      if (!hasPermission) {
        logger.warn(`Permission denied: User ${userId} lacks all of ${permissionSlugs.join(', ')}`);
        return res.status(403).json({
          success: false,
          message: 'Permission denied',
          requiredPermissions: permissionSlugs,
          requirement: 'all'
        });
      }
      
      next();
    } catch (error) {
      logger.error('Permission check failed:', error);
      return res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Attach user permissions to request for frontend use
 */
const attachPermissions = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    
    if (userId) {
      const outletId = req.body?.outletId || req.query?.outletId || req.user?.outletId || null;
      req.userPermissions = await permissionService.getUserPermissions(userId, outletId);
    }
    
    next();
  } catch (error) {
    logger.error('Failed to attach permissions:', error);
    next(); // Continue even if permissions fail to attach
  }
};

module.exports = {
  requirePermission,
  requireAnyPermission,
  requireAllPermissions,
  attachPermissions
};
