/**
 * Order Controller
 * Handles orders, items, KOT, modifications
 */

const orderService = require('../services/order.service');
const kotService = require('../services/kot.service');
const billingService = require('../services/billing.service');
const paymentService = require('../services/payment.service');
const reportsService = require('../services/reports.service');
const logger = require('../utils/logger');

const orderController = {
  // ========================
  // ORDER MANAGEMENT
  // ========================

  async createOrder(req, res) {
    try {
      const order = await orderService.createOrder({
        ...req.body,
        createdBy: req.user.userId
      });
      res.status(201).json({ success: true, message: 'Order created', data: order });
    } catch (error) {
      logger.error('Create order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getOrder(req, res) {
    try {
      const order = await orderService.getOrderWithItems(req.params.id);
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      res.json({ success: true, data: order });
    } catch (error) {
      logger.error('Get order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getActiveOrders(req, res) {
    try {
      const { outletId } = req.params;
      const filters = {
        floorId: req.query.floorId,
        status: req.query.status,
        tableId: req.query.tableId,
        createdBy: req.query.createdBy
      };
      const orders = await orderService.getActiveOrders(outletId, filters);
      res.json({ success: true, data: orders });
    } catch (error) {
      logger.error('Get active orders error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getOrdersByTable(req, res) {
    try {
      const orders = await orderService.getByTable(req.params.tableId);
      res.json({ success: true, data: orders });
    } catch (error) {
      logger.error('Get orders by table error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async addItems(req, res) {
    try {
      const result = await orderService.addItems(
        req.params.id,
        req.body.items,
        req.user.userId
      );
      res.json({ success: true, message: 'Items added', data: result });
    } catch (error) {
      logger.error('Add items error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateItemQuantity(req, res) {
    try {
      const order = await orderService.updateItemQuantity(
        req.params.itemId,
        req.body.quantity,
        req.user.userId
      );
      res.json({ success: true, message: 'Quantity updated', data: order });
    } catch (error) {
      logger.error('Update item quantity error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async cancelItem(req, res) {
    try {
      const order = await orderService.cancelItem(
        req.params.itemId,
        req.body,
        req.user.userId
      );
      res.json({ success: true, message: 'Item cancelled', data: order });
    } catch (error) {
      logger.error('Cancel item error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async cancelOrder(req, res) {
    try {
      const order = await orderService.cancelOrder(
        req.params.id,
        req.body,
        req.user.userId
      );
      res.json({ success: true, message: 'Order cancelled', data: order });
    } catch (error) {
      logger.error('Cancel order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async updateStatus(req, res) {
    try {
      const order = await orderService.updateStatus(
        req.params.id,
        req.body.status,
        req.user.userId
      );
      res.json({ success: true, message: 'Status updated', data: order });
    } catch (error) {
      logger.error('Update status error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async transferTable(req, res) {
    try {
      const order = await orderService.transferTable(
        req.params.id,
        req.body.toTableId,
        req.user.userId
      );
      res.json({ success: true, message: 'Table transferred', data: order });
    } catch (error) {
      logger.error('Transfer table error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCancelReasons(req, res) {
    try {
      const { outletId } = req.params;
      const { type } = req.query;
      const reasons = await orderService.getCancelReasons(outletId, type);
      res.json({ success: true, data: reasons });
    } catch (error) {
      logger.error('Get cancel reasons error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // KOT MANAGEMENT
  // ========================

  async sendKot(req, res) {
    try {
      const result = await kotService.sendKot(req.params.id, req.user.userId);
      res.json({ success: true, message: 'KOT sent', data: result });
    } catch (error) {
      logger.error('Send KOT error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getActiveKots(req, res) {
    try {
      const { outletId } = req.params;
      const { station } = req.query;
      const kots = await kotService.getActiveKots(outletId, station);
      res.json({ success: true, data: kots });
    } catch (error) {
      logger.error('Get active KOTs error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getKotsByOrder(req, res) {
    try {
      const kots = await kotService.getKotsByOrder(req.params.orderId);
      res.json({ success: true, data: kots });
    } catch (error) {
      logger.error('Get KOTs by order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getKotById(req, res) {
    try {
      const kot = await kotService.getKotById(req.params.id);
      if (!kot) {
        return res.status(404).json({ success: false, message: 'KOT not found' });
      }
      res.json({ success: true, data: kot });
    } catch (error) {
      logger.error('Get KOT error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async acceptKot(req, res) {
    try {
      const kot = await kotService.acceptKot(req.params.id, req.user.userId);
      res.json({ success: true, message: 'KOT accepted', data: kot });
    } catch (error) {
      logger.error('Accept KOT error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async startPreparingKot(req, res) {
    try {
      const kot = await kotService.startPreparing(req.params.id, req.user.userId);
      res.json({ success: true, message: 'Started preparing', data: kot });
    } catch (error) {
      logger.error('Start preparing error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async markItemReady(req, res) {
    try {
      const kot = await kotService.markItemReady(req.params.itemId, req.user.userId);
      res.json({ success: true, message: 'Item ready', data: kot });
    } catch (error) {
      logger.error('Mark item ready error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async markKotReady(req, res) {
    try {
      const kot = await kotService.markKotReady(req.params.id, req.user.userId);
      res.json({ success: true, message: 'KOT ready', data: kot });
    } catch (error) {
      logger.error('Mark KOT ready error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async markKotServed(req, res) {
    try {
      const kot = await kotService.markKotServed(req.params.id, req.user.userId);
      res.json({ success: true, message: 'KOT served', data: kot });
    } catch (error) {
      logger.error('Mark KOT served error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getStationDashboard(req, res) {
    try {
      const { outletId, station } = req.params;
      const dashboard = await kotService.getStationDashboard(outletId, station);
      res.json({ success: true, data: dashboard });
    } catch (error) {
      logger.error('Get station dashboard error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async reprintKot(req, res) {
    try {
      const kot = await kotService.reprintKot(req.params.id, req.user.userId);
      res.json({ success: true, message: 'KOT reprinted', data: kot });
    } catch (error) {
      logger.error('Reprint KOT error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // BILLING
  // ========================

  async generateBill(req, res) {
    try {
      const invoice = await billingService.generateBill(req.params.id, {
        ...req.body,
        generatedBy: req.user.userId
      });
      res.json({ success: true, message: 'Bill generated', data: invoice });
    } catch (error) {
      logger.error('Generate bill error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getInvoice(req, res) {
    try {
      const invoice = await billingService.getInvoiceById(req.params.id);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      res.json({ success: true, data: invoice });
    } catch (error) {
      logger.error('Get invoice error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getInvoiceByOrder(req, res) {
    try {
      const invoice = await billingService.getInvoiceByOrder(req.params.orderId);
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      res.json({ success: true, data: invoice });
    } catch (error) {
      logger.error('Get invoice by order error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async printDuplicateBill(req, res) {
    try {
      const invoice = await billingService.printDuplicateBill(
        req.params.id,
        req.user.userId,
        req.body.reason
      );
      res.json({ success: true, message: 'Duplicate bill printed', data: invoice });
    } catch (error) {
      logger.error('Print duplicate bill error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async splitBill(req, res) {
    try {
      const invoices = await billingService.splitBill(
        req.params.id,
        req.body.splits,
        req.user.userId
      );
      res.json({ success: true, message: 'Bill split', data: invoices });
    } catch (error) {
      logger.error('Split bill error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async cancelInvoice(req, res) {
    try {
      const result = await billingService.cancelInvoice(
        req.params.id,
        req.body.reason,
        req.user.userId
      );
      res.json({ success: true, message: result.message });
    } catch (error) {
      logger.error('Cancel invoice error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async applyDiscount(req, res) {
    try {
      const order = await billingService.applyDiscount(
        req.params.id,
        req.body,
        req.user.userId
      );
      res.json({ success: true, message: 'Discount applied', data: order });
    } catch (error) {
      logger.error('Apply discount error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // PAYMENTS
  // ========================

  async processPayment(req, res) {
    try {
      const payment = await paymentService.processPayment({
        ...req.body,
        outletId: req.body.outletId || req.user.outletId,
        receivedBy: req.user.userId
      });
      res.json({ success: true, message: 'Payment processed', data: payment });
    } catch (error) {
      logger.error('Process payment error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async processSplitPayment(req, res) {
    try {
      const payment = await paymentService.processSplitPayment({
        ...req.body,
        outletId: req.body.outletId || req.user.outletId,
        receivedBy: req.user.userId
      });
      res.json({ success: true, message: 'Split payment processed', data: payment });
    } catch (error) {
      logger.error('Process split payment error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getPaymentsByOrder(req, res) {
    try {
      const payments = await paymentService.getPaymentsByOrder(req.params.orderId);
      res.json({ success: true, data: payments });
    } catch (error) {
      logger.error('Get payments error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async initiateRefund(req, res) {
    try {
      const refund = await paymentService.initiateRefund({
        ...req.body,
        outletId: req.body.outletId || req.user.outletId,
        requestedBy: req.user.userId
      });
      res.json({ success: true, message: 'Refund initiated', data: refund });
    } catch (error) {
      logger.error('Initiate refund error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async approveRefund(req, res) {
    try {
      const result = await paymentService.approveRefund(req.params.id, req.user.userId);
      res.json({ success: true, message: result.message });
    } catch (error) {
      logger.error('Approve refund error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // CASH DRAWER
  // ========================

  async openCashDrawer(req, res) {
    try {
      const { outletId } = req.params;
      const result = await paymentService.openCashDrawer(
        outletId,
        req.body.openingCash,
        req.user.userId
      );
      res.json({ success: true, message: 'Cash drawer opened', data: result });
    } catch (error) {
      logger.error('Open cash drawer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async closeCashDrawer(req, res) {
    try {
      const { outletId } = req.params;
      const result = await paymentService.closeCashDrawer(
        outletId,
        req.body.actualCash,
        req.user.userId,
        req.body.notes
      );
      res.json({ success: true, message: 'Cash drawer closed', data: result });
    } catch (error) {
      logger.error('Close cash drawer error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCashDrawerStatus(req, res) {
    try {
      const { outletId } = req.params;
      const status = await paymentService.getCashDrawerStatus(outletId);
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Get cash drawer status error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // ========================
  // REPORTS
  // ========================

  async getLiveDashboard(req, res) {
    try {
      const { outletId } = req.params;
      const dashboard = await reportsService.getLiveDashboard(outletId);
      res.json({ success: true, data: dashboard });
    } catch (error) {
      logger.error('Get live dashboard error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getDailySalesReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getDailySalesReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get daily sales report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getItemSalesReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate, limit } = req.query;
      const report = await reportsService.getItemSalesReport(outletId, startDate, endDate, parseInt(limit) || 20);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get item sales report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getStaffReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getStaffReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get staff report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCategorySalesReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getCategorySalesReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get category sales report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getPaymentModeReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getPaymentModeReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get payment mode report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getTaxReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getTaxReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get tax report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getHourlySalesReport(req, res) {
    try {
      const { outletId } = req.params;
      const { date } = req.query;
      const report = await reportsService.getHourlySalesReport(outletId, date);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get hourly sales report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getFloorSectionReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getFloorSectionReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get floor section report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCounterSalesReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getCounterSalesReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get counter sales report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async getCancellationReport(req, res) {
    try {
      const { outletId } = req.params;
      const { startDate, endDate } = req.query;
      const report = await reportsService.getCancellationReport(outletId, startDate, endDate);
      res.json({ success: true, data: report });
    } catch (error) {
      logger.error('Get cancellation report error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  async aggregateDailySales(req, res) {
    try {
      const { outletId } = req.params;
      const { date } = req.query;
      await reportsService.aggregateDailySales(outletId, date);
      await reportsService.aggregateItemSales(outletId, date);
      await reportsService.aggregateStaffSales(outletId, date);
      res.json({ success: true, message: 'Reports aggregated' });
    } catch (error) {
      logger.error('Aggregate daily sales error:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
};

module.exports = orderController;
