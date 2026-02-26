const { getPool } = require('../database');
const { v4: uuidv4 } = require('uuid');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_TTL = 3600; // 1 hour

/**
 * Outlet Service - CRUD and management for restaurant outlets
 */
const outletService = {
  /**
   * Create new outlet
   */
  async create(data, userId) {
    const pool = getPool();
    const uuid = uuidv4();
    const code = data.code || await this.generateCode(data.name);

    const [result] = await pool.query(
      `INSERT INTO outlets (
        uuid, code, name, legal_name, outlet_type, 
        address_line1, address_line2, city, state, country, postal_code,
        phone, email, gstin, fssai_number, pan_number,
        opening_time, closing_time, is_24_hours,
        currency_code, timezone, settings,
        is_active, created_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid, code, data.name, data.legalName || null, data.outletType || 'restaurant',
        data.addressLine1 || null, data.addressLine2 || null, data.city || null, 
        data.state || null, data.country || 'India', data.postalCode || null,
        data.phone || null, data.email || null, data.gstin || null, data.fssaiNumber || null,
        data.panNumber || null,
        data.openingTime || null, data.closingTime || null, data.is24Hours || false,
        data.currencyCode || 'INR', data.timezone || 'Asia/Kolkata',
        JSON.stringify(data.settings || {}),
        data.isActive !== false, userId
      ]
    );

    const outletId = result.insertId;

    // Auto-assign outlet to the creator if they're an admin without outlets
    if (userId) {
      try {
        // Check if user has admin role without any outlet assignments
        const [adminRoles] = await pool.query(
          `SELECT ur.id FROM user_roles ur
           JOIN roles r ON ur.role_id = r.id
           WHERE ur.user_id = ? AND ur.is_active = 1 
             AND r.slug = 'admin' AND ur.outlet_id IS NULL`,
          [userId]
        );
        
        // Update admin role to include this outlet
        if (adminRoles.length > 0) {
          await pool.query(
            `UPDATE user_roles SET outlet_id = ? WHERE id = ?`,
            [outletId, adminRoles[0].id]
          );
          logger.info(`Auto-assigned outlet ${outletId} to admin user ${userId}`);
        }
      } catch (err) {
        logger.warn(`Failed to auto-assign outlet to creator: ${err.message}`);
      }
    }

    await cache.del('outlets:all');
    return this.getById(outletId);
  },

  /**
   * Get all outlets
   */
  async getAll(filters = {}) {
    const pool = getPool();
    
    let query = `
      SELECT o.*, 
        (SELECT COUNT(*) FROM floors f WHERE f.outlet_id = o.id) as floor_count,
        (SELECT COUNT(*) FROM tables t WHERE t.outlet_id = o.id AND t.is_active = 1) as table_count
      FROM outlets o
      WHERE o.deleted_at IS NULL
    `;
    const params = [];

    if (filters.isActive !== undefined) {
      query += ' AND o.is_active = ?';
      params.push(filters.isActive);
    }

    if (filters.outletType) {
      query += ' AND o.outlet_type = ?';
      params.push(filters.outletType);
    }

    if (filters.search) {
      query += ' AND (o.name LIKE ? OR o.code LIKE ? OR o.city LIKE ?)';
      const search = `%${filters.search}%`;
      params.push(search, search, search);
    }

    query += ' ORDER BY o.name ASC';

    const [outlets] = await pool.query(query, params);
    return outlets;
  },

  /**
   * Get outlet by ID
   */
  async getById(id) {
    const pool = getPool();
    const [outlets] = await pool.query(
      `SELECT o.* FROM outlets o WHERE o.id = ? AND o.deleted_at IS NULL`,
      [id]
    );
    return outlets[0] || null;
  },

  /**
   * Get outlet by UUID
   */
  async getByUuid(uuid) {
    const pool = getPool();
    const [outlets] = await pool.query(
      `SELECT o.* FROM outlets o WHERE o.uuid = ? AND o.deleted_at IS NULL`,
      [uuid]
    );
    return outlets[0] || null;
  },

  /**
   * Update outlet
   */
  async update(id, data, userId) {
    const pool = getPool();
    
    const updates = [];
    const params = [];

    const allowedFields = [
      'name', 'legal_name', 'outlet_type', 'address_line1', 'address_line2',
      'city', 'state', 'country', 'postal_code', 'phone', 'email',
      'gstin', 'fssai_number', 'pan_number', 'opening_time', 'closing_time', 'is_24_hours',
      'currency_code', 'timezone', 'is_active', 'settings'
    ];

    const fieldMap = {
      legalName: 'legal_name',
      outletType: 'outlet_type',
      addressLine1: 'address_line1',
      addressLine2: 'address_line2',
      postalCode: 'postal_code',
      fssaiNumber: 'fssai_number',
      panNumber: 'pan_number',
      openingTime: 'opening_time',
      closingTime: 'closing_time',
      is24Hours: 'is_24_hours',
      currencyCode: 'currency_code',
      isActive: 'is_active'
    };

    Object.keys(data).forEach(key => {
      const dbField = fieldMap[key] || key;
      if (allowedFields.includes(dbField)) {
        updates.push(`${dbField} = ?`);
        params.push(key === 'settings' ? JSON.stringify(data[key]) : data[key]);
      }
    });

    if (updates.length === 0) return this.getById(id);

    updates.push('updated_by = ?');
    params.push(userId);
    params.push(id);

    await pool.query(
      `UPDATE outlets SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    await cache.del('outlets:all');
    await cache.del(`outlet:${id}`);
    return this.getById(id);
  },

  /**
   * Soft delete outlet
   */
  async delete(id, userId) {
    const pool = getPool();
    await pool.query(
      'UPDATE outlets SET deleted_at = NOW(), updated_by = ? WHERE id = ?',
      [userId, id]
    );
    await cache.del('outlets:all');
    await cache.del(`outlet:${id}`);
    return true;
  },

  /**
   * Generate unique outlet code
   */
  async generateCode(name) {
    const pool = getPool();
    const prefix = name.substring(0, 3).toUpperCase();
    const [rows] = await pool.query(
      'SELECT COUNT(*) as count FROM outlets WHERE code LIKE ?',
      [`${prefix}%`]
    );
    return `${prefix}${String(rows[0].count + 1).padStart(3, '0')}`;
  },

  /**
   * Get outlet with full details (floors, sections, tables)
   */
  async getFullDetails(id) {
    const pool = getPool();
    
    const outlet = await this.getById(id);
    if (!outlet) return null;

    // Get floors with tables
    const [floors] = await pool.query(
      `SELECT f.*, 
        (SELECT COUNT(*) FROM tables t WHERE t.floor_id = f.id AND t.is_active = 1) as table_count
       FROM floors f 
       WHERE f.outlet_id = ? AND f.is_active = 1 
       ORDER BY f.display_order, f.name`,
      [id]
    );

    // Get sections
    const [sections] = await pool.query(
      'SELECT * FROM sections WHERE outlet_id = ? AND is_active = 1 ORDER BY display_order, name',
      [id]
    );

    // Get table stats
    const [tableStats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
        SUM(CASE WHEN status = 'billing' THEN 1 ELSE 0 END) as billing,
        SUM(CASE WHEN status = 'cleaning' THEN 1 ELSE 0 END) as cleaning,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked
       FROM tables WHERE outlet_id = ? AND is_active = 1`,
      [id]
    );

    return {
      ...outlet,
      floors,
      sections,
      tableStats: tableStats[0]
    };
  },

  /**
   * HARD DELETE outlet and ALL related data
   * WARNING: This permanently deletes all data - use with extreme caution
   * Only super_admin should have access to this function
   * 
   * @param {number} outletId - Outlet ID to delete
   * @param {string} confirmationCode - Must match outlet code for safety
   * @returns {object} Deletion summary with counts
   */
  async hardDelete(outletId, confirmationCode) {
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      // 1. Verify outlet exists and confirmation code matches
      const outlet = await this.getById(outletId);
      if (!outlet) {
        throw new Error(`Outlet ${outletId} not found`);
      }

      if (outlet.code !== confirmationCode) {
        throw new Error(`Confirmation code mismatch. Expected: ${outlet.code}`);
      }

      logger.warn(`HARD DELETE initiated for outlet ${outletId} (${outlet.name})`);

      await connection.beginTransaction();

      const deletionLog = {
        outletId,
        outletName: outlet.name,
        outletCode: outlet.code,
        deletedAt: new Date().toISOString(),
        tables: {}
      };

      // Tables to delete in order (child tables first, then parent tables)
      // Order matters for foreign key constraints
      const tablesToDelete = [
        // Level 1: Transaction/Log tables
        'activity_logs',
        'permission_logs',
        'error_logs',
        'notification_logs',
        'print_jobs',
        'duplicate_bill_logs',
        'bulk_upload_logs',
        
        // Level 2: User session/assignment tables
        'user_sessions',
        'user_stations',
        'user_floors',
        'user_sections',
        'user_menu_access',
        'user_permissions',
        
        // Level 3: KOT related
        'kot_tickets',
        
        // Level 4: Payment/Billing child tables
        'refunds',
        'payments',
        'invoices',
        
        // Level 5: Order related
        'orders',
        
        // Level 6: Cash management
        'cash_drawer',
        'day_sessions',
        
        // Level 7: Item related child tables (linking tables)
        'item_sales',
        
        // Level 8: Addon related
        'addon_groups',
        
        // Level 9: Items (has variants as child)
        'items',
        
        // Level 10: Categories
        'categories',
        
        // Level 11: Layout tables
        'tables',
        'sections',
        'floors',
        
        // Level 12: Kitchen/Printer infrastructure
        'kitchen_stations',
        'counters',
        'printers',
        'printer_bridges',
        'print_templates',
        
        // Level 13: Time/Schedule tables
        'time_slots',
        
        // Level 14: Inventory tables
        'stock',
        'stock_logs',
        'opening_stock',
        'closing_stock',
        'wastage_logs',
        'ingredients',
        'purchase_orders',
        'suppliers',
        
        // Level 15: Report/Summary tables
        'daily_sales',
        'hourly_sales',
        'item_sales',
        'category_sales',
        'staff_sales',
        'floor_section_sales',
        'payment_mode_summary',
        'tax_summary',
        'discount_summary',
        'cancellation_summary',
        'cash_summary',
        'top_selling_items',
        'inventory_consumption_summary',
        
        // Level 16: Config tables
        'tax_groups',
        'tax_rules',
        'price_rules',
        'discounts',
        'service_charges',
        'cancel_reasons',
        'system_settings',
        'notifications',
        'devices',
        'file_uploads',
        'table_reservations',
        'category_outlets',
        
        // Level 17: Customer related
        'customers',
        
        // Level 18: User roles (before users)
        'user_roles',
      ];

      // Delete from each table
      for (const tableName of tablesToDelete) {
        try {
          const [result] = await connection.query(
            `DELETE FROM ${tableName} WHERE outlet_id = ?`,
            [outletId]
          );
          deletionLog.tables[tableName] = result.affectedRows;
          if (result.affectedRows > 0) {
            logger.info(`Deleted ${result.affectedRows} rows from ${tableName}`);
          }
        } catch (err) {
          // Table might not exist or have different structure - continue
          if (err.code !== 'ER_NO_SUCH_TABLE' && err.code !== 'ER_BAD_FIELD_ERROR') {
            logger.warn(`Error deleting from ${tableName}: ${err.message}`);
          }
          deletionLog.tables[tableName] = 0;
        }
      }

      // Finally delete the outlet itself
      const [outletResult] = await connection.query(
        'DELETE FROM outlets WHERE id = ?',
        [outletId]
      );
      deletionLog.tables['outlets'] = outletResult.affectedRows;

      await connection.commit();

      // Invalidate all caches for this outlet
      await this.invalidateCache(outletId);
      await cache.del(`categories:${outletId}:false`);
      await cache.del(`categories:${outletId}:true`);
      await cache.del(`items:${outletId}`);
      await cache.del(`addon_groups:${outletId}`);
      await cache.del(`kitchen_stations:${outletId}`);
      await cache.del(`counters:${outletId}`);

      logger.warn(`HARD DELETE completed for outlet ${outletId}. Summary:`, deletionLog);

      return {
        success: true,
        message: `Outlet "${outlet.name}" (${outlet.code}) and all related data permanently deleted`,
        summary: deletionLog
      };

    } catch (error) {
      await connection.rollback();
      logger.error(`HARD DELETE failed for outlet ${outletId}:`, error);
      throw error;
    } finally {
      connection.release();
    }
  },

  /**
   * Get deletion preview - shows what would be deleted without actually deleting
   * Use this to verify before hard delete
   */
  async getDeletePreview(outletId) {
    const pool = getPool();

    const outlet = await this.getById(outletId);
    if (!outlet) {
      throw new Error(`Outlet ${outletId} not found`);
    }

    const preview = {
      outlet: {
        id: outlet.id,
        code: outlet.code,
        name: outlet.name
      },
      tables: {}
    };

    // Tables to check
    const tablesToCheck = [
      'users', 'user_roles', 'categories', 'items', 'addon_groups',
      'floors', 'sections', 'tables', 'orders', 'payments', 'invoices',
      'kot_tickets', 'kitchen_stations', 'printers', 'customers',
      'cash_drawer', 'day_sessions', 'print_jobs', 'bulk_upload_logs'
    ];

    let totalRows = 0;
    for (const tableName of tablesToCheck) {
      try {
        const [result] = await pool.query(
          `SELECT COUNT(*) as count FROM ${tableName} WHERE outlet_id = ?`,
          [outletId]
        );
        preview.tables[tableName] = result[0].count;
        totalRows += result[0].count;
      } catch (err) {
        preview.tables[tableName] = 0;
      }
    }

    preview.totalRows = totalRows;
    preview.warning = `This will PERMANENTLY DELETE ${totalRows} rows across ${Object.keys(preview.tables).length} tables. This action CANNOT be undone.`;

    return preview;
  }
};

module.exports = outletService;
