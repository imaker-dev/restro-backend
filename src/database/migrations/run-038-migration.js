/**
 * Run migration 038: Recipe Management tables
 * Usage: node src/database/migrations/run-038-migration.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dbConfig = require('../../config/database.config');

async function runMigration() {
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    multipleStatements: true
  });

  try {
    console.log('Running migration 038: Recipe Management...');

    const sqlPath = path.join(__dirname, '038_recipe_management.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);
    console.log('✓ Created ingredients table');
    console.log('✓ Created recipes table');
    console.log('✓ Created recipe_ingredients table');
    console.log('✓ Created cost_settings table');

    // Verify
    const tables = ['ingredients', 'recipes', 'recipe_ingredients', 'cost_settings'];
    for (const t of tables) {
      const [rows] = await pool.query(`SHOW TABLES LIKE '${t}'`);
      if (rows.length === 0) {
        throw new Error(`Table ${t} was not created!`);
      }
    }
    console.log('✓ All tables verified');

    console.log('\n✅ Migration 038 completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
