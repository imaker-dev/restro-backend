/**
 * KOT/BOT Service
 * Kitchen Order Ticket / Bar Order Ticket - Multi-counter routing
 * Routes items to correct station: Kitchen, Bar, Mocktail, Dessert
 */

const { getPool } = require('../database');
const { cache, publishMessage } = require('../config/redis');
const logger = require('../utils/logger');
const printerService = require('./printer.service');

// Station types for routing
const STATION_TYPES = {
  KITCHEN: 'kitchen',
  BAR: 'bar',
  DESSERT: 'dessert',
  MOCKTAIL: 'mocktail',
  OTHER: 'other'
};

const KOT_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  PREPARING: 'preparing',
  READY: 'ready',
  SERVED: 'served',
  CANCELLED: 'cancelled'
};

// ========================
// FORMAT HELPERS — clean camelCase output matching table details style
// ========================

function formatKotItem(item) {
  return {
    id: item.id,
    kotId: item.kot_id,
    orderItemId: item.order_item_id,
    name: item.item_name,
    variantName: item.variant_name || null,
    itemType: item.item_type,
    quantity: parseFloat(item.quantity) || 0,
    addonsText: item.addons_text || null,
    specialInstructions: item.special_instructions || null,
    status: item.status,
    createdAt: item.created_at,
    addons: (item.addons || []).map(a => ({
      name: a.addon_name,
      price: parseFloat(a.unit_price) || 0,
      quantity: a.quantity || 1
    }))
  };
}

function formatKot(kot) {
  if (!kot) return null;
  return {
    id: kot.id,
    outletId: kot.outlet_id,
    orderId: kot.order_id,
    kotNumber: kot.kot_number,
    orderNumber: kot.order_number || null,
    tableId: kot.table_id || null,
    tableNumber: kot.table_number || null,
    tableName: kot.table_name || null,
    station: kot.station,
    status: kot.status,
    priority: kot.priority || 0,
    notes: kot.notes || null,
    itemCount: Number(kot.item_count) || (kot.items ? kot.items.filter(i => i.status !== 'cancelled').length : 0),
    totalItemCount: Number(kot.total_item_count) || (kot.items ? kot.items.length : 0),
    cancelledItemCount: Number(kot.cancelled_item_count) || 0,
    readyCount: Number(kot.ready_count) || 0,
    acceptedBy: kot.accepted_by_name || kot.accepted_by || null,
    acceptedAt: kot.accepted_at || null,
    readyAt: kot.ready_at || null,
    servedAt: kot.served_at || null,
    servedBy: kot.served_by || null,
    cancelledBy: kot.cancelled_by || null,
    cancelledAt: kot.cancelled_at || null,
    cancelReason: kot.cancel_reason || null,
    createdBy: kot.created_by,
    createdAt: kot.created_at,
    items: (kot.items || []).map(formatKotItem)
  };
}

