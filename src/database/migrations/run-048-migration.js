/**
 * Migration 048: Menu Media (images / pdf)
 * Run: node src/database/migrations/run-048-migration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const dbConfig = require('../../config/database.config');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('Running migration 048: Menu Media...\n');

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
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'menu_media'",
       [dbConfig.database]
    );

    if (tables.length > 0) {
      console.log('- menu_media table already exists');
      connection.release();
      await pool.end();
      console.log('\n✅ Migration 048 already applied!');
      return;
    }

    // Read and execute migration SQL
    const sqlPath = path.join(__dirname, '048_menu_media.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await connection.query(sql);
    console.log('- Created menu_media table');

    // Verify table structure
    const [columns] = await connection.query('DESCRIBE menu_media');
    console.log('- Table columns:', columns.map(c => c.Field).join(', '));

    connection.release();
    await pool.end();

    console.log('\n✅ Migration 048 completed successfully!');
    console.log('\nUse endpoints:');
    console.log('  POST /api/v1/menu-media/:outletId/upload    (form-data file=...)');
    console.log('  GET  /api/v1/menu-media/:outletId           (list JSON)');
    console.log('  GET  /api/v1/menu-media/:outletId/view      (public HTML)');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
