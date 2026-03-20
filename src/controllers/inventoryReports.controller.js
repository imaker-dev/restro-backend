/**
 * Inventory Reports Controller — Module 11
 */

const inventoryReportsService = require('../services/inventoryReports.service');
const logger = require('../utils/logger');

const inventoryReportsController = {

  async stockSummary(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { categoryId, search, lowStockOnly, sortBy, sortOrder } = req.query;
      const result = await inventoryReportsService.stockSummary(outletId, {
        categoryId, search, lowStockOnly, sortBy, sortOrder
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating stock summary:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async batchReport(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { inventoryItemId, activeOnly, sortBy, sortOrder } = req.query;
      const result = await inventoryReportsService.batchReport(outletId, {
        inventoryItemId, activeOnly, sortBy, sortOrder
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating batch report:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async stockLedger(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { inventoryItemId, movementType, startDate, endDate, page, limit, sortOrder } = req.query;
      const result = await inventoryReportsService.stockLedger(outletId, {
        inventoryItemId, movementType, startDate, endDate, page, limit, sortOrder
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating stock ledger:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async recipeConsumption(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { startDate, endDate, recipeId, menuItemId } = req.query;
      const result = await inventoryReportsService.recipeConsumption(outletId, {
        startDate, endDate, recipeId, menuItemId
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating recipe consumption report:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async productionReport(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { startDate, endDate, status, outputItemId } = req.query;
      const result = await inventoryReportsService.productionReport(outletId, {
        startDate, endDate, status, outputItemId
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating production report:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async wastageReport(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { startDate, endDate, wastageType, inventoryItemId, groupBy } = req.query;
      const result = await inventoryReportsService.wastageReport(outletId, {
        startDate, endDate, wastageType, inventoryItemId, groupBy
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating wastage report:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async profitReport(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { startDate, endDate, menuItemId, sortBy, sortOrder } = req.query;
      const result = await inventoryReportsService.profitReport(outletId, {
        startDate, endDate, menuItemId, sortBy, sortOrder
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating profit report:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async dailySummary(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { date, startDate, endDate } = req.query;
      const result = await inventoryReportsService.dailyBusinessSummary(outletId, {
        date, startDate, endDate
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error generating daily summary:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = inventoryReportsController;
