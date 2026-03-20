/**
 * Wastage Controller — Module 10
 */

const wastageService = require('../services/wastage.service');
const logger = require('../utils/logger');

const wastageController = {

  async recordWastage(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const userId = req.user?.id || null;
      const result = await wastageService.recordWastage(outletId, req.body, userId);
      res.status(201).json({ success: true, data: result, message: 'Wastage recorded successfully' });
    } catch (error) {
      logger.error('Error recording wastage:', error);
      const status = error.message.includes('not found') ? 404
        : error.message.includes('required') || error.message.includes('must be') ? 400 : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  async listWastage(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const { page, limit, inventoryItemId, wastageType, startDate, endDate, sortBy, sortOrder } = req.query;
      const result = await wastageService.listWastage(outletId, {
        page, limit, inventoryItemId, wastageType, startDate, endDate, sortBy, sortOrder
      });
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error listing wastage:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getNearExpiryBatches(req, res) {
    try {
      const outletId = parseInt(req.params.outletId);
      const daysAhead = parseInt(req.query.days) || 7;
      const result = await wastageService.getNearExpiryBatches(outletId, daysAhead);
      res.json({
        success: true,
        data: {
          batches: result,
          totalCount: result.length,
          expiredCount: result.filter(b => b.isExpired).length,
          estimatedTotalLoss: parseFloat(result.reduce((s, b) => s + b.estimatedLoss, 0).toFixed(2))
        }
      });
    } catch (error) {
      logger.error('Error getting near-expiry batches:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = wastageController;
