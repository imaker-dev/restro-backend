/**
 * Check customer due list issues
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
    console.log('=== Checking Customer Due List Issues ===\n');

    // 1. Orders with due but no customer_id
    const [ordersNoCust] = await pool.query(`
      SELECT id, order_number, customer_id, total_amount, due_amount, payment_status
      FROM orders
      WHERE due_amount > 0 AND customer_id IS NULL AND status != 'cancelled'
      LIMIT 10
    `);
    console.log('1. Orders with due but NO customer_id:');
    console.log(`   Found ${ordersNoCust.length} orders`);
    if (ordersNoCust.length > 0) {
      console.table(ordersNoCust);
    }

    // 2. Orders with due AND customer_id (should show in due list)
    const [ordersWithCust] = await pool.query(`
      SELECT o.id, o.order_number, o.customer_id, c.name as customer_name,
             o.total_amount, o.paid_amount, o.due_amount, o.payment_status
      FROM orders o
      JOIN customers c ON o.customer_id = c.id
      WHERE o.due_amount > 0 AND o.status != 'cancelled'
      LIMIT 10
    `);
    console.log('\n2. Orders with due AND customer_id:');
    console.log(`   Found ${ordersWithCust.length} orders`);
    if (ordersWithCust.length > 0) {
      console.table(ordersWithCust);
    }

    // 3. Check the actual due list query result
    const outletId = 44;
    const [dueList] = await pool.query(`
      SELECT c.id, c.name, c.phone, od.actual_due, od.pending_due_orders
      FROM customers c
      INNER JOIN (
        SELECT o.customer_id, 
               SUM(o.due_amount) as actual_due,
               COUNT(*) as pending_due_orders
        FROM orders o
        WHERE o.due_amount > 0
        GROUP BY o.customer_id
        HAVING SUM(o.due_amount) > 0
      ) od ON od.customer_id = c.id
      WHERE c.outlet_id = ? AND c.is_active = 1
      ORDER BY od.actual_due DESC
      LIMIT 10
    `, [outletId]);
    
    console.log(`\n3. Due list query result (outlet ${outletId}):`);
    console.log(`   Found ${dueList.length} customers with due`);
    if (dueList.length > 0) {
      console.table(dueList);
    }

    // 4. Check for orders where due_amount calculation is wrong
    const [wrongDue] = await pool.query(`
      SELECT id, order_number, total_amount, paid_amount, due_amount,
             (total_amount - paid_amount) as calculated_due,
             ABS(due_amount - (total_amount - paid_amount)) as diff
      FROM orders
      WHERE status != 'cancelled'
        AND ABS(due_amount - (total_amount - paid_amount)) > 0.01
        AND (total_amount - paid_amount) > 0
      LIMIT 10
    `);
    
    console.log('\n4. Orders where due_amount != (total - paid):');
    if (wrongDue.length > 0) {
      console.table(wrongDue);
    } else {
      console.log('   None found (good!)');
    }

    // 5. Check customers table due_balance vs actual dues
    const [custBalance] = await pool.query(`
      SELECT c.id, c.name, c.due_balance as stored_balance,
             COALESCE(SUM(o.due_amount), 0) as actual_due,
             c.due_balance - COALESCE(SUM(o.due_amount), 0) as diff
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0 AND o.status != 'cancelled'
      WHERE c.outlet_id = ? AND c.is_active = 1
      GROUP BY c.id
      HAVING ABS(c.due_balance - COALESCE(SUM(o.due_amount), 0)) > 0.01
      LIMIT 10
    `, [outletId]);
    
    console.log('\n5. Customers with mismatched due_balance:');
    if (custBalance.length > 0) {
      console.table(custBalance);
    } else {
      console.log('   None found (good!)');
    }

    console.log('\n=== Check Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
