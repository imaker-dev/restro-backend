/**
 * Inventory Reports Routes — Module 11
 */

const express = require('express');
const router = express.Router();
const inventoryReportsController = require('../controllers/inventoryReports.controller');

// 1. Stock Summary Report
router.get('/:outletId/stock-summary', inventoryReportsController.stockSummary);

// 2. Batch Report
router.get('/:outletId/batches', inventoryReportsController.batchReport);

// 3. Stock Ledger (MOST IMPORTANT)
router.get('/:outletId/stock-ledger', inventoryReportsController.stockLedger);

// 4. Recipe Consumption Report
router.get('/:outletId/recipe-consumption', inventoryReportsController.recipeConsumption);

// 5. Production Report
router.get('/:outletId/production', inventoryReportsController.productionReport);

// 6. Wastage Report
router.get('/:outletId/wastage', inventoryReportsController.wastageReport);

// 7. Profit Report
router.get('/:outletId/profit', inventoryReportsController.profitReport);

// 8. Daily Business Summary
router.get('/:outletId/daily-summary', inventoryReportsController.dailySummary);

module.exports = router;
