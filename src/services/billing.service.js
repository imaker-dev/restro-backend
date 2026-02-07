/**
 * Billing Service
 * Invoice generation, tax calculation, bill types
 * Handles GST + VAT mixed bills, service charges, discounts
 */

const { getPool } = require('../database');
const { cache, publishMessage } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const orderService = require('./order.service');
const taxService = require('./tax.service');
const printerService = require('./printer.service');

const billingService = {
  // ========================
  // INVOICE NUMBER GENERATION
  // ========================

  async generateInvoiceNumber(outletId) {
    const pool = getPool();
    const today = new Date();
    const financialYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const fyShort = `${String(financialYear).slice(2)}${String(financialYear + 1).slice(2)}`;
    
    const [result] = await pool.query(
      `SELECT COUNT(*) + 1 as seq FROM invoices 
       WHERE outlet_id = ? AND YEAR(invoice_date) = YEAR(CURDATE())`,
      [outletId]
    );
    
    const seq = String(result[0].seq).padStart(6, '0');
    return `INV/${fyShort}/${seq}`;
  },

  // ========================
  // GENERATE BILL
  // ========================

  /**
   * Generate bill/invoice for order
   */
  async generateBill(orderId, data = {}) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get order with items
      const order = await orderService.getOrderWithItems(orderId);
      if (!order) throw new Error('Order not found');

      if (order.status === 'paid') {
        throw new Error('Order already paid');
      }

      // Check if invoice already exists
      const [existingInvoice] = await connection.query(
        'SELECT * FROM invoices WHERE order_id = ? AND is_cancelled = 0',
        [orderId]
      );

      if (existingInvoice[0]) {
        // Return existing invoice
        return this.getInvoiceById(existingInvoice[0].id);
      }

      const {
        customerId, customerName, customerPhone, customerEmail,
        customerGstin, customerAddress, billingAddress,
        applyServiceCharge = true, notes, termsConditions,
        generatedBy
      } = data;

      // Calculate totals
      const billDetails = await this.calculateBillDetails(order, { applyServiceCharge });

      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber(order.outlet_id);
      const uuid = uuidv4();
      const today = new Date();

      // Create invoice
      const [result] = await connection.query(
        `INSERT INTO invoices (
          uuid, outlet_id, order_id, invoice_number, invoice_date, invoice_time,
          customer_id, customer_name, customer_phone, customer_email,
          customer_gstin, customer_address, billing_address,
          subtotal, discount_amount, taxable_amount,
          cgst_amount, sgst_amount, igst_amount, vat_amount, cess_amount, total_tax,
          service_charge, packaging_charge, delivery_charge, round_off, grand_total,
          amount_in_words, payment_status, tax_breakup, hsn_summary,
          notes, terms_conditions, generated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
        [
          uuid, order.outlet_id, orderId, invoiceNumber,
          today.toISOString().slice(0, 10), today.toTimeString().slice(0, 8),
          customerId || order.customer_id,
          customerName || order.customer_name,
          customerPhone || order.customer_phone,
          customerEmail, customerGstin, customerAddress, billingAddress,
          billDetails.subtotal, billDetails.discountAmount, billDetails.taxableAmount,
          billDetails.cgstAmount, billDetails.sgstAmount, billDetails.igstAmount,
          billDetails.vatAmount, billDetails.cessAmount, billDetails.totalTax,
          billDetails.serviceCharge, billDetails.packagingCharge, billDetails.deliveryCharge,
          billDetails.roundOff, billDetails.grandTotal,
          this.numberToWords(billDetails.grandTotal),
          JSON.stringify(billDetails.taxBreakup),
          JSON.stringify(billDetails.hsnSummary),
          notes, termsConditions, generatedBy
        ]
      );

      const invoiceId = result.insertId;

      // Update order status to billed
      await connection.query(
        `UPDATE orders SET 
          status = 'billed', billed_by = ?, billed_at = NOW(),
          total_amount = ?, tax_amount = ?, service_charge = ?, round_off = ?
         WHERE id = ?`,
        [generatedBy, billDetails.grandTotal, billDetails.totalTax, billDetails.serviceCharge, billDetails.roundOff, orderId]
      );

      await connection.commit();

      const invoice = await this.getInvoiceById(invoiceId);

      // Emit order update event
      await publishMessage('order:update', {
        type: 'order:billed',
        outletId: order.outlet_id,
        orderId,
        invoice,
        timestamp: new Date().toISOString()
      });

      // Emit bill status event for Captain real-time tracking
      await publishMessage('bill:status', {
        outletId: order.outlet_id,
        orderId,
        tableId: order.table_id,
        tableNumber: order.table_number,
        invoiceId,
        invoiceNumber,
        billStatus: 'pending',
        grandTotal: billDetails.grandTotal,
        timestamp: new Date().toISOString()
      });

      // Create print job for bill
      try {
        await printerService.printBill({
          outletId: order.outlet_id,
          orderId,
          invoiceId,
          invoiceNumber,
          outletName: order.outlet_name || 'Restaurant',
          outletAddress: order.outlet_address,
          outletGstin: order.outlet_gstin,
          tableNumber: order.table_number,
          date: today.toLocaleDateString('en-IN'),
          time: today.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          items: order.items.filter(i => i.status !== 'cancelled').map(item => ({
            itemName: item.item_name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unit_price).toFixed(2),
            totalPrice: parseFloat(item.total_price).toFixed(2)
          })),
          subtotal: billDetails.subtotal.toFixed(2),
          taxes: billDetails.taxBreakup,
          serviceCharge: billDetails.serviceCharge > 0 ? billDetails.serviceCharge.toFixed(2) : null,
          discount: billDetails.discountAmount > 0 ? billDetails.discountAmount.toFixed(2) : null,
          grandTotal: billDetails.grandTotal.toFixed(2),
          paymentMode: null, // Will be updated when payment is made
          isDuplicate: false,
          openDrawer: false
        }, generatedBy);
      } catch (printError) {
        logger.error(`Failed to create print job for invoice ${invoiceNumber}:`, printError);
      }

      return invoice;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Calculate bill details with tax breakup
   */
  async calculateBillDetails(order, options = {}) {
    const pool = getPool();
    const { applyServiceCharge = true } = options;

    let subtotal = 0;
    let cgstAmount = 0;
    let sgstAmount = 0;
    let igstAmount = 0;
    let vatAmount = 0;
    let cessAmount = 0;
    const taxBreakup = {};
    const hsnSummary = {};

    // Process each item
    for (const item of order.items) {
      if (item.status === 'cancelled') continue;

      const itemTotal = parseFloat(item.total_price);
      subtotal += itemTotal;

      // Parse tax details
      if (item.tax_details) {
        const taxDetails = typeof item.tax_details === 'string' 
          ? JSON.parse(item.tax_details) 
          : item.tax_details;

        if (Array.isArray(taxDetails)) {
          for (const tax of taxDetails) {
            const taxCode = tax.code || tax.name || 'TAX';
            if (!taxCode || !taxBreakup[taxCode]) {
              taxBreakup[taxCode] = {
                name: tax.name,
                rate: tax.rate,
                taxableAmount: 0,
                taxAmount: 0
              };
            }
            taxBreakup[taxCode].taxableAmount += itemTotal;
            taxBreakup[taxCode].taxAmount += tax.amount || (itemTotal * tax.rate / 100);

            // Categorize tax
            if (taxCode.includes('CGST')) {
              cgstAmount += tax.amount || (itemTotal * tax.rate / 100);
            } else if (taxCode.includes('SGST')) {
              sgstAmount += tax.amount || (itemTotal * tax.rate / 100);
            } else if (taxCode.includes('IGST')) {
              igstAmount += tax.amount || (itemTotal * tax.rate / 100);
            } else if (taxCode.includes('VAT')) {
              vatAmount += tax.amount || (itemTotal * tax.rate / 100);
            } else if (taxCode.includes('CESS')) {
              cessAmount += tax.amount || (itemTotal * tax.rate / 100);
            }
          }
        }
      }
    }

    const totalTax = cgstAmount + sgstAmount + igstAmount + vatAmount + cessAmount;
    const discountAmount = parseFloat(order.discount_amount) || 0;
    const taxableAmount = subtotal - discountAmount;

    // Service charge
    let serviceCharge = 0;
    if (applyServiceCharge && order.order_type === 'dine_in') {
      const [charges] = await pool.query(
        'SELECT * FROM service_charges WHERE outlet_id = ? AND is_active = 1 LIMIT 1',
        [order.outlet_id]
      );
      if (charges[0]) {
        if (charges[0].is_percentage) {
          serviceCharge = (taxableAmount * parseFloat(charges[0].rate)) / 100;
        } else {
          serviceCharge = parseFloat(charges[0].rate);
        }
      }
    }

    const packagingCharge = parseFloat(order.packaging_charge) || 0;
    const deliveryCharge = parseFloat(order.delivery_charge) || 0;

    const preRoundTotal = taxableAmount + totalTax + serviceCharge + packagingCharge + deliveryCharge;
    const grandTotal = Math.round(preRoundTotal);
    const roundOff = grandTotal - preRoundTotal;

    return {
      subtotal: parseFloat(subtotal.toFixed(2)),
      discountAmount: parseFloat(discountAmount.toFixed(2)),
      taxableAmount: parseFloat(taxableAmount.toFixed(2)),
      cgstAmount: parseFloat(cgstAmount.toFixed(2)),
      sgstAmount: parseFloat(sgstAmount.toFixed(2)),
      igstAmount: parseFloat(igstAmount.toFixed(2)),
      vatAmount: parseFloat(vatAmount.toFixed(2)),
      cessAmount: parseFloat(cessAmount.toFixed(2)),
      totalTax: parseFloat(totalTax.toFixed(2)),
      serviceCharge: parseFloat(serviceCharge.toFixed(2)),
      packagingCharge: parseFloat(packagingCharge.toFixed(2)),
      deliveryCharge: parseFloat(deliveryCharge.toFixed(2)),
      roundOff: parseFloat(roundOff.toFixed(2)),
      grandTotal,
      taxBreakup,
      hsnSummary
    };
  },

  // ========================
  // INVOICE RETRIEVAL
  // ========================

  async getInvoiceById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT i.*, o.order_number, o.order_type, o.table_id,
        t.table_number, t.name as table_name,
        u.name as generated_by_name
       FROM invoices i
       JOIN orders o ON i.order_id = o.id
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN users u ON i.generated_by = u.id
       WHERE i.id = ?`,
      [id]
    );

    if (!rows[0]) return null;

    const invoice = rows[0];

    // Get order items
    const order = await orderService.getOrderWithItems(invoice.order_id);
    invoice.items = order.items;
    invoice.discounts = order.discounts;

    // Get payments
    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE invoice_id = ?',
      [id]
    );
    invoice.payments = payments;

    return invoice;
  },

  async getInvoiceByOrder(orderId) {
    const pool = getPool();
    const [rows] = await pool.query(
      'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0',
      [orderId]
    );
    return rows[0] ? await this.getInvoiceById(rows[0].id) : null;
  },

  // ========================
  // BILL TYPES
  // ========================

  /**
   * Print duplicate bill
   */
  async printDuplicateBill(invoiceId, userId, reason = null) {
    const pool = getPool();

    // Get current duplicate count
    const [counts] = await pool.query(
      'SELECT COALESCE(MAX(duplicate_number), 0) + 1 as next FROM duplicate_bill_logs WHERE invoice_id = ?',
      [invoiceId]
    );

    const duplicateNumber = counts[0].next;

    await pool.query(
      `INSERT INTO duplicate_bill_logs (invoice_id, outlet_id, duplicate_number, reason, printed_by)
       SELECT ?, outlet_id, ?, ?, ? FROM invoices WHERE id = ?`,
      [invoiceId, duplicateNumber, reason, userId, invoiceId]
    );

    const invoice = await this.getInvoiceById(invoiceId);
    invoice.isDuplicate = true;
    invoice.duplicateNumber = duplicateNumber;

    return invoice;
  },

  /**
   * Split bill - create multiple invoices from one order
   */
  async splitBill(orderId, splits, generatedBy) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const order = await orderService.getOrderWithItems(orderId);
      if (!order) throw new Error('Order not found');

      const invoices = [];

      for (let i = 0; i < splits.length; i++) {
        const split = splits[i];
        const { itemIds, customerName, customerPhone } = split;

        // Create partial order for invoice calculation
        const splitItems = order.items.filter(item => itemIds.includes(item.id));
        if (splitItems.length === 0) continue;

        const splitOrder = { ...order, items: splitItems };
        const billDetails = await this.calculateBillDetails(splitOrder, { applyServiceCharge: false });

        const invoiceNumber = await this.generateInvoiceNumber(order.outlet_id);
        const uuid = uuidv4();
        const today = new Date();

        const [result] = await connection.query(
          `INSERT INTO invoices (
            uuid, outlet_id, order_id, invoice_number, invoice_date, invoice_time,
            customer_name, customer_phone,
            subtotal, discount_amount, taxable_amount,
            cgst_amount, sgst_amount, vat_amount, total_tax,
            service_charge, round_off, grand_total,
            amount_in_words, payment_status, tax_breakup, generated_by,
            notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          [
            uuid, order.outlet_id, orderId, invoiceNumber,
            today.toISOString().slice(0, 10), today.toTimeString().slice(0, 8),
            customerName, customerPhone,
            billDetails.subtotal, billDetails.discountAmount, billDetails.taxableAmount,
            billDetails.cgstAmount, billDetails.sgstAmount, billDetails.vatAmount, billDetails.totalTax,
            billDetails.serviceCharge, billDetails.roundOff, billDetails.grandTotal,
            this.numberToWords(billDetails.grandTotal),
            JSON.stringify(billDetails.taxBreakup), generatedBy,
            `Split bill ${i + 1} of ${splits.length}`
          ]
        );

        invoices.push({
          id: result.insertId,
          invoiceNumber,
          grandTotal: billDetails.grandTotal,
          itemCount: splitItems.length
        });
      }

      // Update order status
      await connection.query(
        `UPDATE orders SET status = 'billed', billed_by = ?, billed_at = NOW() WHERE id = ?`,
        [generatedBy, orderId]
      );

      await connection.commit();

      return invoices;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Cancel invoice
   */
  async cancelInvoice(invoiceId, reason, cancelledBy) {
    const pool = getPool();

    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) throw new Error('Invoice not found');

    if (invoice.payment_status === 'paid') {
      throw new Error('Cannot cancel paid invoice');
    }

    await pool.query(
      `UPDATE invoices SET 
        is_cancelled = 1, cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ?
       WHERE id = ?`,
      [cancelledBy, reason, invoiceId]
    );

    // Revert order status
    await pool.query(
      `UPDATE orders SET status = 'served' WHERE id = ?`,
      [invoice.order_id]
    );

    return { success: true, message: 'Invoice cancelled' };
  },

  // ========================
  // DISCOUNTS
  // ========================

  /**
   * Apply discount to order
   */
  async applyDiscount(orderId, data, userId) {
    const pool = getPool();
    const {
      discountId, discountCode, discountName, discountType, discountValue,
      appliedOn = 'subtotal', orderItemId, approvedBy, approvalReason
    } = data;

    const order = await orderService.getById(orderId);
    if (!order) throw new Error('Order not found');

    // Calculate discount amount
    let discountAmount = 0;
    if (discountType === 'percentage') {
      const base = appliedOn === 'item' && orderItemId
        ? (await pool.query('SELECT total_price FROM order_items WHERE id = ?', [orderItemId]))[0][0]?.total_price || 0
        : order.subtotal;
      discountAmount = (base * discountValue) / 100;
    } else {
      discountAmount = discountValue;
    }

    await pool.query(
      `INSERT INTO order_discounts (
        order_id, order_item_id, discount_id, discount_code, discount_name,
        discount_type, discount_value, discount_amount, applied_on,
        approved_by, approval_reason, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        orderId, orderItemId, discountId, discountCode, discountName,
        discountType, discountValue, discountAmount, appliedOn,
        approvedBy, approvalReason, userId
      ]
    );

    // Recalculate order totals
    await orderService.recalculateTotals(orderId);

    return orderService.getOrderWithItems(orderId);
  },

  // ========================
  // UTILITIES
  // ========================

  numberToWords(amount) {
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

    if (amount === 0) return 'Zero Rupees Only';

    amount = Math.round(amount);
    let words = '';

    const crore = Math.floor(amount / 10000000);
    amount %= 10000000;
    const lakh = Math.floor(amount / 100000);
    amount %= 100000;
    const thousand = Math.floor(amount / 1000);
    amount %= 1000;
    const hundred = Math.floor(amount / 100);
    amount %= 100;

    const twoDigit = (n) => {
      if (n === 0) return '';
      if (n < 10) return ones[n];
      if (n < 20) return teens[n - 10];
      return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
    };

    if (crore) words += twoDigit(crore) + ' Crore ';
    if (lakh) words += twoDigit(lakh) + ' Lakh ';
    if (thousand) words += twoDigit(thousand) + ' Thousand ';
    if (hundred) words += ones[hundred] + ' Hundred ';
    if (amount) words += twoDigit(amount);

    return words.trim() + ' Rupees Only';
  }
};

module.exports = billingService;
