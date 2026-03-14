/**
 * NC (No Charge) Service
 * Handles NC operations for items and orders
 * NC items are not charged but recorded for reporting
 */

const { getPool } = require('../database');
const { publishMessage } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Fetch updated order totals after NC recalculation for socket emission
 */
async function getUpdatedOrderTotals(orderId) {
  const pool = getPool();
  const [rows] = await pool.query(
    `SELECT o.subtotal, o.tax_amount, o.discount_amount, o.total_amount,
            o.nc_amount, o.is_nc, o.paid_amount, o.due_amount,
            o.table_id, o.floor_id, o.outlet_id
     FROM orders o WHERE o.id = ?`,
    [orderId]
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    subtotal: parseFloat(r.subtotal) || 0,
    taxAmount: parseFloat(r.tax_amount) || 0,
    discountAmount: parseFloat(r.discount_amount) || 0,
    totalAmount: parseFloat(r.total_amount) || 0,
    ncAmount: parseFloat(r.nc_amount) || 0,
    isNC: !!r.is_nc,
    paidAmount: parseFloat(r.paid_amount) || 0,
    dueAmount: parseFloat(r.due_amount) || 0,
    grandTotal: parseFloat(r.total_amount) || 0,
    tableId: r.table_id,
    floorId: r.floor_id,
    outletId: r.outlet_id
  };
}

