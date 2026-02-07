/**
 * Run migration 015: Add item_type to kot_items
 * Run: node src/tests/run-migration-015.js
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const dbConfig = require('../config/database.config');

async function run() {
  const pool = mysql.createPool(dbConfig);
  try {
    await pool.query('ALTER TABLE kot_items ADD COLUMN item_type VARCHAR(20) DEFAULT NULL AFTER variant_name');
    console.log('✓ Migration done: added item_type to kot_items');
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('✓ Column item_type already exists in kot_items');
    } else {
      console.error('✗ Migration failed:', e.message);
    }
  }
  process.exit(0);
}

run();
