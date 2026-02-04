/**
 * Order Service
 * Core order management - create, items, status, modifications
 * This is the backbone of the POS system
 */

const { getPool } = require('../database');
const { cache } = require('../config/redis');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const tableService = require('./table.service');
const menuEngineService = require('./menuEngine.service');
const taxService = require('./tax.service');

// Order status flow
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  BILLED: 'billed',
  PAID: 'paid',
  CANCELLED: 'cancelled'
};

const ITEM_STATUS = {
  PENDING: 'pending',
  SENT_TO_KITCHEN: 'sent_to_kitchen',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled'
};

const orderService = {
  ORDER_STATUS,
  ITEM_STATUS,

  // ========================
  // ORDER CREATION
  // ========================

  /**
   * Generate unique order number
   */
  async generateOrderNumber(outletId) {
    const pool = getPool();
    const today = new Date();
    const datePrefix = today.toISOString().slice(2, 10).replace(/-/g, '');
    
    const [result] = await pool.query(
      `SELECT COUNT(*) + 1 as seq FROM orders 
       WHERE outlet_id = ? AND DATE(created_at) = CURDATE()`,
      [outletId]
    );
    
    const seq = String(result[0].seq).padStart(4, '0');
    return `ORD${datePrefix}${seq}`;
  },

  /**
   * Create new order for table
   */
  async createOrder(data) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const {
        outletId, tableId, floorId, sectionId, orderType = 'dine_in',
        customerId, customerName, customerPhone, guestCount = 1,
        specialInstructions, createdBy
      } = data;

      // Generate order number
      const orderNumber = await this.generateOrderNumber(outletId);
      const uuid = uuidv4();

      // Get or create table session
      let tableSessionId = null;
      if (tableId && orderType === 'dine_in') {
        // Start table session
        const session = await tableService.startSession(tableId, {
          guestCount,
          waiterId: createdBy,
          notes: specialInstructions
        });
        tableSessionId = session.sessionId;

        // Update table status to occupied
        await tableService.updateStatus(tableId, 'occupied', createdBy);
      }

      // Create order
      const [result] = await connection.query(
        `INSERT INTO orders (
          uuid, outlet_id, order_number, order_type,
          table_id, table_session_id, floor_id, section_id,
          customer_id, customer_name, customer_phone, guest_count,
          status, payment_status, special_instructions, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)`,
        [
          uuid, outletId, orderNumber, orderType,
          tableId, tableSessionId, floorId, sectionId,
          customerId, customerName, customerPhone, guestCount,
          specialInstructions, createdBy
        ]
      );

      await connection.commit();

      const order = await this.getById(result.insertId);

      // Emit realtime event
      await this.emitOrderUpdate(outletId, order, 'order:created');

      return order;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // ORDER ITEMS
  // ========================

  /**
   * Add items to order (before sending KOT)
   * Items are staged locally, this stores them in DB with pending status
   */
  async addItems(orderId, items, createdBy) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const order = await this.getById(orderId);
      if (!order) throw new Error('Order not found');
      if (order.status === 'billed' || order.status === 'paid' || order.status === 'cancelled') {
        throw new Error('Cannot add items to this order');
      }

      const addedItems = [];
      const context = {
        floorId: order.floor_id,
        sectionId: order.section_id
      };

      for (const item of items) {
        const {
          itemId, variantId, quantity, addons = [],
          specialInstructions, isComplimentary = false, complimentaryReason
        } = item;

        // Get item details with effective price
        const itemDetails = await menuEngineService.getItemForOrder(itemId, context);
        if (!itemDetails) throw new Error(`Item ${itemId} not found`);

        // Determine price
        let unitPrice, basePric;
        let variantName = null;
        let taxGroupId = itemDetails.tax_group_id;

        if (variantId) {
          const variant = itemDetails.variants?.find(v => v.id === variantId);
          if (!variant) throw new Error(`Variant ${variantId} not found`);
          unitPrice = variant.effectivePrice || variant.price;
          basePrice = variant.price;
          variantName = variant.name;
          if (variant.tax_group_id) taxGroupId = variant.tax_group_id;
        } else {
          unitPrice = itemDetails.effectivePrice || itemDetails.base_price;
          basePrice = itemDetails.base_price;
        }

        // Calculate addon total
        let addonTotal = 0;
        const addonDetails = [];
        for (const addonId of addons) {
          const [addonRows] = await connection.query(
            'SELECT a.*, ag.name as group_name FROM addons a JOIN addon_groups ag ON a.addon_group_id = ag.id WHERE a.id = ?',
            [addonId]
          );
          if (addonRows[0]) {
            addonTotal += parseFloat(addonRows[0].price);
            addonDetails.push(addonRows[0]);
          }
        }

        const totalUnitPrice = unitPrice + addonTotal;
        const totalPrice = totalUnitPrice * quantity;

        // Calculate tax
        let taxAmount = 0;
        let taxDetails = null;
        if (taxGroupId) {
          const taxResult = await taxService.calculateTax(
            [{ price: totalUnitPrice, quantity }],
            taxGroupId
          );
          taxAmount = taxResult.taxAmount;
          taxDetails = taxResult.breakdown;
        }

        // Insert order item
        const [itemResult] = await connection.query(
          `INSERT INTO order_items (
            order_id, item_id, variant_id, item_name, variant_name, item_type,
            quantity, unit_price, base_price, tax_amount, total_price,
            tax_group_id, tax_details, special_instructions,
            status, is_complimentary, complimentary_reason, created_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          [
            orderId, itemId, variantId, itemDetails.name, variantName, itemDetails.item_type,
            quantity, totalUnitPrice, basePrice, taxAmount, totalPrice,
            taxGroupId, JSON.stringify(taxDetails), specialInstructions,
            isComplimentary, complimentaryReason, createdBy
          ]
        );

        const orderItemId = itemResult.insertId;

        // Insert addons
        for (const addon of addonDetails) {
          await connection.query(
            `INSERT INTO order_item_addons (
              order_item_id, addon_id, addon_group_id, addon_name, addon_group_name,
              quantity, unit_price, total_price
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [orderItemId, addon.id, addon.addon_group_id, addon.name, addon.group_name, 1, addon.price, addon.price]
          );
        }

        addedItems.push({
          id: orderItemId,
          itemId,
          itemName: itemDetails.name,
          variantId,
          variantName,
          quantity,
          unitPrice: totalUnitPrice,
          totalPrice,
          taxAmount,
          status: 'pending',
          addons: addonDetails.map(a => ({ id: a.id, name: a.name, price: a.price }))
        });
      }

      // Recalculate order totals
      await this.recalculateTotals(orderId, connection);

      await connection.commit();

      // Get updated order
      const updatedOrder = await this.getById(orderId);
      await this.emitOrderUpdate(order.outlet_id, updatedOrder, 'order:items_added');

      return { order: updatedOrder, addedItems };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Recalculate order totals
   */
  async recalculateTotals(orderId, connection = null) {
    const pool = connection || getPool();

    // Get all non-cancelled items
    const [items] = await pool.query(
      `SELECT SUM(total_price) as subtotal, SUM(tax_amount) as tax_total
       FROM order_items WHERE order_id = ? AND status != 'cancelled'`,
      [orderId]
    );

    const subtotal = items[0].subtotal || 0;
    const taxAmount = items[0].tax_total || 0;

    // Get discount
    const [discounts] = await pool.query(
      'SELECT SUM(discount_amount) as total FROM order_discounts WHERE order_id = ?',
      [orderId]
    );
    const discountAmount = discounts[0].total || 0;

    // Calculate total
    const totalAmount = subtotal - discountAmount + taxAmount;
    const roundOff = Math.round(totalAmount) - totalAmount;

    await pool.query(
      `UPDATE orders SET 
        subtotal = ?, discount_amount = ?, tax_amount = ?,
        round_off = ?, total_amount = ?, updated_at = NOW()
       WHERE id = ?`,
      [subtotal, discountAmount, taxAmount, roundOff, Math.round(totalAmount), orderId]
    );
  },

  // ========================
  // ORDER RETRIEVAL
  // ========================

  async getById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT o.*, t.table_number, t.name as table_name,
        f.name as floor_name, s.name as section_name,
        u.name as created_by_name
       FROM orders o
       LEFT JOIN tables t ON o.table_id = t.id
       LEFT JOIN floors f ON o.floor_id = f.id
       LEFT JOIN sections s ON o.section_id = s.id
       LEFT JOIN users u ON o.created_by = u.id
       WHERE o.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async getByUuid(uuid) {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM orders WHERE uuid = ?', [uuid]);
    return rows[0] ? await this.getById(rows[0].id) : null;
  },

  async getOrderWithItems(orderId) {
    const order = await this.getById(orderId);
    if (!order) return null;

    const pool = getPool();

    // Get items
    const [items] = await pool.query(
      `SELECT oi.*, 
        i.short_name, i.image_url,
        ks.name as station_name, ks.station_type,
        c.name as counter_name
       FROM order_items oi
       LEFT JOIN items i ON oi.item_id = i.id
       LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
       LEFT JOIN counters c ON i.counter_id = c.id
       WHERE oi.order_id = ? 
       ORDER BY oi.created_at`,
      [orderId]
    );

    // Get addons for each item
    for (const item of items) {
      const [addons] = await pool.query(
        'SELECT * FROM order_item_addons WHERE order_item_id = ?',
        [item.id]
      );
      item.addons = addons;
    }

    // Get applied discounts
    const [discounts] = await pool.query(
      'SELECT * FROM order_discounts WHERE order_id = ?',
      [orderId]
    );

    return { ...order, items, discounts };
  },

  /**
   * Get active orders for outlet
   */
  async getActiveOrders(outletId, filters = {}) {
    const pool = getPool();
    let query = `
      SELECT o.*, t.table_number, t.name as table_name,
        f.name as floor_name, s.name as section_name,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.status != 'cancelled') as item_count,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id AND oi.status = 'ready') as ready_count
      FROM orders o
      LEFT JOIN tables t ON o.table_id = t.id
      LEFT JOIN floors f ON o.floor_id = f.id
      LEFT JOIN sections s ON o.section_id = s.id
      WHERE o.outlet_id = ? AND o.status NOT IN ('paid', 'cancelled')
    `;
    const params = [outletId];

    if (filters.floorId) {
      query += ' AND o.floor_id = ?';
      params.push(filters.floorId);
    }
    if (filters.status) {
      query += ' AND o.status = ?';
      params.push(filters.status);
    }
    if (filters.tableId) {
      query += ' AND o.table_id = ?';
      params.push(filters.tableId);
    }
    if (filters.createdBy) {
      query += ' AND o.created_by = ?';
      params.push(filters.createdBy);
    }

    query += ' ORDER BY o.is_priority DESC, o.created_at DESC';

    const [orders] = await pool.query(query, params);
    return orders;
  },

  /**
   * Get orders by table
   */
  async getByTable(tableId) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT * FROM orders 
       WHERE table_id = ? AND status NOT IN ('paid', 'cancelled')
       ORDER BY created_at DESC`,
      [tableId]
    );
    return rows;
  },

  // ========================
  // ORDER STATUS
  // ========================

  async updateStatus(orderId, status, userId) {
    const pool = getPool();
    const order = await this.getById(orderId);
    if (!order) throw new Error('Order not found');

    const updates = { status, updated_by: userId };

    if (status === 'cancelled') {
      updates.cancelled_by = userId;
      updates.cancelled_at = new Date();
    } else if (status === 'billed') {
      updates.billed_by = userId;
      updates.billed_at = new Date();
    }

    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(orderId);

    await pool.query(`UPDATE orders SET ${fields} WHERE id = ?`, values);

    const updatedOrder = await this.getById(orderId);
    await this.emitOrderUpdate(order.outlet_id, updatedOrder, 'order:status_changed');

    return updatedOrder;
  },

  // ========================
  // ITEM MODIFICATIONS
  // ========================

  /**
   * Update item quantity (before KOT sent)
   */
  async updateItemQuantity(orderItemId, newQuantity, userId) {
    const pool = getPool();

    const [items] = await pool.query(
      'SELECT * FROM order_items WHERE id = ?',
      [orderItemId]
    );
    if (!items[0]) throw new Error('Order item not found');

    const item = items[0];

    // Only allow if item is still pending
    if (item.status !== 'pending') {
      throw new Error('Cannot modify item after KOT sent. Use cancel instead.');
    }

    // Recalculate totals
    const totalPrice = item.unit_price * newQuantity;
    let taxAmount = 0;

    if (item.tax_group_id) {
      const taxResult = await taxService.calculateTax(
        [{ price: item.unit_price, quantity: newQuantity }],
        item.tax_group_id
      );
      taxAmount = taxResult.taxAmount;
    }

    await pool.query(
      `UPDATE order_items SET quantity = ?, total_price = ?, tax_amount = ? WHERE id = ?`,
      [newQuantity, totalPrice, taxAmount, orderItemId]
    );

    // Recalculate order totals
    await this.recalculateTotals(item.order_id);

    const order = await this.getOrderWithItems(item.order_id);
    await this.emitOrderUpdate(order.outlet_id, order, 'order:item_modified');

    return order;
  },

  /**
   * Cancel order item
   */
  async cancelItem(orderItemId, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const [items] = await connection.query(
        'SELECT oi.*, o.outlet_id, o.status as order_status FROM order_items oi JOIN orders o ON oi.order_id = o.id WHERE oi.id = ?',
        [orderItemId]
      );
      if (!items[0]) throw new Error('Order item not found');

      const item = items[0];
      const { reason, reasonId, quantity, approvedBy } = data;

      // Check if cancellation requires approval (after preparation started)
      const requiresApproval = ['preparing', 'ready'].includes(item.status);
      if (requiresApproval && !approvedBy) {
        throw new Error('Manager approval required to cancel prepared items');
      }

      // Full or partial cancel
      const cancelQuantity = quantity || item.quantity;
      const isFullCancel = cancelQuantity >= item.quantity;

      if (isFullCancel) {
        await connection.query(
          `UPDATE order_items SET 
            status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(),
            cancel_reason = ?, cancel_quantity = ?
           WHERE id = ?`,
          [userId, reason, cancelQuantity, orderItemId]
        );
      } else {
        // Partial cancel - reduce quantity
        const newQuantity = item.quantity - cancelQuantity;
        const newTotal = item.unit_price * newQuantity;

        await connection.query(
          `UPDATE order_items SET 
            quantity = ?, total_price = ?, cancel_quantity = ?
           WHERE id = ?`,
          [newQuantity, newTotal, cancelQuantity, orderItemId]
        );
      }

      // Log cancellation
      await connection.query(
        `INSERT INTO order_cancel_logs (
          order_id, order_item_id, cancel_type, original_quantity,
          cancelled_quantity, reason_id, reason_text, approved_by, cancelled_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          item.order_id, orderItemId,
          isFullCancel ? 'partial_item' : 'quantity_reduce',
          item.quantity, cancelQuantity, reasonId, reason, approvedBy, userId
        ]
      );

      // Recalculate order totals
      await this.recalculateTotals(item.order_id, connection);

      await connection.commit();

      const order = await this.getOrderWithItems(item.order_id);
      await this.emitOrderUpdate(item.outlet_id, order, 'order:item_cancelled');

      return order;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Cancel entire order
   */
  async cancelOrder(orderId, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const order = await this.getById(orderId);
      if (!order) throw new Error('Order not found');

      const { reason, reasonId, approvedBy } = data;

      // Check if order can be cancelled
      if (['paid', 'cancelled'].includes(order.status)) {
        throw new Error('Order cannot be cancelled');
      }

      // Requires approval if order has prepared items
      const [preparedItems] = await connection.query(
        `SELECT COUNT(*) as count FROM order_items 
         WHERE order_id = ? AND status IN ('preparing', 'ready', 'served')`,
        [orderId]
      );
      
      if (preparedItems[0].count > 0 && !approvedBy) {
        throw new Error('Manager approval required to cancel order with prepared items');
      }

      // Cancel all items
      await connection.query(
        `UPDATE order_items SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?
         WHERE order_id = ? AND status != 'cancelled'`,
        [userId, reason, orderId]
      );

      // Cancel order
      await connection.query(
        `UPDATE orders SET status = 'cancelled', cancelled_by = ?, cancelled_at = NOW(), cancel_reason = ?
         WHERE id = ?`,
        [userId, reason, orderId]
      );

      // Log cancellation
      await connection.query(
        `INSERT INTO order_cancel_logs (
          order_id, cancel_type, reason_id, reason_text, approved_by, cancelled_by
        ) VALUES (?, 'full_order', ?, ?, ?, ?)`,
        [orderId, reasonId, reason, approvedBy, userId]
      );

      // Release table if dine-in
      if (order.table_id) {
        await tableService.updateStatus(order.table_id, 'cleaning', userId);
        if (order.table_session_id) {
          await tableService.endSession(order.table_session_id, userId);
        }
      }

      await connection.commit();

      const cancelledOrder = await this.getById(orderId);
      await this.emitOrderUpdate(order.outlet_id, cancelledOrder, 'order:cancelled');

      return cancelledOrder;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // TABLE OPERATIONS
  // ========================

  /**
   * Transfer order to another table
   */
  async transferTable(orderId, toTableId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const order = await this.getById(orderId);
      if (!order) throw new Error('Order not found');

      const fromTableId = order.table_id;

      // Get new table details
      const [newTable] = await connection.query(
        'SELECT * FROM tables WHERE id = ?',
        [toTableId]
      );
      if (!newTable[0]) throw new Error('Target table not found');

      // Check if new table is available
      if (newTable[0].status === 'occupied') {
        throw new Error('Target table is already occupied');
      }

      // Update order
      await connection.query(
        `UPDATE orders SET 
          table_id = ?, floor_id = ?, section_id = ?, updated_by = ?
         WHERE id = ?`,
        [toTableId, newTable[0].floor_id, newTable[0].section_id, userId, orderId]
      );

      // Update table statuses
      await connection.query('UPDATE tables SET status = ? WHERE id = ?', ['occupied', toTableId]);
      await connection.query('UPDATE tables SET status = ? WHERE id = ?', ['cleaning', fromTableId]);

      // Log transfer
      await connection.query(
        `INSERT INTO order_transfer_logs (
          order_id, from_table_id, to_table_id, transfer_type, transferred_by
        ) VALUES (?, ?, ?, 'table', ?)`,
        [orderId, fromTableId, toTableId, userId]
      );

      await connection.commit();

      const updatedOrder = await this.getById(orderId);
      await this.emitOrderUpdate(order.outlet_id, updatedOrder, 'order:transferred');

      // Emit table updates
      await this.emitTableUpdate(order.outlet_id, fromTableId, toTableId);

      return updatedOrder;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // REALTIME EVENTS
  // ========================

  async emitOrderUpdate(outletId, order, eventType) {
    try {
      const { publishMessage } = require('../config/redis');
      await publishMessage('order:update', {
        type: eventType,
        outletId,
        order,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to emit order update:', error);
    }
  },

  async emitTableUpdate(outletId, ...tableIds) {
    try {
      const { publishMessage } = require('../config/redis');
      for (const tableId of tableIds) {
        await publishMessage('table:update', {
          outletId,
          tableId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error('Failed to emit table update:', error);
    }
  },

  // ========================
  // UTILITIES
  // ========================

  async getCancelReasons(outletId, type = 'item_cancel') {
    const pool = getPool();
    const [reasons] = await pool.query(
      `SELECT * FROM cancel_reasons 
       WHERE (outlet_id = ? OR outlet_id IS NULL) AND reason_type = ? AND is_active = 1
       ORDER BY display_order`,
      [outletId, type]
    );
    return reasons;
  }
};

module.exports = orderService;
