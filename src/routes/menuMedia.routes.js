/**
 * Menu Media Routes — Public endpoints
 * - Upload image/PDF
 * - List media for outlet
 * - Public HTML view (for QR scans)
 */

const express = require('express');
const router = express.Router();
const menuMediaController = require('../controllers/menuMedia.controller');

// Public upload (image or PDF)
router.post('/:outletId/upload', menuMediaController.uploadMenuMedia);
router.post('/:outletId/upload/multiple', menuMediaController.uploadMultipleMenuMedia);

// Public listing
router.get('/:outletId', menuMediaController.listMenuMedia);

// Public HTML gallery view (for QR codes)
router.get('/:outletId/view', menuMediaController.renderPublicView);

// Optional admin-style endpoints (left public per requirement; secure via gateway if needed)
router.patch('/:id/active', menuMediaController.setActive);
router.patch('/:id', menuMediaController.updateMeta);
router.patch('/:id/replace', menuMediaController.replaceMenuMediaFile);
router.delete('/:id', menuMediaController.deleteMenuMedia);

module.exports = router;
