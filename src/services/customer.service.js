/**
 * Customer Service
 * Handles customer management, GST details, and order history
 */

const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// Shared GST state code to state name map
const GST_STATE_MAP = {
  '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab',
  '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
  '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh',
  '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram',
  '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam',
  '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
  '26': 'Dadra & Nagar Haveli and Daman & Diu', '27': 'Maharashtra',
  '28': 'Andhra Pradesh (Old)', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
  '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana',
  '37': 'Andhra Pradesh', '38': 'Ladakh'
};

function deriveGstState(gstin) {
  if (!gstin || gstin.length < 2) return { gstState: null, gstStateCode: null };
  const gstStateCode = gstin.substring(0, 2);
  return { gstState: GST_STATE_MAP[gstStateCode] || null, gstStateCode };
}

const customerService = {
  // ========================
  // CUSTOMER CRUD
  // ========================

  async create(data) {
    const pool = getPool();
    const uuid = uuidv4();
    const {
      outletId, name, phone, email, address,
      isGstCustomer = false, companyName, gstin,
      companyPhone, companyAddress, notes,
      isInterstate = false
    } = data;

    // Derive gstState/gstStateCode from GSTIN if not provided
    let { gstState, gstStateCode } = data;
    if (!gstState && gstin) {
      const derived = deriveGstState(gstin);
      gstState = derived.gstState;
      gstStateCode = derived.gstStateCode;
    }

    const [result] = await pool.query(
      `INSERT INTO customers 
        (uuid, outlet_id, name, phone, email, address,
         is_gst_customer, company_name, gstin, gst_state, gst_state_code,
         company_phone, company_address, notes, is_interstate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, outletId, name, phone, email, address,
       isGstCustomer, companyName, gstin, gstState, gstStateCode,
       companyPhone, companyAddress, notes, isInterstate ? 1 : 0]
    );

    return this.getById(result.insertId);
  },

  async update(id, data) {
    const pool = getPool();
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.phone !== undefined) { fields.push('phone = ?'); values.push(data.phone); }
    if (data.email !== undefined) { fields.push('email = ?'); values.push(data.email); }
    if (data.address !== undefined) { fields.push('address = ?'); values.push(data.address); }
    if (data.isGstCustomer !== undefined) { fields.push('is_gst_customer = ?'); values.push(data.isGstCustomer); }
    if (data.companyName !== undefined) { fields.push('company_name = ?'); values.push(data.companyName); }
    if (data.gstin !== undefined) { fields.push('gstin = ?'); values.push(data.gstin); }
    if (data.gstState !== undefined) { fields.push('gst_state = ?'); values.push(data.gstState); }
    if (data.gstStateCode !== undefined) { fields.push('gst_state_code = ?'); values.push(data.gstStateCode); }
    if (data.companyPhone !== undefined) { fields.push('company_phone = ?'); values.push(data.companyPhone); }
    if (data.companyAddress !== undefined) { fields.push('company_address = ?'); values.push(data.companyAddress); }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive); }
    if (data.isInterstate !== undefined) { fields.push('is_interstate = ?'); values.push(data.isInterstate ? 1 : 0); }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await pool.query(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.getById(id);
  },

  async getById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM customers WHERE id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    return this.formatCustomer(rows[0]);
  },

  async getByPhone(outletId, phone, exactMatch = false) {
    const pool = getPool();
    
    // If exactMatch or phone is 10+ digits, try exact match first
    if (exactMatch || phone.length >= 10) {
      const [exactRows] = await pool.query(
        `SELECT * FROM customers WHERE outlet_id = ? AND phone = ? AND is_active = 1`,
        [outletId, phone]
      );
      if (exactRows[0]) return this.formatCustomer(exactRows[0]);
    }
    
    // Partial search (last N digits match or contains)
    const searchPhone = `%${phone}%`;
    const [rows] = await pool.query(
      `SELECT * FROM customers 
       WHERE outlet_id = ? AND phone LIKE ? AND is_active = 1
       ORDER BY 
         CASE WHEN phone = ? THEN 0 ELSE 1 END,
         last_order_at DESC
       LIMIT 10`,
      [outletId, searchPhone, phone]
    );
    
    // If single result, return it; otherwise return array for selection
    if (rows.length === 1) return this.formatCustomer(rows[0]);
    if (rows.length > 1) return rows.map(r => this.formatCustomer(r));
    return null;
  },

  async getByGstin(outletId, gstin) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM customers WHERE outlet_id = ? AND gstin = ? AND is_active = 1`,
      [outletId, gstin]
    );
    if (!rows[0]) return null;
    return this.formatCustomer(rows[0]);
  },

  // ========================
  // SEARCH & LIST
  // ========================

  async search(outletId, query, limit = 20) {
    const pool = getPool();
    const searchTerm = `%${query}%`;
    const [rows] = await pool.query(
      `SELECT * FROM customers 
       WHERE outlet_id = ? AND is_active = 1
         AND (name LIKE ? OR phone LIKE ? OR company_name LIKE ? OR gstin LIKE ?)
       ORDER BY last_order_at DESC, name ASC
       LIMIT ?`,
      [outletId, searchTerm, searchTerm, searchTerm, searchTerm, limit]
    );
    return rows.map(r => this.formatCustomer(r));
  },

  async list(outletId, options = {}) {
    const pool = getPool();
    const { page = 1, limit = 50, gstOnly = false, sortBy = 'name', sortOrder = 'ASC' } = options;
    const offset = (page - 1) * limit;

    let whereClause = 'outlet_id = ? AND is_active = 1';
    const params = [outletId];

    if (gstOnly) {
      whereClause += ' AND is_gst_customer = 1';
    }

    const validSortFields = ['name', 'total_orders', 'total_spent', 'last_order_at', 'created_at'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'name';
    const order = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    const [rows] = await pool.query(
      `SELECT * FROM customers WHERE ${whereClause} ORDER BY ${sortField} ${order} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM customers WHERE ${whereClause}`,
      params
    );

    return {
      customers: rows.map(r => this.formatCustomer(r)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  // ========================
  // ORDER HISTORY
  // ========================

  async getOrderHistory(customerId, options = {}) {
    const pool = getPool();
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;

    const [orders] = await pool.query(
      `SELECT o.id, o.uuid, o.order_number, o.order_type, o.status, o.payment_status,
              o.subtotal, o.discount_amount, o.tax_amount, o.total_amount,
              o.is_interstate, o.customer_gstin, o.customer_company_name,
              o.created_at, o.billed_at,
              t.table_number, t.name as table_name,
              i.cgst_amount, i.sgst_amount, i.igst_amount, i.invoice_number
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN invoices i ON o.id = i.order_id AND i.is_cancelled = 0
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC
       LIMIT ? OFFSET ?`,
      [customerId, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM orders WHERE customer_id = ?`,
      [customerId]
    );

    return {
      orders: orders.map(o => {
        const isInterstate = !!o.is_interstate;
        return {
          id: o.id,
          uuid: o.uuid,
          orderNumber: o.order_number,
          orderType: o.order_type,
          status: o.status,
          paymentStatus: o.payment_status,
          subtotal: parseFloat(o.subtotal) || 0,
          discountAmount: parseFloat(o.discount_amount) || 0,
          taxAmount: parseFloat(o.tax_amount) || 0,
          totalAmount: parseFloat(o.total_amount) || 0,
          isInterstate,
          taxType: isInterstate ? 'IGST' : 'CGST+SGST',
          cgstAmount: parseFloat(o.cgst_amount) || 0,
          sgstAmount: parseFloat(o.sgst_amount) || 0,
          igstAmount: parseFloat(o.igst_amount) || 0,
          customerGstin: o.customer_gstin || null,
          customerCompanyName: o.customer_company_name || null,
          invoiceNumber: o.invoice_number || null,
          tableNumber: o.table_number,
          tableName: o.table_name,
          createdAt: o.created_at,
          billedAt: o.billed_at
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
  },

  // ========================
  // LINK CUSTOMER TO ORDER
  // ========================

  async linkToOrder(orderId, customerData) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      let customerId = customerData.customerId;
      let customer = null;
      const isInterstate = customerData.isInterstate === true;
      const taxType = isInterstate ? 'IGST' : 'CGST+SGST';

      // Derive gstState/gstStateCode from GSTIN
      const gstin = customerData.gstin || null;
      const { gstState, gstStateCode } = deriveGstState(gstin);

      // Get order info (needed for outlet_id)
      const [orderRows] = await connection.query(
        'SELECT outlet_id FROM orders WHERE id = ?', [orderId]
      );
      const outletId = orderRows[0]?.outlet_id;
      if (!outletId) throw new Error('Order not found');

      // If customerId provided, get the customer
      if (customerId) {
        customer = await this.getById(customerId);
      } else if (customerData.phone) {
        // Try to find existing customer by phone
        const found = await this.getByPhone(outletId, customerData.phone);
        if (found && !Array.isArray(found)) {
          customer = found;
          customerId = customer.id;
        } else if (Array.isArray(found) && found.length === 1) {
          customer = found[0];
          customerId = customer.id;
        }
      }

      // Create new customer if not found
      if (!customerId && customerData.name) {
        const newCustomer = await this.create({
          outletId,
          name: customerData.name,
          phone: customerData.phone,
          email: customerData.email,
          address: customerData.address,
          isGstCustomer: customerData.isGstCustomer || false,
          companyName: customerData.companyName,
          gstin,
          gstState,
          gstStateCode,
          companyPhone: customerData.companyPhone,
          companyAddress: customerData.companyAddress,
          isInterstate
        });
        customerId = newCustomer.id;
        customer = newCustomer;
      }

      // Update existing customer's GST fields if GST data is provided
      if (customerId && (gstin || customerData.isGstCustomer)) {
        await connection.query(
          `UPDATE customers SET 
            is_gst_customer = ?,
            gstin = COALESCE(?, gstin),
            company_name = COALESCE(?, company_name),
            company_phone = COALESCE(?, company_phone),
            gst_state = COALESCE(?, gst_state),
            gst_state_code = COALESCE(?, gst_state_code),
            is_interstate = ?
           WHERE id = ?`,
          [
            customerData.isGstCustomer ? 1 : (gstin ? 1 : 0),
            gstin,
            customerData.companyName || null,
            customerData.companyPhone || null,
            gstState,
            gstStateCode,
            isInterstate ? 1 : 0,
            customerId
          ]
        );
      }

      // Update order with customer details
      const updateFields = [
        'customer_id = ?', 'customer_name = ?', 'customer_phone = ?',
        'is_interstate = ?'
      ];
      const updateValues = [
        customerId,
        customerData.name || customer?.name,
        customerData.phone || customer?.phone,
        isInterstate ? 1 : 0
      ];

      // Add GST fields if provided
      if (gstin || customer?.gstin) {
        updateFields.push(
          'customer_gstin = ?', 'customer_company_name = ?',
          'customer_gst_state = ?', 'customer_gst_state_code = ?'
        );
        updateValues.push(
          gstin || customer?.gstin,
          customerData.companyName || customer?.companyName,
          gstState || customer?.gstState,
          gstStateCode || customer?.gstStateCode
        );
      }

      updateValues.push(orderId);
      await connection.query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      // Update customer stats
      if (customerId) {
        await connection.query(
          `UPDATE customers SET 
            total_orders = total_orders + 1,
            last_order_at = NOW()
           WHERE id = ?`,
          [customerId]
        );
      }

      // Update existing invoice if one exists for this order
      const [existingInvoice] = await connection.query(
        'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0 ORDER BY created_at DESC LIMIT 1',
        [orderId]
      );
      if (existingInvoice[0]) {
        const invoiceId = existingInvoice[0].id;
        const customerName = customerData.name || customer?.name;
        const customerPhone = customerData.phone || customer?.phone;
        const customerGstin = gstin || customer?.gstin;
        const customerCompanyName = customerData.companyName || customer?.companyName;

        // Get order with items for tax recalculation
        const [orderData] = await connection.query(
          `SELECT o.*, GROUP_CONCAT(oi.id) as item_ids
           FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id
           WHERE o.id = ?`, [orderId]
        );
        const [orderItems] = await connection.query(
          'SELECT * FROM order_items WHERE order_id = ? AND status != ?',
          [orderId, 'cancelled']
        );

        if (orderData[0]) {
          const orderObj = { ...orderData[0], items: orderItems, is_interstate: isInterstate };
          const billingService = require('./billing.service');
          const billDetails = await billingService.calculateBillDetails(orderObj, { isInterstate });

          await connection.query(
            `UPDATE invoices SET
              customer_id = ?, customer_name = ?, customer_phone = ?,
              customer_gstin = ?, customer_company_name = ?,
              customer_gst_state = ?, customer_gst_state_code = ?,
              is_interstate = ?,
              cgst_amount = ?, sgst_amount = ?, igst_amount = ?, total_tax = ?,
              round_off = ?, grand_total = ?,
              amount_in_words = ?, tax_breakup = ?
             WHERE id = ?`,
            [
              customerId, customerName, customerPhone,
              customerGstin, customerCompanyName,
              gstState, gstStateCode,
              isInterstate ? 1 : 0,
              billDetails.cgstAmount, billDetails.sgstAmount, billDetails.igstAmount, billDetails.totalTax,
              billDetails.roundOff, billDetails.grandTotal,
              billingService.numberToWords(billDetails.grandTotal),
              JSON.stringify(billDetails.taxBreakup),
              invoiceId
            ]
          );
        }
      }

      await connection.commit();

      // Fetch fresh customer data to return
      const finalCustomer = customerId ? await this.getById(customerId) : customer;

      return { 
        customerId, 
        orderId: parseInt(orderId),
        customer: finalCustomer,
        customerName: finalCustomer?.name || customerData.name || 'Walk-in Customer',
        customerPhone: finalCustomer?.phone || customerData.phone || null,
        isGstCustomer: finalCustomer?.isGstCustomer || false,
        gstin: finalCustomer?.gstin || customerData.gstin || null,
        companyName: finalCustomer?.companyName || customerData.companyName || null,
        isInterstate,
        taxType
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateOrderCustomerGst(orderId, gstData) {
    const pool = getPool();
    let { customerId, gstin, companyName, companyPhone, isInterstate: inputInterstate } = gstData;

    // Use isInterstate directly from input (default false = same state)
    const isInterstate = inputInterstate === true;
    const taxType = isInterstate ? 'IGST' : 'CGST+SGST';

    // Derive gst_state and gst_state_code from GSTIN
    const { gstState, gstStateCode } = deriveGstState(gstin);

    // Update order with GST details
    await pool.query(
      `UPDATE orders SET 
        customer_gstin = ?, customer_company_name = ?,
        customer_gst_state = ?, customer_gst_state_code = ?,
        is_interstate = ?
       WHERE id = ?`,
      [gstin, companyName, gstState, gstStateCode, isInterstate, orderId]
    );

    // If customerId not provided, try to get it from the order
    if (!customerId) {
      const [order] = await pool.query('SELECT customer_id FROM orders WHERE id = ?', [orderId]);
      if (order[0]?.customer_id) {
        customerId = order[0].customer_id;
      }
    }

    // Update the customer record if customerId exists
    if (customerId) {
      const [customer] = await pool.query('SELECT id FROM customers WHERE id = ?', [customerId]);
      if (customer[0]) {
        await pool.query(
          `UPDATE customers SET 
            is_gst_customer = 1,
            gstin = ?, company_name = ?,
            company_phone = ?,
            gst_state = ?, gst_state_code = ?,
            is_interstate = ?
           WHERE id = ?`,
          [gstin, companyName, companyPhone || null, gstState, gstStateCode, isInterstate ? 1 : 0, customerId]
        );
      }
    }

    // Update existing invoice if one exists for this order
    const [existingInvoice] = await pool.query(
      'SELECT id FROM invoices WHERE order_id = ? AND is_cancelled = 0 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    if (existingInvoice[0]) {
      const invoiceId = existingInvoice[0].id;
      const [orderData] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
      const [orderItems] = await pool.query(
        'SELECT * FROM order_items WHERE order_id = ? AND status != ?',
        [orderId, 'cancelled']
      );
      if (orderData[0]) {
        const orderObj = { ...orderData[0], items: orderItems, is_interstate: isInterstate };
        const billingService = require('./billing.service');
        const billDetails = await billingService.calculateBillDetails(orderObj, { isInterstate });

        await pool.query(
          `UPDATE invoices SET
            customer_gstin = ?, customer_company_name = ?,
            customer_gst_state = ?, customer_gst_state_code = ?,
            is_interstate = ?,
            cgst_amount = ?, sgst_amount = ?, igst_amount = ?, total_tax = ?,
            round_off = ?, grand_total = ?,
            amount_in_words = ?, tax_breakup = ?
           WHERE id = ?`,
          [
            gstin, companyName,
            gstState, gstStateCode,
            isInterstate ? 1 : 0,
            billDetails.cgstAmount, billDetails.sgstAmount, billDetails.igstAmount, billDetails.totalTax,
            billDetails.roundOff, billDetails.grandTotal,
            billingService.numberToWords(billDetails.grandTotal),
            JSON.stringify(billDetails.taxBreakup),
            invoiceId
          ]
        );
      }
    }

    return { 
      orderId: parseInt(orderId),
      isInterstate, 
      taxType,
      customerId,
      gstin,
      companyName,
      gstState,
      gstStateCode
    };
  },

  // ========================
  // HELPERS
  // ========================

  formatCustomer(row) {
    return {
      id: row.id,
      uuid: row.uuid,
      outletId: row.outlet_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      address: row.address,
      isGstCustomer: !!row.is_gst_customer,
      companyName: row.company_name,
      gstin: row.gstin,
      gstState: row.gst_state,
      gstStateCode: row.gst_state_code,
      companyPhone: row.company_phone,
      companyAddress: row.company_address,
      isInterstate: !!row.is_interstate,
      totalOrders: row.total_orders,
      totalSpent: parseFloat(row.total_spent) || 0,
      lastOrderAt: row.last_order_at,
      notes: row.notes,
      isActive: !!row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
};

module.exports = customerService;
