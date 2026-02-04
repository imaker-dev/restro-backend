const { getPool } = require('../database');
const { cache, pubsub } = require('../config/redis');
const { emit } = require('../config/socket');
const logger = require('../utils/logger');

const TABLE_STATUSES = ['available', 'occupied', 'reserved', 'billing', 'cleaning', 'blocked'];

/**
 * Table Service - Comprehensive table management with real-time updates
 */
const tableService = {
  // ========================
  // CRUD Operations
  // ========================

  /**
   * Create new table
   */
  async create(data, userId) {
    const pool = getPool();
    
    const [result] = await pool.query(
      `INSERT INTO tables (
        outlet_id, floor_id, section_id, table_number, name,
        capacity, min_capacity, shape, status, is_mergeable, is_splittable,
        display_order, qr_code, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.outletId,
        data.floorId,
        data.sectionId || null,
        data.tableNumber,
        data.name || null,
        data.capacity || 4,
        data.minCapacity || 1,
        data.shape || 'square',
        'available',
        data.isMergeable !== false,
        data.isSplittable || false,
        data.displayOrder || 0,
        data.qrCode || null,
        data.isActive !== false
      ]
    );

    const tableId = result.insertId;

    // Create layout position if provided
    if (data.position) {
      await pool.query(
        `INSERT INTO table_layouts (table_id, position_x, position_y, width, height, rotation)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tableId,
          data.position.x || 0,
          data.position.y || 0,
          data.position.width || 100,
          data.position.height || 100,
          data.position.rotation || 0
        ]
      );
    }

    await this.invalidateCache(data.outletId, data.floorId);
    return this.getById(tableId);
  },

  /**
   * Get table by ID with full details
   */
  async getById(id) {
    const pool = getPool();
    const [tables] = await pool.query(
      `SELECT t.*, 
        f.name as floor_name, 
        s.name as section_name, s.section_type,
        o.name as outlet_name,
        tl.position_x, tl.position_y, tl.width, tl.height, tl.rotation
       FROM tables t
       JOIN floors f ON t.floor_id = f.id
       JOIN outlets o ON t.outlet_id = o.id
       LEFT JOIN sections s ON t.section_id = s.id
       LEFT JOIN table_layouts tl ON t.id = tl.table_id
       WHERE t.id = ?`,
      [id]
    );
    return tables[0] || null;
  },

  /**
   * Get all tables for an outlet
   */
  async getByOutlet(outletId, filters = {}) {
    const pool = getPool();
    
    let query = `
      SELECT t.*, 
        f.name as floor_name, 
        s.name as section_name, s.section_type,
        tl.position_x, tl.position_y, tl.width, tl.height, tl.rotation
      FROM tables t
      JOIN floors f ON t.floor_id = f.id
      LEFT JOIN sections s ON t.section_id = s.id
      LEFT JOIN table_layouts tl ON t.id = tl.table_id
      WHERE t.outlet_id = ?
    `;
    const params = [outletId];

    if (filters.floorId) {
      query += ' AND t.floor_id = ?';
      params.push(filters.floorId);
    }

    if (filters.sectionId) {
      query += ' AND t.section_id = ?';
      params.push(filters.sectionId);
    }

    if (filters.status) {
      query += ' AND t.status = ?';
      params.push(filters.status);
    }

    if (filters.isActive !== undefined) {
      query += ' AND t.is_active = ?';
      params.push(filters.isActive);
    } else {
      query += ' AND t.is_active = 1';
    }

    query += ' ORDER BY t.display_order, t.table_number';

    const [tables] = await pool.query(query, params);
    return tables;
  },

  /**
   * Get tables by floor with real-time data
   */
  async getByFloor(floorId) {
    const pool = getPool();
    
    const [tables] = await pool.query(
      `SELECT t.*, 
        s.name as section_name, s.section_type,
        tl.position_x, tl.position_y, tl.width, tl.height, tl.rotation,
        ts.id as session_id, ts.guest_count, ts.guest_name, ts.started_at, ts.started_by,
        u.name as captain_name,
        o.id as current_order_id, o.order_number, o.total_amount, o.status as order_status
       FROM tables t
       LEFT JOIN sections s ON t.section_id = s.id
       LEFT JOIN table_layouts tl ON t.id = tl.table_id
       LEFT JOIN table_sessions ts ON t.id = ts.table_id AND ts.status = 'active'
       LEFT JOIN users u ON ts.started_by = u.id
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE t.floor_id = ? AND t.is_active = 1
       ORDER BY t.display_order, t.table_number`,
      [floorId]
    );

    // Get merged tables info
    for (const table of tables) {
      if (table.session_id) {
        const [merges] = await pool.query(
          `SELECT tm.*, t.table_number as merged_table_number
           FROM table_merges tm
           JOIN tables t ON tm.merged_table_id = t.id
           WHERE tm.primary_table_id = ? AND tm.unmerged_at IS NULL`,
          [table.id]
        );
        table.mergedTables = merges;
      }
    }

    return tables;
  },

  /**
   * Update table
   */
  async update(id, data, userId) {
    const pool = getPool();
    const table = await this.getById(id);
    if (!table) return null;

    const updates = [];
    const params = [];

    if (data.floorId !== undefined) { updates.push('floor_id = ?'); params.push(data.floorId); }
    if (data.sectionId !== undefined) { updates.push('section_id = ?'); params.push(data.sectionId); }
    if (data.tableNumber !== undefined) { updates.push('table_number = ?'); params.push(data.tableNumber); }
    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.capacity !== undefined) { updates.push('capacity = ?'); params.push(data.capacity); }
    if (data.minCapacity !== undefined) { updates.push('min_capacity = ?'); params.push(data.minCapacity); }
    if (data.shape !== undefined) { updates.push('shape = ?'); params.push(data.shape); }
    if (data.isMergeable !== undefined) { updates.push('is_mergeable = ?'); params.push(data.isMergeable); }
    if (data.isSplittable !== undefined) { updates.push('is_splittable = ?'); params.push(data.isSplittable); }
    if (data.displayOrder !== undefined) { updates.push('display_order = ?'); params.push(data.displayOrder); }
    if (data.isActive !== undefined) { updates.push('is_active = ?'); params.push(data.isActive); }

    if (updates.length > 0) {
      params.push(id);
      await pool.query(`UPDATE tables SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // Update layout position
    if (data.position) {
      await pool.query(
        `INSERT INTO table_layouts (table_id, position_x, position_y, width, height, rotation)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE 
           position_x = VALUES(position_x),
           position_y = VALUES(position_y),
           width = VALUES(width),
           height = VALUES(height),
           rotation = VALUES(rotation)`,
        [
          id,
          data.position.x || 0,
          data.position.y || 0,
          data.position.width || 100,
          data.position.height || 100,
          data.position.rotation || 0
        ]
      );
    }

    await this.invalidateCache(table.outlet_id, table.floor_id);
    return this.getById(id);
  },

  /**
   * Delete table
   */
  async delete(id, userId) {
    const pool = getPool();
    const table = await this.getById(id);
    if (!table) return false;

    // Check if table has active session
    const [sessions] = await pool.query(
      'SELECT COUNT(*) as count FROM table_sessions WHERE table_id = ? AND status = "active"',
      [id]
    );

    if (sessions[0].count > 0) {
      throw new Error('Cannot delete table with active session');
    }

    await pool.query('UPDATE tables SET is_active = 0 WHERE id = ?', [id]);
    await this.invalidateCache(table.outlet_id, table.floor_id);
    return true;
  },

  // ========================
  // Status Management
  // ========================

  /**
   * Update table status with real-time broadcast
   */
  async updateStatus(id, status, userId, additionalData = {}) {
    const pool = getPool();
    
    if (!TABLE_STATUSES.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const table = await this.getById(id);
    if (!table) throw new Error('Table not found');

    const oldStatus = table.status;

    await pool.query('UPDATE tables SET status = ? WHERE id = ?', [status, id]);

    // Log status change
    await this.logHistory(id, 'status_change', {
      from: oldStatus,
      to: status,
      changedBy: userId,
      ...additionalData
    });

    // Broadcast real-time update
    this.broadcastTableUpdate(table.outlet_id, table.floor_id, {
      tableId: id,
      tableNumber: table.table_number,
      oldStatus,
      newStatus: status,
      changedBy: userId,
      timestamp: new Date()
    });

    await this.invalidateCache(table.outlet_id, table.floor_id);
    return this.getById(id);
  },

  /**
   * Get real-time status of all tables
   */
  async getRealTimeStatus(outletId, floorId = null) {
    const pool = getPool();
    
    let query = `
      SELECT t.id, t.table_number, t.status, t.capacity,
        f.id as floor_id, f.name as floor_name,
        s.name as section_name,
        ts.guest_count, ts.started_at,
        u.name as captain_name,
        o.order_number, o.total_amount,
        (SELECT COUNT(*) FROM kot_tickets kt WHERE kt.order_id = o.id AND kt.status IN ('pending', 'preparing')) as active_kots
      FROM tables t
      JOIN floors f ON t.floor_id = f.id
      LEFT JOIN sections s ON t.section_id = s.id
      LEFT JOIN table_sessions ts ON t.id = ts.table_id AND ts.status = 'active'
      LEFT JOIN users u ON ts.started_by = u.id
      LEFT JOIN orders o ON ts.order_id = o.id
      WHERE t.outlet_id = ? AND t.is_active = 1
    `;
    const params = [outletId];

    if (floorId) {
      query += ' AND t.floor_id = ?';
      params.push(floorId);
    }

    query += ' ORDER BY f.display_order, t.display_order';

    const [tables] = await pool.query(query, params);
    return tables;
  },

  // ========================
  // Session Management
  // ========================

  /**
   * Start table session (occupy table)
   */
  async startSession(tableId, data, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const table = await this.getById(tableId);
      if (!table) throw new Error('Table not found');
      if (table.status !== 'available' && table.status !== 'reserved') {
        throw new Error(`Table is currently ${table.status}`);
      }

      // Create session
      const [result] = await connection.query(
        `INSERT INTO table_sessions (table_id, guest_count, guest_name, guest_phone, started_by, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          tableId,
          data.guestCount || 1,
          data.guestName || null,
          data.guestPhone || null,
          userId,
          data.notes || null
        ]
      );

      // Update table status
      await connection.query('UPDATE tables SET status = "occupied" WHERE id = ?', [tableId]);

      await connection.commit();

      // Log and broadcast
      await this.logHistory(tableId, 'session_started', {
        sessionId: result.insertId,
        guestCount: data.guestCount,
        startedBy: userId
      });

      this.broadcastTableUpdate(table.outlet_id, table.floor_id, {
        tableId,
        tableNumber: table.table_number,
        event: 'session_started',
        sessionId: result.insertId,
        captain: userId
      });

      await this.invalidateCache(table.outlet_id, table.floor_id);
      return { sessionId: result.insertId, table: await this.getById(tableId) };

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * End table session
   */
  async endSession(tableId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const table = await this.getById(tableId);
      if (!table) throw new Error('Table not found');

      // Get active session
      const [sessions] = await connection.query(
        'SELECT * FROM table_sessions WHERE table_id = ? AND status = "active"',
        [tableId]
      );

      if (sessions.length === 0) throw new Error('No active session found');

      const session = sessions[0];

      // End session
      await connection.query(
        'UPDATE table_sessions SET status = "completed", ended_at = NOW(), ended_by = ? WHERE id = ?',
        [userId, session.id]
      );

      // Unmerge any merged tables
      await connection.query(
        'UPDATE table_merges SET unmerged_at = NOW(), unmerged_by = ? WHERE primary_table_id = ? AND unmerged_at IS NULL',
        [userId, tableId]
      );

      // Update all merged tables to cleaning
      await connection.query(
        `UPDATE tables SET status = 'cleaning' 
         WHERE id IN (
           SELECT merged_table_id FROM table_merges 
           WHERE primary_table_id = ? AND unmerged_at IS NOT NULL AND unmerged_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE)
         )`,
        [tableId]
      );

      // Update primary table to cleaning
      await connection.query('UPDATE tables SET status = "cleaning" WHERE id = ?', [tableId]);

      await connection.commit();

      // Log and broadcast
      await this.logHistory(tableId, 'session_ended', {
        sessionId: session.id,
        duration: Math.floor((new Date() - new Date(session.started_at)) / 1000 / 60),
        endedBy: userId
      });

      this.broadcastTableUpdate(table.outlet_id, table.floor_id, {
        tableId,
        tableNumber: table.table_number,
        event: 'session_ended'
      });

      await this.invalidateCache(table.outlet_id, table.floor_id);
      return true;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Get current session for table
   */
  async getCurrentSession(tableId) {
    const pool = getPool();
    const [sessions] = await pool.query(
      `SELECT ts.*, 
        u.name as captain_name, u.employee_code as captain_code,
        o.id as order_id, o.order_number, o.total_amount, o.status as order_status,
        (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) as item_count,
        (SELECT COUNT(*) FROM kot_tickets kt WHERE kt.order_id = o.id AND kt.status IN ('pending', 'preparing')) as pending_kots
       FROM table_sessions ts
       LEFT JOIN users u ON ts.started_by = u.id
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE ts.table_id = ? AND ts.status = 'active'`,
      [tableId]
    );
    return sessions[0] || null;
  },

  // ========================
  // Table Merge Operations
  // ========================

  /**
   * Merge tables
   */
  async mergeTables(primaryTableId, tableIdsToMerge, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const primaryTable = await this.getById(primaryTableId);
      if (!primaryTable) throw new Error('Primary table not found');
      if (!primaryTable.is_mergeable) throw new Error('Primary table is not mergeable');

      // Get current session
      const [sessions] = await connection.query(
        'SELECT id FROM table_sessions WHERE table_id = ? AND status = "active"',
        [primaryTableId]
      );
      const sessionId = sessions[0]?.id || null;

      for (const tableId of tableIdsToMerge) {
        const table = await this.getById(tableId);
        if (!table) throw new Error(`Table ${tableId} not found`);
        if (!table.is_mergeable) throw new Error(`Table ${table.table_number} is not mergeable`);
        if (table.status !== 'available') throw new Error(`Table ${table.table_number} is not available`);
        if (table.floor_id !== primaryTable.floor_id) {
          throw new Error('Cannot merge tables from different floors');
        }

        // Create merge record
        await connection.query(
          `INSERT INTO table_merges (primary_table_id, merged_table_id, table_session_id, merged_by)
           VALUES (?, ?, ?, ?)`,
          [primaryTableId, tableId, sessionId, userId]
        );

        // Update merged table status
        await connection.query('UPDATE tables SET status = "occupied" WHERE id = ?', [tableId]);
      }

      await connection.commit();

      // Log and broadcast
      await this.logHistory(primaryTableId, 'tables_merged', {
        mergedTableIds: tableIdsToMerge,
        mergedBy: userId
      });

      this.broadcastTableUpdate(primaryTable.outlet_id, primaryTable.floor_id, {
        event: 'tables_merged',
        primaryTableId,
        mergedTableIds: tableIdsToMerge
      });

      await this.invalidateCache(primaryTable.outlet_id, primaryTable.floor_id);
      return this.getMergedTables(primaryTableId);

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Unmerge tables
   */
  async unmergeTables(primaryTableId, userId) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      const primaryTable = await this.getById(primaryTableId);
      if (!primaryTable) throw new Error('Primary table not found');

      // Get merged tables
      const [merges] = await connection.query(
        'SELECT merged_table_id FROM table_merges WHERE primary_table_id = ? AND unmerged_at IS NULL',
        [primaryTableId]
      );

      if (merges.length === 0) throw new Error('No merged tables found');

      // Unmerge all
      await connection.query(
        'UPDATE table_merges SET unmerged_at = NOW(), unmerged_by = ? WHERE primary_table_id = ? AND unmerged_at IS NULL',
        [userId, primaryTableId]
      );

      // Update merged tables to available
      const mergedIds = merges.map(m => m.merged_table_id);
      await connection.query(
        'UPDATE tables SET status = "available" WHERE id IN (?)',
        [mergedIds]
      );

      await connection.commit();

      // Log and broadcast
      await this.logHistory(primaryTableId, 'tables_unmerged', {
        unmergedTableIds: mergedIds,
        unmergedBy: userId
      });

      this.broadcastTableUpdate(primaryTable.outlet_id, primaryTable.floor_id, {
        event: 'tables_unmerged',
        primaryTableId,
        unmergedTableIds: mergedIds
      });

      await this.invalidateCache(primaryTable.outlet_id, primaryTable.floor_id);
      return true;

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Get merged tables for a primary table
   */
  async getMergedTables(primaryTableId) {
    const pool = getPool();
    const [merges] = await pool.query(
      `SELECT tm.*, t.table_number, t.capacity
       FROM table_merges tm
       JOIN tables t ON tm.merged_table_id = t.id
       WHERE tm.primary_table_id = ? AND tm.unmerged_at IS NULL`,
      [primaryTableId]
    );
    return merges;
  },

  // ========================
  // Table History & Reports
  // ========================

  /**
   * Log table history
   */
  async logHistory(tableId, eventType, eventData) {
    const pool = getPool();
    try {
      await pool.query(
        `INSERT INTO table_history (table_id, event_type, event_data, created_at)
         VALUES (?, ?, ?, NOW())`,
        [tableId, eventType, JSON.stringify(eventData)]
      );
    } catch (error) {
      // Table might not exist yet, create it
      if (error.code === 'ER_NO_SUCH_TABLE') {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS table_history (
            id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            table_id BIGINT UNSIGNED NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            event_data JSON,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_table_history_table (table_id),
            INDEX idx_table_history_type (event_type),
            INDEX idx_table_history_created (created_at)
          )
        `);
        await pool.query(
          `INSERT INTO table_history (table_id, event_type, event_data, created_at)
           VALUES (?, ?, ?, NOW())`,
          [tableId, eventType, JSON.stringify(eventData)]
        );
      } else {
        logger.error('Error logging table history:', error);
      }
    }
  },

  /**
   * Get table history
   */
  async getHistory(tableId, limit = 50) {
    const pool = getPool();
    try {
      const [history] = await pool.query(
        `SELECT * FROM table_history 
         WHERE table_id = ? 
         ORDER BY created_at DESC 
         LIMIT ?`,
        [tableId, limit]
      );
      return history;
    } catch (error) {
      return [];
    }
  },

  /**
   * Get table session history
   */
  async getSessionHistory(tableId, fromDate, toDate, limit = 100) {
    const pool = getPool();
    
    let query = `
      SELECT ts.*, 
        u_start.name as started_by_name,
        u_end.name as ended_by_name,
        o.order_number, o.total_amount, o.payment_status,
        TIMESTAMPDIFF(MINUTE, ts.started_at, COALESCE(ts.ended_at, NOW())) as duration_minutes
      FROM table_sessions ts
      LEFT JOIN users u_start ON ts.started_by = u_start.id
      LEFT JOIN users u_end ON ts.ended_by = u_end.id
      LEFT JOIN orders o ON ts.order_id = o.id
      WHERE ts.table_id = ?
    `;
    const params = [tableId];

    if (fromDate) {
      query += ' AND ts.started_at >= ?';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND ts.started_at <= ?';
      params.push(toDate);
    }

    query += ' ORDER BY ts.started_at DESC LIMIT ?';
    params.push(limit);

    const [sessions] = await pool.query(query, params);
    return sessions;
  },

  /**
   * Get table-wise report
   */
  async getTableReport(tableId, fromDate, toDate) {
    const pool = getPool();
    
    const [report] = await pool.query(
      `SELECT 
        COUNT(DISTINCT ts.id) as total_sessions,
        SUM(ts.guest_count) as total_guests,
        AVG(ts.guest_count) as avg_guests,
        AVG(TIMESTAMPDIFF(MINUTE, ts.started_at, ts.ended_at)) as avg_duration_minutes,
        COUNT(DISTINCT o.id) as total_orders,
        SUM(o.total_amount) as total_sales,
        AVG(o.total_amount) as avg_order_value,
        COUNT(DISTINCT o.created_by) as unique_captains
       FROM table_sessions ts
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE ts.table_id = ?
         AND ts.started_at >= ?
         AND ts.started_at <= ?
         AND ts.status = 'completed'`,
      [tableId, fromDate, toDate]
    );

    // Get captain breakdown
    const [captains] = await pool.query(
      `SELECT u.id, u.name, u.employee_code,
        COUNT(DISTINCT ts.id) as sessions,
        COUNT(DISTINCT o.id) as orders,
        SUM(o.total_amount) as sales
       FROM table_sessions ts
       JOIN users u ON ts.started_by = u.id
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE ts.table_id = ?
         AND ts.started_at >= ?
         AND ts.started_at <= ?
       GROUP BY u.id
       ORDER BY sales DESC`,
      [tableId, fromDate, toDate]
    );

    // Get hourly distribution
    const [hourly] = await pool.query(
      `SELECT HOUR(ts.started_at) as hour, COUNT(*) as sessions
       FROM table_sessions ts
       WHERE ts.table_id = ?
         AND ts.started_at >= ?
         AND ts.started_at <= ?
       GROUP BY HOUR(ts.started_at)
       ORDER BY hour`,
      [tableId, fromDate, toDate]
    );

    return {
      summary: report[0],
      captains,
      hourlyDistribution: hourly
    };
  },

  /**
   * Get floor-wise report
   */
  async getFloorReport(floorId, fromDate, toDate) {
    const pool = getPool();
    
    const [tables] = await pool.query(
      `SELECT t.id, t.table_number, t.capacity,
        COUNT(DISTINCT ts.id) as sessions,
        SUM(ts.guest_count) as guests,
        COUNT(DISTINCT o.id) as orders,
        SUM(o.total_amount) as sales,
        AVG(TIMESTAMPDIFF(MINUTE, ts.started_at, ts.ended_at)) as avg_duration
       FROM tables t
       LEFT JOIN table_sessions ts ON t.id = ts.table_id 
         AND ts.started_at >= ? AND ts.started_at <= ? AND ts.status = 'completed'
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE t.floor_id = ? AND t.is_active = 1
       GROUP BY t.id
       ORDER BY sales DESC`,
      [fromDate, toDate, floorId]
    );

    const [summary] = await pool.query(
      `SELECT 
        COUNT(DISTINCT t.id) as total_tables,
        SUM(t.capacity) as total_capacity,
        COUNT(DISTINCT ts.id) as total_sessions,
        SUM(o.total_amount) as total_sales
       FROM tables t
       LEFT JOIN table_sessions ts ON t.id = ts.table_id 
         AND ts.started_at >= ? AND ts.started_at <= ? AND ts.status = 'completed'
       LEFT JOIN orders o ON ts.order_id = o.id
       WHERE t.floor_id = ? AND t.is_active = 1`,
      [fromDate, toDate, floorId]
    );

    return {
      summary: summary[0],
      tables
    };
  },

  /**
   * Get running KOTs for a table
   */
  async getRunningKots(tableId) {
    const pool = getPool();
    
    const [kots] = await pool.query(
      `SELECT kt.*, 
        u.name as created_by_name,
        (SELECT JSON_ARRAYAGG(
          JSON_OBJECT('id', ki.id, 'itemName', ki.item_name, 'quantity', ki.quantity, 'status', ki.status)
        ) FROM kot_items ki WHERE ki.kot_id = kt.id) as items
       FROM kot_tickets kt
       JOIN orders o ON kt.order_id = o.id
       JOIN table_sessions ts ON o.table_session_id = ts.id
       LEFT JOIN users u ON kt.created_by = u.id
       WHERE ts.table_id = ? AND ts.status = 'active' AND kt.status IN ('pending', 'accepted', 'preparing')
       ORDER BY kt.created_at ASC`,
      [tableId]
    );

    return kots;
  },

  // ========================
  // Utilities
  // ========================

  /**
   * Broadcast table update via Socket.IO
   */
  broadcastTableUpdate(outletId, floorId, data) {
    try {
      emit.toFloor(outletId, floorId, 'table:update', data);
    } catch (error) {
      logger.error('Error broadcasting table update:', error);
    }
  },

  /**
   * Invalidate cache
   */
  async invalidateCache(outletId, floorId) {
    await cache.del(`tables:outlet:${outletId}`);
    await cache.del(`tables:floor:${floorId}`);
  },

  /**
   * Get available table statuses
   */
  getStatuses() {
    return TABLE_STATUSES.map(s => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1)
    }));
  },

  /**
   * Get table shapes
   */
  getShapes() {
    return ['square', 'rectangle', 'round', 'oval', 'custom'].map(s => ({
      value: s,
      label: s.charAt(0).toUpperCase() + s.slice(1)
    }));
  }
};

module.exports = tableService;
