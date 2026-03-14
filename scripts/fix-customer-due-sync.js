/**
 * Fix customer due balance sync and investigate due list issue
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

  const connection = await pool.getConnection();

  try {
    console.log('=== Fixing Customer Due Sync ===\n');

    // 1. Check customer 10 outlet
    const [cust10] = await pool.query(`
      SELECT id, name, outlet_id, due_balance 
      FROM customers WHERE id = 10
    `);
    console.log('1. Customer 10 details:', cust10[0]);

    // 2. Check order 609 details
    const [order609] = await pool.query(`
      SELECT id, order_number, outlet_id, customer_id, total_amount, paid_amount, due_amount 
      FROM orders WHERE id = 609
    `);
    console.log('2. Order 609 details:', order609[0]);

    // 3. Check if outlets match
    if (cust10[0] && order609[0]) {
      console.log(`   Customer outlet: ${cust10[0].outlet_id}, Order outlet: ${order609[0].outlet_id}`);
      if (cust10[0].outlet_id !== order609[0].outlet_id) {
        console.log('   ⚠️ MISMATCH: Customer and order are in different outlets!');
      }
    }

    await connection.beginTransaction();

    // 4. Fix customer due_balance to match actual order dues
    console.log('\n4. Syncing customer due_balance with actual order dues...');
    
    const [updateResult] = await connection.query(`
      UPDATE customers c
      SET c.due_balance = COALESCE((
        SELECT SUM(o.due_amount)
        FROM orders o
        WHERE o.customer_id = c.id AND o.due_amount > 0 AND o.status != 'cancelled'
      ), 0)
    `);
    console.log(`   Updated ${updateResult.affectedRows} customers`);

    // 5. Verify the fix
    const [afterFix] = await pool.query(`
      SELECT c.id, c.name, c.due_balance,
             COALESCE(SUM(o.due_amount), 0) as actual_due
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0 AND o.status != 'cancelled'
      WHERE c.outlet_id = 44 AND c.is_active = 1
      GROUP BY c.id
      HAVING c.due_balance > 0 OR COALESCE(SUM(o.due_amount), 0) > 0
    `);
    
    console.log('\n5. Customers with due after fix:');
    if (afterFix.length > 0) {
      console.table(afterFix);
    } else {
      console.log('   No customers with due in outlet 44');
    }

    // 6. Now test the due list query again
    const outletId = 44;
    const [dueList] = await pool.query(`
      SELECT c.id, c.name, c.phone, c.outlet_id, od.actual_due, od.pending_due_orders
      FROM customers c
      INNER JOIN (
        SELECT o.customer_id, 
               SUM(o.due_amount) as actual_due,
               COUNT(*) as pending_due_orders
        FROM orders o
        WHERE o.due_amount > 0 AND o.status != 'cancelled'
        GROUP BY o.customer_id
        HAVING SUM(o.due_amount) > 0
      ) od ON od.customer_id = c.id
      WHERE c.outlet_id = ? AND c.is_active = 1
      ORDER BY od.actual_due DESC
    `, [outletId]);
    
    console.log(`\n6. Due list query result (outlet ${outletId}):`);
    if (dueList.length > 0) {
      console.table(dueList);
    } else {
      console.log('   No customers with due');
      
      // Debug: check all customers with dues regardless of outlet
      const [allDue] = await pool.query(`
        SELECT c.id, c.name, c.outlet_id, od.actual_due
        FROM customers c
        INNER JOIN (
          SELECT o.customer_id, SUM(o.due_amount) as actual_due
          FROM orders o
          WHERE o.due_amount > 0 AND o.status != 'cancelled'
          GROUP BY o.customer_id
          HAVING SUM(o.due_amount) > 0
        ) od ON od.customer_id = c.id
        WHERE c.is_active = 1
      `);
      console.log('\n   All customers with due (any outlet):');
      if (allDue.length > 0) {
        console.table(allDue);
      } else {
        console.log('   None found');
      }
    }

    await connection.commit();
    console.log('\n=== Fix Complete ===');

  } catch (error) {
    await connection.rollback();
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    connection.release();
    await pool.end();
  }
}

main();
