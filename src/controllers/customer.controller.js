/**
 * Customer Controller
 * Handles customer management and GST details
 */

const customerService = require('../services/customer.service');
const paymentService = require('../services/payment.service');
const logger = require('../utils/logger');

function parseBooleanQuery(value) {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;
  return undefined;
}

function parseIntegerQuery(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseNumberQuery(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

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
      const {
        page,
        limit,
        gstOnly,
        isGstCustomer,
        isActive,
        hasPhone,
        hasEmail,
        isInterstate,
        search,
        minTotalSpent,
        maxTotalSpent,
        minTotalOrders,
        maxTotalOrders,
        createdFrom,
        createdTo,
        lastOrderFrom,
        lastOrderTo,
        orderType,
        paymentStatus,
        sortBy,
        sortOrder
      } = req.query;

      const result = await customerService.list(outletId, {
        page: parseIntegerQuery(page, 1),
        limit: parseIntegerQuery(limit, 50),
        gstOnly: parseBooleanQuery(gstOnly) === true,
        isGstCustomer: parseBooleanQuery(isGstCustomer),
        isActive: parseBooleanQuery(isActive),
        hasPhone: parseBooleanQuery(hasPhone),
        hasEmail: parseBooleanQuery(hasEmail),
        isInterstate: parseBooleanQuery(isInterstate),
        search,
        minTotalSpent: parseNumberQuery(minTotalSpent),
        maxTotalSpent: parseNumberQuery(maxTotalSpent),
        minTotalOrders: parseNumberQuery(minTotalOrders),
        maxTotalOrders: parseNumberQuery(maxTotalOrders),
        createdFrom,
        createdTo,
        lastOrderFrom,
        lastOrderTo,
        orderType,
        paymentStatus,
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

  async getDetails(req, res) {
    try {
      const { outletId, customerId } = req.params;
      const {
        includeOrders,
        includeItems,
        includePayments,
        includeCancelledOrders,
        paginate,
        page,
        limit,
        search,
        status,
        paymentStatus,
        orderType,
        fromDate,
        toDate,
        minAmount,
        maxAmount,
        sortBy,
        sortOrder
      } = req.query;

      const result = await customerService.getCustomerDetails(outletId, customerId, {
        includeOrders: parseBooleanQuery(includeOrders) !== false,
        includeItems: parseBooleanQuery(includeItems) !== false,
        includePayments: parseBooleanQuery(includePayments) !== false,
        includeCancelledOrders: parseBooleanQuery(includeCancelledOrders) !== false,
        paginate: parseBooleanQuery(paginate) === true,
        page: parseIntegerQuery(page, 1),
        limit: parseIntegerQuery(limit, 50),
        search,
        status,
        paymentStatus,
        orderType,
        fromDate,
        toDate,
        minAmount: parseNumberQuery(minAmount),
        maxAmount: parseNumberQuery(maxAmount),
        sortBy,
        sortOrder
      });

      if (!result) {
        return res.status(404).json({ success: false, message: 'Customer not found for this outlet' });
      }

      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Get customer details error:', error);
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
  },

  // ========================
  // DUE PAYMENT MANAGEMENT
  // ========================

  async getDueBalance(req, res) {
    try {
      const { outletId, customerId } = req.params;
      const result = await paymentService.getCustomerDueBalance(customerId, parseInt(outletId));
      if (!result) {
        return res.status(404).json({ success: false, message: 'Customer not found in this outlet' });
      }
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Get customer due balance error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getDueTransactions(req, res) {
    try {
      const { customerId } = req.params;
      const { page, limit, type } = req.query;
      const result = await paymentService.getCustomerDueTransactions(customerId, {
        page: parseIntegerQuery(page, 1),
        limit: parseIntegerQuery(limit, 50),
        type
      });
      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('Get customer due transactions error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async collectDue(req, res) {
    try {
      const { outletId, customerId } = req.params;
      const { amount, paymentMode, transactionId, referenceNumber, orderId, invoiceId, notes } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid amount is required' });
      }
      if (!paymentMode) {
        return res.status(400).json({ success: false, message: 'Payment mode is required' });
      }

      const result = await paymentService.collectDuePayment({
        outletId: parseInt(outletId),
        customerId: parseInt(customerId),
        amount: parseFloat(amount),
        paymentMode,
        transactionId,
        referenceNumber,
        orderId: orderId ? parseInt(orderId) : null,
        invoiceId: invoiceId ? parseInt(invoiceId) : null,
        notes,
        receivedBy: req.user.userId
      });

      res.json({ success: true, message: 'Due payment collected successfully', data: result });
    } catch (error) {
      logger.error('Collect due payment error:', error);
      const status = error.message.includes('not found') ? 404
        : error.message.includes('no pending') || error.message.includes('exceeds') ? 400
        : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  async waiveDue(req, res) {
    try {
      const { outletId, customerId } = req.params;
      const { amount, reason } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Valid amount is required' });
      }
      if (!reason) {
        return res.status(400).json({ success: false, message: 'Reason is required for waiving due' });
      }

      const result = await paymentService.waiveDue({
        outletId: parseInt(outletId),
        customerId: parseInt(customerId),
        amount: parseFloat(amount),
        reason,
        userId: req.user.userId
      });

      res.json({ success: true, message: 'Due waived successfully', data: result });
    } catch (error) {
      logger.error('Waive due error:', error);
      const status = error.message.includes('not found') ? 404
        : error.message.includes('exceeds') ? 400
        : 500;
      res.status(status).json({ success: false, message: error.message });
    }
  },

  async listWithDue(req, res) {
    try {
      const { outletId } = req.params;
      const { page, limit, search, minDue, maxDue, fromDate, toDate, sortBy, sortOrder } = req.query;

      const result = await customerService.listWithDue(outletId, {
        page: parseIntegerQuery(page, 1),
        limit: parseIntegerQuery(limit, 50),
        search: search || null,
        minDue: parseNumberQuery(minDue),
        maxDue: parseNumberQuery(maxDue),
        fromDate: fromDate || null,
        toDate: toDate || null,
        sortBy: sortBy || 'dueBalance',
        sortOrder: sortOrder || 'DESC'
      });

      res.json({ success: true, ...result });
    } catch (error) {
      logger.error('List customers with due error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = customerController;