const ncService = {
  // ========================
  // NC REASONS MANAGEMENT
  // ========================

  /**
   * Get all NC reasons for an outlet
   */
  async getNCReasons(outletId, includeInactive = false) {
    const pool = getPool();
    let query = 'SELECT * FROM nc_reasons WHERE outlet_id = ?';
    const params = [outletId];
    
    // if (!includeInactive) {
    //   query += ' AND is_active = 1';
    // }
    query += ' ORDER BY display_order, name';
    
    const [reasons] = await pool.query(query, params);
    return reasons.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isActive: !!r.is_active,
      displayOrder: r.display_order
    }));
  },

  /**
   * Create a new NC reason
   */
  async createNCReason(outletId, data) {
    const pool = getPool();
    const { name, description, displayOrder = 0 } = data;
    
    const [result] = await pool.query(
      'INSERT INTO nc_reasons (outlet_id, name, description, display_order) VALUES (?, ?, ?, ?)',
      [outletId, name, description, displayOrder]
    );
    
    return { id: result.insertId, name, description, displayOrder };
  },

  /**
   * Update NC reason
   */
  async updateNCReason(reasonId, data) {
    const pool = getPool();
    const { name, description, isActive, displayOrder } = data;
    
    const updates = [];
    const params = [];
    
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (isActive !== undefined) { updates.push('is_active = ?'); params.push(isActive); }
    if (displayOrder !== undefined) { updates.push('display_order = ?'); params.push(displayOrder); }
    
    if (updates.length === 0) return null;
    
    params.push(reasonId);
    await pool.query(`UPDATE nc_reasons SET ${updates.join(', ')} WHERE id = ?`, params);
    
    const [rows] = await pool.query('SELECT * FROM nc_reasons WHERE id = ?', [reasonId]);
    return rows[0];
  },

  // ========================
  // ITEM LEVEL NC
  // ========================

  /**
   * Mark an order item as NC (No Charge)
   * The item remains in the order but is excluded from payable amount
   */
  async markItemAsNC(orderItemId, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { ncReasonId, ncReason, notes } = data;

      // Get item details
      const [items] = await connection.query(
        `SELECT oi.*, o.outlet_id, o.status as order_status, o.order_number,
                o.is_nc as order_is_nc
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.id = ?`,
        [orderItemId]
      );

      if (!items[0]) throw new Error('Order item not found');
      const item = items[0];

      // Don't allow NC on cancelled items
      if (item.status === 'cancelled') {
        throw new Error('Cannot mark cancelled item as NC');
      }

      // Don't allow NC if order is already NC
      if (item.order_is_nc) {
        throw new Error('Order is already marked as NC');
      }

      // Calculate NC amount (full item price including tax)
      const ncAmount = parseFloat(item.total_price) || 0;

      // Update item as NC
      await connection.query(
        `UPDATE order_items SET 
          is_nc = 1, nc_reason_id = ?, nc_reason = ?, 
          nc_amount = ?, nc_by = ?, nc_at = NOW()
         WHERE id = ?`,
        [ncReasonId, ncReason, ncAmount, userId, orderItemId]
      );

      // Log the NC action
      await this.logNCAction(connection, {
        outletId: item.outlet_id,
        orderId: item.order_id,
        orderItemId,
        actionType: 'item_nc',
        ncReasonId,
        ncReason,
        ncAmount,
        itemName: item.item_name,
        appliedBy: userId,
        notes
      });

      // Recalculate order NC totals
      await this.recalculateOrderNC(item.order_id, connection);

      await connection.commit();

      // Emit update event
      await publishMessage('order:update', {
        type: 'order:item_nc',
        outletId: item.outlet_id,
        orderId: item.order_id,
        orderItemId,
        itemName: item.item_name,
        ncAmount,
        ncReason,
        timestamp: new Date().toISOString()
      });

      // Emit table update with recalculated totals so real-time table UI reflects NC
      if (item.table_id) {
        const updatedTotals = await getUpdatedOrderTotals(item.order_id);
        await publishMessage('table:update', {
          type: 'table:nc_changed',
          outletId: item.outlet_id,
          floorId: updatedTotals?.floorId || null,
          tableId: item.table_id,
          orderId: item.order_id,
          orderTotals: updatedTotals,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        orderItemId,
        itemName: item.item_name,
        ncAmount,
        ncReason
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Remove NC from an order item
   */
  async removeItemNC(orderItemId, userId, notes = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get item details
      const [items] = await connection.query(
        `SELECT oi.*, o.outlet_id, o.order_number
         FROM order_items oi
         JOIN orders o ON oi.order_id = o.id
         WHERE oi.id = ?`,
        [orderItemId]
      );

      if (!items[0]) throw new Error('Order item not found');
      const item = items[0];

      if (!item.is_nc) {
        throw new Error('Item is not marked as NC');
      }

      const ncAmount = parseFloat(item.nc_amount) || 0;

      // Remove NC from item
      await connection.query(
        `UPDATE order_items SET 
          is_nc = 0, nc_reason_id = NULL, nc_reason = NULL, 
          nc_amount = 0, nc_by = NULL, nc_at = NULL
         WHERE id = ?`,
        [orderItemId]
      );

      // Log the NC removal
      await this.logNCAction(connection, {
        outletId: item.outlet_id,
        orderId: item.order_id,
        orderItemId,
        actionType: 'item_nc_removed',
        ncReasonId: null,
        ncReason: 'NC Removed',
        ncAmount,
        itemName: item.item_name,
        appliedBy: userId,
        notes
      });

      // Recalculate order NC totals
      await this.recalculateOrderNC(item.order_id, connection);

      await connection.commit();

      return {
        success: true,
        orderItemId,
        itemName: item.item_name,
        removedNCAmount: ncAmount
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // BULK ITEM NC OPERATIONS
  // ========================

  /**
   * Mark multiple order items as NC (No Charge) in bulk
   * @param {number} orderId - Order ID
   * @param {Array} items - Array of { orderItemId, ncReasonId?, ncReason? }
   * @param {Object} data - Common NC data { ncReasonId, ncReason, notes }
   * @param {number} userId - User performing the action
   */
  async markItemsAsNC(orderId, items, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { ncReasonId: commonReasonId, ncReason: commonReason, notes } = data;
      const results = [];
      let totalNcAmount = 0;

      // Get order details first
      const [orders] = await connection.query(
        `SELECT id, outlet_id, order_number, table_id, is_nc as order_is_nc, status FROM orders WHERE id = ?`,
        [orderId]
      );

      if (!orders[0]) throw new Error('Order not found');
      const order = orders[0];

      if (order.order_is_nc) {
        throw new Error('Order is already marked as NC');
      }

      // Process each item
      for (const itemData of items) {
        const orderItemId = itemData.orderItemId;
        const ncReasonId = itemData.ncReasonId || commonReasonId;
        const ncReason = itemData.ncReason || commonReason;

        if (!ncReason) {
          throw new Error(`NC reason is required for item ${orderItemId}`);
        }

        // Get item details
        const [itemRows] = await connection.query(
          `SELECT oi.*, o.outlet_id FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           WHERE oi.id = ? AND oi.order_id = ?`,
          [orderItemId, orderId]
        );

        if (!itemRows[0]) {
          throw new Error(`Order item ${orderItemId} not found in order ${orderId}`);
        }

        const item = itemRows[0];

        if (item.status === 'cancelled') {
          results.push({
            orderItemId,
            success: false,
            error: 'Item is cancelled'
          });
          continue;
        }

        if (item.is_nc) {
          results.push({
            orderItemId,
            success: false,
            error: 'Item is already NC'
          });
          continue;
        }

        const ncAmount = parseFloat(item.total_price) || 0;
        totalNcAmount += ncAmount;

        // Update item as NC
        await connection.query(
          `UPDATE order_items SET 
            is_nc = 1, nc_reason_id = ?, nc_reason = ?, 
            nc_amount = ?, nc_by = ?, nc_at = NOW()
           WHERE id = ?`,
          [ncReasonId, ncReason, ncAmount, userId, orderItemId]
        );

        // Log the NC action
        await this.logNCAction(connection, {
          outletId: order.outlet_id,
          orderId,
          orderItemId,
          actionType: 'item_nc',
          ncReasonId,
          ncReason,
          ncAmount,
          itemName: item.item_name,
          appliedBy: userId,
          notes: notes || 'Bulk NC operation'
        });

        results.push({
          orderItemId,
          success: true,
          itemName: item.item_name,
          ncAmount,
          ncReason
        });
      }

      // Recalculate order NC totals once after all items processed
      await this.recalculateOrderNC(orderId, connection);

      await connection.commit();

      // Emit update event
      await publishMessage('order:update', {
        type: 'order:bulk_item_nc',
        outletId: order.outlet_id,
        orderId,
        itemCount: results.filter(r => r.success).length,
        totalNcAmount,
        timestamp: new Date().toISOString()
      });

      // Emit table update with recalculated totals so real-time table UI reflects NC
      if (order.table_id) {
        const updatedTotals = await getUpdatedOrderTotals(orderId);
        await publishMessage('table:update', {
          type: 'table:nc_changed',
          outletId: order.outlet_id,
          floorId: updatedTotals?.floorId || null,
          tableId: order.table_id,
          orderId,
          orderTotals: updatedTotals,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        orderId,
        orderNumber: order.order_number,
        totalItemsProcessed: items.length,
        successCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length,
        totalNcAmount,
        items: results
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Remove NC from multiple order items in bulk
   * @param {number} orderId - Order ID
   * @param {Array} orderItemIds - Array of order item IDs
   * @param {number} userId - User performing the action
   * @param {string} notes - Notes for the removal
   */
  async removeItemsNC(orderId, orderItemIds, userId, notes = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const results = [];
      let totalRemovedAmount = 0;

      // Get order details first
      const [orders] = await connection.query(
        `SELECT id, outlet_id, order_number, table_id FROM orders WHERE id = ?`,
        [orderId]
      );

      if (!orders[0]) throw new Error('Order not found');
      const order = orders[0];

      // Process each item
      for (const orderItemId of orderItemIds) {
        // Get item details
        const [itemRows] = await connection.query(
          `SELECT oi.*, o.outlet_id FROM order_items oi
           JOIN orders o ON oi.order_id = o.id
           WHERE oi.id = ? AND oi.order_id = ?`,
          [orderItemId, orderId]
        );

        if (!itemRows[0]) {
          results.push({
            orderItemId,
            success: false,
            error: `Item not found in order ${orderId}`
          });
          continue;
        }

        const item = itemRows[0];

        if (!item.is_nc) {
          results.push({
            orderItemId,
            success: false,
            error: 'Item is not marked as NC'
          });
          continue;
        }

        const ncAmount = parseFloat(item.nc_amount) || 0;
        totalRemovedAmount += ncAmount;

        // Remove NC from item
        await connection.query(
          `UPDATE order_items SET 
            is_nc = 0, nc_reason_id = NULL, nc_reason = NULL, 
            nc_amount = 0, nc_by = NULL, nc_at = NULL
           WHERE id = ?`,
          [orderItemId]
        );

        // Log the NC removal
        await this.logNCAction(connection, {
          outletId: order.outlet_id,
          orderId,
          orderItemId,
          actionType: 'item_nc_removed',
          ncReasonId: null,
          ncReason: 'NC Removed (Bulk)',
          ncAmount,
          itemName: item.item_name,
          appliedBy: userId,
          notes: notes || 'Bulk NC removal'
        });

        results.push({
          orderItemId,
          success: true,
          itemName: item.item_name,
          removedNCAmount: ncAmount
        });
      }

      // Recalculate order NC totals once after all items processed
      await this.recalculateOrderNC(orderId, connection);

      await connection.commit();

      // Emit update event
      await publishMessage('order:update', {
        type: 'order:bulk_item_nc_removed',
        outletId: order.outlet_id,
        orderId,
        itemCount: results.filter(r => r.success).length,
        totalRemovedAmount,
        timestamp: new Date().toISOString()
      });

      // Emit table update with recalculated totals so real-time table UI reflects NC removal
      if (order.table_id) {
        const updatedTotals = await getUpdatedOrderTotals(orderId);
        await publishMessage('table:update', {
          type: 'table:nc_changed',
          outletId: order.outlet_id,
          floorId: updatedTotals?.floorId || null,
          tableId: order.table_id,
          orderId,
          orderTotals: updatedTotals,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        orderId,
        orderNumber: order.order_number,
        totalItemsProcessed: orderItemIds.length,
        successCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length,
        totalRemovedAmount,
        items: results
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // ORDER LEVEL NC
  // ========================

  /**
   * Mark entire order as NC (No Charge)
   * All items become NC, payable amount becomes 0
   */
  async markOrderAsNC(orderId, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const { ncReasonId, ncReason, notes } = data;

      // Get order details
      const [orders] = await connection.query(
        `SELECT o.*, 
          (SELECT SUM(total_price) FROM order_items WHERE order_id = o.id AND status != 'cancelled') as items_total
         FROM orders o WHERE o.id = ?`,
        [orderId]
      );

      if (!orders[0]) throw new Error('Order not found');
      const order = orders[0];

      if (order.is_nc) {
        throw new Error('Order is already marked as NC');
      }

      // Calculate total NC amount
      const ncAmount = parseFloat(order.items_total) || parseFloat(order.total_amount) || 0;

      // Update order as NC
      await connection.query(
        `UPDATE orders SET 
          is_nc = 1, nc_reason_id = ?, nc_reason = ?, 
          nc_amount = ?, nc_approved_by = ?, nc_at = NOW()
         WHERE id = ?`,
        [ncReasonId, ncReason, ncAmount, userId, orderId]
      );

      // Mark all non-cancelled items as NC
      await connection.query(
        `UPDATE order_items SET 
          is_nc = 1, nc_reason_id = ?, nc_reason = ?, 
          nc_amount = total_price, nc_by = ?, nc_at = NOW()
         WHERE order_id = ? AND status != 'cancelled'`,
        [ncReasonId, ncReason, userId, orderId]
      );

      // Log the NC action
      await this.logNCAction(connection, {
        outletId: order.outlet_id,
        orderId,
        orderItemId: null,
        actionType: 'order_nc',
        ncReasonId,
        ncReason,
        ncAmount,
        itemName: null,
        appliedBy: userId,
        notes
      });

      // Recalculate order totals so subtotal excludes all NC items
      const orderService = require('./order.service');
      await orderService.recalculateTotals(orderId, connection);

      await connection.commit();

      // Emit update event
      await publishMessage('order:update', {
        type: 'order:nc',
        outletId: order.outlet_id,
        orderId,
        orderNumber: order.order_number,
        ncAmount,
        ncReason,
        timestamp: new Date().toISOString()
      });

      // Emit table update with recalculated totals so real-time table UI reflects NC
      if (order.table_id) {
        const updatedTotals = await getUpdatedOrderTotals(orderId);
        await publishMessage('table:update', {
          type: 'table:nc_changed',
          outletId: order.outlet_id,
          floorId: updatedTotals?.floorId || null,
          tableId: order.table_id,
          orderId,
          orderTotals: updatedTotals,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        orderId,
        orderNumber: order.order_number,
        ncAmount,
        ncReason
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Remove NC from entire order
   */
  async removeOrderNC(orderId, userId, notes = null) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get order details
      const [orders] = await connection.query(
        'SELECT * FROM orders WHERE id = ?',
        [orderId]
      );

      if (!orders[0]) throw new Error('Order not found');
      const order = orders[0];

      if (!order.is_nc) {
        throw new Error('Order is not marked as NC');
      }

      const ncAmount = parseFloat(order.nc_amount) || 0;

      // Remove NC from order
      await connection.query(
        `UPDATE orders SET 
          is_nc = 0, nc_reason_id = NULL, nc_reason = NULL, 
          nc_amount = 0, nc_approved_by = NULL, nc_at = NULL
         WHERE id = ?`,
        [orderId]
      );

      // Remove NC from all items
      await connection.query(
        `UPDATE order_items SET 
          is_nc = 0, nc_reason_id = NULL, nc_reason = NULL, 
          nc_amount = 0, nc_by = NULL, nc_at = NULL
         WHERE order_id = ?`,
        [orderId]
      );

      // Log the NC removal
      await this.logNCAction(connection, {
        outletId: order.outlet_id,
        orderId,
        orderItemId: null,
        actionType: 'order_nc_removed',
        ncReasonId: null,
        ncReason: 'Order NC Removed',
        ncAmount,
        itemName: null,
        appliedBy: userId,
        notes
      });

      // Recalculate order totals so subtotal includes all items again
      const orderService = require('./order.service');
      await orderService.recalculateTotals(orderId, connection);

      await connection.commit();

      // Emit update events
      await publishMessage('order:update', {
        type: 'order:nc_removed',
        outletId: order.outlet_id,
        orderId,
        orderNumber: order.order_number,
        removedNCAmount: ncAmount,
        timestamp: new Date().toISOString()
      });

      // Emit table update with recalculated totals so real-time table UI reflects NC removal
      if (order.table_id) {
        const updatedTotals = await getUpdatedOrderTotals(orderId);
        await publishMessage('table:update', {
          type: 'table:nc_changed',
          outletId: order.outlet_id,
          floorId: updatedTotals?.floorId || null,
          tableId: order.table_id,
          orderId,
          orderTotals: updatedTotals,
          timestamp: new Date().toISOString()
        });
      }

      return {
        success: true,
        orderId,
        orderNumber: order.order_number,
        removedNCAmount: ncAmount
      };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  // ========================
  // HELPER METHODS
  // ========================

  /**
   * Recalculate order NC totals from items
   * Also triggers full order recalculation to exclude NC items from subtotal/total
   */
  async recalculateOrderNC(orderId, connection = null) {
    const pool = connection || getPool();

    // Sum NC amounts from items (NC items have zero tax)
    const [ncTotals] = await pool.query(
      `SELECT 
        COUNT(CASE WHEN is_nc = 1 THEN 1 END) as nc_count,
        SUM(CASE WHEN is_nc = 1 THEN nc_amount ELSE 0 END) as total_nc
       FROM order_items 
       WHERE order_id = ? AND status != 'cancelled'`,
      [orderId]
    );

    const ncCount = parseInt(ncTotals[0].nc_count) || 0;
    const ncAmount = parseFloat(ncTotals[0].total_nc) || 0;
    const hasNCItems = ncCount > 0;

    // Update order nc_amount (sum of NC items) but do NOT touch is_nc flag here.
    // is_nc at order level is only set by markOrderAsNC / removeOrderNC (whole-order NC).
    // Item-level NC only updates nc_amount for tracking purposes.
    await pool.query(
      'UPDATE orders SET nc_amount = ? WHERE id = ?',
      [ncAmount, orderId]
    );

    // Recalculate order totals (subtotal excludes NC items)
    const orderService = require('./order.service');
    await orderService.recalculateTotals(orderId, connection);

    return { ncAmount, hasNCItems };
  },

  /**
   * Log NC action for audit
   */
  async logNCAction(connection, data) {
    const {
      outletId, orderId, orderItemId, actionType,
      ncReasonId, ncReason, ncAmount, itemName,
      appliedBy, notes
    } = data;

    await connection.query(
      `INSERT INTO nc_logs (
        outlet_id, order_id, order_item_id, action_type,
        nc_reason_id, nc_reason, nc_amount, item_name,
        applied_by, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        outletId, orderId, orderItemId, actionType,
        ncReasonId, ncReason, ncAmount, itemName,
        appliedBy, notes
      ]
    );
  },

  /**
   * Get NC logs for an order
   */
  async getNCLogs(orderId) {
    const pool = getPool();
    const [logs] = await pool.query(
      `SELECT nl.*, u.name as applied_by_name
       FROM nc_logs nl
       LEFT JOIN users u ON nl.applied_by = u.id
       WHERE nl.order_id = ?
       ORDER BY nl.applied_at DESC`,
      [orderId]
    );

    return logs.map(l => ({
      id: l.id,
      orderId: l.order_id,
      orderItemId: l.order_item_id,
      actionType: l.action_type,
      ncReasonId: l.nc_reason_id,
      ncReason: l.nc_reason,
      ncAmount: parseFloat(l.nc_amount) || 0,
      itemName: l.item_name,
      appliedBy: l.applied_by,
      appliedByName: l.applied_by_name,
      appliedAt: l.applied_at,
      notes: l.notes
    }));
  },

  /**
   * Get NC summary report
   */
  async getNCReport(outletId, startDate, endDate, options = {}) {
    const pool = getPool();
    const { groupBy = 'date' } = options;

    // NC by date
    const [byDate] = await pool.query(
      `SELECT 
        DATE(nl.applied_at) as report_date,
        COUNT(DISTINCT nl.order_id) as nc_orders,
        COUNT(CASE WHEN nl.action_type = 'item_nc' THEN 1 END) as nc_items,
        COUNT(CASE WHEN nl.action_type = 'order_nc' THEN 1 END) as full_nc_orders,
        SUM(CASE WHEN nl.action_type IN ('item_nc', 'order_nc') THEN nl.nc_amount ELSE 0 END) as total_nc_amount
       FROM nc_logs nl
       WHERE nl.outlet_id = ? 
         AND DATE(nl.applied_at) BETWEEN ? AND ?
         AND nl.action_type IN ('item_nc', 'order_nc')
       GROUP BY DATE(nl.applied_at)
       ORDER BY report_date DESC`,
      [outletId, startDate, endDate]
    );

    // NC by reason
    const [byReason] = await pool.query(
      `SELECT 
        nl.nc_reason,
        COUNT(*) as count,
        SUM(nl.nc_amount) as total_amount
       FROM nc_logs nl
       WHERE nl.outlet_id = ? 
         AND DATE(nl.applied_at) BETWEEN ? AND ?
         AND nl.action_type IN ('item_nc', 'order_nc')
       GROUP BY nl.nc_reason
       ORDER BY total_amount DESC`,
      [outletId, startDate, endDate]
    );

    // NC by staff
    const [byStaff] = await pool.query(
      `SELECT 
        u.id as user_id,
        u.name as user_name,
        COUNT(*) as count,
        SUM(nl.nc_amount) as total_amount
       FROM nc_logs nl
       JOIN users u ON nl.applied_by = u.id
       WHERE nl.outlet_id = ? 
         AND DATE(nl.applied_at) BETWEEN ? AND ?
         AND nl.action_type IN ('item_nc', 'order_nc')
       GROUP BY u.id, u.name
       ORDER BY total_amount DESC`,
      [outletId, startDate, endDate]
    );

    // NC by item
    const [byItem] = await pool.query(
      `SELECT 
        nl.item_name,
        COUNT(*) as count,
        SUM(nl.nc_amount) as total_amount
       FROM nc_logs nl
       WHERE nl.outlet_id = ? 
         AND DATE(nl.applied_at) BETWEEN ? AND ?
         AND nl.action_type = 'item_nc'
         AND nl.item_name IS NOT NULL
       GROUP BY nl.item_name
       ORDER BY count DESC
       LIMIT 20`,
      [outletId, startDate, endDate]
    );

    // Summary totals
    const totalNCAmount = byDate.reduce((sum, d) => sum + (parseFloat(d.total_nc_amount) || 0), 0);
    const totalNCOrders = byDate.reduce((sum, d) => sum + (d.nc_orders || 0), 0);
    const totalNCItems = byDate.reduce((sum, d) => sum + (d.nc_items || 0), 0);

    return {
      dateRange: { startDate, endDate },
      summary: {
        totalNCAmount: totalNCAmount.toFixed(2),
        totalNCOrders,
        totalNCItems,
        averageNCPerOrder: totalNCOrders > 0 ? (totalNCAmount / totalNCOrders).toFixed(2) : '0.00'
      },
      byDate: byDate.map(d => ({
        date: d.report_date,
        ncOrders: d.nc_orders,
        ncItems: d.nc_items,
        fullNCOrders: d.full_nc_orders,
        totalNCAmount: parseFloat(d.total_nc_amount) || 0
      })),
      byReason: byReason.map(r => ({
        reason: r.nc_reason,
        count: r.count,
        totalAmount: parseFloat(r.total_amount) || 0
      })),
      byStaff: byStaff.map(s => ({
        userId: s.user_id,
        userName: s.user_name,
        count: s.count,
        totalAmount: parseFloat(s.total_amount) || 0
      })),
      byItem: byItem.map(i => ({
        itemName: i.item_name,
        count: i.count,
        totalAmount: parseFloat(i.total_amount) || 0
      }))
    };
  }
};

module.exports = ncService;
