/**
 * Customer Service
 * Handles customer management, GST details, and order history
 */

const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const customerService = {
  // ========================
  // CUSTOMER CRUD
  // ========================

  async create(data) {
    const pool = getPool();
    const uuid = uuidv4();
    const {
      outletId, name, phone, email, address,
      isGstCustomer = false, companyName, gstin, gstState, gstStateCode,
      companyPhone, companyAddress, notes
    } = data;

    const [result] = await pool.query(
      `INSERT INTO customers 
        (uuid, outlet_id, name, phone, email, address,
         is_gst_customer, company_name, gstin, gst_state, gst_state_code,
         company_phone, company_address, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuid, outletId, name, phone, email, address,
       isGstCustomer, companyName, gstin, gstState, gstStateCode,
       companyPhone, companyAddress, notes]
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

  async getByPhone(outletId, phone) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM customers WHERE outlet_id = ? AND phone = ? AND is_active = 1`,
      [outletId, phone]
    );
    if (!rows[0]) return null;
    return this.formatCustomer(rows[0]);
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
              o.created_at, o.billed_at,
              t.table_number, t.name as table_name
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
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
      orders: orders.map(o => ({
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
        tableNumber: o.table_number,
        tableName: o.table_name,
        createdAt: o.created_at,
        billedAt: o.billed_at
      })),
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

      // If customerId provided, get the customer
      if (customerId) {
        customer = await this.getById(customerId);
      } else if (customerData.phone) {
        // Try to find existing customer by phone
        const [order] = await connection.query('SELECT outlet_id FROM orders WHERE id = ?', [orderId]);
        if (order[0]) {
          customer = await this.getByPhone(order[0].outlet_id, customerData.phone);
          if (customer) {
            customerId = customer.id;
          }
        }
      }

      // Create new customer if not found
      if (!customerId && customerData.name) {
        const [order] = await connection.query('SELECT outlet_id FROM orders WHERE id = ?', [orderId]);
        if (order[0]) {
          const newCustomer = await this.create({
            outletId: order[0].outlet_id,
            name: customerData.name,
            phone: customerData.phone,
            email: customerData.email,
            address: customerData.address,
            isGstCustomer: customerData.isGstCustomer || false,
            companyName: customerData.companyName,
            gstin: customerData.gstin,
            gstState: customerData.gstState,
            gstStateCode: customerData.gstStateCode,
            companyPhone: customerData.companyPhone,
            companyAddress: customerData.companyAddress
          });
          customerId = newCustomer.id;
          customer = newCustomer;
        }
      }

      // Update order with customer details
      const updateFields = ['customer_id = ?', 'customer_name = ?', 'customer_phone = ?'];
      const updateValues = [
        customerId,
        customerData.name || customer?.name,
        customerData.phone || customer?.phone
      ];

      // Add GST fields if provided
      if (customerData.gstin || customer?.gstin) {
        updateFields.push('customer_gstin = ?', 'customer_company_name = ?', 'customer_gst_state = ?', 'customer_gst_state_code = ?');
        updateValues.push(
          customerData.gstin || customer?.gstin,
          customerData.companyName || customer?.companyName,
          customerData.gstState || customer?.gstState,
          customerData.gstStateCode || customer?.gstStateCode
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

      await connection.commit();

      return { customerId, customer };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async updateOrderCustomerGst(orderId, gstData) {
    const pool = getPool();
    const { gstin, companyName, gstState, gstStateCode, companyPhone } = gstData;

    // Check if interstate
    const [businessProfile] = await pool.query('SELECT state_code FROM business_profile LIMIT 1');
    const outletStateCode = businessProfile[0]?.state_code || '23'; // Default MP
    const isInterstate = gstStateCode && gstStateCode !== outletStateCode;

    await pool.query(
      `UPDATE orders SET 
        customer_gstin = ?, customer_company_name = ?,
        customer_gst_state = ?, customer_gst_state_code = ?,
        is_interstate = ?
       WHERE id = ?`,
      [gstin, companyName, gstState, gstStateCode, isInterstate, orderId]
    );

    return { isInterstate };
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
