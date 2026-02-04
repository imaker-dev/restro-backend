/**
 * Time Slot Service
 * Handles time-based menu visibility (Breakfast, Lunch, Dinner, Happy Hour, etc.)
 */

const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_TTL = 3600;

const timeSlotService = {
  async create(data) {
    const pool = getPool();
    const {
      outletId, name, code, description,
      startTime, endTime,
      activeDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      isActive = true, displayOrder = 0
    } = data;

    const [result] = await pool.query(
      `INSERT INTO time_slots (outlet_id, name, code, description, start_time, end_time, active_days, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [outletId, name, code?.toUpperCase(), description, startTime, endTime, JSON.stringify(activeDays), isActive, displayOrder]
    );

    await this.invalidateCache(outletId);
    return { id: result.insertId, ...data };
  },

  async getByOutlet(outletId) {
    const cacheKey = `time_slots:${outletId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const pool = getPool();
    const [slots] = await pool.query(
      `SELECT * FROM time_slots WHERE outlet_id = ? AND is_active = 1 ORDER BY display_order, start_time`,
      [outletId]
    );

    const result = slots.map(s => ({
      ...s,
      active_days: s.active_days ? JSON.parse(s.active_days) : []
    }));

    await cache.set(cacheKey, result, CACHE_TTL);
    return result;
  },

  async getById(id) {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM time_slots WHERE id = ?', [id]);
    if (!rows[0]) return null;
    return {
      ...rows[0],
      active_days: rows[0].active_days ? JSON.parse(rows[0].active_days) : []
    };
  },

  async update(id, data) {
    const pool = getPool();
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code?.toUpperCase()); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.startTime !== undefined) { fields.push('start_time = ?'); values.push(data.startTime); }
    if (data.endTime !== undefined) { fields.push('end_time = ?'); values.push(data.endTime); }
    if (data.activeDays !== undefined) { fields.push('active_days = ?'); values.push(JSON.stringify(data.activeDays)); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive); }
    if (data.displayOrder !== undefined) { fields.push('display_order = ?'); values.push(data.displayOrder); }

    if (fields.length === 0) return null;
    values.push(id);

    await pool.query(`UPDATE time_slots SET ${fields.join(', ')} WHERE id = ?`, values);

    const slot = await this.getById(id);
    if (slot) await this.invalidateCache(slot.outlet_id);
    return slot;
  },

  async delete(id) {
    const pool = getPool();
    const slot = await this.getById(id);
    if (!slot) return false;

    await pool.query('UPDATE time_slots SET is_active = 0 WHERE id = ?', [id]);
    await this.invalidateCache(slot.outlet_id);
    return true;
  },

  /**
   * Get current active time slot for an outlet
   */
  async getCurrentSlot(outletId) {
    const pool = getPool();
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const [slots] = await pool.query(
      `SELECT * FROM time_slots 
       WHERE outlet_id = ? AND is_active = 1
       AND start_time <= ? AND end_time >= ?
       AND JSON_CONTAINS(active_days, ?)
       ORDER BY display_order
       LIMIT 1`,
      [outletId, currentTime, currentTime, JSON.stringify(dayOfWeek)]
    );

    if (!slots[0]) return null;
    return {
      ...slots[0],
      active_days: slots[0].active_days ? JSON.parse(slots[0].active_days) : []
    };
  },

  /**
   * Check if a time slot is currently active
   */
  isSlotActive(slot, time = null, day = null) {
    const now = time ? new Date(`2000-01-01 ${time}`) : new Date();
    const currentTime = now.toTimeString().slice(0, 8);
    const dayOfWeek = day || now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const startTime = slot.start_time;
    const endTime = slot.end_time;
    const activeDays = typeof slot.active_days === 'string' ? JSON.parse(slot.active_days) : slot.active_days;

    // Check if current day is in active days
    if (!activeDays.includes(dayOfWeek)) return false;

    // Handle overnight slots (e.g., 22:00 - 02:00)
    if (endTime < startTime) {
      return currentTime >= startTime || currentTime <= endTime;
    }

    return currentTime >= startTime && currentTime <= endTime;
  },

  async invalidateCache(outletId) {
    await cache.del(`time_slots:${outletId}`);
  }
};

module.exports = timeSlotService;
