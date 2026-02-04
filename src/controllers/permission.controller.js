/**
 * Permission Controller
 * Handles permission management API endpoints
 */

const permissionService = require('../services/permission.service');
const logger = require('../utils/logger');

/**
 * GET /api/v1/permissions
 * Get all available permissions grouped by category
 */
const getAllPermissions = async (req, res, next) => {
  try {
    const result = await permissionService.getAllPermissions();
    
    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get permissions failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/permissions/my
 * Get current user's permissions
 */
const getMyPermissions = async (req, res, next) => {
  try {
    const outletId = req.query.outletId || null;
    const permissions = await permissionService.getUserPermissions(req.user.userId, outletId);
    
    res.status(200).json({
      success: true,
      data: permissions
    });
  } catch (error) {
    logger.error('Get my permissions failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/permissions/grantable
 * Get permissions current user can grant to others
 */
const getGrantablePermissions = async (req, res, next) => {
  try {
    const outletId = req.query.outletId || null;
    const permissions = await permissionService.getGrantablePermissions(req.user.userId, outletId);
    
    res.status(200).json({
      success: true,
      data: permissions
    });
  } catch (error) {
    logger.error('Get grantable permissions failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/users/:id/permissions
 * Get specific user's permissions
 */
const getUserPermissions = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const outletId = req.query.outletId || null;
    
    const permissions = await permissionService.getUserPermissions(userId, outletId);
    
    res.status(200).json({
      success: true,
      data: permissions
    });
  } catch (error) {
    logger.error('Get user permissions failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/users/:id/permissions
 * Set user's permissions (replace all)
 */
const setUserPermissions = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { permissions, outletId, reason } = req.body;
    
    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({
        success: false,
        message: 'Permissions array is required'
      });
    }
    
    const result = await permissionService.setUserPermissions(
      userId,
      permissions,
      req.user.userId,
      outletId || null,
      {
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Permissions updated successfully',
      data: result
    });
  } catch (error) {
    if (error.message.includes('cannot') || error.message.includes('don\'t have')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Set user permissions failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/users/:id/permissions/grant
 * Grant specific permissions to user
 */
const grantPermissions = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { permissions, outletId, reason } = req.body;
    
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Permissions array is required'
      });
    }
    
    const result = await permissionService.grantPermissions(
      userId,
      permissions,
      req.user.userId,
      outletId || null,
      {
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Permissions granted successfully',
      data: result
    });
  } catch (error) {
    if (error.message.includes('cannot') || error.message.includes('don\'t have')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Grant permissions failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/users/:id/permissions/revoke
 * Revoke specific permissions from user
 */
const revokePermissions = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { permissions, outletId, reason } = req.body;
    
    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Permissions array is required'
      });
    }
    
    const result = await permissionService.revokePermissions(
      userId,
      permissions,
      req.user.userId,
      outletId || null,
      {
        reason,
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Permissions revoked successfully',
      data: result
    });
  } catch (error) {
    if (error.message.includes('cannot') || error.message.includes('don\'t have')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Revoke permissions failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/users/:id/permissions/history
 * Get permission change history for user
 */
const getPermissionHistory = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const limit = parseInt(req.query.limit, 10) || 50;
    
    const history = await permissionService.getPermissionHistory(userId, limit);
    
    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    logger.error('Get permission history failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/roles/:id/permissions
 * Get default permissions for a role
 */
const getRolePermissions = async (req, res, next) => {
  try {
    const roleId = parseInt(req.params.id, 10);
    const permissions = await permissionService.getRolePermissions(roleId);
    
    res.status(200).json({
      success: true,
      data: permissions
    });
  } catch (error) {
    logger.error('Get role permissions failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/permissions/check
 * Check if current user has specific permission(s)
 */
const checkPermission = async (req, res, next) => {
  try {
    const { permission, permissions, outletId } = req.body;
    
    if (permission) {
      // Single permission check
      const hasPermission = await permissionService.hasPermission(
        req.user.userId,
        permission,
        outletId || null
      );
      
      return res.status(200).json({
        success: true,
        data: {
          permission,
          granted: hasPermission
        }
      });
    }
    
    if (permissions && Array.isArray(permissions)) {
      // Multiple permission check
      const userPerms = await permissionService.getUserPermissions(req.user.userId, outletId);
      
      const results = {};
      for (const perm of permissions) {
        results[perm] = userPerms.isSuperuser || userPerms.permissions.includes(perm);
      }
      
      return res.status(200).json({
        success: true,
        data: {
          permissions: results,
          isSuperuser: userPerms.isSuperuser
        }
      });
    }
    
    return res.status(400).json({
      success: false,
      message: 'Permission or permissions array is required'
    });
  } catch (error) {
    logger.error('Check permission failed:', error);
    next(error);
  }
};

module.exports = {
  getAllPermissions,
  getMyPermissions,
  getGrantablePermissions,
  getUserPermissions,
  setUserPermissions,
  grantPermissions,
  revokePermissions,
  getPermissionHistory,
  getRolePermissions,
  checkPermission
};
