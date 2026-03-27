const { getPool } = require('../database');
const logger = require('../utils/logger');

const menuMediaService = {
  async getById(id) {
    const pool = getPool();
    const [[row]] = await pool.query('SELECT * FROM menu_media WHERE id = ?', [id]);
    return row || null;
  },
  async create(outletId, { fileType, title = null, path, displayOrder = 0, isActive = 1 }) {
    const pool = getPool();
    try {
      // Store only relative path, no url column needed
      const [res] = await pool.query(
        `INSERT INTO menu_media (outlet_id, file_type, title, path, display_order, is_active)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [outletId, fileType, title, path, displayOrder, isActive ? 1 : 0]
      );
      const id = res.insertId;
      const [[row]] = await pool.query('SELECT * FROM menu_media WHERE id = ?', [id]);
      return row;
    } catch (error) {
      logger.error('menuMediaService.create error:', error);
      throw error;
    }
  },

  async list(outletId, { type = 'all', isActive = 1 } = {}) {
    const pool = getPool();
    let where = 'WHERE outlet_id = ?';
    const params = [outletId];

    if (type && ['image', 'pdf'].includes(String(type))) {
      where += ' AND file_type = ?';
      params.push(type);
    }
    if (typeof isActive !== 'undefined' && isActive !== null) {
      where += ' AND is_active = ?';
      params.push(isActive ? 1 : 0);
    }

    const [rows] = await pool.query(
      `SELECT id, outlet_id, file_type, title, path, display_order, is_active, created_at
       FROM menu_media ${where}
       ORDER BY display_order ASC, created_at DESC`,
      params
    );
    return rows;
  },

  async setActive(id, isActive) {
    const pool = getPool();
    await pool.query('UPDATE menu_media SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, id]);
    const [[row]] = await pool.query('SELECT * FROM menu_media WHERE id = ?', [id]);
    return row;
  },

  async updateMeta(id, { title, displayOrder }) {
    const pool = getPool();
    await pool.query('UPDATE menu_media SET title = ?, display_order = ? WHERE id = ?', [title || null, displayOrder || 0, id]);
    const [[row]] = await pool.query('SELECT * FROM menu_media WHERE id = ?', [id]);
    return row;
  },

  async replaceFile(id, { fileType, path }) {
    const pool = getPool();
    // Store only relative path
    await pool.query('UPDATE menu_media SET file_type = ?, path = ? WHERE id = ?', [fileType, path, id]);
    const [[row]] = await pool.query('SELECT * FROM menu_media WHERE id = ?', [id]);
    return row;
  },

  async delete(id) {
    const pool = getPool();
    const [[row]] = await pool.query('SELECT * FROM menu_media WHERE id = ?', [id]);
    if (!row) return { row: null, deleted: false };
    await pool.query('DELETE FROM menu_media WHERE id = ?', [id]);
    return { row, deleted: true };
  }
};

module.exports = menuMediaService;
