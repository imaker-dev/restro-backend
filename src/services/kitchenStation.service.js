/**
 * Kitchen Station & Counter Service
 * Handles KOT routing to different stations (Main Kitchen, Bar, Tandoor, etc.)
 */

const { getPool } = require('../database');
const { cache } = require('../config/redis');
const logger = require('../utils/logger');

const CACHE_TTL = 3600;

const kitchenStationService = {
  // ========================
  // KITCHEN STATIONS
  // ========================

  async createStation(data) {
    const pool = getPool();
    const {
      outletId, name, code, stationType = 'main_kitchen',
      description, printerId, displayId, isActive = true, displayOrder = 0
    } = data;

    const [result] = await pool.query(
      `INSERT INTO kitchen_stations (outlet_id, name, code, station_type, description, printer_id, display_id, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [outletId, name, code?.toUpperCase(), stationType, description, printerId, displayId, isActive, displayOrder]
    );

    await this.invalidateCache(outletId);
    return { id: result.insertId, ...data };
  },

  async getStations(outletId) {
    const cacheKey = `kitchen_stations:${outletId}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;

    const pool = getPool();
    const [stations] = await pool.query(
      `SELECT * FROM kitchen_stations WHERE outlet_id = ? AND is_active = 1 ORDER BY display_order, name`,
      [outletId]
    );

    await cache.set(cacheKey, stations, CACHE_TTL);
    return stations;
  },

  async getStationById(id) {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM kitchen_stations WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async updateStation(id, data) {
    const pool = getPool();
    const fields = [];
    const values = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code?.toUpperCase()); }
    if (data.stationType !== undefined) { fields.push('station_type = ?'); values.push(data.stationType); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.printerId !== undefined) { fields.push('printer_id = ?'); values.push(data.printerId); }
    if (data.displayId !== undefined) { fields.push('display_id = ?'); values.push(data.displayId); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive); }
    if (data.displayOrder !== undefined) { fields.push('display_order = ?'); values.push(data.displayOrder); }

    if (fields.length === 0) return null;
    values.push(id);

    await pool.query(`UPDATE kitchen_stations SET ${fields.join(', ')} WHERE id = ?`, values);

    const station = await this.getStationById(id);
    if (station) await this.invalidateCache(station.outlet_id);
    return station;
  },

  async deleteStation(id) {
    const pool = getPool();
    const station = await this.getStationById(id);
    if (!station) return false;

    await pool.query('UPDATE kitchen_stations SET is_active = 0 WHERE id = ?', [id]);
    await this.invalidateCache(station.outlet_id);
    return true;
  },

  // ========================
  // COUNTERS (Bar, Live Counter)
  // ========================

  async createCounter(data) {
    const pool = getPool();
    const {
      outletId, floorId, name, code, counterType = 'main_bar',
      description, printerId, isActive = true, displayOrder = 0
    } = data;

    const [result] = await pool.query(
      `INSERT INTO counters (outlet_id, floor_id, name, code, counter_type, description, printer_id, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [outletId, floorId, name, code?.toUpperCase(), counterType, description, printerId, isActive, displayOrder]
    );

    await cache.del(`counters:${outletId}`);
    return { id: result.insertId, ...data };
  },

  async getCounters(outletId, floorId = null) {
    const pool = getPool();
    let query = `SELECT c.*, f.name as floor_name 
                 FROM counters c 
                 LEFT JOIN floors f ON c.floor_id = f.id
                 WHERE c.outlet_id = ? AND c.is_active = 1`;
    const params = [outletId];

    if (floorId) {
      query += ' AND c.floor_id = ?';
      params.push(floorId);
    }
    query += ' ORDER BY c.display_order, c.name';

    const [counters] = await pool.query(query, params);
    return counters;
  },

  async getCounterById(id) {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT c.*, f.name as floor_name 
       FROM counters c 
       LEFT JOIN floors f ON c.floor_id = f.id
       WHERE c.id = ?`,
      [id]
    );
    return rows[0] || null;
  },

  async updateCounter(id, data) {
    const pool = getPool();
    const fields = [];
    const values = [];

    if (data.floorId !== undefined) { fields.push('floor_id = ?'); values.push(data.floorId); }
    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.code !== undefined) { fields.push('code = ?'); values.push(data.code?.toUpperCase()); }
    if (data.counterType !== undefined) { fields.push('counter_type = ?'); values.push(data.counterType); }
    if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description); }
    if (data.printerId !== undefined) { fields.push('printer_id = ?'); values.push(data.printerId); }
    if (data.isActive !== undefined) { fields.push('is_active = ?'); values.push(data.isActive); }
    if (data.displayOrder !== undefined) { fields.push('display_order = ?'); values.push(data.displayOrder); }

    if (fields.length === 0) return null;
    values.push(id);

    await pool.query(`UPDATE counters SET ${fields.join(', ')} WHERE id = ?`, values);

    const counter = await this.getCounterById(id);
    if (counter) await cache.del(`counters:${counter.outlet_id}`);
    return counter;
  },

  async deleteCounter(id) {
    const pool = getPool();
    const counter = await this.getCounterById(id);
    if (!counter) return false;

    await pool.query('UPDATE counters SET is_active = 0 WHERE id = ?', [id]);
    await cache.del(`counters:${counter.outlet_id}`);
    return true;
  },

  // ========================
  // ITEM MAPPINGS
  // ========================

  async mapItemToStation(itemId, stationId, isPrimary = true) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO item_kitchen_stations (item_id, kitchen_station_id, is_primary)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_primary = ?`,
      [itemId, stationId, isPrimary, isPrimary]
    );
    return true;
  },

  async mapItemToCounter(itemId, counterId, isPrimary = true) {
    const pool = getPool();
    await pool.query(
      `INSERT INTO item_counters (item_id, counter_id, is_primary)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE is_primary = ?`,
      [itemId, counterId, isPrimary, isPrimary]
    );
    return true;
  },

  async getItemStations(itemId) {
    const pool = getPool();
    const [stations] = await pool.query(
      `SELECT ks.*, iks.is_primary
       FROM item_kitchen_stations iks
       JOIN kitchen_stations ks ON iks.kitchen_station_id = ks.id
       WHERE iks.item_id = ? AND ks.is_active = 1`,
      [itemId]
    );
    return stations;
  },

  async getItemCounters(itemId) {
    const pool = getPool();
    const [counters] = await pool.query(
      `SELECT c.*, ic.is_primary
       FROM item_counters ic
       JOIN counters c ON ic.counter_id = c.id
       WHERE ic.item_id = ? AND c.is_active = 1`,
      [itemId]
    );
    return counters;
  },

  async invalidateCache(outletId) {
    await cache.del(`kitchen_stations:${outletId}`);
    await cache.del(`counters:${outletId}`);
  }
};

module.exports = kitchenStationService;
