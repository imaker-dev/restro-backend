/**
 * Check schema for due balance feature
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db'
  });

  console.log('=== Checking Schema for Due Balance Feature ===\n');

  // Check customers table
  const [custCols] = await pool.query('SHOW COLUMNS FROM customers');
  console.log('Customers table columns:');
  custCols.forEach(c => {
    if (['due_balance', 'total_due_collected', 'total_spent', 'total_orders'].includes(c.Field)) {
      console.log(`  ✓ ${c.Field}: ${c.Type}`);
    }
  });

  // Check invoices table
  const [invCols] = await pool.query('SHOW COLUMNS FROM invoices');
  console.log('\nInvoices table columns:');
  invCols.forEach(c => {
    if (['paid_amount', 'due_amount', 'is_due_payment', 'grand_total', 'payment_status'].includes(c.Field)) {
      console.log(`  ✓ ${c.Field}: ${c.Type}`);
    }
  });

  // Check if customer_due_transactions table exists
  const [tables] = await pool.query("SHOW TABLES LIKE 'customer_due_transactions'");
  console.log('\nDue transactions table:', tables.length > 0 ? '✓ Exists' : '✗ Missing');

  // Check payments table
  const [payCols] = await pool.query('SHOW COLUMNS FROM payments');
  console.log('\nPayments table columns:');
  payCols.forEach(c => {
    if (['is_due_collection', 'due_transaction_id'].includes(c.Field)) {
      console.log(`  ✓ ${c.Field}: ${c.Type}`);
    }
  });

  await pool.end();
}

main().catch(console.error);
