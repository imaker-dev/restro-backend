/**
 * Wastage Routes — Module 10
 */

const express = require('express');
const router = express.Router();
const wastageController = require('../controllers/wastage.controller');

// Record wastage
router.post('/:outletId', wastageController.recordWastage);

// List wastage logs
router.get('/:outletId', wastageController.listWastage);

// Get near-expiry batches (flag only, no auto-deduction)
router.get('/:outletId/near-expiry', wastageController.getNearExpiryBatches);

module.exports = router;
