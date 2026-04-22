/**
 * License Routes — Protected by auth middleware
 * 
 * These routes handle:
 *   1. License status check (modules, plan, limits)
 *   2. Upgrade token validation (dry run)
 *   3. Upgrade application (Free → Pro)
 * 
 * All routes require authentication (Bearer token).
 */

const express = require('express');
const router = express.Router();
const licenseService = require('./license.service');
const logger = require('../../src/utils/logger');
const { authenticate, authorize } = require('../../src/middlewares/auth.middleware');

/**
 * GET /api/v1/license/status
 * Returns current plan, module flags, and limits.
 * Used by Flutter LicenseProvider on startup.
 */
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = await licenseService.getLicenseStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    logger.error('License status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get license status' });
  }
});

/**
 * POST /api/v1/license/validate-upgrade
 * Dry-run validation of an upgrade token.
 * Shows what will change before applying.
 * Admin only.
 * 
 * Body: { token: "base64url_payload.base64url_signature" }
 */
router.post('/validate-upgrade', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Upgrade token is required',
      });
    }

    const result = await licenseService.validateUpgrade(token.trim());

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.json({
      success: true,
      data: result.preview,
    });
  } catch (error) {
    logger.error('Upgrade validation error:', error);
    res.status(500).json({ success: false, message: 'Upgrade validation failed' });
  }
});

/**
 * POST /api/v1/license/upgrade
 * Apply an upgrade token. Updates license, broadcasts to all devices.
 * Admin only.
 * 
 * Body: { token: "base64url_payload.base64url_signature" }
 */
router.post('/upgrade', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { token } = req.body;

    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Upgrade token is required',
      });
    }

    const result = await licenseService.applyUpgrade(token.trim(), req.user.userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    // Broadcast to all connected devices via WebSocket
    try {
      const { getSocketIO } = require('../../src/config/socket');
      const io = getSocketIO();
      io.emit('plan:upgraded', {
        plan: result.data.plan,
        modules: result.data.modules,
        maxOutlets: result.data.maxOutlets,
        maxUsers: result.data.maxUsers,
        message: 'Your plan has been upgraded to Pro! Captain and Inventory modules are now available.',
        timestamp: new Date().toISOString(),
      });
      logger.info('[License] plan:upgraded event broadcast to all devices');
    } catch (socketErr) {
      // Non-fatal: upgrade succeeded even if broadcast fails
      logger.warn('[License] Failed to broadcast upgrade event:', socketErr.message);
    }

    // Clear caches so middleware picks up new plan immediately
    const { clearActivationCache } = require('./activation.middleware');
    clearActivationCache();
    const { refreshModuleCache } = require('./module.middleware');
    refreshModuleCache();

    res.json({
      success: true,
      message: 'Plan upgraded successfully',
      data: result.data,
    });
  } catch (error) {
    logger.error('Upgrade error:', error);
    res.status(500).json({ success: false, message: 'Upgrade failed. Please try again.' });
  }
});

module.exports = router;
