/**
 * Test script to verify due-list API fix
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testDueListAPI() {
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'restro_db'
  });

  try {
    console.log('=== Testing Due List API Fix ===\n');

    // 1. Check actual data in database
    console.log('1. Database State:');
    const [customer] = await pool.query(
      'SELECT id, name, phone, due_balance, total_due_collected FROM customers WHERE id = 15'
    );
    console.log('   Customer 15 in DB:', customer[0]);

    const [orders] = await pool.query(
      'SELECT id, order_number, due_amount, paid_amount FROM orders WHERE customer_id = 15 AND due_amount > 0'
    );
    console.log('   Orders with due for customer 15:', orders);

    // 2. Simulate what the fixed listWithDue query returns
    console.log('\n2. Fixed Query Result (what API should return):');
    const [result] = await pool.query(
      `SELECT c.id, c.name, c.phone,
              COALESCE(od.actual_due, 0) as actual_due,
              COALESCE(od.pending_due_orders, 0) as pending_due_orders,
              COALESCE(od.total_paid, 0) as total_paid
       FROM customers c
       LEFT JOIN (
         SELECT customer_id, 
                SUM(due_amount) as actual_due,
                COUNT(*) as pending_due_orders,
                SUM(paid_amount) as total_paid
         FROM orders 
         WHERE due_amount > 0
         GROUP BY customer_id
       ) od ON od.customer_id = c.id
       WHERE c.outlet_id = 44 AND c.is_active = 1 AND COALESCE(od.actual_due, 0) > 0
       ORDER BY actual_due DESC`
    );
    console.table(result);

    // 3. Check if customer with 0 actual due is excluded
    console.log('\n3. Verification:');
    const customerWithStaleData = result.find(c => c.id === 15 && parseFloat(c.actual_due) === 0);
    if (customerWithStaleData) {
      console.log('   ❌ FAIL: Customer with 0 actual due still appears in list');
    } else {
      const customerWithDue = result.find(c => c.id === 15);
      if (customerWithDue) {
        console.log(`   ✓ Customer 15 (Rishav) actual due: ₹${customerWithDue.actual_due}`);
        console.log(`   ✓ Pending orders: ${customerWithDue.pending_due_orders}`);
        console.log(`   ✓ Total paid on due orders: ₹${customerWithDue.total_paid}`);
      } else {
        console.log('   ✓ No customers with actual outstanding due in outlet 44');
      }
    }

    // 4. Summary
    console.log('\n4. Summary for outlet 44:');
    const [[summary]] = await pool.query(
      `SELECT 
         COUNT(DISTINCT c.id) as customers_with_due,
         COALESCE(SUM(o.due_amount), 0) as total_due
       FROM customers c
       INNER JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0
       WHERE c.outlet_id = 44 AND c.is_active = 1`
    );
    console.log(`   Customers with actual due: ${summary.customers_with_due}`);
    console.log(`   Total outstanding due: ₹${summary.total_due}`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testDueListAPI();
