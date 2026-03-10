/**
 * Setup placeholder item for unmapped online orders
 */
const mysql = require('mysql2/promise');
require('dotenv').config();

async function setup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_pos'
  });

  try {
    // Check if placeholder exists
    const [existing] = await conn.query(
      "SELECT id FROM items WHERE name = 'Online Order Item' LIMIT 1"
    );

    if (existing.length > 0) {
      console.log('Placeholder item already exists: ID', existing[0].id);
      return existing[0].id;
    }

    // Get first category
    const [cats] = await conn.query('SELECT id FROM categories LIMIT 1');
    const catId = cats[0]?.id || 1;

    // Get first outlet
    const [outlets] = await conn.query('SELECT id FROM outlets LIMIT 1');
    const outletId = outlets[0]?.id || 1;

    // Create placeholder item
    const [result] = await conn.query(
      `INSERT INTO items (outlet_id, category_id, name, base_price, is_active) 
       VALUES (?, ?, 'Online Order Item', 0, 1)`,
      [outletId, catId]
    );

    console.log('Created placeholder item: ID', result.insertId);
    return result.insertId;

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await conn.end();
  }
}

setup();
