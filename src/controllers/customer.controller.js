/**
 * Customer Controller
 * Handles customer management and GST details
 */

const customerService = require('../services/customer.service');
const logger = require('../utils/logger');

const customerController = {
  async create(req, res) {
    try {
      const { outletId } = req.params;
      const customer = await customerService.create({
        outletId,
        ...req.body
      });
      res.status(201).json({ success: true, data: customer });
    } catch (error) {
      logger.error('Create customer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async update(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerService.update(id, req.body);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      res.json({ success: true, data: customer });
    } catch (error) {
      logger.error('Update customer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getById(req, res) {
    try {
      const { id } = req.params;
      const customer = await customerService.getById(id);
      if (!customer) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }
      res.json({ success: true, data: customer });
    } catch (error) {
      logger.error('Get customer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async search(req, res) {
    try {
      const { outletId } = req.params;
      const { q, limit } = req.query;
      if (!q || q.length < 2) {
        return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
      }
      const customers = await customerService.search(outletId, q, parseInt(limit) || 20);
      res.json({ success: true, data: customers });
    } catch (error) {
      logger.error('Search customers error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async list(req, res) {
    try {
      const { outletId } = req.params;
      const { page, limit, gstOnly, sortBy, sortOrder } = req.query;
      const result = await customerService.list(outletId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
        gstOnly: gstOnly === 'true',
        sortBy,
        sortOrder
      });
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('List customers error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getOrderHistory(req, res) {
    try {
      const { id } = req.params;
      const { page, limit } = req.query;
      const result = await customerService.getOrderHistory(id, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      });
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Get customer order history error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getByPhone(req, res) {
    try {
      const { outletId } = req.params;
      const { phone } = req.query;
      if (!phone) {
        return res.status(400).json({ success: false, message: 'Phone number required' });
      }
      const customer = await customerService.getByPhone(outletId, phone);
      res.json({ success: true, data: customer });
    } catch (error) {
      logger.error('Get customer by phone error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async linkToOrder(req, res) {
    try {
      const { orderId } = req.params;
      const result = await customerService.linkToOrder(orderId, req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Link customer to order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateOrderGst(req, res) {
    try {
      const { orderId } = req.params;
      const result = await customerService.updateOrderCustomerGst(orderId, req.body);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Update order customer GST error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = customerController;
