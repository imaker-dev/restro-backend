const express = require('express');
const router = express.Router();
const appVersionController = require('../controllers/appVersion.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// =====================
// PUBLIC ENDPOINTS
// =====================

// GET /api/v1/app/version - Get latest version (for app update checks)
// This endpoint is public to allow update checks before login
router.get('/version', appVersionController.getLatestVersion);

// GET /api/v1/app/version/checksum - Get checksum for integrity verification
router.get('/version/checksum', appVersionController.getChecksum);

// =====================
// ADMIN ENDPOINTS
// =====================

// GET /api/v1/app/versions - List all versions (admin)
router.get('/versions', authenticate, authorize(['super_admin', 'admin']), appVersionController.getAllVersions);

// GET /api/v1/app/versions/:id - Get version by ID (admin)
router.get('/versions/:id', authenticate, authorize(['super_admin', 'admin']), appVersionController.getVersionById);

// POST /api/v1/app/versions - Create new version (admin)
router.post('/versions', authenticate, authorize(['super_admin','admin']), appVersionController.createVersion);

// PUT /api/v1/app/versions/:id - Update version (admin)
router.put('/versions/:id', authenticate, authorize(['super_admin','admin']), appVersionController.updateVersion);

// DELETE /api/v1/app/versions/:id - Delete version (admin)
router.delete('/versions/:id', authenticate, authorize(['super_admin','admin']), appVersionController.deleteVersion);

module.exports = router;
