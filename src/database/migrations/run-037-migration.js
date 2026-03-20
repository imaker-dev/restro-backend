/**
 * Run migration 037: Purchase Payments table
 * Usage: node src/database/migrations/run-037-migration.js
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
    console.log('Running migration 037: Purchase Payments...');

    const sqlPath = path.join(__dirname, '037_purchase_payments.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    await pool.query(sql);
    console.log('✓ Created purchase_payments table');

    // Verify
    const [tables] = await pool.query("SHOW TABLES LIKE 'purchase_payments'");
    if (tables.length > 0) {
      console.log('✓ Migration verified successfully');
    }

    // Backfill existing payments from purchases table
    console.log('Backfilling existing payments...');
    const [purchases] = await pool.query(
      `SELECT id, paid_amount, purchase_date, created_by 
       FROM purchases 
       WHERE paid_amount > 0 AND status != 'cancelled'`
    );

    for (const p of purchases) {
      // Check if payment already exists
      const [[existing]] = await pool.query(
        'SELECT id FROM purchase_payments WHERE purchase_id = ?', [p.id]
      );
      if (!existing) {
        await pool.query(
          `INSERT INTO purchase_payments (purchase_id, amount, payment_method, payment_date, notes, created_by)
           VALUES (?, ?, 'cash', ?, 'Initial payment (backfilled)', ?)`,
          [p.id, p.paid_amount, p.purchase_date, p.created_by]
        );
      }
    }
    console.log(`✓ Backfilled ${purchases.length} existing payments`);

    console.log('\n✅ Migration 037 completed successfully!');

  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
