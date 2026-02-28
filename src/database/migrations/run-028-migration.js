/**
 * Run migration 028 - Floor-based shifts
 * Adds floor_id to day_sessions, cash_drawer, and payments tables
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Running Migration 028: Floor-Based Shifts');
  console.log('='.repeat(60));

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  try {
    // Check if migration already applied
    const [cols] = await connection.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'day_sessions' AND COLUMN_NAME = 'floor_id'
    `, [process.env.DB_NAME]);

    if (cols.length > 0) {
      console.log('Migration already applied - floor_id column exists in day_sessions');
      console.log('Skipping migration.');
      return;
    }

    console.log('\nApplying migration...\n');

    // Add floor_id and cashier_id to day_sessions
    console.log('1. Adding floor_id and cashier_id to day_sessions...');
    await connection.query(`
      ALTER TABLE day_sessions 
      ADD COLUMN floor_id BIGINT UNSIGNED NULL AFTER outlet_id,
      ADD COLUMN cashier_id BIGINT UNSIGNED NULL AFTER opened_by,
      ADD INDEX idx_day_sessions_floor (floor_id),
      ADD INDEX idx_day_sessions_cashier (cashier_id)
    `);
    console.log('   ✅ Done');

    // Update unique constraint
    console.log('2. Updating unique constraint on day_sessions...');
    try {
      await connection.query('ALTER TABLE day_sessions DROP INDEX uk_day_session');
    } catch (e) {
      console.log('   (uk_day_session index not found, skipping drop)');
    }
    await connection.query('ALTER TABLE day_sessions ADD UNIQUE KEY uk_day_session_floor (outlet_id, floor_id, session_date)');
    console.log('   ✅ Done');

    // Add floor_id to cash_drawer
    console.log('3. Adding floor_id to cash_drawer...');
    await connection.query(`
      ALTER TABLE cash_drawer
      ADD COLUMN floor_id BIGINT UNSIGNED NULL AFTER outlet_id,
      ADD INDEX idx_cash_drawer_floor (floor_id)
    `);
    console.log('   ✅ Done');

    // Add floor_id to payments
    console.log('4. Adding floor_id to payments...');
    await connection.query(`
      ALTER TABLE payments
      ADD COLUMN floor_id BIGINT UNSIGNED NULL AFTER outlet_id,
      ADD INDEX idx_payments_floor (floor_id)
    `);
    console.log('   ✅ Done');

    console.log('\n' + '='.repeat(60));
    console.log('Migration 028 completed successfully!');
    console.log('='.repeat(60));
    console.log(`
Summary of changes:
- day_sessions: Added floor_id, cashier_id columns
- day_sessions: Updated unique constraint to include floor_id
- cash_drawer: Added floor_id column
- payments: Added floor_id column

Now shifts are floor-isolated:
- Each floor has its own shift
- Cashiers can only open/close their assigned floor's shift
- Table sessions require floor shift to be open
- Bills are routed to floor's assigned cashier
`);

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

runMigration().catch(console.error);
