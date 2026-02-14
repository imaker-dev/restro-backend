const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Section Service - CRUD and management for restaurant sections
 */
const sectionService = {
  /**
   * Create new section
   */
  async create(data, userId) {
    const pool = getPool();

    // Validate floor exists and belongs to the outlet
    if (data.floorId) {
      const [floors] = await pool.query(
        'SELECT id FROM floors WHERE id = ? AND outlet_id = ? AND is_active = 1',
        [data.floorId, data.outletId]
      );
      if (floors.length === 0) {
        const error = new Error('Floor not found or does not belong to this outlet');
        error.statusCode = 400;
        throw error;
      }
    }

    // Check duplicate section name on same floor
    if (data.floorId) {
      const [existing] = await pool.query(
        `SELECT s.id FROM sections s
         JOIN floor_sections fs ON s.id = fs.section_id
         WHERE s.outlet_id = ? AND fs.floor_id = ? AND LOWER(s.name) = LOWER(?) AND s.is_active = 1 AND fs.is_active = 1`,
        [data.outletId, data.floorId, data.name]
      );
      if (existing.length > 0) {
        const error = new Error('A section with this name already exists on this floor');
        error.statusCode = 409;
        throw error;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO sections (outlet_id, name, code, section_type, description, color_code, display_order, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.outletId,
        data.name,
        data.code || null,
        data.sectionType || 'dine_in',
        data.description || null,
        data.colorCode || null,
        data.displayOrder || 0,
        data.isActive !== false
      ]
    );

    const sectionId = result.insertId;

    // Auto-link section to floor
    if (data.floorId) {
      await pool.query(
        `INSERT INTO floor_sections (floor_id, section_id, price_modifier_percent, is_active)
         VALUES (?, ?, 0, 1)
         ON DUPLICATE KEY UPDATE is_active = 1`,
        [data.floorId, sectionId]
      );
    }

    await cache.del(`sections:outlet:${data.outletId}`);
    return this.getById(sectionId);
  },

  /**
   * Get all sections for an outlet
   */
  async getByOutlet(outletId, includeInactive = false) {
    const pool = getPool();
    
    let query = `
      SELECT s.*, 
        (SELECT COUNT(*) FROM tables t WHERE t.section_id = s.id AND t.is_active = 1) as table_count
      FROM sections s
      WHERE s.outlet_id = ?
    `;

    if (!includeInactive) {
      query += ' AND s.is_active = 1';
    }

    query += ' ORDER BY s.display_order, s.name';

    const [sections] = await pool.query(query, [outletId]);
    return sections;
  },

  /**
   * Get all sections for a specific floor
   */
  async getByFloor(floorId, includeInactive = false) {
    const pool = getPool();

    let query = `
      SELECT s.*,
        fs.price_modifier_percent,
        (SELECT COUNT(*) FROM tables t WHERE t.section_id = s.id AND t.floor_id = ? AND t.is_active = 1) as table_count
      FROM sections s
      JOIN floor_sections fs ON s.id = fs.section_id
      WHERE fs.floor_id = ? AND fs.is_active = 1
    `;
    const params = [floorId, floorId];

    if (!includeInactive) {
      query += ' AND s.is_active = 1';
    }

    query += ' ORDER BY s.display_order, s.name';

    const [sections] = await pool.query(query, params);
    return sections;
  },

  /**
   * Get section by ID
   */
  async getById(id) {
    const pool = getPool();
    const [sections] = await pool.query(
      `SELECT s.*, o.name as outlet_name
       FROM sections s
       JOIN outlets o ON s.outlet_id = o.id
       WHERE s.id = ?`,
      [id]
    );
    return sections[0] || null;
  },

  /**
   * Get all section types
   */
  getSectionTypes() {
    return [
      { value: 'dine_in', label: 'Dine In' },
      { value: 'takeaway', label: 'Takeaway' },
      { value: 'delivery', label: 'Delivery' },
      { value: 'bar', label: 'Bar' },
      { value: 'rooftop', label: 'Rooftop' },
      { value: 'private', label: 'Private Dining' },
      { value: 'outdoor', label: 'Outdoor' },
      { value: 'ac', label: 'AC Section' },
      { value: 'non_ac', label: 'Non-AC Section' }
    ];
  },

  /**
   * Update section
   */
  async update(id, data, userId) {
    const pool = getPool();
    const section = await this.getById(id);
    if (!section) return null;

    const updates = [];
    const params = [];

    if (data.name !== undefined) { updates.push('name = ?'); params.push(data.name); }
    if (data.code !== undefined) { updates.push('code = ?'); params.push(data.code); }
    if (data.sectionType !== undefined) { updates.push('section_type = ?'); params.push(data.sectionType); }
    if (data.description !== undefined) { updates.push('description = ?'); params.push(data.description); }
    if (data.colorCode !== undefined) { updates.push('color_code = ?'); params.push(data.colorCode); }
    if (data.displayOrder !== undefined) { updates.push('display_order = ?'); params.push(data.displayOrder); }
    if (data.isActive !== undefined) { updates.push('is_active = ?'); params.push(data.isActive); }

    if (updates.length === 0) return section;

    params.push(id);
    await pool.query(`UPDATE sections SET ${updates.join(', ')} WHERE id = ?`, params);

    await cache.del(`sections:outlet:${section.outlet_id}`);
    return this.getById(id);
  },

  /**
   * Delete section
   */
  async delete(id) {
    const pool = getPool();
    const section = await this.getById(id);
    if (!section) return false;

    // Check if section has tables
    const [tables] = await pool.query(
      'SELECT COUNT(*) as count FROM tables WHERE section_id = ? AND is_active = 1',
      [id]
    );

    if (tables[0].count > 0) {
      throw new Error('Cannot delete section with active tables. Please move or delete tables first.');
    }

    await pool.query('DELETE FROM sections WHERE id = ?', [id]);
    await cache.del(`sections:outlet:${section.outlet_id}`);
    return true;
  }
};

module.exports = sectionService;
