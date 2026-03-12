require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkDueData() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db'
  });

  try {
    console.log('=== Customer Due Data (Rishav) ===');
    const [customers] = await pool.query(
      'SELECT id, name, phone, due_balance, total_due_collected FROM customers WHERE name = ?',
      ['Rishav']
    );
    console.table(customers);

    const customerId = customers[0]?.id;
    if (!customerId) {
      console.log('Customer not found');
      return;
    }

    console.log('\n=== Orders with Due for Rishav (customer_id=15) ===');
    const [ordersWithDue] = await pool.query(
      'SELECT id, order_number, outlet_id, total_amount, paid_amount, due_amount, payment_status FROM orders WHERE customer_id = ? AND due_amount > 0',
      [customerId]
    );

    // Also check outlet 44 specifically
    console.log('\n=== All Orders with Due in Outlet 44 ===');
    const [outlet44Due] = await pool.query(
      `SELECT o.id, o.order_number, o.customer_id, c.name as customer_name, o.total_amount, o.paid_amount, o.due_amount, o.payment_status 
       FROM orders o 
       LEFT JOIN customers c ON o.customer_id = c.id
       WHERE o.outlet_id = 44 AND o.due_amount > 0`
    );
    console.table(outlet44Due);
    console.table(ordersWithDue);

    console.log('\n=== All Orders for Rishav (last 10) ===');
    const [allOrders] = await pool.query(
      'SELECT id, order_number, total_amount, paid_amount, due_amount, payment_status FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 10',
      [customerId]
    );
    console.table(allOrders);

    console.log('\n=== Due Transactions for Rishav ===');
    const [txns] = await pool.query(
      'SELECT id, transaction_type, amount, balance_after, created_at FROM customer_due_transactions WHERE customer_id = ? ORDER BY id DESC',
      [customerId]
    );
    console.table(txns);

    // Calculate what the due balance should be
    const [sumResult] = await pool.query(
      'SELECT SUM(due_amount) as total_due FROM orders WHERE customer_id = ? AND due_amount > 0',
      [customerId]
    );
    console.log('\n=== Calculated Totals ===');
    console.log('Sum of all order due_amounts:', sumResult[0].total_due);
    console.log('Customer due_balance in DB:', customers[0].due_balance);
    console.log('Customer total_due_collected:', customers[0].total_due_collected);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDueData();
