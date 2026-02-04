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

      // Get pending items with station info
      const [pendingItems] = await connection.query(
        `SELECT oi.*, 
          i.kitchen_station_id, i.counter_id,
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
          // Get addons text
          const [addons] = await connection.query(
            'SELECT addon_name FROM order_item_addons WHERE order_item_id = ?',
            [item.id]
          );
          const addonsText = addons.map(a => a.addon_name).join(', ');

          await connection.query(
            `INSERT INTO kot_items (
              kot_id, order_item_id, item_name, variant_name,
              quantity, addons_text, special_instructions, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [kotId, item.id, item.item_name, item.variant_name, item.quantity, addonsText, item.special_instructions]
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
          itemCount: items.length,
          items: items.map(i => ({
            id: i.id,
            name: i.item_name,
            variant: i.variant_name,
            quantity: i.quantity
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

      await connection.commit();

      // Emit realtime events for each station and create print jobs
      for (const ticket of createdTickets) {
        await this.emitKotUpdate(order.outlet_id, ticket, 'kot:created');

        // Create print job for KOT/BOT
        try {
          await printerService.printKot({
            outletId: order.outlet_id,
            kotId: ticket.id,
            orderId,
            kotNumber: ticket.kotNumber,
            station: ticket.station,
            tableNumber: order.table_number,
            time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            items: ticket.items.map(i => ({
              itemName: i.name,
              variantName: i.variant,
              quantity: i.quantity,
              instructions: i.instructions
            })),
            captainName: order.created_by_name || 'Staff'
          }, createdBy);
        } catch (printError) {
          logger.error(`Failed to create print job for KOT ${ticket.kotNumber}:`, printError);
        }
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
        station = 'dessert';
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
    await this.emitKotUpdate(kot.outlet_id, kot, 'kot:accepted');

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
      await pool.query(
        `UPDATE orders SET status = 'preparing' WHERE id = ? AND status != 'preparing'`,
        [kot.order_id]
      );

      await this.emitKotUpdate(kot.outlet_id, kot, 'kot:preparing');

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
      await this.emitKotUpdate(kot.outlet_id, kot, 'kot:item_ready');

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
      await this.emitKotUpdate(kot.outlet_id, kot, 'kot:ready');

      // Check if all order items are ready
      await this.checkOrderReadyStatus(kot.order_id);

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
      await this.emitKotUpdate(kot.outlet_id, kot, 'kot:served');

      // Check if all order items are served
      await this.checkOrderServedStatus(kot.order_id);

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
        `UPDATE orders SET status = 'ready' WHERE id = ? AND status NOT IN ('ready', 'served', 'billed', 'paid')`,
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
        `UPDATE orders SET status = 'served' WHERE id = ? AND status NOT IN ('served', 'billed', 'paid')`,
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
      `SELECT kt.*, o.order_number
       FROM kot_tickets kt
       JOIN orders o ON kt.order_id = o.id
       WHERE kt.id = ?`,
      [id]
    );

    if (!rows[0]) return null;

    const kot = rows[0];

    // Get items
    const [items] = await pool.query(
      'SELECT * FROM kot_items WHERE kot_id = ? ORDER BY id',
      [id]
    );
    kot.items = items;

    return kot;
  },

  /**
   * Get active KOTs for station
   */
  async getActiveKots(outletId, station = null) {
    const pool = getPool();
    let query = `
      SELECT kt.*, o.order_number, o.table_id,
        t.table_number, t.name as table_name,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id AND ki.status != 'cancelled') as item_count,
        (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = kt.id AND ki.status = 'ready') as ready_count
      FROM kot_tickets kt
      JOIN orders o ON kt.order_id = o.id
      LEFT JOIN tables t ON o.table_id = t.id
      WHERE kt.outlet_id = ? AND kt.status NOT IN ('served', 'cancelled')
    `;
    const params = [outletId];

    if (station) {
      query += ' AND kt.station = ?';
      params.push(station);
    }

    query += ' ORDER BY kt.priority DESC, kt.created_at ASC';

    const [kots] = await pool.query(query, params);

    // Get items for each KOT
    for (const kot of kots) {
      const [items] = await pool.query(
        'SELECT * FROM kot_items WHERE kot_id = ? ORDER BY id',
        [kot.id]
      );
      kot.items = items;
    }

    return kots;
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

    for (const kot of kots) {
      const [items] = await pool.query(
        'SELECT * FROM kot_items WHERE kot_id = ?',
        [kot.id]
      );
      kot.items = items;
    }

    return kots;
  },

  /**
   * Get station dashboard data
   */
  async getStationDashboard(outletId, station) {
    const pool = getPool();

    // Get active KOTs
    const activeKots = await this.getActiveKots(outletId, station);

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
    } catch (error) {
      logger.error('Failed to emit KOT update:', error);
    }
  },

  // ========================
  // REPRINT / DUPLICATE
  // ========================

  async reprintKot(kotId, userId) {
    const pool = getPool();

    await pool.query(
      `UPDATE kot_tickets SET 
        printed_count = printed_count + 1, last_printed_at = NOW()
       WHERE id = ?`,
      [kotId]
    );

    return this.getKotById(kotId);
  }
};

module.exports = kotService;
