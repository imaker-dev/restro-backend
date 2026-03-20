/**
 * Run migration 039: Alter ingredients table to add inventory_item_id link
 * Usage: node src/database/migrations/run-039-migration.js
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
    console.log('Running migration 039: Alter ingredients table...');

    // Check and add inventory_item_id
    const [cols1] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'inventory_item_id'`
    );
    if (cols1[0].cnt === 0) {
      await pool.query('ALTER TABLE ingredients ADD COLUMN inventory_item_id BIGINT UNSIGNED NULL AFTER outlet_id');
      console.log('✓ Added inventory_item_id column');
    } else {
      console.log('- inventory_item_id already exists');
    }

    // Check and add yield_percentage
    const [cols2] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'yield_percentage'`
    );
    if (cols2[0].cnt === 0) {
      await pool.query('ALTER TABLE ingredients ADD COLUMN yield_percentage DECIMAL(5,2) DEFAULT 100.00 AFTER description');
      console.log('✓ Added yield_percentage column');
    } else {
      console.log('- yield_percentage already exists');
    }

    // Check and add wastage_percentage
    const [cols3] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'wastage_percentage'`
    );
    if (cols3[0].cnt === 0) {
      await pool.query('ALTER TABLE ingredients ADD COLUMN wastage_percentage DECIMAL(5,2) DEFAULT 0.00 AFTER yield_percentage');
      console.log('✓ Added wastage_percentage column');
    } else {
      console.log('- wastage_percentage already exists');
    }

    // Check and add preparation_notes
    const [cols4] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND COLUMN_NAME = 'preparation_notes'`
    );
    if (cols4[0].cnt === 0) {
      await pool.query('ALTER TABLE ingredients ADD COLUMN preparation_notes TEXT NULL AFTER wastage_percentage');
      console.log('✓ Added preparation_notes column');
    } else {
      console.log('- preparation_notes already exists');
    }

    // Check and add index
    const [idx] = await pool.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.STATISTICS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ingredients' AND INDEX_NAME = 'idx_ingredients_item'`
    );
    if (idx[0].cnt === 0) {
      await pool.query('ALTER TABLE ingredients ADD INDEX idx_ingredients_item (inventory_item_id)');
      console.log('✓ Added index idx_ingredients_item');
    } else {
      console.log('- idx_ingredients_item already exists');
    }

    console.log('\n✅ Migration 039 completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
