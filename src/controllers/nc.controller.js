/**
 * NC (No Charge) Controller
 * Handles NC operations for items and orders
 */

const ncService = require('../services/nc.service');
const logger = require('../utils/logger');

const ncController = {
  // ========================
  // NC REASONS
  // ========================

  /**
   * Get NC reasons for an outlet
   * GET /api/v1/orders/:outletId/nc/reasons
   */
  async getNCReasons(req, res) {
    try {
      const { outletId } = req.params;
      // const includeInactive = req.query.includeInactive === 'true';

      const reasons = await ncService.getNCReasons(outletId);
      res.json({ success: true, data: reasons });
    } catch (error) {
      logger.error('Get NC reasons error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Create NC reason
   * POST /api/v1/orders/:outletId/nc/reasons
   */
  async createNCReason(req, res) {
    try {
      const { outletId } = req.params;
      const { name, description, displayOrder } = req.body;

      if (!name) {
        return res.status(400).json({ success: false, message: 'Name is required' });
      }

      const reason = await ncService.createNCReason(outletId, { name, description, displayOrder });
      res.status(201).json({ success: true, message: 'NC reason created', data: reason });
    } catch (error) {
      logger.error('Create NC reason error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Update NC reason
   * PUT /api/v1/orders/:outletId/nc/reasons/:reasonId
   */
  async updateNCReason(req, res) {
    try {
      const { reasonId } = req.params;
      const { name, description, isActive, displayOrder } = req.body;

      const reason = await ncService.updateNCReason(reasonId, { name, description, isActive, displayOrder });
      if (!reason) {
        return res.status(404).json({ success: false, message: 'NC reason not found' });
      }

      res.json({ success: true, message: 'NC reason updated', data: reason });
    } catch (error) {
      logger.error('Update NC reason error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // ITEM LEVEL NC
  // ========================

  /**
   * Mark an order item as NC
   * POST /api/v1/orders/:orderId/items/:orderItemId/nc
   */
  async markItemAsNC(req, res) {
    try {
      const { orderItemId } = req.params;
      const { ncReasonId, ncReason, notes } = req.body;
      const userId = req.user.userId;

      if (!ncReason && !ncReasonId) {
        return res.status(400).json({ success: false, message: 'NC reason is required' });
      }

      const result = await ncService.markItemAsNC(orderItemId, { ncReasonId, ncReason, notes }, userId);
      res.json({ success: true, message: 'Item marked as NC', data: result });
    } catch (error) {
      logger.error('Mark item as NC error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Remove NC from an order item
   * DELETE /api/v1/orders/:orderId/items/:orderItemId/nc
   */
  async removeItemNC(req, res) {
    try {
      const { orderItemId } = req.params;
      const { notes } = req.body;
      const userId = req.user.userId;

      const result = await ncService.removeItemNC(orderItemId, userId, notes);
      res.json({ success: true, message: 'NC removed from item', data: result });
    } catch (error) {
      logger.error('Remove item NC error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // BULK ITEM NC OPERATIONS
  // ========================

  /**
   * Mark multiple order items as NC (bulk operation)
   * POST /api/v1/orders/:orderId/items/nc/bulk
   */
  async markItemsAsNC(req, res) {
    try {
      const { orderId } = req.params;
      const { items, ncReasonId, ncReason, notes } = req.body;
      const userId = req.user.userId;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Items array is required' });
      }

      if (!ncReason && !items.every(item => item.ncReason)) {
        return res.status(400).json({ success: false, message: 'NC reason is required (either common or per item)' });
      }

      const result = await ncService.markItemsAsNC(
        parseInt(orderId),
        items,
        { ncReasonId, ncReason, notes },
        userId
      );

      res.json({ 
        success: true, 
        message: `${result.successCount} items marked as NC`, 
        data: result 
      });
    } catch (error) {
      logger.error('Bulk mark items as NC error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Remove NC from multiple order items (bulk operation)
   * DELETE /api/v1/orders/:orderId/items/nc/bulk
   */
  async removeItemsNC(req, res) {
    try {
      const { orderId } = req.params;
      const { orderItemIds, notes } = req.body;
      const userId = req.user.userId;

      if (!orderItemIds || !Array.isArray(orderItemIds) || orderItemIds.length === 0) {
        return res.status(400).json({ success: false, message: 'orderItemIds array is required' });
      }

      const result = await ncService.removeItemsNC(
        parseInt(orderId),
        orderItemIds,
        userId,
        notes
      );

      res.json({ 
        success: true, 
        message: `NC removed from ${result.successCount} items`, 
        data: result 
      });
    } catch (error) {
      logger.error('Bulk remove items NC error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // ORDER LEVEL NC
  // ========================

  /**
   * Mark entire order as NC
   * POST /api/v1/orders/:orderId/nc
   */
  async markOrderAsNC(req, res) {
    try {
      const { orderId } = req.params;
      const { ncReasonId, ncReason, notes } = req.body;
      const userId = req.user.userId;

      if (!ncReason && !ncReasonId) {
        return res.status(400).json({ success: false, message: 'NC reason is required' });
      }

      const result = await ncService.markOrderAsNC(orderId, { ncReasonId, ncReason, notes }, userId);
      res.json({ success: true, message: 'Order marked as NC', data: result });
    } catch (error) {
      logger.error('Mark order as NC error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Remove NC from entire order
   * DELETE /api/v1/orders/:orderId/nc
   */
  async removeOrderNC(req, res) {
    try {
      const { orderId } = req.params;
      const { notes } = req.body;
      const userId = req.user.userId;

      const result = await ncService.removeOrderNC(orderId, userId, notes);
      res.json({ success: true, message: 'NC removed from order', data: result });
    } catch (error) {
      logger.error('Remove order NC error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // NC LOGS & REPORTS
  // ========================

  /**
   * Get NC logs for an order
   * GET /api/v1/orders/:orderId/nc/logs
   */
  async getNCLogs(req, res) {
    try {
      const { orderId } = req.params;

      const logs = await ncService.getNCLogs(orderId);
      res.json({ success: true, data: logs });
    } catch (error) {
      logger.error('Get NC logs error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  /**
   * Get NC report for an outlet
   * GET /api/v1/orders/reports/:outletId/nc
   */
  async getNCReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate, groupBy } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
      }

      const report = await ncService.getNCReport(outletId, startDate, endDate, { groupBy });
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get NC report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = ncController;
