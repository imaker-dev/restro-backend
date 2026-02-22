const settingsService = require('../services/settings.service');
const logger = require('../utils/logger');

/**
 * GET /api/v1/settings
 * Get all settings (optionally filtered by category)
 */
const getSettings = async (req, res, next) => {
  try {
    const { outletId, category } = req.query;
    const result = await settingsService.getAll(
      outletId ? parseInt(outletId, 10) : null,
      category || null
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get settings failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/settings/categories
 * Get all setting categories
 */
const getCategories = async (req, res, next) => {
  try {
    const categories = await settingsService.getCategories();

    res.status(200).json({
      success: true,
      data: categories
    });
  } catch (error) {
    logger.error('Get categories failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/settings/category/:category
 * Get settings by category
 */
const getByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const { outletId } = req.query;
    
    const result = await settingsService.getByCategory(
      category,
      outletId ? parseInt(outletId, 10) : null
    );

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    logger.error('Get settings by category failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/settings/:key
 * Get a single setting by key
 */
const getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { outletId } = req.query;
    
    const setting = await settingsService.get(
      key,
      outletId ? parseInt(outletId, 10) : null
    );

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: `Setting '${key}' not found`
      });
    }

    res.status(200).json({
      success: true,
      data: setting
    });
  } catch (error) {
    logger.error('Get setting failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/settings/:key
 * Update a single setting
 */
const updateSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, outletId } = req.body;

    if (value === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Value is required'
      });
    }

    const setting = await settingsService.update(
      key,
      value,
      outletId ? parseInt(outletId, 10) : null,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: 'Setting updated successfully',
      data: setting
    });
  } catch (error) {
    if (error.message.includes('not editable')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Update setting failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/settings
 * Update multiple settings at once
 */
const updateMultiple = async (req, res, next) => {
  try {
    const { settings, outletId } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }

    const result = await settingsService.updateMultiple(
      settings,
      outletId ? parseInt(outletId, 10) : null,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: `Updated ${Object.keys(result.updated).length} settings`,
      data: result
    });
  } catch (error) {
    logger.error('Update multiple settings failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/settings/category/:category
 * Update all settings in a category
 */
const updateByCategory = async (req, res, next) => {
  try {
    const { category } = req.params;
    const { settings, outletId } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Settings object is required'
      });
    }

    const result = await settingsService.updateByCategory(
      category,
      settings,
      outletId ? parseInt(outletId, 10) : null,
      req.user.userId
    );

    res.status(200).json({
      success: true,
      message: `Updated ${Object.keys(result.updated).length} settings in ${category}`,
      data: result
    });
  } catch (error) {
    logger.error('Update settings by category failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/settings/:key/reset
 * Reset setting to default value
 */
const resetSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const { outletId } = req.body;

    const result = await settingsService.resetToDefault(
      key,
      outletId ? parseInt(outletId, 10) : null
    );

    res.status(200).json({
      success: true,
      message: 'Setting reset to default',
      data: result
    });
  } catch (error) {
    if (error.message.includes('No default')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Reset setting failed:', error);
    next(error);
  }
};

/**
 * POST /api/v1/settings/initialize
 * Initialize default settings for outlet
 */
const initializeDefaults = async (req, res, next) => {
  try {
    const { outletId } = req.body;

    const result = await settingsService.initializeDefaults(
      outletId ? parseInt(outletId, 10) : null
    );

    res.status(200).json({
      success: true,
      message: 'Default settings initialized',
      data: result
    });
  } catch (error) {
    logger.error('Initialize defaults failed:', error);
    next(error);
  }
};

/**
 * GET /api/v1/settings/business-profile
 * Get business profile
 */
const getBusinessProfile = async (req, res, next) => {
  try {
    const profile = await settingsService.getBusinessProfile();

    res.status(200).json({
      success: true,
      data: profile
    });
  } catch (error) {
    logger.error('Get business profile failed:', error);
    next(error);
  }
};

/**
 * PUT /api/v1/settings/business-profile
 * Update business profile
 */
const updateBusinessProfile = async (req, res, next) => {
  try {
    const profile = await settingsService.updateBusinessProfile(req.body);

    res.status(200).json({
      success: true,
      message: 'Business profile updated successfully',
      data: profile
    });
  } catch (error) {
    if (error.message.includes('No fields')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Update business profile failed:', error);
    next(error);
  }
};

module.exports = {
  getSettings,
  getCategories,
  getByCategory,
  getSetting,
  updateSetting,
  updateMultiple,
  updateByCategory,
  resetSetting,
  initializeDefaults,
  getBusinessProfile,
  updateBusinessProfile
};
