/**
 * Test script for Due Payment feature
 * Run: node scripts/test-due-payment-scenarios.js
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

  console.log('=== DUE PAYMENT FEATURE TEST ===\n');

  // 1. Check schema
  console.log('1. Checking database schema...');
  
  const [custCols] = await pool.query('SHOW COLUMNS FROM customers WHERE Field IN ("due_balance", "total_due_collected")');
  console.log(`   ✓ customers table: ${custCols.length}/2 due columns found`);
  
  const [invCols] = await pool.query('SHOW COLUMNS FROM invoices WHERE Field IN ("paid_amount", "due_amount", "is_due_payment")');
  console.log(`   ✓ invoices table: ${invCols.length}/3 due columns found`);
  
  const [tables] = await pool.query("SHOW TABLES LIKE 'customer_due_transactions'");
  console.log(`   ✓ customer_due_transactions table: ${tables.length > 0 ? 'exists' : 'MISSING'}`);

  // 2. Check for customers with due balance
  console.log('\n2. Customers with due balance...');
  const [dueCustomers] = await pool.query(`
    SELECT id, name, phone, due_balance, total_due_collected
    FROM customers
    WHERE due_balance > 0
    ORDER BY due_balance DESC
    LIMIT 10
  `);
  
  if (dueCustomers.length > 0) {
    console.table(dueCustomers);
  } else {
    console.log('   No customers with due balance yet.');
  }

  // 3. Check for orders with due amount
  console.log('\n3. Orders with due amount...');
  const [dueOrders] = await pool.query(`
    SELECT o.id, o.order_number, o.customer_name, o.total_amount, 
           o.paid_amount, o.due_amount, o.payment_status, o.status
    FROM orders o
    WHERE o.due_amount > 0
    ORDER BY o.created_at DESC
    LIMIT 10
  `);
  
  if (dueOrders.length > 0) {
    console.table(dueOrders);
  } else {
    console.log('   No orders with due amount yet.');
  }

  // 4. Check for invoices with due amount
  console.log('\n4. Invoices with due amount...');
  const [dueInvoices] = await pool.query(`
    SELECT i.id, i.invoice_number, i.customer_name, i.grand_total,
           i.paid_amount, i.due_amount, i.is_due_payment, i.payment_status
    FROM invoices i
    WHERE i.due_amount > 0
    ORDER BY i.created_at DESC
    LIMIT 10
  `);
  
  if (dueInvoices.length > 0) {
    console.table(dueInvoices);
  } else {
    console.log('   No invoices with due amount yet.');
  }

  // 5. Check due transactions
  console.log('\n5. Recent due transactions...');
  const [transactions] = await pool.query(`
    SELECT cdt.id, cdt.transaction_type, cdt.amount, cdt.balance_after,
           c.name as customer_name, o.order_number, cdt.created_at
    FROM customer_due_transactions cdt
    JOIN customers c ON cdt.customer_id = c.id
    LEFT JOIN orders o ON cdt.order_id = o.id
    ORDER BY cdt.created_at DESC
    LIMIT 10
  `);
  
  if (transactions.length > 0) {
    console.table(transactions);
  } else {
    console.log('   No due transactions yet.');
  }

  // 6. Summary statistics
  console.log('\n6. Due Payment Summary...');
  const [[summary]] = await pool.query(`
    SELECT 
      COUNT(DISTINCT CASE WHEN c.due_balance > 0 THEN c.id END) as customers_with_due,
      SUM(c.due_balance) as total_outstanding_due,
      SUM(c.total_due_collected) as total_due_collected,
      (SELECT COUNT(*) FROM orders WHERE due_amount > 0) as orders_with_due,
      (SELECT COUNT(*) FROM invoices WHERE due_amount > 0) as invoices_with_due,
      (SELECT COUNT(*) FROM customer_due_transactions WHERE transaction_type = 'due_created') as due_created_count,
      (SELECT COUNT(*) FROM customer_due_transactions WHERE transaction_type = 'due_collected') as due_collected_count
    FROM customers c
  `);
  
  console.log(`   Customers with outstanding due: ${summary.customers_with_due || 0}`);
  console.log(`   Total outstanding due amount: ₹${parseFloat(summary.total_outstanding_due || 0).toFixed(2)}`);
  console.log(`   Total due collected: ₹${parseFloat(summary.total_due_collected || 0).toFixed(2)}`);
  console.log(`   Orders with due: ${summary.orders_with_due || 0}`);
  console.log(`   Invoices with due: ${summary.invoices_with_due || 0}`);
  console.log(`   Due created transactions: ${summary.due_created_count || 0}`);
  console.log(`   Due collected transactions: ${summary.due_collected_count || 0}`);

  console.log('\n=== TEST COMPLETE ===');
  console.log('\nTo test the feature:');
  console.log('1. Create an order with customer name and phone');
  console.log('2. Generate bill');
  console.log('3. Make a partial payment (less than total)');
  console.log('4. Check customer due balance via API');
  console.log('5. Collect due payment later');

  await pool.end();
}

main().catch(console.error);
