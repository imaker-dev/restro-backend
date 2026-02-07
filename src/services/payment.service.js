/**
 * Payment Service
 * Handle all payment modes - Cash, Card, UPI, Split
 * Settlement, refunds, cash drawer
 */

const { getPool } = require('../database');
const { cache, publishMessage } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const orderService = require('./order.service');
const tableService = require('./table.service');

const PAYMENT_MODES = {
  CASH: 'cash',
  CARD: 'card',
  UPI: 'upi',
  WALLET: 'wallet',
  CREDIT: 'credit',
  COMPLIMENTARY: 'complimentary',
  SPLIT: 'split'
};

const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  CANCELLED: 'cancelled'
};

const paymentService = {
  PAYMENT_MODES,
  PAYMENT_STATUS,

  // ========================
  // PAYMENT NUMBER GENERATION
  // ========================

  async generatePaymentNumber(outletId) {
    const pool = getPool();
    const today = new Date();
    const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    const [result] = await pool.query(
      `SELECT COUNT(*) + 1 as seq FROM payments 
       WHERE outlet_id = ? AND DATE(created_at) = CURDATE()`,
      [outletId]
    );
    
    const seq = String(result[0].seq).padStart(4, '0');
    return `PAY${datePrefix}${seq}`;
  },

  // ========================
  // PROCESS PAYMENT
  // ========================

  /**
   * Process single payment
   */
  async processPayment(data) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        outletId: requestOutletId, orderId, invoiceId,
        paymentMode, amount, tipAmount = 0,
        transactionId, referenceNumber,
        cardLastFour, cardType, upiId, walletName, bankName,
        notes, receivedBy
      } = data;

      // Validate order/invoice
      const order = await orderService.getById(orderId);
      if (!order) throw new Error('Order not found');

      // Use request outletId or fallback to order's outlet_id
      const outletId = requestOutletId || order.outlet_id;
      if (!outletId) throw new Error('Outlet ID is required');

      if (order.status === 'paid') {
        throw new Error('Order already paid');
      }

      const totalAmount = parseFloat(amount) + parseFloat(tipAmount);
      const paymentNumber = await this.generatePaymentNumber(outletId);
      const uuid = uuidv4();

      // Create payment record
      const [result] = await connection.query(
        `INSERT INTO payments (
          uuid, outlet_id, order_id, invoice_id, payment_number,
          payment_mode, amount, tip_amount, total_amount, status,
          transaction_id, reference_number,
          card_last_four, card_type, upi_id, wallet_name, bank_name,
          notes, received_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid, outletId, orderId, invoiceId, paymentNumber,
          paymentMode, amount, tipAmount, totalAmount,
          transactionId, referenceNumber,
          cardLastFour, cardType, upiId, walletName, bankName,
          notes, receivedBy
        ]
      );

      const paymentId = result.insertId;

      // Update order payment status
      const [totalPaid] = await connection.query(
        `SELECT SUM(total_amount) as paid FROM payments 
         WHERE order_id = ? AND status = 'completed'`,
        [orderId]
      );

      const paidAmount = parseFloat(totalPaid[0].paid) || 0;
      const orderTotal = parseFloat(order.total_amount);
      const dueAmount = orderTotal - paidAmount;

      let paymentStatus = 'pending';
      let orderStatus = order.status;

      if (dueAmount <= 0) {
        paymentStatus = 'completed';
        orderStatus = 'paid';
      } else if (paidAmount > 0) {
        paymentStatus = 'partial';
      }

      await connection.query(
        `UPDATE orders SET 
          paid_amount = ?, due_amount = ?, payment_status = ?, status = ?
         WHERE id = ?`,
        [paidAmount, Math.max(0, dueAmount), paymentStatus, orderStatus, orderId]
      );

      // Update invoice if exists
      if (invoiceId) {
        await connection.query(
          `UPDATE invoices SET payment_status = ? WHERE id = ?`,
          [paymentStatus === 'completed' ? 'paid' : paymentStatus, invoiceId]
        );
      }

      // Record cash drawer transaction if cash payment
      if (paymentMode === 'cash') {
        await this.recordCashTransaction(connection, {
          outletId,
          userId: receivedBy,
          type: 'sale',
          amount: totalAmount,
          referenceType: 'payment',
          referenceId: paymentId,
          description: `Payment for order ${order.order_number}`
        });
      }

      // Release table if fully paid - auto end session and make available
      if (paymentStatus === 'completed' && order.table_id) {
        await connection.query(
          `UPDATE tables SET status = 'available' WHERE id = ?`,
          [order.table_id]
        );
        
        if (order.table_session_id) {
          await connection.query(
            `UPDATE table_sessions SET 
              status = 'completed', ended_at = NOW()
             WHERE id = ?`,
            [order.table_session_id]
          );
        }
      }

      await connection.commit();

      const payment = await this.getPaymentById(paymentId);

      // Emit realtime event
      await publishMessage('order:update', {
        type: 'order:payment_received',
        outletId,
        orderId,
        payment,
        orderStatus,
        timestamp: new Date().toISOString()
      });

      // Emit bill status for Captain real-time tracking
      await publishMessage('bill:status', {
        outletId,
        orderId,
        tableId: order.table_id,
        invoiceId,
        billStatus: paymentStatus === 'completed' ? 'paid' : 'partial',
        amountPaid: totalAmount,
        timestamp: new Date().toISOString()
      });

      // Emit table update if released - table now available
      if (paymentStatus === 'completed' && order.table_id) {
        await publishMessage('table:update', {
          outletId,
          tableId: order.table_id,
          status: 'available',
          event: 'session_ended',
          timestamp: new Date().toISOString()
        });
      }

      return payment;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Process split payment
   */
  async processSplitPayment(data) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { outletId, orderId, invoiceId, splits, receivedBy } = data;

      const order = await orderService.getById(orderId);
      if (!order) throw new Error('Order not found');

      // Calculate total
      const totalAmount = splits.reduce((sum, s) => sum + parseFloat(s.amount), 0);
      const paymentNumber = await this.generatePaymentNumber(outletId);
      const uuid = uuidv4();

      // Create main payment record
      const [mainResult] = await connection.query(
        `INSERT INTO payments (
          uuid, outlet_id, order_id, invoice_id, payment_number,
          payment_mode, amount, total_amount, status, received_by
        ) VALUES (?, ?, ?, ?, ?, 'split', ?, ?, 'completed', ?)`,
        [uuid, outletId, orderId, invoiceId, paymentNumber, totalAmount, totalAmount, receivedBy]
      );

      const paymentId = mainResult.insertId;

      // Create split payment records
      for (const split of splits) {
        await connection.query(
          `INSERT INTO split_payments (
            payment_id, payment_mode, amount,
            transaction_id, reference_number, card_last_four, upi_id, notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            paymentId, split.paymentMode, split.amount,
            split.transactionId, split.referenceNumber,
            split.cardLastFour, split.upiId, split.notes
          ]
        );

        // Record cash if applicable
        if (split.paymentMode === 'cash') {
          await this.recordCashTransaction(connection, {
            outletId,
            userId: receivedBy,
            type: 'sale',
            amount: split.amount,
            referenceType: 'split_payment',
            referenceId: paymentId,
            description: `Split payment for order ${order.order_number}`
          });
        }
      }

      // Update order status
      await connection.query(
        `UPDATE orders SET 
          paid_amount = ?, due_amount = 0, payment_status = 'completed', status = 'paid'
         WHERE id = ?`,
        [totalAmount, orderId]
      );

      if (invoiceId) {
        await connection.query(
          `UPDATE invoices SET payment_status = 'paid' WHERE id = ?`,
          [invoiceId]
        );
      }

      // Release table - set to available and end session
      if (order.table_id) {
        await connection.query(
          `UPDATE tables SET status = 'available' WHERE id = ?`,
          [order.table_id]
        );
        
        if (order.table_session_id) {
          await connection.query(
            `UPDATE table_sessions SET 
              status = 'completed', ended_at = NOW()
             WHERE id = ?`,
            [order.table_session_id]
          );
        }
      }

      await connection.commit();

      const payment = await this.getPaymentById(paymentId);

      await publishMessage('order:update', {
        type: 'order:payment_received',
        outletId,
        orderId,
        payment,
        orderStatus: 'paid',
        timestamp: new Date().toISOString()
      });

      return payment;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // PAYMENT RETRIEVAL
  // ========================

  async getPaymentById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT p.*, o.order_number, i.invoice_number,
        u.name as received_by_name
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       LEFT JOIN invoices i ON p.invoice_id = i.id
       LEFT JOIN users u ON p.received_by = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (!rows[0]) return null;

    const payment = rows[0];

    // Get split payments if split
    if (payment.payment_mode === 'split') {
      const [splits] = await pool.query(
        'SELECT * FROM split_payments WHERE payment_id = ?',
        [id]
      );
      payment.splits = splits;
    }

    return payment;
  },

  async getPaymentsByOrder(orderId) {
    const pool = getPool();
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at',
      [orderId]
    );
    return payments;
  },

  // ========================
  // REFUNDS
  // ========================

  async initiateRefund(data) {
    const pool = getPool();
    const {
      outletId, orderId, paymentId, refundAmount,
      refundMode, reason, requestedBy
    } = data;

    const today = new Date();
    const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, '');
    const [seqResult] = await pool.query(
      `SELECT COUNT(*) + 1 as seq FROM refunds WHERE outlet_id = ? AND DATE(created_at) = CURDATE()`,
      [outletId]
    );
    const refundNumber = `REF${datePrefix}${String(seqResult[0].seq).padStart(4, '0')}`;

    const [result] = await pool.query(
      `INSERT INTO refunds (
        outlet_id, order_id, payment_id, refund_number, refund_amount,
        refund_mode, status, reason, requested_by
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [outletId, orderId, paymentId, refundNumber, refundAmount, refundMode, reason, requestedBy]
    );

    return { id: result.insertId, refundNumber, status: 'pending' };
  },

  async approveRefund(refundId, approvedBy) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [refunds] = await connection.query(
        'SELECT * FROM refunds WHERE id = ?',
        [refundId]
      );
      if (!refunds[0]) throw new Error('Refund not found');

      const refund = refunds[0];

      // Update refund status
      await connection.query(
        `UPDATE refunds SET 
          status = 'approved', approved_by = ?, approved_at = NOW()
         WHERE id = ?`,
        [approvedBy, refundId]
      );

      // Update payment
      await connection.query(
        `UPDATE payments SET 
          refund_amount = refund_amount + ?, refunded_at = NOW(), refund_reason = ?
         WHERE id = ?`,
        [refund.refund_amount, refund.reason, refund.payment_id]
      );

      // Record cash out if cash refund
      if (refund.refund_mode === 'cash') {
        await this.recordCashTransaction(connection, {
          outletId: refund.outlet_id,
          userId: approvedBy,
          type: 'refund',
          amount: -refund.refund_amount,
          referenceType: 'refund',
          referenceId: refundId,
          description: `Refund for order`
        });
      }

      await connection.commit();

      return { success: true, message: 'Refund approved' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // CASH DRAWER
  // ========================

  async recordCashTransaction(connection, data) {
    const {
      outletId, userId, type, amount,
      referenceType, referenceId, description
    } = data;

    // Get current balance
    const [lastTx] = await connection.query(
      `SELECT balance_after FROM cash_drawer 
       WHERE outlet_id = ? ORDER BY id DESC LIMIT 1`,
      [outletId]
    );
    const balanceBefore = lastTx[0]?.balance_after || 0;
    const balanceAfter = balanceBefore + amount;

    await connection.query(
      `INSERT INTO cash_drawer (
        outlet_id, user_id, transaction_type, amount,
        balance_before, balance_after,
        reference_type, reference_id, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [outletId, userId, type, amount, balanceBefore, balanceAfter, referenceType, referenceId, description]
    );
  },

  async openCashDrawer(outletId, openingCash, userId) {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);

    // Check if session exists
    const [existing] = await pool.query(
      'SELECT * FROM day_sessions WHERE outlet_id = ? AND session_date = ?',
      [outletId, today]
    );

    if (existing[0]) {
      throw new Error('Day session already open');
    }

    await pool.query(
      `INSERT INTO day_sessions (
        outlet_id, session_date, opening_time, opening_cash, status, opened_by
      ) VALUES (?, ?, NOW(), ?, 'open', ?)`,
      [outletId, today, openingCash, userId]
    );

    await pool.query(
      `INSERT INTO cash_drawer (
        outlet_id, user_id, transaction_type, amount,
        balance_before, balance_after, description
      ) VALUES (?, ?, 'opening', ?, 0, ?, 'Day opening')`,
      [outletId, userId, openingCash, openingCash]
    );

    return { success: true, openingCash };
  },

  async closeCashDrawer(outletId, actualCash, userId, notes = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const today = new Date().toISOString().slice(0, 10);

      // Get session
      const [sessions] = await connection.query(
        'SELECT * FROM day_sessions WHERE outlet_id = ? AND session_date = ? AND status = ?',
        [outletId, today, 'open']
      );

      if (!sessions[0]) throw new Error('No open session found');

      // Calculate expected cash
      const [cashTotals] = await connection.query(
        `SELECT 
          SUM(CASE WHEN transaction_type IN ('opening', 'cash_in', 'sale') THEN amount ELSE 0 END) as cash_in,
          SUM(CASE WHEN transaction_type IN ('cash_out', 'refund', 'expense') THEN ABS(amount) ELSE 0 END) as cash_out
         FROM cash_drawer 
         WHERE outlet_id = ? AND DATE(created_at) = ?`,
        [outletId, today]
      );

      const expectedCash = (cashTotals[0].cash_in || 0) - (cashTotals[0].cash_out || 0);
      const variance = actualCash - expectedCash;

      // Get day totals
      const [dayTotals] = await connection.query(
        `SELECT 
          COUNT(*) as total_orders,
          SUM(total_amount) as total_sales,
          SUM(CASE WHEN payment_status = 'completed' THEN paid_amount ELSE 0 END) as total_collected
         FROM orders 
         WHERE outlet_id = ? AND DATE(created_at) = ? AND status != 'cancelled'`,
        [outletId, today]
      );

      // Update session
      await connection.query(
        `UPDATE day_sessions SET 
          closing_time = NOW(), closing_cash = ?, expected_cash = ?,
          cash_variance = ?, total_sales = ?, total_orders = ?,
          status = 'closed', closed_by = ?, variance_notes = ?
         WHERE id = ?`,
        [
          actualCash, expectedCash, variance,
          dayTotals[0].total_sales || 0, dayTotals[0].total_orders || 0,
          userId, notes, sessions[0].id
        ]
      );

      // Record closing transaction
      await connection.query(
        `INSERT INTO cash_drawer (
          outlet_id, user_id, transaction_type, amount,
          balance_before, balance_after, description
        ) VALUES (?, ?, 'closing', ?, ?, ?, 'Day closing')`,
        [outletId, userId, -expectedCash, expectedCash, 0]
      );

      await connection.commit();

      return {
        success: true,
        expectedCash,
        actualCash,
        variance,
        totalSales: dayTotals[0].total_sales || 0,
        totalOrders: dayTotals[0].total_orders || 0
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async getCashDrawerStatus(outletId) {
    const pool = getPool();
    const today = new Date().toISOString().slice(0, 10);

    const [session] = await pool.query(
      'SELECT * FROM day_sessions WHERE outlet_id = ? AND session_date = ?',
      [outletId, today]
    );

    const [balance] = await pool.query(
      `SELECT balance_after FROM cash_drawer 
       WHERE outlet_id = ? ORDER BY id DESC LIMIT 1`,
      [outletId]
    );

    const [transactions] = await pool.query(
      `SELECT * FROM cash_drawer 
       WHERE outlet_id = ? AND DATE(created_at) = ?
       ORDER BY created_at DESC LIMIT 20`,
      [outletId, today]
    );

    return {
      session: session[0] || null,
      currentBalance: balance[0]?.balance_after || 0,
      recentTransactions: transactions
    };
  }
};

module.exports = paymentService;
