/**
 * Migration Runner: 030_online_order_integration (v2)
 * Creates tables for Swiggy/Zomato integration via Dyno APIs
 * 
 * Run: node src/database/migrations/run-030-migration-v2.js
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
  console.log('═'.repeat(60));
  console.log('  MIGRATION: 030_online_order_integration (v2)');
  console.log('  Dyno APIs Integration Tables');
  console.log('═'.repeat(60));

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro',
    multipleStatements: true
  });

  try {
    console.log('\n✓ Connected to database:', process.env.DB_NAME || 'restro_pos');

    // Step 1: Create new tables from SQL file
    console.log('\n📋 Step 1: Creating integration tables...\n');
    
    const sqlPath = path.join(__dirname, '030_online_order_integration_v2.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await connection.query(sql);
    console.log('  ✓ Integration tables created');

    // Step 2: Add columns to orders table
    console.log('\n📋 Step 2: Adding columns to orders table...\n');

    // Check and add 'source' column
    const [sourceCol] = await connection.query(`
      SELECT COUNT(*) as cnt FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'source'
    `);
    if (sourceCol[0].cnt === 0) {
      await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN source ENUM('pos', 'swiggy', 'zomato', 'uber_eats', 'dunzo', 'other') 
        DEFAULT 'pos' AFTER order_type
      `);
      console.log('  ✓ Added column: orders.source');
    } else {
      console.log('  ⊘ Column orders.source already exists');
    }

    // Check and add 'external_order_id' column
    const [extCol] = await connection.query(`
      SELECT COUNT(*) as cnt FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'external_order_id'
    `);
    if (extCol[0].cnt === 0) {
      await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN external_order_id VARCHAR(100) AFTER source
      `);
      console.log('  ✓ Added column: orders.external_order_id');
    } else {
      console.log('  ⊘ Column orders.external_order_id already exists');
    }

    // Check and add 'online_order_id' column
    const [onlineCol] = await connection.query(`
      SELECT COUNT(*) as cnt FROM information_schema.columns 
      WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = 'online_order_id'
    `);
    if (onlineCol[0].cnt === 0) {
      await connection.query(`
        ALTER TABLE orders 
        ADD COLUMN online_order_id BIGINT UNSIGNED AFTER external_order_id
      `);
      console.log('  ✓ Added column: orders.online_order_id');
    } else {
      console.log('  ⊘ Column orders.online_order_id already exists');
    }

    // Add indexes (ignore if exists)
    console.log('\n📋 Step 3: Adding indexes...\n');
    
    try {
      await connection.query('CREATE INDEX idx_orders_source ON orders(source)');
      console.log('  ✓ Added index: idx_orders_source');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('  ⊘ Index idx_orders_source already exists');
      } else {
        console.log('  ✗ Index idx_orders_source:', e.message);
      }
    }

    try {
      await connection.query('CREATE INDEX idx_orders_external ON orders(external_order_id)');
      console.log('  ✓ Added index: idx_orders_external');
    } catch (e) {
      if (e.code === 'ER_DUP_KEYNAME') {
        console.log('  ⊘ Index idx_orders_external already exists');
      } else {
        console.log('  ✗ Index idx_orders_external:', e.message);
      }
    }

    // Step 4: Create system user for online orders
    console.log('\n📋 Step 4: Creating system user...\n');
    
    try {
      await connection.query(`
        INSERT IGNORE INTO users (name, email, phone, password_hash, is_active)
        VALUES ('Online Order System', 'system.online@restropos.local', '0000000000', 
                '$2b$10$placeholder_hash_not_for_login', 1)
      `);
      console.log('  ✓ System user created/exists');
    } catch (e) {
      console.log('  ⊘ System user:', e.message);
    }

    // Verification
    console.log('\n' + '─'.repeat(60));
    console.log('  VERIFICATION');
    console.log('─'.repeat(60));

    const tablesToCheck = [
      'integration_channels',
      'online_orders',
      'channel_menu_mapping',
      'integration_logs'
    ];

    for (const table of tablesToCheck) {
      const [rows] = await connection.query(`
        SELECT COUNT(*) as count FROM information_schema.tables 
        WHERE table_schema = DATABASE() AND table_name = ?
      `, [table]);
      
      if (rows[0].count > 0) {
        console.log(`  ✓ Table '${table}' exists`);
      } else {
        console.log(`  ✗ Table '${table}' NOT FOUND`);
      }
    }

    // Check orders columns
    const columnsToCheck = ['source', 'external_order_id', 'online_order_id'];
    for (const col of columnsToCheck) {
      const [rows] = await connection.query(`
        SELECT COUNT(*) as count FROM information_schema.columns 
        WHERE table_schema = DATABASE() AND table_name = 'orders' AND column_name = ?
      `, [col]);
      
      if (rows[0].count > 0) {
        console.log(`  ✓ Column 'orders.${col}' exists`);
      } else {
        console.log(`  ✗ Column 'orders.${col}' NOT FOUND`);
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('  ✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('═'.repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

runMigration().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