const kotService = {
  STATION_TYPES,
  KOT_STATUS,

  // ========================
  // KOT NUMBER GENERATION
  // ========================

  async generateKotNumber(outletId, station) {
    const pool = getPool();
    const today = new Date();
    const datePrefix = today.toISOString().slice(5, 10).replace(/-/g, '');
    
    const prefix = station === 'bar' ? 'BOT' : 'KOT';
    
    const [result] = await pool.query(
      `SELECT COUNT(*) + 1 as seq FROM kot_tickets 
       WHERE outlet_id = ? AND station = ? AND DATE(created_at) = CURDATE()`,
      [outletId, station]
    );
    
    const seq = String(result[0].seq).padStart(3, '0');
    return `${prefix}${datePrefix}${seq}`;
  },

  // ========================
  // SEND KOT - MAIN FUNCTION
  // ========================

  /**
   * Send KOT for pending order items
   * Groups items by station and creates separate tickets
   */
  async sendKot(orderId, createdBy) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get order details
      const [orders] = await connection.query(
        `SELECT o.*, t.table_number FROM orders o
         LEFT JOIN tables t ON o.table_id = t.id
         WHERE o.id = ?`,
        [orderId]
      );
      if (!orders[0]) throw new Error('Order not found');
      const order = orders[0];

      // Get pending items with station info and item_type
      const [pendingItems] = await connection.query(
        `SELECT oi.*, 
          i.kitchen_station_id, i.counter_id, i.item_type as menu_item_type,
          ks.station_type, ks.name as station_name,
          c.counter_type, c.name as counter_name
         FROM order_items oi
         JOIN items i ON oi.item_id = i.id
         LEFT JOIN kitchen_stations ks ON i.kitchen_station_id = ks.id
         LEFT JOIN counters c ON i.counter_id = c.id
         WHERE oi.order_id = ? AND oi.status = 'pending'`,
        [orderId]
      );

      if (pendingItems.length === 0) {
        throw new Error('No pending items to send');
      }

      // Group items by station
      const groupedItems = this.groupItemsByStation(pendingItems);
      const createdTickets = [];

      // Create KOT for each station
      for (const [station, items] of Object.entries(groupedItems)) {
        const kotNumber = await this.generateKotNumber(order.outlet_id, station);

        // Create KOT ticket
        const [kotResult] = await connection.query(
          `INSERT INTO kot_tickets (
            outlet_id, order_id, kot_number, table_number,
            station, status, priority, notes, created_by
          ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
          [
            order.outlet_id, orderId, kotNumber, order.table_number,
            station, order.is_priority ? 1 : 0, order.special_instructions, createdBy
          ]
        );

        const kotId = kotResult.insertId;

        // Create KOT items
        for (const item of items) {
          // Get addons with full details
          const [addons] = await connection.query(
            'SELECT addon_name, unit_price, quantity FROM order_item_addons WHERE order_item_id = ?',
            [item.id]
          );
          const addonsText = addons.map(a => a.addon_name).join(', ');
          item._addons = addons;
          item._addonsText = addonsText;

          const itemType = item.item_type || item.menu_item_type || null;

          await connection.query(
            `INSERT INTO kot_items (
              kot_id, order_item_id, item_name, variant_name, item_type,
              quantity, addons_text, special_instructions, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [kotId, item.id, item.item_name, item.variant_name, itemType, item.quantity, addonsText, item.special_instructions]
          );

          // Update order item status and kot_id
          await connection.query(
            `UPDATE order_items SET status = 'sent_to_kitchen', kot_id = ? WHERE id = ?`,
            [kotId, item.id]
          );
        }

        createdTickets.push({
          id: kotId,
          kotNumber,
          station,
          tableNumber: order.table_number,
          orderNumber: order.order_number,
          itemCount: items.length,
          createdAt: new Date().toISOString(),
          items: items.map(i => ({
            id: i.id,
            name: i.item_name,
            variant: i.variant_name,
            quantity: i.quantity,
            itemType: i.item_type || i.menu_item_type || null,
            addons: (i._addons || []).map(a => ({ name: a.addon_name, price: a.unit_price, quantity: a.quantity })),
            addonsText: i._addonsText || null,
            specialInstructions: i.special_instructions || null
          }))
        });
      }

      // Update order status if first KOT
      if (order.status === 'pending') {
        await connection.query(
          `UPDATE orders SET status = 'confirmed' WHERE id = ?`,
          [orderId]
        );
      }

      // Update table status to 'running' when KOT is sent (dine_in orders with a table)
      if (order.table_id && order.order_type === 'dine_in') {
        await connection.query(
          `UPDATE tables SET status = 'running' WHERE id = ? AND status IN ('occupied', 'running')`,
          [order.table_id]
        );
      }

      await connection.commit();

      // Emit realtime events for each station and print KOT
      for (const ticket of createdTickets) {
        await this.emitKotUpdate(order.outlet_id, ticket, 'kot:created');

        // Prepare KOT data for printing
        const kotPrintData = {
          outletId: order.outlet_id,
          kotId: ticket.id,
          orderId,
          orderNumber: order.order_number,
          kotNumber: ticket.kotNumber,
          station: ticket.station,
          tableNumber: order.table_number,
          time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          items: ticket.items.map(i => ({
            itemName: i.name,
            variantName: i.variant,
            quantity: i.quantity,
            itemType: i.itemType,
            addonsText: i.addonsText,
            instructions: i.specialInstructions
          })),
          captainName: order.created_by_name || 'Staff'
        };

        // Try direct printing first (to configured printer)
        try {
          const printer = await this.getPrinterForStation(order.outlet_id, ticket.station);
          if (printer && printer.ip_address) {
            await printerService.printKotDirect(kotPrintData, printer.ip_address, printer.port || 9100);
            logger.info(`KOT ${ticket.kotNumber} printed directly to ${printer.ip_address}`);
          } else {
            // Fallback: create print job for bridge polling
            await printerService.printKot(kotPrintData, createdBy);
          }
        } catch (printError) {
          logger.error(`Failed to print KOT ${ticket.kotNumber}:`, printError.message);
          // Fallback: create print job for bridge polling
          try {
            await printerService.printKot(kotPrintData, createdBy);
          } catch (fallbackError) {
            logger.error(`Fallback print job also failed for KOT ${ticket.kotNumber}:`, fallbackError);
          }
        }
      }

      // Emit table status update to 'running' for real-time floor view
      if (order.table_id && order.order_type === 'dine_in') {
        await publishMessage('table:update', {
          outletId: order.outlet_id,
          tableId: order.table_id,
          floorId: order.floor_id,
          status: 'running',
          event: 'kot_sent',
          timestamp: new Date().toISOString()
        });
      }

      // Emit order update
      await publishMessage('order:update', {
        type: 'order:kot_sent',
        outletId: order.outlet_id,
        orderId,
        tickets: createdTickets,
        timestamp: new Date().toISOString()
      });

      return {
        orderId,
        orderNumber: order.order_number,
        tableNumber: order.table_number,
        tickets: createdTickets
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Group items by their target station
   */
  groupItemsByStation(items) {
    const grouped = {};

    for (const item of items) {
      let station = 'kitchen'; // default

      // Determine station based on item configuration
      if (item.counter_id) {
        // Has counter (bar items)
        station = item.counter_type || 'bar';
      } else if (item.kitchen_station_id) {
        // Has kitchen station
        station = item.station_type || 'kitchen';
      }

      // Normalize station names
      if (station.includes('bar') || station.includes('liquor')) {
        station = 'bar';
      } else if (station.includes('mocktail') || station.includes('beverage')) {
        station = 'mocktail';
      } else if (station.includes('dessert')) {
        station = 'kitchen'; // dessert items go to kitchen
      } else {
        station = 'kitchen';
      }

      if (!grouped[station]) {
        grouped[station] = [];
      }
      grouped[station].push(item);
    }

    return grouped;
  },

  // ========================
  // KOT STATUS UPDATES
  // ========================

  /**
   * Accept KOT (station acknowledges)
   */
  async acceptKot(kotId, userId) {
    const pool = getPool();

    await pool.query(
      `UPDATE kot_tickets SET 
        status = 'accepted', accepted_by = ?, accepted_at = NOW()
       WHERE id = ?`,
      [userId, kotId]
    );

    const kot = await this.getKotById(kotId);
    if (kot) await this.emitKotUpdate(kot.outletId, kot, 'kot:accepted');

    return kot;
  },

  /**
   * Start preparing KOT
   */
  async startPreparing(kotId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE kot_tickets SET status = 'preparing' WHERE id = ?`,
        [kotId]
      );

      // Update all items to preparing
      await connection.query(
        `UPDATE kot_items SET status = 'preparing' WHERE kot_id = ?`,
        [kotId]
      );

      // Update order items
      await connection.query(
        `UPDATE order_items SET status = 'preparing' WHERE kot_id = ?`,
        [kotId]
      );

      await connection.commit();

      const kot = await this.getKotById(kotId);

      // Update order status
      if (kot) {
        await pool.query(
          `UPDATE orders SET status = 'preparing' WHERE id = ? AND status != 'preparing'`,
          [kot.orderId]
        );
        await this.emitKotUpdate(kot.outletId, kot, 'kot:preparing');
      }

      return kot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Mark single item as ready
   */
  async markItemReady(kotItemId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Get KOT item details
      const [kotItems] = await connection.query(
        `SELECT ki.*, kt.outlet_id, kt.order_id 
         FROM kot_items ki
         JOIN kot_tickets kt ON ki.kot_id = kt.id
         WHERE ki.id = ?`,
        [kotItemId]
      );
      if (!kotItems[0]) throw new Error('KOT item not found');

      const kotItem = kotItems[0];

      // Update KOT item
      await connection.query(
        `UPDATE kot_items SET status = 'ready' WHERE id = ?`,
        [kotItemId]
      );

      // Update order item
      await connection.query(
        `UPDATE order_items SET status = 'ready' WHERE id = ?`,
        [kotItem.order_item_id]
      );

      // Check if all items in KOT are ready
      const [pendingItems] = await connection.query(
        `SELECT COUNT(*) as count FROM kot_items 
         WHERE kot_id = ? AND status NOT IN ('ready', 'served', 'cancelled')`,
        [kotItem.kot_id]
      );

      if (pendingItems[0].count === 0) {
        // All items ready - update KOT status
        await connection.query(
          `UPDATE kot_tickets SET status = 'ready', ready_at = NOW() WHERE id = ?`,
          [kotItem.kot_id]
        );
      }

      await connection.commit();

      const kot = await this.getKotById(kotItem.kot_id);
      if (kot) await this.emitKotUpdate(kot.outletId, kot, 'kot:item_ready');

      // Emit to captain/waiter
      await publishMessage('order:update', {
        type: 'order:item_ready',
        outletId: kotItem.outlet_id,
        orderId: kotItem.order_id,
        itemId: kotItem.order_item_id,
        timestamp: new Date().toISOString()
      });

      return kot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Mark entire KOT as ready
   */
  async markKotReady(kotId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE kot_tickets SET status = 'ready', ready_at = NOW() WHERE id = ?`,
        [kotId]
      );

      await connection.query(
        `UPDATE kot_items SET status = 'ready' WHERE kot_id = ? AND status != 'cancelled'`,
        [kotId]
      );

      // Get order items and update
      const [kotItems] = await connection.query(
        'SELECT order_item_id FROM kot_items WHERE kot_id = ?',
        [kotId]
      );

      for (const item of kotItems) {
        await connection.query(
          `UPDATE order_items SET status = 'ready' WHERE id = ?`,
          [item.order_item_id]
        );
      }

      await connection.commit();

      const kot = await this.getKotById(kotId);
      if (kot) {
        await this.emitKotUpdate(kot.outletId, kot, 'kot:ready');
        await this.checkOrderReadyStatus(kot.orderId);
      }

      return kot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Mark KOT items as served
   */
  async markKotServed(kotId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        `UPDATE kot_tickets SET 
          status = 'served', served_at = NOW(), served_by = ?
         WHERE id = ?`,
        [userId, kotId]
      );

      await connection.query(
        `UPDATE kot_items SET status = 'served' WHERE kot_id = ? AND status != 'cancelled'`,
        [kotId]
      );

      // Update order items
      const [kotItems] = await connection.query(
        'SELECT order_item_id FROM kot_items WHERE kot_id = ?',
        [kotId]
      );

      for (const item of kotItems) {
        await connection.query(
          `UPDATE order_items SET status = 'served' WHERE id = ?`,
          [item.order_item_id]
        );
      }

      await connection.commit();

      const kot = await this.getKotById(kotId);
      if (kot) {
        await this.emitKotUpdate(kot.outletId, kot, 'kot:served');
        await this.checkOrderServedStatus(kot.orderId);
      }

      return kot;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Check if all items in order are ready
   */
  async checkOrderReadyStatus(orderId) {
    const pool = getPool();

    const [pending] = await pool.query(
      `SELECT COUNT(*) as count FROM order_items 
       WHERE order_id = ? AND status NOT IN ('ready', 'served', 'cancelled')`,
      [orderId]
    );

    if (pending[0].count === 0) {
      await pool.query(
        `UPDATE orders SET status = 'ready' WHERE id = ? AND status NOT IN ('ready', 'served', 'billed', 'paid', 'completed')`,
        [orderId]
      );

      const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
      await publishMessage('order:update', {
        type: 'order:all_ready',
        outletId: order[0].outlet_id,
        orderId,
        timestamp: new Date().toISOString()
      });
    }
  },

  /**
   * Check if all items in order are served
   */
  async checkOrderServedStatus(orderId) {
    const pool = getPool();

    const [pending] = await pool.query(
      `SELECT COUNT(*) as count FROM order_items 
       WHERE order_id = ? AND status NOT IN ('served', 'cancelled')`,
      [orderId]
    );

    if (pending[0].count === 0) {
      await pool.query(
        `UPDATE orders SET status = 'served' WHERE id = ? AND status NOT IN ('served', 'billed', 'paid', 'completed')`,
        [orderId]
      );

      const [order] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
      await publishMessage('order:update', {
        type: 'order:all_served',
        outletId: order[0].outlet_id,
        orderId,
        timestamp: new Date().toISOString()
      });
    }
  },

  // ========================
  // KOT RETRIEVAL
  // ========================

  async getKotById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT kt.*, o.order_number, o.table_id, t.table_number
       FROM kot_tickets kt
       LEFT JOIN orders o ON kt.order_id = o.id
       LEFT JOIN tables t ON o.table_id = t.id
       WHERE kt.id = ?`,
      [id]
    );

    if (!rows[0]) return null;

    const kot = rows[0];

    // Get items with item_type
    const [items] = await pool.query(
      'SELECT * FROM kot_items WHERE kot_id = ? ORDER BY id',
      [id]
    );

    // Batch-load addons for all items (avoids N+1)
    const orderItemIds = items.map(i => i.order_item_id).filter(Boolean);
    let addonsMap = {};
    if (orderItemIds.length > 0) {
      const [allAddons] = await pool.query(
        'SELECT order_item_id, addon_name, unit_price, quantity FROM order_item_addons WHERE order_item_id IN (?)',
        [orderItemIds]
      );
      for (const a of allAddons) {
        if (!addonsMap[a.order_item_id]) addonsMap[a.order_item_id] = [];
        addonsMap[a.order_item_id].push(a);
      }
    }
    for (const item of items) {
      item.addons = addonsMap[item.order_item_id] || [];
    }

    kot.items = items;

    return formatKot(kot);
  },

  // Fallback: read KOT via a specific connection (avoids pool visibility lag)
  async _getKotByIdViaConnection(connection, id) {
    const [rows] = await connection.query(
      `SELECT kt.*, o.order_number, o.table_id, t.table_number
       FROM kot_tickets kt
       LEFT JOIN orders o ON kt.order_id = o.id
       LEFT JOIN tables t ON o.table_id = t.id
       WHERE kt.id = ?`,
      [id]
    );
    if (!rows[0]) return null;
    const kot = rows[0];
    const [items] = await connection.query(
      'SELECT * FROM kot_items WHERE kot_id = ? ORDER BY id', [id]
    );
    for (const item of items) {
      const [addons] = await connection.query(
        'SELECT addon_name, unit_price, quantity FROM order_item_addons WHERE order_item_id = ?',
        [item.order_item_id]
      );
      item.addons = addons;
    }
    kot.items = items;
    return formatKot(kot);
  },

  /**
   * Get active KOTs for station
   * @param {number} outletId - Outlet ID
   * @param {string} station - Station filter (kitchen, bar, mocktail, dessert)
   * @param {string|string[]} status - Status filter (pending, accepted, preparing, ready) or array of statuses
   * @param {number[]} floorIds - Floor restriction (empty = no restriction)
   */
  async getActiveKots(outletId, station = null, status = null, floorIds = []) {
    const pool = getPool();
    let query = `
      SELECT kt.*, o.order_number, o.table_id,
        t.table_number, t.name as table_name,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id AND ki.status != 'cancelled') as item_count,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id) as total_item_count,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id AND ki.status = 'cancelled') as cancelled_item_count,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id AND ki.status = 'ready') as ready_count
      FROM kot_tickets kt
      JOIN orders o ON kt.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE kt.outlet_id = ?
    `;
    const params = [outletId];

    // Floor restriction
    if (floorIds && floorIds.length > 0) {
      query += ` AND t.floor_id IN (${floorIds.map(() => '?').join(',')})`;
      params.push(...floorIds);
    }

    // Status filter - if provided, filter by specific status(es), otherwise exclude served/cancelled
    if (status) {
      const statuses = Array.isArray(status) ? status : [status];
      const validStatuses = statuses.filter(s => ['pending', 'accepted', 'preparing', 'ready', 'served', 'cancelled'].includes(s));
      if (validStatuses.length > 0) {
        query += ` AND kt.status IN (${validStatuses.map(() => '?').join(',')})`;
        params.push(...validStatuses);
      }
    } else {
      query += " AND kt.status NOT IN ('served', 'cancelled')";
    }

    if (station) {
      query += ' AND kt.station = ?';
      params.push(station);
    }

    query += ' ORDER BY kt.priority DESC, kt.created_at DESC';

    const [kots] = await pool.query(query, params);

    // Batch-load all KOT items and addons (avoids N+1)
    const kotIds = kots.map(k => k.id);
    if (kotIds.length > 0) {
      const [allItems] = await pool.query(
        'SELECT * FROM kot_items WHERE kot_id IN (?) ORDER BY id',
        [kotIds]
      );
      const allOrderItemIds = allItems.map(i => i.order_item_id).filter(Boolean);
      let addonsMap = {};
      if (allOrderItemIds.length > 0) {
        const [allAddons] = await pool.query(
          'SELECT order_item_id, addon_name, unit_price, quantity FROM order_item_addons WHERE order_item_id IN (?)',
          [allOrderItemIds]
        );
        for (const a of allAddons) {
          if (!addonsMap[a.order_item_id]) addonsMap[a.order_item_id] = [];
          addonsMap[a.order_item_id].push(a);
        }
      }
      for (const item of allItems) {
        item.addons = addonsMap[item.order_item_id] || [];
      }
      for (const kot of kots) {
        kot.items = allItems.filter(i => i.kot_id === kot.id);
      }
    } else {
      for (const kot of kots) { kot.items = []; }
    }

    return kots.map(formatKot);
  },

  /**
   * Get KOTs for order
   */
  async getKotsByOrder(orderId) {
    const pool = getPool();
    const [kots] = await pool.query(
      `SELECT * FROM kot_tickets WHERE order_id = ? ORDER BY created_at`,
      [orderId]
    );

    // Batch-load all KOT items and addons (avoids N+1)
    const kotIds = kots.map(k => k.id);
    if (kotIds.length > 0) {
      const [allItems] = await pool.query(
        'SELECT * FROM kot_items WHERE kot_id IN (?) ORDER BY id',
        [kotIds]
      );
      const allOrderItemIds = allItems.map(i => i.order_item_id).filter(Boolean);
      let addonsMap = {};
      if (allOrderItemIds.length > 0) {
        const [allAddons] = await pool.query(
          'SELECT order_item_id, addon_name, unit_price, quantity FROM order_item_addons WHERE order_item_id IN (?)',
          [allOrderItemIds]
        );
        for (const a of allAddons) {
          if (!addonsMap[a.order_item_id]) addonsMap[a.order_item_id] = [];
          addonsMap[a.order_item_id].push(a);
        }
      }
      for (const item of allItems) {
        item.addons = addonsMap[item.order_item_id] || [];
      }
      for (const kot of kots) {
        kot.items = allItems.filter(i => i.kot_id === kot.id);
      }
    } else {
      for (const kot of kots) { kot.items = []; }
    }

    return kots.map(formatKot);
  },

  /**
   * Get station dashboard data
   * @param {number} outletId
   * @param {string} station
   * @param {number[]} floorIds - Floor restriction (empty = no restriction)
   */
  async getStationDashboard(outletId, station, floorIds = []) {
    const pool = getPool();

    // Get active KOTs (pass floor restriction)
    const activeKots = await this.getActiveKots(outletId, station, null, floorIds);

    // Get stats
    const [stats] = await pool.query(
      `SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_count,
        COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_count,
        COUNT(*) as total_count,
        AVG(TIMESTAMPDIFF(MINUTE, created_at, COALESCE(ready_at, NOW()))) as avg_prep_time
       FROM kot_tickets
       WHERE outlet_id = ? AND station = ? AND DATE(created_at) = CURDATE()`,
      [outletId, station]
    );

    return {
      station,
      kots: activeKots,
      stats: stats[0]
    };
  },

  /**
   * Get KOT stats for outlet/station
   */
  async getKotStats(outletId, station = null) {
    const pool = getPool();
    
    let query = `
      SELECT 
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_count,
        COUNT(CASE WHEN status = 'preparing' THEN 1 END) as preparing_count,
        COUNT(CASE WHEN status = 'ready' THEN 1 END) as ready_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_count,
        COUNT(CASE WHEN status = 'served' THEN 1 END) as served_count,
        COUNT(CASE WHEN status NOT IN ('served', 'cancelled') THEN 1 END) as active_count,
        AVG(CASE WHEN status = 'ready' THEN TIMESTAMPDIFF(MINUTE, created_at, ready_at) END) as avg_prep_time
       FROM kot_tickets
       WHERE outlet_id = ? AND DATE(created_at) = CURDATE()
    `;
    const params = [outletId];
    
    if (station) {
      query += ' AND station = ?';
      params.push(station);
    }
    
    const [stats] = await pool.query(query, params);
    return stats[0];
  },

  // ========================
  // REALTIME EVENTS
  // ========================

  async emitKotUpdate(outletId, kot, eventType) {
    try {
      await publishMessage('kot:update', {
        type: eventType,
        outletId,
        station: kot.station,
        kot,
        timestamp: new Date().toISOString()
      });
      logger.info(`KOT socket event emitted: ${eventType} for outlet ${outletId}, station ${kot.station}, KOT ${kot.kotNumber || kot.id}`);
    } catch (error) {
      logger.error(`Failed to emit KOT update (${eventType}):`, error.message);
    }
  },

  // ========================
  // REPRINT / DUPLICATE
  // ========================

  async reprintKot(kotId, userId) {
    const pool = getPool();

    // Get KOT details
    const kot = await this.getKotById(kotId);
    if (!kot) throw new Error('KOT not found');

    // Update reprint count
    await pool.query(
      `UPDATE kot_tickets SET 
        printed_count = printed_count + 1, last_printed_at = NOW()
       WHERE id = ?`,
      [kotId]
    );

    // Get updated KOT with new printed_count
    const updatedKot = await this.getKotById(kotId);

    // Print the KOT with REPRINT label
    try {
      const printer = await this.getPrinterForStation(kot.outletId, kot.station);
      if (printer) {
        const printService = require('./print.service');
        await printService.printKot(updatedKot, printer, { isReprint: true });
        logger.info(`KOT ${kot.kotNumber} reprinted to ${printer.name}`);
      }
    } catch (printError) {
      logger.error(`Failed to print KOT reprint: ${printError.message}`);
    }

    // Emit reprint event to kitchen for real-time update
    await this.emitKotUpdate(kot.outletId, {
      ...updatedKot,
      reprintedBy: userId,
      reprintCount: updatedKot.printedCount
    }, 'kot:reprinted');

    return updatedKot;
  },

  // ========================
  // PRINTER HELPERS
  // ========================

  /**
   * Get printer configuration for a station
   * Falls back to default kitchen/bar printer if station-specific not found
   */
  async getPrinterForStation(outletId, station) {
    const pool = getPool();
    
    // Map station to printer station type
    const stationMap = {
      'kitchen': 'kot_kitchen',
      'bar': 'kot_bar',
      'dessert': 'kot_dessert',
      'mocktail': 'kot_kitchen' // fallback
    };
    const printerStation = stationMap[station] || 'kot_kitchen';
    
    // First try to find station-specific printer
    let [printers] = await pool.query(
      `SELECT * FROM printers 
       WHERE outlet_id = ? AND station = ? AND is_active = 1
       LIMIT 1`,
      [outletId, printerStation]
    );

    if (printers[0]) return printers[0];

    // Fall back to default KOT kitchen printer for this outlet
    [printers] = await pool.query(
      `SELECT * FROM printers 
       WHERE outlet_id = ? AND station LIKE 'kot_%' AND is_active = 1
       ORDER BY is_default DESC, id LIMIT 1`,
      [outletId]
    );

    return printers[0] || null;
  }
};

module.exports = kotService;
