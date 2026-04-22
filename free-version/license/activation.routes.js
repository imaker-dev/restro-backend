/**
 * Activation Routes — Available BEFORE system is activated
 * 
 * These routes are NOT protected by auth middleware.
 * They allow the Flutter app to:
 *   1. Check if the system is activated
 *   2. Activate the system with a token
 *   3. Get system info (version, plan)
 */

const express = require('express');
const router = express.Router();
const licenseService = require('./license.service');
const logger = require('../../src/utils/logger');

/**
 * GET /api/v1/activation/status
 * Check if system is activated
 * 
 * Flutter calls this on startup to decide: show activation screen or login screen
 */
router.get('/status', async (req, res) => {
  try {
    const status = await licenseService.getActivationStatus();
    res.json({
      success: true,
      data: {
        activated: status.activated,
        restaurant: status.restaurant || null,
        plan: status.plan || 'free',
        maxOutlets: status.maxOutlets || 1,
        // Don't expose admin email in status check for security
      }
    });
  } catch (error) {
    logger.error('Activation status error:', error);
    res.status(500).json({ success: false, message: 'Failed to check activation status' });
  }
});

/**
 * POST /api/v1/activation/activate
 * Activate the system with a token
 * 
 * Body: { token: "base64url_payload.base64url_signature" }
 * 
 * On success:
 *   - Creates admin user
 *   - Seeds roles/permissions
 *   - Returns admin email (password was given separately by imaker)
 */
router.post('/activate', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Activation token is required'
      });
    }
    
    const result = await licenseService.activate(token.trim());
    
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error
      });
    }
    
    res.json({
      success: true,
      message: 'System activated successfully',
      data: {
        activated: true,
        restaurant: result.restaurant,
        adminEmail: result.adminEmail,
        licenseId: result.licenseId,
      }
    });
    
  } catch (error) {
    logger.error('Activation error:', error);
    res.status(500).json({ success: false, message: 'Activation failed. Please try again.' });
  }
});

/**
 * GET /api/v1/activation/info
 * Get system info (even before activation)
 */
router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      product: 'Restro POS',
      version: process.env.FREE_VERSION_ID || 'free-offline-v1',
      isFreeVersion: true,
      plan: 'free',
    }
  });
});

/**
 * POST /api/v1/activation/validate-token
 * Validate a token WITHOUT activating (dry run)
 * Useful for Flutter to show token validity before confirming
 */
router.post('/validate-token', (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }
    
    const { valid, payload, error } = licenseService.verifyToken(token.trim());
    
    if (!valid) {
      return res.status(400).json({ success: false, message: error });
    }
    
    res.json({
      success: true,
      data: {
        valid: true,
        restaurant: payload.restaurant,
        plan: payload.plan,
        adminEmail: payload.email,
        maxOutlets: payload.maxOutlets,
      }
    });
  } catch (error) {
    logger.error('Token validation error:', error);
    res.status(500).json({ success: false, message: 'Token validation failed' });
  }
});

module.exports = router;
