/**
 * Permission Routes
 * API endpoints for permission management
 */

const express = require('express');
const router = express.Router();
const permissionController = require('../controllers/permission.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/permissions
 * @desc    Get all available permissions
 * @access  Private (authenticated users)
 */
router.get('/', permissionController.getAllPermissions);

/**
 * @route   GET /api/v1/permissions/my
 * @desc    Get current user's permissions
 * @access  Private (authenticated users)
 */
router.get('/my', permissionController.getMyPermissions);

/**
 * @route   GET /api/v1/permissions/grantable
 * @desc    Get permissions current user can grant
 * @access  Private (admin, manager)
 */
router.get('/grantable', authorize('super_admin', 'admin', 'manager'), permissionController.getGrantablePermissions);

/**
 * @route   POST /api/v1/permissions/check
 * @desc    Check if current user has specific permission(s)
 * @access  Private (authenticated users)
 */
router.post('/check', permissionController.checkPermission);

/**
 * @route   GET /api/v1/roles/:id/permissions
 * @desc    Get default permissions for a role
 * @access  Private (admin, manager)
 */
router.get('/roles/:id', authorize('super_admin', 'admin', 'manager'), permissionController.getRolePermissions);

module.exports = router;
