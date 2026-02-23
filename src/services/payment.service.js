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
const billingService = require('./billing.service');
const kotService = require('./kot.service');
const whatsappService = require('./whatsapp.service');

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

// ========================
// FORMAT HELPERS — clean camelCase output matching KOT details style
// ========================

function formatSplitEntry(split) {
  if (!split) return null;
  return {
    id: split.id,
    paymentId: split.payment_id,
    paymentMode: split.payment_mode,
    amount: parseFloat(split.amount) || 0,
    transactionId: split.transaction_id || null,
    referenceNumber: split.reference_number || null,
    cardLastFour: split.card_last_four || null,
    upiId: split.upi_id || null,
    notes: split.notes || null,
  };
}

function formatPayment(payment) {
  if (!payment) return null;
  return {
    id: payment.id,
    uuid: payment.uuid,
    outletId: payment.outlet_id,
    orderId: payment.order_id,
    invoiceId: payment.invoice_id || null,
    paymentNumber: payment.payment_number,
    paymentMode: payment.payment_mode,
    amount: parseFloat(payment.amount) || 0,
    tipAmount: parseFloat(payment.tip_amount) || 0,
    totalAmount: parseFloat(payment.total_amount) || 0,
    status: payment.status,
    transactionId: payment.transaction_id || null,
    referenceNumber: payment.reference_number || null,
    cardLastFour: payment.card_last_four || null,
    cardType: payment.card_type || null,
    upiId: payment.upi_id || null,
    walletName: payment.wallet_name || null,
    bankName: payment.bank_name || null,
    notes: payment.notes || null,
    receivedBy: payment.received_by || null,
    receivedByName: payment.received_by_name || null,
    refundAmount: parseFloat(payment.refund_amount) || 0,
    refundedAt: payment.refunded_at || null,
    refundReason: payment.refund_reason || null,
    orderNumber: payment.order_number || null,
    invoiceNumber: payment.invoice_number || null,
    createdAt: payment.created_at || null,
    splits: payment.splits ? payment.splits.map(formatSplitEntry) : undefined,
  };
}

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

    // Variables needed after transaction for event publishing
    let paymentId, outletId, orderId, invoiceId, orderStatus, paymentStatus;
    let totalAmount, tableId, tableSessionId;
    let order;

    try {
      const {
        outletId: requestOutletId, orderId: reqOrderId, invoiceId: reqInvoiceId,
        paymentMode, amount, tipAmount = 0,
        transactionId, referenceNumber,
        cardLastFour, cardType, upiId, walletName, bankName,
        notes, receivedBy
      } = data;

      orderId = reqOrderId;
      invoiceId = reqInvoiceId;

      // Validate order/invoice BEFORE transaction to avoid REPEATABLE READ snapshot issues
      order = await orderService.getById(orderId);
      if (!order) {
        // Fallback: read directly via connection before transaction
        const [rows] = await connection.query(
          `SELECT * FROM orders WHERE id = ?`,
          [orderId]
        );
        order = rows[0] || null;
      }
      if (!order) throw new Error('Order not found');

      await connection.beginTransaction();

      // Use request outletId or fallback to order's outlet_id
      outletId = requestOutletId || order.outlet_id;
      if (!outletId) throw new Error('Outlet ID is required');
      tableId = order.table_id;
      tableSessionId = order.table_session_id;

      if (order.status === 'paid' || order.status === 'completed') {
        throw new Error('Order already paid');
      }

      totalAmount = parseFloat(amount) + parseFloat(tipAmount);
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

      paymentId = Number(result.insertId);

      // Update order payment status
      const [totalPaid] = await connection.query(
        `SELECT SUM(total_amount) as paid FROM payments 
         WHERE order_id = ? AND status = 'completed'`,
        [orderId]
      );

      const paidAmount = parseFloat(totalPaid[0].paid) || 0;

      // Use invoice grand_total if available, fallback to order total_amount
      let orderTotal = parseFloat(order.total_amount) || 0;
      if (invoiceId) {
        const [invRow] = await connection.query(
          'SELECT grand_total FROM invoices WHERE id = ? AND is_cancelled = 0',
          [invoiceId]
        );
        if (invRow[0]) {
          orderTotal = parseFloat(invRow[0].grand_total) || orderTotal;
        }
      }
      const dueAmount = orderTotal - paidAmount;

      paymentStatus = 'pending';
      orderStatus = order.status;

      if (dueAmount <= 0) {
        paymentStatus = 'completed';
        orderStatus = 'completed';
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

      // Release table if fully paid - auto end session, unmerge, and make available
      if (paymentStatus === 'completed' && tableId) {
        // Unmerge any merged tables and restore capacity
        const [activeMerges] = await connection.query(
          `SELECT tm.merged_table_id, t.capacity
           FROM table_merges tm
           JOIN tables t ON tm.merged_table_id = t.id
           WHERE tm.primary_table_id = ? AND tm.unmerged_at IS NULL`,
          [tableId]
        );

        if (activeMerges.length > 0) {
          await connection.query(
            'UPDATE table_merges SET unmerged_at = NOW(), unmerged_by = ? WHERE primary_table_id = ? AND unmerged_at IS NULL',
            [data.receivedBy, tableId]
          );
          const mergedIds = activeMerges.map(m => m.merged_table_id);
          await connection.query(
            'UPDATE tables SET status = "available" WHERE id IN (?)',
            [mergedIds]
          );
          const capacityToRemove = activeMerges.reduce((sum, m) => sum + (m.capacity || 0), 0);
          if (capacityToRemove > 0) {
            await connection.query(
              'UPDATE tables SET capacity = GREATEST(1, capacity - ?) WHERE id = ?',
              [capacityToRemove, tableId]
            );
          }
        }

        await connection.query(
          `UPDATE tables SET status = 'available' WHERE id = ?`,
          [tableId]
        );
        
        if (tableSessionId) {
          await connection.query(
            `UPDATE table_sessions SET 
              status = 'completed', ended_at = NOW()
             WHERE id = ?`,
            [tableSessionId]
          );
        }
      }

      // Mark all KOTs and order items as served on full payment
      if (paymentStatus === 'completed') {
        await connection.query(
          `UPDATE kot_tickets SET status = 'served', served_at = NOW(), served_by = ?
           WHERE order_id = ? AND status NOT IN ('served', 'cancelled')`,
          [data.receivedBy, orderId]
        );
        await connection.query(
          `UPDATE kot_items SET status = 'served'
           WHERE kot_id IN (SELECT id FROM kot_tickets WHERE order_id = ?)
             AND status != 'cancelled'`,
          [orderId]
        );
        await connection.query(
          `UPDATE order_items SET status = 'served'
           WHERE order_id = ? AND status NOT IN ('served', 'cancelled')`,
          [orderId]
        );
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    // Fetch payment and publish events AFTER connection is released
    const payment = await this.getPaymentById(paymentId);

    // Emit realtime event
    await publishMessage('order:update', {
      type: 'order:payment_received',
      outletId,
      orderId,
      tableId,
      captainId: order.created_by,
      payment,
      orderStatus,
      paymentStatus,
      timestamp: new Date().toISOString()
    });

    // Emit bill status for Captain real-time tracking
    await publishMessage('bill:status', {
      outletId,
      orderId,
      tableId,
      tableNumber: order.table_number,
      captainId: order.created_by,
      invoiceId,
      billStatus: paymentStatus === 'completed' ? 'paid' : 'partial',
      amountPaid: totalAmount,
      timestamp: new Date().toISOString()
    });

    // Emit table update if released - table now available
    if (paymentStatus === 'completed' && tableId) {
      await publishMessage('table:update', {
        outletId,
        tableId,
        floorId: order.floor_id,
        status: 'available',
        event: 'session_ended',
        timestamp: new Date().toISOString()
      });
    }

    // Emit KOT served events for real-time kitchen display
    if (paymentStatus === 'completed') {
      try {
        const kots = await kotService.getKotsByOrder(orderId);
        for (const kot of kots) {
          await publishMessage('kot:update', {
            type: 'kot:served',
            outletId,
            station: kot.station,
            kot,
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        logger.error('Failed to emit KOT served events:', err.message);
      }
    }

    // Send WhatsApp bill to customer on full payment completion
    if (paymentStatus === 'completed') {
      this.sendWhatsAppBillOnCompletion(invoiceId, outletId, orderId).catch(err =>
        logger.warn('WhatsApp bill send failed (non-critical):', err.message)
      );
    }

    // Build detailed response for all scenarios
    return this.buildPaymentResponse(payment, orderId, invoiceId, orderStatus, paymentStatus, tableId);
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

      const paymentId = Number(mainResult.insertId);

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
          paid_amount = ?, due_amount = 0, payment_status = 'completed', status = 'completed'
         WHERE id = ?`,
        [totalAmount, orderId]
      );

      if (invoiceId) {
        await connection.query(
          `UPDATE invoices SET payment_status = 'paid' WHERE id = ?`,
          [invoiceId]
        );
      }

      // Release table - unmerge, restore capacity, end session, set available
      if (order.table_id) {
        // Unmerge any merged tables and restore capacity
        const [activeMerges] = await connection.query(
          `SELECT tm.merged_table_id, t.capacity
           FROM table_merges tm
           JOIN tables t ON tm.merged_table_id = t.id
           WHERE tm.primary_table_id = ? AND tm.unmerged_at IS NULL`,
          [order.table_id]
        );

        if (activeMerges.length > 0) {
          await connection.query(
            'UPDATE table_merges SET unmerged_at = NOW(), unmerged_by = ? WHERE primary_table_id = ? AND unmerged_at IS NULL',
            [receivedBy, order.table_id]
          );
          const mergedIds = activeMerges.map(m => m.merged_table_id);
          await connection.query(
            'UPDATE tables SET status = "available" WHERE id IN (?)',
            [mergedIds]
          );
          const capacityToRemove = activeMerges.reduce((sum, m) => sum + (m.capacity || 0), 0);
          if (capacityToRemove > 0) {
            await connection.query(
              'UPDATE tables SET capacity = GREATEST(1, capacity - ?) WHERE id = ?',
              [capacityToRemove, order.table_id]
            );
          }
        }

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

      // Mark all KOTs and order items as served
      await connection.query(
        `UPDATE kot_tickets SET status = 'served', served_at = NOW(), served_by = ?
         WHERE order_id = ? AND status NOT IN ('served', 'cancelled')`,
        [receivedBy, orderId]
      );
      await connection.query(
        `UPDATE kot_items SET status = 'served'
         WHERE kot_id IN (SELECT id FROM kot_tickets WHERE order_id = ?)
           AND status != 'cancelled'`,
        [orderId]
      );
      await connection.query(
        `UPDATE order_items SET status = 'served'
         WHERE order_id = ? AND status NOT IN ('served', 'cancelled')`,
        [orderId]
      );

      await connection.commit();

      const payment = await this.getPaymentById(paymentId);

      await publishMessage('order:update', {
        type: 'order:payment_received',
        outletId,
        orderId,
        payment,
        orderStatus: 'completed',
        timestamp: new Date().toISOString()
      });

      // Emit table update
      if (order.table_id) {
        await publishMessage('table:update', {
          outletId,
          tableId: order.table_id,
          floorId: order.floor_id,
          status: 'available',
          event: 'session_ended',
          timestamp: new Date().toISOString()
        });
      }

      // Emit KOT served events
      try {
        const kots = await kotService.getKotsByOrder(orderId);
        for (const kot of kots) {
          await publishMessage('kot:update', {
            type: 'kot:served',
            outletId,
            station: kot.station,
            kot,
            timestamp: new Date().toISOString()
          });
        }
      } catch (err) {
        logger.error('Failed to emit KOT served events:', err.message);
      }

      // Send WhatsApp bill to customer on split payment completion
      this.sendWhatsAppBillOnCompletion(invoiceId, outletId, orderId).catch(err =>
        logger.warn('WhatsApp bill send failed (non-critical):', err.message)
      );

      return this.buildPaymentResponse(payment, orderId, invoiceId, 'completed', 'completed', order.table_id);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // WHATSAPP NOTIFICATION
  // ========================

  /**
   * Fetch invoice + outlet info and send WhatsApp bill template to customer.
   * Silently skips if customer has no phone or WhatsApp is not configured.
   */
  async sendWhatsAppBillOnCompletion(invoiceId, outletId, orderId = null) {
    logger.info(`[WhatsApp] Triggered for invoiceId=${invoiceId} orderId=${orderId} outletId=${outletId}`);

    if (!process.env.WHATSAPP_PHONE_NUMBER_ID || !process.env.WHATSAPP_ACCESS_TOKEN) {
      logger.warn('[WhatsApp] Skipped: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not set');
      return;
    }

    const pool = getPool();

    let invoice = null;

    if (invoiceId) {
      invoice = await billingService.getInvoiceById(invoiceId);
    } else if (orderId) {
      // Fallback: look up invoice by orderId
      logger.info(`[WhatsApp] No invoiceId provided, looking up invoice by orderId=${orderId}`);
      const [rows] = await pool.query(
        `SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0 ORDER BY id DESC LIMIT 1`,
        [orderId]
      );
      if (rows[0]) {
        invoice = await billingService.getInvoiceById(rows[0].id);
      }
    }

    if (!invoice) {
      logger.warn(`[WhatsApp] Skipped: no invoice found for invoiceId=${invoiceId} orderId=${orderId}`);
      return;
    }
    logger.info(`[WhatsApp] Invoice fetched: ${invoice.invoiceNumber} | customer: ${invoice.customerName} | phone: ${invoice.customerPhone}`);

    const phone = invoice.customerPhone;
    if (!phone) {
      logger.warn(`[WhatsApp] Skipped: no customer phone on invoice ${invoice.invoiceNumber}`);
      return;
    }

    const [outletRows] = await pool.query(
      `SELECT name, CONCAT_WS(', ', NULLIF(address_line1,''), NULLIF(city,''), NULLIF(state,'')) as address, phone
       FROM outlets WHERE id = ?`,
      [outletId]
    );
    const outlet = outletRows[0] || {};
    logger.info(`[WhatsApp] Outlet: ${outlet.name} | template: ${process.env.WHATSAPP_INVOICE_TEMPLATE || 'send_invoice'}`);

    logger.info(`[WhatsApp] Generating PDF and uploading for invoice ${invoice.invoiceNumber}...`);
    await whatsappService.sendBillingPDFTemplate(
      phone,
      invoice,
      outlet,
      process.env.WHATSAPP_INVOICE_TEMPLATE || 'send_invoice',
      process.env.WHATSAPP_TEMPLATE_LANG || 'en'
    );

    logger.info(`[WhatsApp] ✓ Invoice ${invoice.invoiceNumber} sent to ${phone}`);
  },

  // ========================
  // RESPONSE BUILDER
  // ========================

  async buildPaymentResponse(payment, orderId, invoiceId, orderStatus, paymentStatus, tableId) {
    const pool = getPool();

    // Fetch updated order
    const updatedOrder = await orderService.getOrderWithItems(orderId);

    // Fetch invoice (always, not just on complete)
    let invoice = null;
    if (invoiceId) {
      try {
        invoice = await billingService.getInvoiceById(invoiceId);
      } catch (err) {
        logger.error('Failed to fetch invoice:', err.message);
      }
    }
    // Fallback: find invoice by order if not passed
    if (!invoice) {
      try {
        const [invRows] = await pool.query(
          'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0 LIMIT 1',
          [orderId]
        );
        if (invRows[0]) invoice = await billingService.getInvoiceById(invRows[0].id);
      } catch (err) { /* ignore */ }
    }

    // Fetch all payments for this order
    const allPayments = await this.getPaymentsByOrder(orderId);
    const totalPaid = allPayments.reduce((s, p) => s + p.totalAmount, 0);
    const orderTotal = invoice ? invoice.grandTotal : (parseFloat(updatedOrder?.total_amount) || 0);
    const dueAmount = Math.max(0, orderTotal - totalPaid);

    // Table info
    let tableInfo = null;
    if (tableId) {
      try {
        const [tbl] = await pool.query(
          'SELECT id, table_number, name, status FROM tables WHERE id = ?',
          [tableId]
        );
        if (tbl[0]) {
          tableInfo = {
            id: tbl[0].id,
            tableNumber: tbl[0].table_number,
            name: tbl[0].name,
            status: tbl[0].status
          };
        }
      } catch (err) { /* ignore */ }
    }

    return {
      payment,
      invoice,
      order: updatedOrder ? {
        id: updatedOrder.id,
        orderNumber: updatedOrder.order_number,
        orderType: updatedOrder.order_type,
        status: orderStatus,
        itemCount: updatedOrder.items?.filter(i => i.status !== 'cancelled').length || 0,
        subtotal: parseFloat(updatedOrder.subtotal) || 0,
        discountAmount: parseFloat(updatedOrder.discount_amount) || 0,
        taxAmount: parseFloat(updatedOrder.tax_amount) || 0,
        totalAmount: orderTotal,
        tableName: updatedOrder.table_name || null,
        tableNumber: updatedOrder.table_number || null,
        floorName: updatedOrder.floor_name || null,
        createdByName: updatedOrder.created_by_name || null
      } : null,
      paymentSummary: {
        orderTotal,
        totalPaid: parseFloat(totalPaid.toFixed(2)),
        dueAmount: parseFloat(dueAmount.toFixed(2)),
        paymentStatus,
        paymentCount: allPayments.length,
        payments: allPayments
      },
      table: tableInfo,
      orderStatus,
      paymentStatus
    };
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

    return formatPayment(payment);
  },

  async getPaymentsByOrder(orderId) {
    const pool = getPool();
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at',
      [orderId]
    );
    return payments.map(formatPayment);
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
    const balanceBefore = parseFloat(lastTx[0]?.balance_after) || 0;
    const balanceAfter = balanceBefore + parseFloat(amount);

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

    // Check if a session exists for today
    const [existing] = await pool.query(
      'SELECT * FROM day_sessions WHERE outlet_id = ? AND session_date = ?',
      [outletId, today]
    );

    if (existing[0] && existing[0].status === 'open') {
      throw new Error('Day session already open');
    }

    if (existing[0] && existing[0].status === 'closed') {
      // Reopen: update existing closed session back to open
      await pool.query(
        `UPDATE day_sessions SET 
          opening_time = NOW(), opening_cash = ?, closing_time = NULL, closing_cash = 0,
          expected_cash = 0, cash_variance = 0, total_sales = 0, total_orders = 0,
          status = 'open', opened_by = ?, closed_by = NULL, variance_notes = NULL
         WHERE id = ?`,
        [openingCash, userId, existing[0].id]
      );
    } else {
      // First open of the day — insert new row
      await pool.query(
        `INSERT INTO day_sessions (
          outlet_id, session_date, opening_time, opening_cash, status, opened_by
        ) VALUES (?, ?, NOW(), ?, 'open', ?)`,
        [outletId, today, openingCash, userId]
      );
    }

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

    console.log("Session: ", session);
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
  },

  // ========================
  // SHIFT HISTORY
  // ========================

  /**
   * Get shift history with pagination, filtering, and full details
   * @param {Object} params - Query parameters
   * @returns {Object} - Paginated shift history with summary
   */
  async getShiftHistory(params) {
    const pool = getPool();
    const {
      outletId,
      userId = null,
      startDate = null,
      endDate = null,
      status = null, // 'open', 'closed', 'all'
      page = 1,
      limit = 20,
      sortBy = 'session_date',
      sortOrder = 'DESC'
    } = params;

    const offset = (page - 1) * limit;
    const conditions = ['ds.outlet_id = ?'];
    const queryParams = [outletId];

    // Filter by user (opened_by or closed_by)
    if (userId) {
      conditions.push('(ds.opened_by = ? OR ds.closed_by = ?)');
      queryParams.push(userId, userId);
    }

    // Date range filter
    if (startDate) {
      conditions.push('ds.session_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      conditions.push('ds.session_date <= ?');
      queryParams.push(endDate);
    }

    // Status filter
    if (status && status !== 'all') {
      conditions.push('ds.status = ?');
      queryParams.push(status);
    }

    const whereClause = conditions.join(' AND ');

    // Validate sort columns
    const allowedSortColumns = ['session_date', 'opening_time', 'closing_time', 'total_sales', 'total_orders', 'cash_variance'];
    const safeSort = allowedSortColumns.includes(sortBy) ? sortBy : 'session_date';
    const safeOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Get total count
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as total FROM day_sessions ds WHERE ${whereClause}`,
      queryParams
    );
    const total = countResult[0].total;

    // Get shifts with user details
    const [shifts] = await pool.query(
      `SELECT 
        ds.*,
        o.name as outlet_name,
        opener.name as opened_by_name,
        closer.name as closed_by_name
       FROM day_sessions ds
       LEFT JOIN outlets o ON ds.outlet_id = o.id
       LEFT JOIN users opener ON ds.opened_by = opener.id
       LEFT JOIN users closer ON ds.closed_by = closer.id
       WHERE ${whereClause}
       ORDER BY ds.${safeSort} ${safeOrder}
       LIMIT ? OFFSET ?`,
      [...queryParams, parseInt(limit), parseInt(offset)]
    );

    // Format shifts
    const formattedShifts = shifts.map(shift => ({
      id: shift.id,
      outletId: shift.outlet_id,
      outletName: shift.outlet_name,
      sessionDate: shift.session_date,
      openingTime: shift.opening_time,
      closingTime: shift.closing_time,
      openingCash: parseFloat(shift.opening_cash) || 0,
      closingCash: parseFloat(shift.closing_cash) || 0,
      expectedCash: parseFloat(shift.expected_cash) || 0,
      cashVariance: parseFloat(shift.cash_variance) || 0,
      totalSales: parseFloat(shift.total_sales) || 0,
      totalOrders: shift.total_orders || 0,
      totalCashSales: parseFloat(shift.total_cash_sales) || 0,
      totalCardSales: parseFloat(shift.total_card_sales) || 0,
      totalUpiSales: parseFloat(shift.total_upi_sales) || 0,
      totalDiscounts: parseFloat(shift.total_discounts) || 0,
      totalRefunds: parseFloat(shift.total_refunds) || 0,
      totalCancellations: parseFloat(shift.total_cancellations) || 0,
      status: shift.status,
      openedBy: shift.opened_by,
      openedByName: shift.opened_by_name,
      closedBy: shift.closed_by,
      closedByName: shift.closed_by_name,
      varianceNotes: shift.variance_notes,
      createdAt: shift.created_at,
      updatedAt: shift.updated_at
    }));

    return {
      shifts: formattedShifts,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Get detailed shift by ID with all transactions
   * @param {number} shiftId - Day session ID
   * @returns {Object} - Detailed shift with transactions
   */
  async getShiftDetail(shiftId) {
    const pool = getPool();

    // Get shift details
    const [shifts] = await pool.query(
      `SELECT 
        ds.*,
        o.name as outlet_name,
        opener.name as opened_by_name,
        closer.name as closed_by_name
       FROM day_sessions ds
       LEFT JOIN outlets o ON ds.outlet_id = o.id
       LEFT JOIN users opener ON ds.opened_by = opener.id
       LEFT JOIN users closer ON ds.closed_by = closer.id
       WHERE ds.id = ?`,
      [shiftId]
    );

    if (!shifts[0]) {
      throw new Error('Shift not found');
    }

    const shift = shifts[0];

    // Get all cash drawer transactions for this shift
    const [transactions] = await pool.query(
      `SELECT 
        cd.*,
        u.name as user_name
       FROM cash_drawer cd
       LEFT JOIN users u ON cd.user_id = u.id
       WHERE cd.outlet_id = ? AND DATE(cd.created_at) = ?
       ORDER BY cd.created_at ASC`,
      [shift.outlet_id, shift.session_date]
    );

    // Get payment breakdown for the shift
    const [paymentBreakdown] = await pool.query(
      `SELECT 
        payment_mode,
        COUNT(*) as count,
        SUM(total_amount) as total
       FROM payments
       WHERE outlet_id = ? AND DATE(created_at) = ? AND status = 'completed'
       GROUP BY payment_mode`,
      [shift.outlet_id, shift.session_date]
    );

    // Get order statistics
    const [orderStats] = await pool.query(
      `SELECT 
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'completed' OR status = 'paid' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
        SUM(CASE WHEN order_type = 'dine_in' THEN 1 ELSE 0 END) as dine_in_orders,
        SUM(CASE WHEN order_type = 'takeaway' THEN 1 ELSE 0 END) as takeaway_orders,
        SUM(CASE WHEN order_type = 'delivery' THEN 1 ELSE 0 END) as delivery_orders,
        AVG(total_amount) as avg_order_value,
        MAX(total_amount) as max_order_value,
        MIN(CASE WHEN total_amount > 0 THEN total_amount ELSE NULL END) as min_order_value
       FROM orders
       WHERE outlet_id = ? AND DATE(created_at) = ?`,
      [shift.outlet_id, shift.session_date]
    );

    // Get staff who worked during this shift
    const [staffActivity] = await pool.query(
      `SELECT 
        u.id as user_id,
        u.name as user_name,
        COUNT(DISTINCT o.id) as orders_handled,
        SUM(o.total_amount) as total_sales
       FROM orders o
       JOIN users u ON o.created_by = u.id
       WHERE o.outlet_id = ? AND DATE(o.created_at) = ?
       GROUP BY u.id, u.name
       ORDER BY total_sales DESC`,
      [shift.outlet_id, shift.session_date]
    );

    // Format transactions
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      type: tx.transaction_type,
      amount: parseFloat(tx.amount) || 0,
      balanceBefore: parseFloat(tx.balance_before) || 0,
      balanceAfter: parseFloat(tx.balance_after) || 0,
      referenceType: tx.reference_type,
      referenceId: tx.reference_id,
      description: tx.description,
      notes: tx.notes,
      userId: tx.user_id,
      userName: tx.user_name,
      createdAt: tx.created_at
    }));

    // Format payment breakdown
    const formattedPayments = paymentBreakdown.map(p => ({
      mode: p.payment_mode,
      count: p.count,
      total: parseFloat(p.total) || 0
    }));

    return {
      id: shift.id,
      outletId: shift.outlet_id,
      outletName: shift.outlet_name,
      sessionDate: shift.session_date,
      openingTime: shift.opening_time,
      closingTime: shift.closing_time,
      openingCash: parseFloat(shift.opening_cash) || 0,
      closingCash: parseFloat(shift.closing_cash) || 0,
      expectedCash: parseFloat(shift.expected_cash) || 0,
      cashVariance: parseFloat(shift.cash_variance) || 0,
      totalSales: parseFloat(shift.total_sales) || 0,
      totalOrders: shift.total_orders || 0,
      totalCashSales: parseFloat(shift.total_cash_sales) || 0,
      totalCardSales: parseFloat(shift.total_card_sales) || 0,
      totalUpiSales: parseFloat(shift.total_upi_sales) || 0,
      totalDiscounts: parseFloat(shift.total_discounts) || 0,
      totalRefunds: parseFloat(shift.total_refunds) || 0,
      totalCancellations: parseFloat(shift.total_cancellations) || 0,
      status: shift.status,
      openedBy: shift.opened_by,
      openedByName: shift.opened_by_name,
      closedBy: shift.closed_by,
      closedByName: shift.closed_by_name,
      varianceNotes: shift.variance_notes,
      transactions: formattedTransactions,
      paymentBreakdown: formattedPayments,
      orderStats: {
        totalOrders: orderStats[0]?.total_orders || 0,
        completedOrders: orderStats[0]?.completed_orders || 0,
        cancelledOrders: orderStats[0]?.cancelled_orders || 0,
        dineInOrders: orderStats[0]?.dine_in_orders || 0,
        takeawayOrders: orderStats[0]?.takeaway_orders || 0,
        deliveryOrders: orderStats[0]?.delivery_orders || 0,
        avgOrderValue: parseFloat(orderStats[0]?.avg_order_value) || 0,
        maxOrderValue: parseFloat(orderStats[0]?.max_order_value) || 0,
        minOrderValue: parseFloat(orderStats[0]?.min_order_value) || 0
      },
      staffActivity: staffActivity.map(s => ({
        userId: s.user_id,
        userName: s.user_name,
        ordersHandled: s.orders_handled,
        totalSales: parseFloat(s.total_sales) || 0
      })),
      createdAt: shift.created_at,
      updatedAt: shift.updated_at
    };
  },

  /**
   * Get shift summary statistics across date range
   * @param {Object} params - Query parameters
   * @returns {Object} - Summary statistics
   */
  async getShiftSummary(params) {
    const pool = getPool();
    const {
      outletId,
      startDate = null,
      endDate = null
    } = params;

    const conditions = ['outlet_id = ?'];
    const queryParams = [outletId];

    if (startDate) {
      conditions.push('session_date >= ?');
      queryParams.push(startDate);
    }
    if (endDate) {
      conditions.push('session_date <= ?');
      queryParams.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    const [summary] = await pool.query(
      `SELECT 
        COUNT(*) as total_shifts,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_shifts,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_shifts,
        SUM(total_sales) as total_sales,
        SUM(total_orders) as total_orders,
        SUM(total_cash_sales) as total_cash_sales,
        SUM(total_card_sales) as total_card_sales,
        SUM(total_upi_sales) as total_upi_sales,
        SUM(total_discounts) as total_discounts,
        SUM(total_refunds) as total_refunds,
        SUM(total_cancellations) as total_cancellations,
        SUM(cash_variance) as total_variance,
        AVG(total_sales) as avg_daily_sales,
        AVG(total_orders) as avg_daily_orders,
        MAX(total_sales) as max_daily_sales,
        MIN(CASE WHEN total_sales > 0 THEN total_sales ELSE NULL END) as min_daily_sales
       FROM day_sessions
       WHERE ${whereClause}`,
      queryParams
    );

    return {
      totalShifts: summary[0]?.total_shifts || 0,
      closedShifts: summary[0]?.closed_shifts || 0,
      openShifts: summary[0]?.open_shifts || 0,
      totalSales: parseFloat(summary[0]?.total_sales) || 0,
      totalOrders: summary[0]?.total_orders || 0,
      totalCashSales: parseFloat(summary[0]?.total_cash_sales) || 0,
      totalCardSales: parseFloat(summary[0]?.total_card_sales) || 0,
      totalUpiSales: parseFloat(summary[0]?.total_upi_sales) || 0,
      totalDiscounts: parseFloat(summary[0]?.total_discounts) || 0,
      totalRefunds: parseFloat(summary[0]?.total_refunds) || 0,
      totalCancellations: parseFloat(summary[0]?.total_cancellations) || 0,
      totalVariance: parseFloat(summary[0]?.total_variance) || 0,
      avgDailySales: parseFloat(summary[0]?.avg_daily_sales) || 0,
      avgDailyOrders: parseFloat(summary[0]?.avg_daily_orders) || 0,
      maxDailySales: parseFloat(summary[0]?.max_daily_sales) || 0,
      minDailySales: parseFloat(summary[0]?.min_daily_sales) || 0
    };
  }
};

module.exports = paymentService;
