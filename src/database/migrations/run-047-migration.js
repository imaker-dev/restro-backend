/**
 * Migration 047: Open Item Ingredients
 * Run: node src/database/migrations/run-047-migration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const dbConfig = require('../../config/database.config');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Running migration 047: Open Item Ingredients...\n');

  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    multipleStatements: true
  });

  try {
    const connection = await pool.getConnection();

    // Check if table already exists
    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'order_item_ingredients'",
      [dbConfig.database]
    );

    if (tables.length > 0) {
      console.log('- order_item_ingredients table already exists');
      connection.release();
      await pool.end();
      console.log('\n✅ Migration 047 already applied!');
      return;
    }

    // Read and execute migration SQL
    const sqlPath = path.join(__dirname, '047_open_item_ingredients.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await connection.query(sql);
    console.log('- Created order_item_ingredients table');

    // Verify table structure
    const [columns] = await connection.query('DESCRIBE order_item_ingredients');
    console.log('- Table columns:', columns.map(c => c.Field).join(', '));

    connection.release();
    await pool.end();

    console.log('\n✅ Migration 047 completed successfully!');
    console.log('\nThis table stores ad-hoc ingredients for open items:');
    console.log('  - Links order_item_id to ingredient_id');
    console.log('  - Tracks quantity, unit, and conversion factor');
    console.log('  - Used for stock deduction on open items with ingredients');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
