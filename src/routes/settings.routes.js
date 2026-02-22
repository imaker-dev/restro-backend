const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settings.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// All routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/settings
 * @desc    Get all settings (optionally filtered by category)
 * @access  Private (admin, super_admin)
 * @query   outletId - Filter by outlet (optional)
 * @query   category - Filter by category (optional)
 */
router.get('/', authorize('super_admin', 'admin'), settingsController.getSettings);

/**
 * @route   GET /api/v1/settings/categories
 * @desc    Get all setting categories
 * @access  Private (admin, super_admin)
 */
router.get('/categories', authorize('super_admin', 'admin'), settingsController.getCategories);

/**
 * @route   GET /api/v1/settings/business-profile
 * @desc    Get business profile
 * @access  Private (admin, super_admin)
 */
router.get('/business-profile', authorize('super_admin', 'admin'), settingsController.getBusinessProfile);

/**
 * @route   PUT /api/v1/settings/business-profile
 * @desc    Update business profile
 * @access  Private (admin, super_admin)
 */
router.put('/business-profile', authorize('super_admin', 'admin'), settingsController.updateBusinessProfile);

/**
 * @route   GET /api/v1/settings/category/:category
 * @desc    Get settings by category
 * @access  Private (admin, super_admin)
 */
router.get('/category/:category', authorize('super_admin', 'admin'), settingsController.getByCategory);

/**
 * @route   PUT /api/v1/settings/category/:category
 * @desc    Update all settings in a category
 * @access  Private (admin, super_admin)
 */
router.put('/category/:category', authorize('super_admin', 'admin'), settingsController.updateByCategory);

/**
 * @route   POST /api/v1/settings/initialize
 * @desc    Initialize default settings
 * @access  Private (super_admin only)
 */
router.post('/initialize', authorize('super_admin'), settingsController.initializeDefaults);

/**
 * @route   PUT /api/v1/settings
 * @desc    Update multiple settings at once
 * @access  Private (admin, super_admin)
 */
router.put('/', authorize('super_admin', 'admin'), settingsController.updateMultiple);

/**
 * @route   GET /api/v1/settings/:key
 * @desc    Get a single setting by key
 * @access  Private (admin, super_admin)
 */
router.get('/:key', authorize('super_admin', 'admin'), settingsController.getSetting);

/**
 * @route   PUT /api/v1/settings/:key
 * @desc    Update a single setting
 * @access  Private (admin, super_admin)
 */
router.put('/:key', authorize('super_admin', 'admin'), settingsController.updateSetting);

/**
 * @route   POST /api/v1/settings/:key/reset
 * @desc    Reset setting to default value
 * @access  Private (admin, super_admin)
 */
router.post('/:key/reset', authorize('super_admin', 'admin'), settingsController.resetSetting);

module.exports = router;
