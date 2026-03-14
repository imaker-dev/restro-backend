/**
 * Check all orders with dues and verify due API data
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });

  try {
    console.log('=== All Orders with Actual Dues ===\n');
    
    const [dues] = await pool.query(`
      SELECT o.id, o.order_number, o.customer_id, c.name as customer_name, c.outlet_id,
             o.total_amount, o.paid_amount, o.due_amount, o.payment_status, o.status
      FROM orders o 
      LEFT JOIN customers c ON o.customer_id = c.id 
      WHERE o.due_amount > 0 AND o.status != 'cancelled'
      ORDER BY o.due_amount DESC
    `);
    
    if (dues.length > 0) {
      console.table(dues);
    } else {
      console.log('No orders with due_amount > 0 found');
    }

    console.log('\n=== All Customers with stored due_balance > 0 ===\n');
    const [custs] = await pool.query(`
      SELECT id, name, phone, outlet_id, due_balance, total_due_collected
      FROM customers
      WHERE due_balance > 0
      ORDER BY due_balance DESC
    `);
    
    if (custs.length > 0) {
      console.table(custs);
    } else {
      console.log('No customers with due_balance > 0');
    }

    console.log('\n=== Customer Due Transactions (last 20) ===\n');
    const [txns] = await pool.query(`
      SELECT cdt.id, cdt.customer_id, c.name as customer_name, 
             cdt.transaction_type, cdt.amount, cdt.balance_after, cdt.created_at
      FROM customer_due_transactions cdt
      JOIN customers c ON cdt.customer_id = c.id
      ORDER BY cdt.created_at DESC
      LIMIT 20
    `);
    
    if (txns.length > 0) {
      console.table(txns);
    } else {
      console.log('No due transactions found');
    }

    console.log('\n=== Summary by Customer (actual dues from orders) ===\n');
    const [summary] = await pool.query(`
      SELECT c.id, c.name, c.outlet_id, c.due_balance as stored_balance,
             COALESCE(SUM(o.due_amount), 0) as actual_due_from_orders,
             COUNT(o.id) as orders_with_due
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0 AND o.status != 'cancelled'
      WHERE c.due_balance > 0 OR o.id IS NOT NULL
      GROUP BY c.id
      ORDER BY actual_due_from_orders DESC, stored_balance DESC
    `);
    
    if (summary.length > 0) {
      console.table(summary);
    } else {
      console.log('No data');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

main();
