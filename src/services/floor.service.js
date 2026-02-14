const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Floor Service - CRUD and management for restaurant floors
 */
const floorService = {
  /**
   * Create new floor
   */
  async create(data, userId) {
    const pool = getPool();

    // Validate outlet exists
    const [outlets] = await pool.query(
      'SELECT id FROM outlets WHERE id = ? AND is_active = 1',
      [data.outletId]
    );
    if (outlets.length === 0) {
      const error = new Error('Outlet not found');
      error.statusCode = 400;
      throw error;
    }

    // Check duplicate floor name in same outlet
    const [existing] = await pool.query(
      'SELECT id FROM floors WHERE outlet_id = ? AND LOWER(name) = LOWER(?) AND is_active = 1',
      [data.outletId, data.name]
    );
    if (existing.length > 0) {
      const error = new Error('A floor with this name already exists in this outlet');
      error.statusCode = 409;
      throw error;
    }

    const [result] = await pool.query(
      `INSERT INTO floors (outlet_id, name, code, description, floor_number, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.outletId,
        data.name,
        data.code || null,
        data.description || null,
        data.floorNumber || 0,
        data.displayOrder || 0,
        data.isActive !== false
      ]
    );

    await cache.del(`floors:outlet:${data.outletId}`);
    return this.getById(result.insertId);
  },

  /**
   * Get all floors for an outlet
   * When userId is provided, filters to only assigned floors (if user has any assignments).
   * Users with no floor assignments (admin/manager or unrestricted staff) see all floors.
   */
  async getByOutlet(outletId, includeInactive = false, userId = null) {
    const pool = getPool();
    const params = [outletId];

    // Check if user has floor restrictions
    let floorRestriction = '';
    if (userId) {
      const [userFloors] = await pool.query(
        'SELECT floor_id FROM user_floors WHERE user_id = ? AND outlet_id = ? AND is_active = 1',
        [userId, outletId]
      );
      if (userFloors.length > 0) {
        const floorIds = userFloors.map(uf => uf.floor_id);
        floorRestriction = ` AND f.id IN (${floorIds.map(() => '?').join(',')})`;
        params.push(...floorIds);
      }
    }

    let query = `
      SELECT f.*, 
        (SELECT COUNT(*) FROM tables t WHERE t.floor_id = f.id AND t.is_active = 1) as table_count,
        (SELECT COUNT(*) FROM tables t WHERE t.floor_id = f.id AND t.is_active = 1 AND t.status = 'available') as available_count,
        (SELECT COUNT(*) FROM tables t WHERE t.floor_id = f.id AND t.is_active = 1 AND t.status = 'occupied') as occupied_count
      FROM floors f
      WHERE f.outlet_id = ?${floorRestriction}
    `;

    if (!includeInactive) {
      query += ' AND f.is_active = 1';
    }

    query += ' ORDER BY f.display_order, f.floor_number, f.name';

    const [floors] = await pool.query(query, params);
    return floors;
  },

  /**
   * Get floor by ID
   */
  async getById(id) {
    const pool = getPool();
    const [floors] = await pool.query(
      `SELECT f.*, o.name as outlet_name
       FROM floors f
       JOIN outlets o ON f.outlet_id = o.id
       WHERE f.id = ?`,
      [id]
    );
    return floors[0] || null;
  },

  /**
   * Get floor with tables and sections
   */
  async getWithDetails(id) {
    const pool = getPool();
    
    const floor = await this.getById(id);
    if (!floor) return null;

    // Get tables on this floor
    const [tables] = await pool.query(
      `SELECT t.*, 
        s.name as section_name, s.section_type,
        tl.position_x, tl.position_y, tl.width, tl.height, tl.rotation
       FROM tables t
       LEFT JOIN sections s ON t.section_id = s.id
       LEFT JOIN table_layouts tl ON t.id = tl.table_id
       WHERE t.floor_id = ? AND t.is_active = 1
       ORDER BY t.display_order, t.table_number`,
      [id]
    );

    // Get sections linked to this floor
    const [sections] = await pool.query(
      `SELECT s.*, fs.price_modifier_percent
       FROM sections s
       JOIN floor_sections fs ON s.id = fs.section_id
       WHERE fs.floor_id = ? AND fs.is_active = 1`,
      [id]
    );

    // Get table stats
    const [stats] = await pool.query(
      `SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupied,
        SUM(CASE WHEN status = 'reserved' THEN 1 ELSE 0 END) as reserved,
        SUM(CASE WHEN status = 'billing' THEN 1 ELSE 0 END) as billing,
        SUM(capacity) as total_capacity
       FROM tables WHERE floor_id = ? AND is_active = 1`,
      [id]
    );

    return {
      ...floor,
      tables,
      sections,
      stats: stats[0]
    };
  },

  /**
   * Update floor
   */
  async update(id, data, userId) {
    const pool = getPool();
    const floor = await this.getById(id);
    if (!floor) return null;

    const updates = [];
    const params = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.code !== undefined) { updates.push('code = ?'); params.push(data.code); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.floorNumber !== undefined) { updates.push('floor_number = ?'); params.push(data.floorNumber); }
    if (data.displayOrder !== undefined) { updates.push('display_order = ?'); params.push(data.displayOrder); }
    if (data.isActive !== undefined) { updates.push('is_active = ?'); params.push(data.isActive); }

    if (updates.length === 0) return floor;

    params.push(id);
    await pool.query(`UPDATE floors SET ${updates.join(', ')} WHERE id = ?`, params);

    await cache.del(`floors:outlet:${floor.outlet_id}`);
    return this.getById(id);
  },

  /**
   * Delete floor
   */
  async delete(id) {
    const pool = getPool();
    const floor = await this.getById(id);
    if (!floor) return false;

    // Check if floor has tables
    const [tables] = await pool.query(
      'SELECT COUNT(*) as count FROM tables WHERE floor_id = ? AND is_active = 1',
      [id]
    );

    if (tables[0].count > 0) {
      throw new Error('Cannot delete floor with active tables. Please move or delete tables first.');
    }

    await pool.query('DELETE FROM floors WHERE id = ?', [id]);
    await cache.del(`floors:outlet:${floor.outlet_id}`);
    return true;
  },

  /**
   * Link section to floor
   */
  async linkSection(floorId, sectionId, priceModifier = 0) {
    const pool = getPool();
    
    await pool.query(
      `INSERT INTO floor_sections (floor_id, section_id, price_modifier_percent, is_active)
       VALUES (?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE price_modifier_percent = ?, is_active = 1`,
      [floorId, sectionId, priceModifier, priceModifier]
    );

    return true;
  },

  /**
   * Unlink section from floor
   */
  async unlinkSection(floorId, sectionId) {
    const pool = getPool();
    await pool.query(
      'UPDATE floor_sections SET is_active = 0 WHERE floor_id = ? AND section_id = ?',
      [floorId, sectionId]
    );
    return true;
  }
};

module.exports = floorService;
