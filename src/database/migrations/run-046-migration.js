/**
 * Run migration 046: Open Item Support
 * Adds is_open_item flag to items and order_items tables
 * Usage: node src/database/migrations/run-046-migration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const dbConfig = require('../../config/database.config');

async function runMigration() {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    multipleStatements: false
  });

  try {
    console.log('Running migration 046: Open Item Support...\n');

    // 1. Add is_open_item to items table
    const [col1] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'is_open_item'`
    );
    if (col1[0].cnt === 0) {
      await pool.query('ALTER TABLE items ADD COLUMN is_open_item TINYINT(1) DEFAULT 0 AFTER is_active');
      console.log('✓ Added is_open_item column to items table');
    } else {
      console.log('- items.is_open_item already exists');
    }

    // 2. Add index on items.is_open_item
    const [idx1] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND INDEX_NAME = 'idx_items_is_open_item'`
    );
    if (idx1[0].cnt === 0) {
      await pool.query('ALTER TABLE items ADD INDEX idx_items_is_open_item (is_open_item)');
      console.log('✓ Added index idx_items_is_open_item');
    } else {
      console.log('- idx_items_is_open_item already exists');
    }

    // 3. Add is_open_item to order_items table
    const [col2] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'is_open_item'`
    );
    if (col2[0].cnt === 0) {
      // Place after stock_deducted if it exists, else after is_complimentary
      const [sdCol] = await pool.query(
        `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND COLUMN_NAME = 'stock_deducted'`
      );
      const afterCol = sdCol[0].cnt > 0 ? 'stock_deducted' : 'is_complimentary';
      await pool.query(`ALTER TABLE order_items ADD COLUMN is_open_item TINYINT(1) DEFAULT 0 AFTER ${afterCol}`);
      console.log(`✓ Added is_open_item column to order_items table (after ${afterCol})`);
    } else {
      console.log('- order_items.is_open_item already exists');
    }

    // 4. Add index on order_items.is_open_item
    const [idx2] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'order_items' AND INDEX_NAME = 'idx_order_items_is_open_item'`
    );
    if (idx2[0].cnt === 0) {
      await pool.query('ALTER TABLE order_items ADD INDEX idx_order_items_is_open_item (is_open_item)');
      console.log('✓ Added index idx_order_items_is_open_item');
    } else {
      console.log('- idx_order_items_is_open_item already exists');
    }

    console.log('\n✅ Migration 046 completed successfully!');
    console.log('\nNext steps:');
    console.log('  1. Create open item templates via admin item management');
    console.log('     - Create item with is_open_item=1, base_price=0');
    console.log('     - Assign correct category + tax group (e.g., Food→GST, Liquor→VAT)');
    console.log('  2. Use POST /api/v1/orders/:id/items with isOpenItem=true to add open items');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
