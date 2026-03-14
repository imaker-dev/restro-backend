/**
 * Diagnose due-related API issues
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

  const outletId = 44;
  const customerId = 16;

  try {
    console.log('=== Diagnosing Due API Issues ===\n');

    // 1. Check customer 16 exists and get details
    console.log(`1. Customer ${customerId} details:`);
    const [customer] = await pool.query(
      `SELECT id, name, phone, email, outlet_id, due_balance, total_due_collected, is_active
       FROM customers WHERE id = ?`,
      [customerId]
    );
    if (customer[0]) {
      console.table(customer);
    } else {
      console.log('   Customer not found!');
    }

    // 2. Check all orders for customer 16
    console.log(`\n2. All orders for customer ${customerId}:`);
    const [custOrders] = await pool.query(
      `SELECT o.id, o.order_number, o.outlet_id, o.total_amount, o.paid_amount, o.due_amount, 
              o.payment_status, o.status, o.created_at
       FROM orders o
       WHERE o.customer_id = ?
       ORDER BY o.created_at DESC`,
      [customerId]
    );
    if (custOrders.length > 0) {
      console.table(custOrders);
    } else {
      console.log('   No orders found for this customer');
    }

    // 3. Check orders with due > 0 for customer 16
    console.log(`\n3. Orders with due_amount > 0 for customer ${customerId}:`);
    const [dueOrders] = await pool.query(
      `SELECT o.id, o.order_number, o.total_amount, o.paid_amount, o.due_amount, 
              o.payment_status, o.status
       FROM orders o
       WHERE o.customer_id = ? AND o.due_amount > 0`,
      [customerId]
    );
    if (dueOrders.length > 0) {
      console.table(dueOrders);
    } else {
      console.log('   No orders with due > 0');
    }

    // 4. Check all customers in outlet 44 with dues
    console.log(`\n4. All customers in outlet ${outletId} with actual dues (from orders):`);
    const [allDueCustomers] = await pool.query(
      `SELECT c.id, c.name, c.phone, c.outlet_id, c.due_balance as stored_balance,
              COALESCE(SUM(o.due_amount), 0) as actual_due,
              COUNT(o.id) as due_orders_count
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id AND o.due_amount > 0 AND o.status != 'cancelled'
       WHERE c.outlet_id = ? AND c.is_active = 1
       GROUP BY c.id
       HAVING COALESCE(SUM(o.due_amount), 0) > 0 OR c.due_balance > 0
       ORDER BY actual_due DESC`,
      [outletId]
    );
    if (allDueCustomers.length > 0) {
      console.table(allDueCustomers);
    } else {
      console.log('   No customers with dues in this outlet');
    }

    // 5. Check the due-list query result
    console.log(`\n5. Due-list query result (what the API returns):`);
    const [dueListResult] = await pool.query(
      `SELECT c.id, c.name, c.phone, c.outlet_id,
              od.actual_due,
              od.pending_due_orders,
              od.total_due_collected,
              od.last_due_date
       FROM customers c
       INNER JOIN (
         SELECT o.customer_id, 
                SUM(o.due_amount) as actual_due,
                COUNT(*) as pending_due_orders,
                SUM(o.paid_amount) as total_due_collected,
                MAX(o.created_at) as last_due_date
         FROM orders o
         WHERE o.due_amount > 0
         GROUP BY o.customer_id
         HAVING SUM(o.due_amount) > 0
       ) od ON od.customer_id = c.id
       WHERE c.outlet_id = ? AND c.is_active = 1
       ORDER BY od.actual_due DESC`,
      [outletId]
    );
    if (dueListResult.length > 0) {
      console.table(dueListResult);
    } else {
      console.log('   No results from due-list query');
    }

    // 6. Check customer_due_transactions table
    console.log(`\n6. Customer due transactions for customer ${customerId}:`);
    const [dueTransactions] = await pool.query(
      `SELECT id, customer_id, order_id, invoice_id, transaction_type, amount, 
              balance_before, balance_after, created_at
       FROM customer_due_transactions
       WHERE customer_id = ?
       ORDER BY created_at DESC
       LIMIT 10`,
      [customerId]
    );
    if (dueTransactions.length > 0) {
      console.table(dueTransactions);
    } else {
      console.log('   No due transactions found');
    }

    // 7. Check invoices for customer orders
    console.log(`\n7. Invoices for customer ${customerId} orders:`);
    const [invoices] = await pool.query(
      `SELECT i.id, i.invoice_number, i.order_id, o.order_number, 
              i.total_amount, i.paid_amount, i.due_amount, i.payment_status, i.is_due_payment
       FROM invoices i
       JOIN orders o ON i.order_id = o.id
       WHERE o.customer_id = ? AND i.is_cancelled = 0
       ORDER BY i.created_at DESC`,
      [customerId]
    );
    if (invoices.length > 0) {
      console.table(invoices);
    } else {
      console.log('   No invoices found');
    }

    // 8. Check due report query (orders/reports/:outletId/due)
    console.log(`\n8. Due report query result:`);
    const [dueReport] = await pool.query(
      `SELECT 
        c.id, c.name, c.phone, c.email,
        SUM(o.due_amount) as actual_due,
        COUNT(*) as pending_orders,
        SUM(o.paid_amount) as collected,
        MAX(o.created_at) as last_order_date
       FROM customers c
       INNER JOIN orders o ON o.customer_id = c.id
       WHERE c.outlet_id = ? AND o.due_amount > 0 AND o.status != 'cancelled'
       GROUP BY c.id
       HAVING SUM(o.due_amount) > 0
       ORDER BY actual_due DESC`,
      [outletId]
    );
    if (dueReport.length > 0) {
      console.table(dueReport);
    } else {
      console.log('   No results');
    }

    // 9. Summary
    console.log('\n=== SUMMARY ===');
    const cust = customer[0];
    if (cust) {
      const actualDue = dueOrders.reduce((sum, o) => sum + parseFloat(o.due_amount || 0), 0);
      console.log(`Customer ${customerId} (${cust.name}):`);
      console.log(`  - Outlet: ${cust.outlet_id} (querying for outlet ${outletId})`);
      console.log(`  - Stored due_balance: ${cust.due_balance}`);
      console.log(`  - Actual due from orders: ${actualDue}`);
      console.log(`  - Orders with due: ${dueOrders.length}`);
      console.log(`  - Total orders: ${custOrders.length}`);
      
      if (parseInt(cust.outlet_id) !== parseInt(outletId)) {
        console.log(`\n  ⚠️ ISSUE: Customer is in outlet ${cust.outlet_id}, not ${outletId}!`);
      }
      if (parseFloat(cust.due_balance) !== actualDue) {
        console.log(`\n  ⚠️ ISSUE: Stored due_balance (${cust.due_balance}) != actual (${actualDue})`);
      }
    }

    console.log('\n=== Diagnosis Complete ===');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

main();
